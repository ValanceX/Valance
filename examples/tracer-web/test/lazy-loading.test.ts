// Tracer: lazy loading, with LOADING, ADMISSION and USE kept apart. No dynamic import, no Web, no network: the loader is a gated fake Effect.
//   loading    obtaining a program/impl asynchronously      -> an ordinary application-owned command (here the `start` command); nothing new
//   admission  proving it may participate                   -> D ⊆ B for the loaded program, asked of MESH (`declaredEvents`) against the command table's keys
//   use        executing it                                 -> MESH `render` of the admitted program, called by a command
// Part 2 is a CHARACTERIZATION of unsupported, out-of-contract behavior (dynamic views): it forces a loaded program into `views` after `start` to record what stops it.
// It documents today's failure mode; it is NOT a requirement. A future late-admission design may change every assertion in it, and that is allowed.
import type { Mesh } from "@valancex/nexus";

import { compileProgram } from "@valancex/mesh-compiler";
import { declaredEvents, render as meshRender } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Cause, Deferred, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { textTarget, type TextTarget } from "./non-dom-target.js";

const manifest = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: { title: { type: { kind: "string" }, required: true } }, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    shell: { props: {}, events: {}, commands: {}, scope: { title: { kind: "string" } } },
    quiet: { props: {}, events: {}, commands: {}, scope: { title: { kind: "string" } } },
    extra: { props: {}, events: {}, commands: { go: { parameters: [] } }, scope: { title: { kind: "string" } } },
    rogue: { props: {}, events: {}, commands: { nope: { parameters: [] } }, scope: { title: { kind: "string" } } },
  },
});
const build = async (root: string, source: string): Promise<Mesh.Program> => {
  const result = await compileProgram({ model: { manifest, path: "components.json" }, root, components: [{ component: root, source, path: `${root}.mprx` }] });

  if (result.program === undefined) { throw new Error(JSON.stringify(result.assembly ?? result.components)); }

  return result.program;
};
const programs = {
  shell: await build("shell", `<page title={title}><text>shell</text></page>`),
  quiet: await build("quiet", `<page title={title}><text>quiet</text></page>`),                         // declares no event
  extra: await build("extra", `<page title={title}><button on.click={go()}>Go</button></page>`),        // declares extra/go
  rogue: await build("rogue", `<page title={title}><button on.click={nope()}>No</button></page>`),      // declares rogue/nope
};

type Name = keyof typeof programs;
interface Bundle { readonly program: Mesh.Program; readonly impl: { readonly greet: () => string } }

const State = Schema.Struct({ phase: Schema.Literal("idle", "loading", "ready", "rejected", "failed"), ticket: Schema.Number, detail: Schema.String, shown: Schema.Literal("shell", "extra", "quiet") });
type State = typeof State.Type;
const initial: State = { phase: "idle", ticket: 0, detail: "", shown: "shell" };

/** The fake loader: each `load(name)` call takes the next gate for that name; the test completes it, or fails it. Records starts and interruptions. */
const fakeLoader = () => {
  const log: Array<string> = [];
  const gates: Array<{ readonly name: Name; readonly gate: Deferred.Deferred<Bundle, string> }> = [];

  return {
    log,
    load: (name: Name): Effect.Effect<Bundle, string> => Effect.suspend(() => {
      const gate = Effect.runSync(Deferred.make<Bundle, string>());

      gates.push({ name, gate });
      log.push(`start ${name}#${gates.filter((g) => g.name === name).length}`);

      return Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push(`interrupted ${name}`); })));
    }),
    nth: (name: Name, n: number) => gates.filter((g) => g.name === name)[n - 1]!.gate,
    finish: (name: Name, n = 1, greeting = name) => Effect.runPromise(Deferred.succeed(Effect.runSync(Effect.sync(() => gates.filter((g) => g.name === name)[n - 1]!.gate)), { program: programs[name], impl: { greet: () => `hello from ${greeting}` } })),
    fail: (name: Name, n = 1) => Effect.runPromise(Deferred.fail(gates.filter((g) => g.name === name)[n - 1]!.gate, "unavailable")),
  };
};

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) { throw new Error("timed out"); }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const app = (loader: ReturnType<typeof fakeLoader>, options: { readonly start?: Name } = {}) => {
  // What the application has ADMITTED, per start: plain values in the command closure. Nothing here is VALANCE's.
  const admitted = new Map<string, Bundle>();
  const views = { shell: { program: programs.shell, scope: (s: State) => ({ title: `${s.phase}:${s.detail}` }) } } as unknown as { [K in State["shown"]]: Valance.View<State> };
  const definition = Valance.define({
    name: "lazy", state: { schema: State, initial }, views, view: (s: State) => s.shown,
    commands: (state: Nexus.State.StateHandle<State>) => {
      let issued = 0;                                                                     // tickets: the application's own, taken atomically (synchronously)
      const table: Record<string, Nexus.Mesh.Binding<never, never>> = {};
      const set = (change: (c: State) => State) => state.update((c): Effect.Effect<State> => Effect.succeed(change(c)));
      const load = Nexus.Command.define("lazy.load", Schema.Struct({ name: Schema.Literal("quiet", "extra", "rogue") }), ({ name }) => Effect.gen(function* () {
        const mine = ++issued;

        yield* set((c) => ({ ...c, phase: "loading", ticket: mine, detail: name }));
        const bundle = yield* loader.load(name).pipe(Effect.either);

        if (bundle._tag === "Left") { yield* set((c) => c.ticket === mine ? { ...c, phase: "failed", detail: bundle.left } : c); return; }

        // ADMISSION: D ⊆ B for the loaded program, evaluated now against the table's keys. The loaded value is not usable until this passes.
        const declared = yield* Effect.promise(() => declaredEvents({ program: { root: bundle.right.program.root, templates: bundle.right.program.templates }, model: bundle.right.program.model }));
        const missing = declared.diagnostics !== undefined ? ["<diagnostics>"] : declared.events.map((e) => `${e.component}/${e.command}`).filter((key) => !Object.hasOwn(table, key));

        yield* set((c) => {
          if (c.ticket !== mine) { return c; }                                                // a stale load: dropped by the application's own ticket
          if (missing.length > 0) { return { ...c, phase: "rejected", detail: missing.join() }; }

          admitted.clear();
          admitted.set(name, bundle.right);

          return { ...c, phase: "ready", detail: name };
        });
      }));
      const use = Nexus.Command.define("lazy.use", Schema.Struct({}), () => Effect.gen(function* () {
        const current = yield* state.get;
        const bundle = admitted.get(current.detail);

        if (current.phase !== "ready" || bundle === undefined) { yield* set((c) => ({ ...c, detail: "not loaded" })); return; }

        // USE: the admitted program through MESH, and the admitted impl.
        const result = yield* Effect.promise(() => meshRender({ program: { root: bundle.program.root, templates: bundle.program.templates }, model: bundle.program.model, snapshot: { title: "t" } }));

        yield* set((c) => ({ ...c, detail: `${bundle.impl.greet()} / rendered:${result.diagnostics === undefined}` }));
      }));
      const show = (shown: State["shown"]) => Nexus.Command.define(`lazy.show.${shown}`, Schema.Struct({}), () => Effect.asVoid(set((c) => ({ ...c, shown }))));
      const entries = {
        "app/load": Valance.entry(load, (name) => ({ name })),
        "app/use": Valance.entry(use),
        "app/showExtra": Valance.entry(show("extra")),
        "app/showQuiet": Valance.entry(show("quiet")),
        "extra/go": Valance.entry(Nexus.Command.define("lazy.go", Schema.Struct({}), () => Effect.asVoid(set((c) => ({ ...c, detail: "went" }))))),
        "app/loadQuiet": Valance.entry(load, () => ({ name: "quiet" })),
        "app/loadExtra": Valance.entry(load, () => ({ name: "extra" })),
        "app/loadRogue": Valance.entry(load, () => ({ name: "rogue" })),
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;

      Object.assign(table, entries);

      return table;
    },
    ...(options.start === undefined ? {} : { start: `app/load${options.start[0]!.toUpperCase()}${options.start.slice(1)}` }),
  });

  return { definition, views, admitted };
};

const boot = async (options: { readonly start?: Name; readonly mount?: boolean } = {}) => {
  const loader = fakeLoader();
  const a = app(loader, options);
  const scope = await Effect.runPromise(Scope.make());
  const released: Array<string> = [];

  await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { released.push("platform resource released"); })));
  const handle = await Effect.runPromise(Valance.start(a.definition).pipe(Scope.extend(scope)));
  let target: TextTarget | undefined;
  let mounted: Valance.Mounted<unknown> | undefined;

  if (options.mount === true) {
    const factory = textTarget();

    mounted = await Effect.runPromise(Valance.mount(handle, (report) => (target = factory(report))).pipe(Scope.extend(scope)));
  }

  return {
    loader, a, scope, released, handle, mounted, target: () => target!,
    state: () => Effect.runPromise(handle.state),
    invoke: (key: string, ...args: ReadonlyArray<unknown>) => Effect.runPromise(Effect.exit(handle.invoke(key, args.map((value) => ({ value })) as never))),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

describe("part 1: loading, admission and use, inside the existing contract", () => {
  it("1: the `start` command loads; an admissible program is admitted AFTER start, then used; before that it is not usable", async () => {
    const b = await boot({ start: "extra" });

    await wait(() => b.loader.log.includes("start extra#1"));                          // started by `start`, not by the host
    expect((await b.state()).phase).toBe("loading");
    await b.invoke("app/use");
    expect((await b.state()).detail).toBe("not loaded");                              // not admitted yet: unusable

    await b.loader.finish("extra", 1);
    await wait(() => b.a.admitted.size === 1);                                         // extra/go IS in the table: D ⊆ B holds, so it is admitted
    await b.invoke("app/use");
    expect((await b.state()).detail).toBe("hello from extra / rendered:true");
    await b.close();
  });

  it("2: a loaded program that declares an event the table lacks is REJECTED at admission, as application state; the same invariant as `start`, nothing weakened", async () => {
    const b = await boot();

    const loading = b.invoke("app/loadRogue");

    await wait(() => b.loader.log.includes("start rogue#1"));
    await b.loader.finish("rogue");
    await loading;
    expect(await b.state()).toMatchObject({ phase: "rejected", detail: "rogue/nope" });
    expect(b.a.admitted.size).toBe(0);
    await b.invoke("app/use");
    expect((await b.state()).detail).toBe("not loaded");
    await b.close();
  });

  it("3: a failed load is ordinary state; nothing is admitted; the application stays healthy", async () => {
    const b = await boot();
    const loading = b.invoke("app/loadQuiet");

    await wait(() => b.loader.log.includes("start quiet#1"));
    await b.loader.fail("quiet");
    await loading;
    expect(await b.state()).toMatchObject({ phase: "failed", detail: "unavailable" });
    expect(b.a.admitted.size).toBe(0);
    await b.close();
  });

  it("4: closing the application interrupts a pending load before the platform resource releases; a late completion admits nothing and changes nothing", async () => {
    const b = await boot({ start: "quiet" });

    await wait(() => b.loader.log.includes("start quiet#1"));
    await b.close();
    expect(b.loader.log).toEqual(["start quiet#1", "interrupted quiet"]);
    expect(b.released).toEqual(["platform resource released"]);
    await b.loader.finish("quiet").catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.a.admitted.size).toBe(0);
    expect(await b.state()).toMatchObject({ phase: "loading", detail: "quiet" });
  });

  it("5: stale loads: A then B started, B finishes then A: the application's own ticket drops A; no loader ordering semantics exist or are needed", async () => {
    const b = await boot();
    const a1 = b.invoke("app/loadQuiet");
    const a2 = b.invoke("app/loadExtra");

    await wait(() => b.loader.log.includes("start quiet#1") && b.loader.log.includes("start extra#1"));
    await b.loader.finish("extra");                                                    // B (ticket 2) first
    await a2;
    expect(await b.state()).toMatchObject({ phase: "ready", detail: "extra" });
    await b.loader.finish("quiet");                                                    // then A (ticket 1)
    await a1;
    expect(await b.state()).toMatchObject({ phase: "ready", detail: "extra" });       // A dropped
    expect([...b.a.admitted.keys()]).toEqual(["extra"]);
    await b.close();
  });
});

describe("part 2: characterization of UNSUPPORTED behavior (not a contract): a loaded program forced in as a VIEW", () => {
  it("6: forcing it into `views` after start: an event-free program renders (render reads `views` live); an event-bearing one draws but its event is a defect, no host was built for it at start", async () => {
    const b = await boot({ mount: true });

    b.a.views.quiet = { program: programs.quiet, scope: (s: State) => ({ title: s.phase }) };
    b.a.views.extra = { program: programs.extra, scope: (s: State) => ({ title: s.phase }) };

    await b.invoke("app/showQuiet");
    await wait(() => b.target().screen().includes("quiet"));                          // D = ∅, so nothing needed admission: it simply renders

    await b.invoke("app/showExtra");
    await wait(() => b.target().screen().includes("Go"));                             // drawn: no conformance ran, `start` was the only time it did
    b.target().activate("Go");
    await wait(() => b.mounted!.dispatched.length === 1);

    const exit = b.mounted!.dispatched[0]!;

    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause) && String(Cause.squash(exit.cause))).toContain("no view named extra");   // fails CLOSED, as a defect, never reaching the command `extra/go`
    expect((await b.state()).detail).not.toBe("went");
    await b.close();
  });
});

describe("part 3: a lazily acquired capability with a finalizer", () => {
  it("7: a resource acquired inside a command lives only as long as that command; the application cannot hold it past the command, and the application's Scope is not reachable from a command", async () => {
    const log: Array<string> = [];
    const held: { impl?: { readonly use: () => string } } = {};
    const definition = Valance.define({
      name: "lazy-capability", state: { schema: State, initial }, views: { shell: { program: programs.shell, scope: (s: State) => ({ title: s.phase }) } }, view: () => "shell" as const,
      commands: () => ({
        "app/acquire": Valance.entry(Nexus.Command.define("lazy.acquire", Schema.Struct({}), () => Effect.scoped(Effect.gen(function* () {
          const impl = yield* Effect.acquireRelease(Effect.sync(() => { log.push("acquired"); return { use: () => "alive" }; }), () => Effect.sync(() => { log.push("released"); }));

          held.impl = impl;                                                             // the application keeps the impl...
        })))),
      }),
    });
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(definition).pipe(Scope.extend(scope)));

    await Effect.runPromise(handle.invoke("app/acquire", []));
    expect(log).toEqual(["acquired", "released"]);                                  // ...but the finalizer ran when the command ended, application alive
    expect(held.impl?.use()).toBe("alive");                                        // a dangling impl: nothing stops its use (the type cannot say it was released)
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
