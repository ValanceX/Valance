// Stage 55 — whose capability, whose resource, and what its use can and cannot do. Observed over NEXUS's existing mechanism (a platform Layer supplied at `start`, resolved by `Capability.require`):
//   ownership   a resource belongs to ONE application's Scope: acquired by `start`, held across commands, mount closes and history closes, released once when the application's Scope closes
//   isolation   a command resolves only its own application's implementation: two applications, two implementations, no sharing; nothing a consumer does acquires or releases it
//   failure     a capability failure is the command's failure (typed, in its own channel): no commit if it comes first, the commit stays if it comes after; never an application lifecycle event
//   after close admission is terminal, so no capability operation runs; observation (reads, the stream, presentation) never touches a capability
// The platform Layer and `Capability.require` are NEXUS's; VALANCE adds nothing (the handle stays `state` and `invoke`).
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import type { WebPort } from "@valancex/port-web";
import { runningOf } from "@valancex/valance/internal";
import { Cause, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const programs = await compilePrograms();
const State = Schema.Struct({ n: Schema.Number, owner: Schema.String });
type State = Schema.Schema.Type<typeof State>;
interface Meter { readonly owner: string; readonly use: () => Effect.Effect<number, "capability failed">; readonly failing: { value: boolean } }
const Meter = Nexus.Capability.define<Meter>("test/meter");
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const kind = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "success" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isDieType(exit.cause) ? `die ${String((exit.cause.defect as Error).message).slice(0, 60)}` : Cause.isFailType(exit.cause) ? `fail ${typeof exit.cause.error === "string" ? exit.cause.error : (exit.cause.error as { _tag: string })._tag}` : "other";

const app = Valance.define({
  name: "resources", state: { schema: State, initial: { n: 0, owner: "" } },
  views: { only: { program: programs.notfound, scope: (s: State) => ({ title: `n${s.n}` }) } }, view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<State>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bind = (name: string, body: () => Effect.Effect<unknown, unknown, any>) => Nexus.Mesh.bind(Nexus.Command.define(name, Schema.Struct({}) as never, body as never), (() => ({})) as never);
    const record = Effect.gen(function* () {
      const meter = yield* Nexus.Capability.require(Meter);
      const n = yield* meter.use();

      return { meter, n };
    });

    return {
      // uses the capability and stores what it answered, including WHICH implementation answered
      "app/measure": bind("measure", () => Effect.flatMap(record, ({ meter, n }) => Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ n, owner: meter.owner }))))),
      // the capability fails before any commit
      "app/measureFailsFirst": bind("measureFailsFirst", () => Effect.flatMap(record, ({ meter, n }) => Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ n, owner: meter.owner }))))),
      // commits, then the capability fails
      "app/commitThenMeter": bind("commitThenMeter", () => Effect.zipRight(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 100 })), Effect.flatMap(Nexus.Capability.require(Meter), (meter) => meter.use()))),
      "app/navigate": Nexus.Mesh.bind(Nexus.Command.define("navigate", Schema.Struct({ n: Schema.Number }) as never, (({ n }: { n: number }) => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n })))) as never), ((args: ReadonlyArray<Nexus.Mesh.IntentArgument>) => (args[0] !== undefined && "value" in args[0] ? args[0].value : undefined)) as never),
    } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
  },
});

/** One application with its own meter implementation and resource, counted. */
const world = async (owner: string) => {
  const counts = { acquired: 0, released: 0, uses: 0 };
  const failing = { value: false };
  const layer: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.acquireRelease(
      Effect.sync((): Meter => { counts.acquired += 1; return { owner, failing, use: () => { counts.uses += 1; return failing.value ? Effect.fail("capability failed" as const) : Effect.succeed(counts.uses); } }; }),
      () => Effect.sync(() => { counts.released += 1; })
    ),
    (implementation) => ({ resolutions: new Map([[Meter.id, { _tag: "Available" as const, implementation }]]) })
  ));
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app, { platform: layer }).pipe(Scope.extend(appScope)));
  const mount = async () => {
    const page = load("");
    const scope = await run(Scope.make());

    await run(Valance.mount(handle, ((report) => Web.target({ container: page.container, primitives })(report)) as Valance.TargetFactory<WebPort>).pipe(Scope.extend(scope)));

    return { label: () => page.container.querySelector("section")?.getAttribute("aria-label"), close: () => run(Scope.close(scope, Exit.void)) };
  };
  const history = async () => {
    const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/0" });
    const scope = await run(Scope.make());

    await run(Web.history(handle, { window: dom.window as unknown as Window, urlOf: (s: { readonly n: number }) => `/${s.n}`, stateOf: (url: URL) => ({ n: Number(url.pathname.slice(1)) }), navigate: "app/navigate" } as never).pipe(Scope.extend(scope)));
    await sleep(30);

    return { close: () => run(Scope.close(scope, Exit.void)) };
  };
  const invoke = (key: string) => Effect.runPromise(Effect.exit(handle.invoke(key, [])));

  return { counts, failing, handle, mount, history, invoke, appScope, state: async () => (await run(handle.state)) as State, close: () => run(Scope.close(appScope, Exit.void)) };
};

describe("capability use and isolation", () => {
  it("A/B/F/G. a command reaches its own application's capability, and only that one: two applications, two implementations, interleaved and concurrent use, closing one leaves the other's usable", async () => {
    const a = await world("A");
    const b = await world("B");

    expect(a.counts.acquired).toBe(1);                                   // the capability is installed (acquired by start)
    expect(b.counts.acquired).toBe(1);
    expect(kind(await a.invoke("app/measure"))).toBe("success");
    expect(await a.state()).toEqual({ n: 1, owner: "A" });               // A's implementation answered
    expect(await b.state()).toEqual({ n: 0, owner: "" });
    await Promise.all([a.invoke("app/measure"), b.invoke("app/measure"), a.invoke("app/measure"), b.invoke("app/measure")]);
    expect((await a.state()).owner).toBe("A");
    expect((await b.state()).owner).toBe("B");                           // never the other's, however interleaved
    expect([a.counts.uses, b.counts.uses]).toEqual([3, 2]);              // each resource counted only its own application's commands
    await a.close();
    expect(kind(await b.invoke("app/measure"))).toBe("success");         // B's resource is untouched by A's close
    expect(b.counts).toMatchObject({ acquired: 1, released: 0, uses: 3 });
    expect(a.counts).toMatchObject({ acquired: 1, released: 1 });
    await b.close();
  });

  it("C/D. a capability failure before the commit commits nothing; after it, the commit stays; neither is an application lifecycle event and consumers stay alive", async () => {
    const w = await world("A");
    const m = await w.mount();

    w.failing.value = true;
    expect(kind(await w.invoke("app/measureFailsFirst"))).toBe("fail capability failed");
    expect(await w.state()).toEqual({ n: 0, owner: "" });                // nothing committed
    expect(kind(await w.invoke("app/commitThenMeter"))).toBe("fail capability failed");
    expect(await w.state()).toEqual({ n: 100, owner: "" });              // the commit before the failing use is authoritative
    await until(() => m.label() === "n100");                             // and the mount presented it
    w.failing.value = false;
    expect(kind(await w.invoke("app/measure"))).toBe("success");         // the application is as usable as before
    await until(() => m.label() === "n3");                               // `measure` stores the meter's use count: the two failed uses counted too
    await m.close();
    await w.close();
  });
});

describe("resource lifetime", () => {
  it("E/H/K. the resource is acquired at start and held across commands, a mount's close and a history's close; the application's Scope releases it exactly once", async () => {
    const w = await world("A");
    const m = await w.mount();
    const h = await w.history();

    expect(w.counts).toMatchObject({ acquired: 1, released: 0 });
    await w.invoke("app/measure");
    expect(w.counts).toMatchObject({ acquired: 1, released: 0 });        // command completion does not release it
    await m.close();
    expect(w.counts).toMatchObject({ acquired: 1, released: 0 });        // nor does a mount
    expect(kind(await w.invoke("app/measure"))).toBe("success");
    await h.close();
    expect(w.counts).toMatchObject({ acquired: 1, released: 0 });        // nor a history
    expect(kind(await w.invoke("app/measure"))).toBe("success");
    await w.close();                                                     // the counter is read only after the Scope settled
    expect(w.counts).toMatchObject({ acquired: 1, released: 1 });
    await w.close();
    expect(w.counts).toMatchObject({ acquired: 1, released: 1 });        // exactly once
  });

  it("I. after the close admission is terminal: no capability operation runs, nothing commits, the last state stays readable", async () => {
    const w = await world("A");

    await w.invoke("app/measure");
    await w.close();
    const uses = w.counts.uses;

    expect(kind(await w.invoke("app/measure"))).toMatch(/^die /);
    expect(kind(await w.invoke("app/commitThenMeter"))).toMatch(/^die /);
    expect(w.counts.uses).toBe(uses);                                    // the capability was never reached
    expect(await w.state()).toEqual({ n: 1, owner: "A" });
  });

  it("J. observation never touches the capability: reads, the state stream and a mount's presentation use none", async () => {
    const w = await world("A");
    const seen: Array<unknown> = [];
    const watcher = Effect.runFork(Stream.runForEach(runningOf(w.handle).states, (s) => Effect.sync(() => { seen.push(s); })));
    const m = await w.mount();

    await w.invoke("app/measure");                                       // one use, by the command
    await until(() => m.label() === "n1");
    await w.state();
    await w.state();
    await sleep(30);
    expect(seen.length).toBe(2);
    expect(w.counts.uses).toBe(1);                                       // nothing else called it
    await Effect.runPromise(Fiber.interrupt(watcher));
    await m.close();
    await w.close();
  });
});
