// Start conformance, D ⊆ B (Contract §2): `start` returns a handle only if every event the programs of ALL the application's views declare has an entry in the command table,
// and only if MESH accepts every program. A real `Valance.start` over real MESH programs (MESH's `compileProgram`, the runtime's `declaredEvents`), no mock of either.
// The check is of key PRESENCE: nothing here claims a command exists, an entry runs it, or arguments fit. `UnmappedCommand` stays the runtime defense below it.
import type { Mesh } from "@valancex/nexus";

import * as Nexus from "@valancex/nexus";
import { compileProgram } from "@valancex/mesh-compiler";
import { Cause, Effect, Exit, Layer, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { runningOf } from "../src/internal.js";

const empty = { props: {}, events: {}, commands: {}, scope: {} };
const goes = { ...empty, commands: { go: { parameters: [] } } };
const manifest = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: { ...empty, props: { title: { type: { kind: "string" }, required: true } } },
    text: empty,
    button: { ...empty, events: { click: {} } },
    "mesh-if": { ...empty, props: { when: { type: { kind: "boolean" }, required: true } } },
    "mesh-each": { ...empty, props: { items: { type: { kind: "list", element: { kind: "any" } }, required: true }, as: { type: { kind: "string" }, required: true }, key: { type: { kind: "any" }, required: true } } },
    quiet: empty,
    home: { ...goes },
    conditional: { ...goes, scope: { show: { kind: "boolean" } } },
    repeated: { ...goes, scope: { ids: { kind: "list", element: { kind: "string" } } } },
    titled: { ...empty, scope: { title: { kind: "string" } } },
  },
});

const sources = {
  quiet: `<page title="q"><text>nothing is declared here</text></page>`,
  home: `<page title="h"><button on.click={go()}>go</button></page>`,
  conditional: `<page title="c"><mesh-if when={show}><button on.click={go()}>go</button></mesh-if></page>`,
  repeated: `<page title="r"><mesh-each items={ids} as="i" key={i}><button on.click={go()}>a</button></mesh-each><button on.click={go()}>b</button></page>`,
  titled: "<page title={title}><text>t</text></page>",
};
const program = async (root: keyof typeof sources): Promise<Mesh.Program> => {
  const built = await compileProgram({ model: { manifest, path: "components.json" }, root, components: [{ component: root, source: sources[root], path: `${root}.mprx` }] });

  if (built.program === undefined) {
    throw new Error(`${root} doesn't compile: ${JSON.stringify(built.assembly ?? built.components)}`);
  }

  return built.program;
};
const programs = { quiet: await program("quiet"), home: await program("home"), conditional: await program("conditional"), repeated: await program("repeated"), titled: await program("titled") };

const State = Schema.Struct({ show: Schema.Boolean, bad: Schema.Boolean });
type State = Schema.Schema.Type<typeof State>;
const entry = (name: string) => Nexus.Mesh.bind(Nexus.Command.define(name, Schema.Struct({}), () => Effect.void), () => ({}));
type Table = Record<string, ReturnType<typeof entry>>;
const tableOf = (...keys: ReadonlyArray<string>): Table => Object.fromEntries(keys.map((key) => [key, entry(`t.${key}`)]));

/** An application over `views` (name → program) showing `current`, with `keys` in its command table. */
const application = (views: Record<string, Mesh.Program>, current: string, keys: ReadonlyArray<string>) => Valance.define({
  name: "conformance",
  state: { schema: State, initial: { show: false, bad: false } },
  views: Object.fromEntries(Object.entries(views).map(([name, view]) => [name, { program: view, scope: (state: State) => ({ show: state.show, ids: ["x", "y"], title: state.bad ? (42 as never) : "ok" }) }])),
  view: () => current,
  commands: () => tableOf(...keys),
});

const startOf = (app: ReturnType<typeof application>) => Effect.runPromise(Effect.exit(Effect.scoped(Valance.start(app))));
const failureOf = <A>(exit: Exit.Exit<A, Valance.StartError>): Valance.StartError => {
  if (Exit.isSuccess(exit) || !Cause.isFailType(exit.cause)) {
    throw new Error(`expected a typed start failure, got ${JSON.stringify(exit)}`);
  }

  return exit.cause.error;
};
const violationOf = (error: Valance.StartError): ReadonlyArray<Valance.UnmappedDeclaration> => {
  if (error._tag !== "ConformanceViolation") {
    throw new Error(`expected ConformanceViolation, got ${error._tag}`);
  }

  return error.missing;
};

describe("start conformance: every declared event has a command-table key (D ⊆ B)", () => {
  it("a conforming application starts", async () => {
    expect(Exit.isSuccess(await startOf(application({ main: programs.home }, "main", ["home/go"])))).toBe(true);
  });

  it("a declared event with no key prevents start, and the failure names the declaration (view, component, event, command, key, MESH's span)", async () => {
    const [missing, ...rest] = violationOf(failureOf(await startOf(application({ main: programs.home }, "main", ["app/other"]))));

    expect(rest).toEqual([]);
    expect(missing).toMatchObject({ view: "main", component: "home", event: "click", command: "go", key: "home/go" });
    expect(sources.home.slice(missing!.span.start.utf16, missing!.span.end.utf16)).toBe("on.click={go()}");   // MESH's span, in `home`'s template source
  });

  it("a failed start yields no handle, admits no command, and the platform it had acquired is released when the caller's Scope closes", async () => {
    const counts = { acquired: 0, released: 0 };
    const platform: Nexus.Application.Platform = Layer.merge(
      Nexus.Capability.EnvironmentLive(new Map()),
      Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
    );
    const scope = await Effect.runPromise(Scope.make());
    const exit = await Effect.runPromise(Effect.exit(Valance.start(application({ main: programs.home }, "main", []), { platform }).pipe(Scope.extend(scope))));

    expect(Exit.isFailure(exit) && Cause.isFailType(exit.cause) && exit.cause.error._tag).toBe("ConformanceViolation");
    expect(counts).toEqual({ acquired: 1, released: 0 });                      // acquired before the check: the caller's Scope owns it
    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });

  it("a declaration in an UNSELECTED view still requires a key", async () => {
    const missing = violationOf(failureOf(await startOf(application({ shown: programs.quiet, other: programs.home }, "shown", []))));

    expect(missing.map(({ view, key }) => [view, key])).toEqual([["other", "home/go"]]);
  });

  it("a declaration inside an INACTIVE conditional branch still requires a key (no reachability analysis)", async () => {
    expect(violationOf(failureOf(await startOf(application({ main: programs.conditional }, "main", [])))).map(({ key }) => key)).toEqual(["conditional/go"]);
    expect(Exit.isSuccess(await startOf(application({ main: programs.conditional }, "main", ["conditional/go"])))).toBe(true);   // show is false: the event is not rendered, and is mapped
  });

  it("duplicate declarations (two bindings, one inside a repeated body) need ONE entry, and are each reported with their own span when it is missing", async () => {
    expect(Exit.isSuccess(await startOf(application({ main: programs.repeated }, "main", ["repeated/go"])))).toBe(true);

    const missing = violationOf(failureOf(await startOf(application({ main: programs.repeated }, "main", []))));

    expect(missing.map(({ key }) => key)).toEqual(["repeated/go", "repeated/go"]);
    expect(missing[0]!.span).not.toEqual(missing[1]!.span);
  });

  it("every missing declaration is reported, in the definition's view order and then MESH's order", async () => {
    const missing = violationOf(failureOf(await startOf(application({ b: programs.repeated, a: programs.home, c: programs.conditional }, "a", []))));

    expect(missing.map(({ view, key }) => `${view}:${key}`)).toEqual(["b:repeated/go", "b:repeated/go", "a:home/go", "c:conditional/go"]);
  });

  it("extra command-table keys are allowed: only D ⊆ B is checked, never B ⊆ D", async () => {
    expect(Exit.isSuccess(await startOf(application({ main: programs.quiet }, "main", ["app/navigate", "nowhere/declared", "home/go"])))).toBe(true);
  });
});

describe("start conformance: a program MESH rejects fails start, before D ⊆ B", () => {
  const rejected: Mesh.Program = { ...programs.home, root: "nowhere" };

  it("program-level MESH diagnostics prevent start with MESH's own diagnostics, whatever state the application is in", async () => {
    const error = failureOf(await startOf(application({ main: rejected }, "main", ["home/go"])));

    expect(error._tag).toBe("MeshDiagnostics");
    expect(error._tag === "MeshDiagnostics" && error.diagnostics.diagnostics.map((d) => [d.code, d.location.kind])).toEqual([["assembly-missing-root", "program"]]);
  });

  it("an unselected view's program is checked too, and its diagnostics win over a conformance violation found in a valid view", async () => {
    const error = failureOf(await startOf(application({ valid: programs.home, other: rejected }, "valid", [])));   // `valid` also lacks its key

    expect(error._tag).toBe("MeshDiagnostics");
  });

  it("diagnostics that depend on the VALUES a scope produces are not a start failure: start succeeds, and the mount reports them", async () => {
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(Valance.define({
        name: "values", state: { schema: State, initial: { show: false, bad: true } },
        views: { main: { program: programs.titled, scope: (state: State) => ({ title: state.bad ? (42 as never) : "ok" }) } }, view: () => "main" as const, commands: () => ({} as Table),
      }));

      return yield* Effect.exit(Valance.mount(handle, () => ({ draw: () => undefined, update: () => undefined, unmount: () => undefined })));
    })));

    expect(Exit.isFailure(result) && Cause.isFailType(result.cause) && result.cause.error).toMatchObject({ _tag: "MeshDiagnostics" });
    expect(Exit.isFailure(result) && Cause.isFailType(result.cause) && JSON.stringify(result.cause.error)).toContain("runtime-value-mismatch");
  });
});

describe("runtime defense-in-depth: UnmappedCommand is still the answer below the start boundary", () => {
  const handlerOf = (node: { readonly type: string; readonly events?: Readonly<Record<string, string>>; readonly children?: ReadonlyArray<unknown> }): string | undefined => {
    if (node.type !== "node") {
      return undefined;
    }

    return Object.values(node.events ?? {})[0] ?? (node.children ?? []).map((child) => handlerOf(child as typeof node)).find((handler) => handler !== undefined);
  };

  it("a render made by one application's programs reaches another, conforming application's table: an unknown key is the typed UnmappedCommand, and `invoke` of an unknown key too", async () => {
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const declaring = yield* Valance.start(application({ main: programs.home }, "main", ["home/go"]));
      const conforming = yield* Valance.start(application({ main: programs.quiet }, "main", ["app/other"]));   // declares nothing, so it conforms without `home/go`
      const viewed = yield* runningOf(declaring).render;
      const dispatched = yield* Effect.exit(runningOf(conforming).dispatch(viewed, handlerOf(viewed.render.tree.root)!));
      const invoked = yield* Effect.exit(conforming.invoke("nowhere/at-all", []));

      return { dispatched, invoked };
    })));

    expect(result.dispatched).toEqual(Exit.fail({ _tag: "UnmappedCommand", component: "home", name: "go" }));
    expect(result.invoked).toEqual(Exit.fail({ _tag: "UnmappedCommand", component: "nowhere", name: "at-all" }));
  });
});
