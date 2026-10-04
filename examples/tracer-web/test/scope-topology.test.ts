// Stage 37: the SCOPE TOPOLOGY between an application and its mounts. `Valance.start` and `Valance.mount` both only require "a Scope" from
// the caller; nothing parents one to the other. Three arrangements are expressible with public APIs and are probed separately:
//   "shared"      start and mount in the SAME Scope (what every example, browser test and capability test in this repository does)
//   "parented"    each mount in a child Scope forked from the application's Scope (Effect's `Scope.fork`)
//   "independent" each mount in its own unrelated Scope
// The harness is Stage 35/36's. Event ownership is NOT touched: production behavior, the Stage 36 decision stays open.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, ExecutionStrategy, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const ids = ["setA", "setB", "gate1", "gate2", "typed", "die"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const programs = await compilePrograms();
const firstValue = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => { const first = args[0]; return first !== undefined && "value" in first ? first.value : undefined; };
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isFailType(exit.cause) ? "failed" : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const yields = (n: number) => Effect.runPromise(Effect.forEach(Array.from({ length: n }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));
const at = (events: ReadonlyArray<string>, event: string) => events.indexOf(event);

type Topology = "shared" | "parented" | "independent";

const boot = async (topology: Topology = "independent") => {
  const events: Array<string> = [];
  const gates = new Map<string, { readonly gate: Deferred.Deferred<string>; readonly started: Deferred.Deferred<void> }>();
  const gateOf = (name: string) => {
    let entry = gates.get(name);

    if (entry === undefined) {
      entry = { gate: Effect.runSync(Deferred.make<string>()), started: Effect.runSync(Deferred.make<void>()) };
      gates.set(name, entry);
    }

    return entry;
  };
  const initial: State = { items: ids.map((id) => ({ id, name: id })), value: "init" };
  const app = Valance.define({
    name: "multi-mount",
    state: { schema: State, initial },
    views: { home: { program: programs.home, scope: (state: State) => ({ title: "Mounts", count: state.items.length, summary: state.value, firstId: "", items: state.items.map(({ id, name }) => ({ id, name })) }) } },
    view: () => "home" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const commit = (value: string) => Effect.gen(function* () {
        yield* state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value }));
        events.push(`commit ${value}`);
      });
      const wait = (name: string) => Effect.gen(function* () {
        const { gate, started } = gateOf(name);

        events.push(`${name} started`);
        yield* Deferred.succeed(started, undefined);

        return yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { events.push(`${name} interrupted`); })));
      });
      const behavior = (id: string): Effect.Effect<void> => {
        switch (id) {
          case "setA": return commit("A");
          case "setB": return commit("B");
          case "gate1": return Effect.flatMap(wait("gate1"), (v) => commit(`g1:${v}`));
          case "gate2": return Effect.flatMap(wait("gate2"), (v) => commit(`g2:${v}`));
          case "typed": return Effect.fail("typed-boom") as never;
          case "die": return Effect.die(new Error("defect-boom"));
          default: return Effect.die(new Error(`no behavior for ${id}`));
        }
      };

      return {
        // the borrowed home program also declares Reverse: bound (a no-op) because the harness uses that program, though nothing here presses it
        "home/reverse": Nexus.Mesh.bind(Nexus.Command.define("t.reverse", Schema.Struct({}), () => Effect.void), () => ({})),
        "home/open": Nexus.Mesh.bind(Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), ({ id }) =>
          behavior(id).pipe(Effect.onExit((exit) => Effect.sync(() => { events.push(`open(${id}) exit: ${show(exit)}`); })))), (args) => ({ id: firstValue(args) })),
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });

  const appScope = await Effect.runPromise(Scope.make());

  await Effect.runPromise(Scope.addFinalizer(appScope, Effect.sync(() => { events.push("platform resource released"); })));
  const handle = (await Effect.runPromise(Valance.start(app as never, { state: initial }).pipe(Scope.extend(appScope)))) as Valance.ApplicationHandle<State, never>;
  // Two independent subscribers to the application's state stream: are they given the same commit?
  const seen: [Array<State>, Array<State>] = [[], []];

  for (const index of [0, 1] as const) {
    Effect.runFork(Stream.runForEach(runningOf(handle as never).states as Stream.Stream<State>, (state) => Effect.sync(() => { seen[index].push(state); })).pipe(Effect.onExit(() => Effect.sync(() => { if (index === 0) { events.push("state stream ended"); } }))));
  }

  /** One independent mount in its own Scope, over its own page. */
  const mountOn = async (name: string, options: { readonly failDraw?: boolean } = {}) => {
    const page = load("");
    const label = () => (page.container.querySelector("span")?.textContent ?? "").replace(/^\d+ items: /, "");
    const target: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container: page.container, primitives })(report);

      return {
        draw: (tree) => { if (options.failDraw === true) { throw new Error(`${name} draw failed`); } port.draw(tree); events.push(`${name} render draw: ${label()}`); },
        update: (tree) => { port.update(tree); events.push(`${name} render update: ${label()}`); },
        hydrate: (tree) => port.hydrate(tree),
        unmount: () => { port.unmount(); events.push(`${name} unmounted`); },
      };
    };
    const scope = topology === "shared" ? appScope : topology === "parented" ? await Effect.runPromise(Scope.fork(appScope, ExecutionStrategy.sequential)) : await Effect.runPromise(Scope.make());
    const mounted = await Effect.runPromise(Effect.exit(Valance.mount(handle as never, target).pipe(Scope.extend(scope))));

    return {
      scope, page, label, mounted,
      mount: Exit.isSuccess(mounted) ? (mounted.value as Valance.Mounted<never>) : undefined,
      unmount: () => topology === "shared" ? Promise.reject(new Error("a shared-Scope mount cannot be closed on its own")) : Effect.runPromise(Scope.close(scope, Exit.void)),
      clickRow: (id: string) => page.click(page.container.querySelectorAll("div")[ids.indexOf(id as never)]!.querySelector("button")!),
    };
  };
  type MountOn = Awaited<ReturnType<typeof mountOn>>;

  return {
    events, handle, mountOn, seen,
    invoke: (id: string) => Effect.runFork(Effect.onExit(handle.invoke("home/open", [{ value: id }]), (exit) => Effect.sync(() => { events.push(`invoke(${id}): ${show(exit)}`); }))),
    closeApp: () => Effect.runPromise(Scope.close(appScope, Exit.void).pipe(Effect.tap(() => Effect.sync(() => { events.push("application closed"); })))),
    started: (name: string) => Effect.runPromise(Deferred.await(gateOf(name).started)),
    release: (name: string, value: string) => Effect.runPromise(Deferred.succeed(gateOf(name).gate, value)),
    seenEvent: (event: string) => until(() => events.includes(event)),
    state: () => Effect.runPromise(handle.state),
    renders: (name: string) => events.filter((event) => event.startsWith(`${name} render`) || event === `${name} unmounted`),
    commits: () => events.filter((event) => event.startsWith("commit ")),
    stable: () => yields(400),
    _: undefined as unknown as MountOn,
  };
};



/** The lifecycle-relevant part of the trace, without per-mount render noise. (`state stream ended` is the collector's own fiber, observed later: not ordered here.) */
const timeline = (events: ReadonlyArray<string>) => events.filter((event) => /unmounted$|^gate1 interrupted|^open\(gate1\) exit|^invoke\(gate1\)|platform resource released|application closed/.test(event));
const settle = (b: Awaited<ReturnType<typeof boot>>) => b.stable();

describe("closing the application with a command suspended: the order in each topology", () => {
  for (const topology of ["shared", "parented"] as const) {
    for (const kind of ["invoked", "click"] as const) {
      it(`${topology} Scope, ${kind} command: mounts unmount first (reverse of their creation), THEN the command is interrupted, THEN the platform releases`, async () => {
        const b = await boot(topology);
        const a = await b.mountOn("A");

        await b.mountOn("B");
        if (kind === "invoked") { b.invoke("gate1"); } else { a.clickRow("gate1"); }
        await b.started("gate1");
        await b.closeApp();
        await settle(b);

        expect(timeline(b.events)).toEqual([
          "B unmounted", "A unmounted",                                                         // mount finalizers: the targets are gone BEFORE the drain
          "gate1 interrupted", "open(gate1) exit: interrupted",                                 // the registry's drain (Stage 29)
          ...(kind === "invoked" ? ["invoke(gate1): interrupted"] : []),
          "platform resource released", "application closed",                                   // NEXUS terminated, resources last
        ]);
        expect(b.commits()).toEqual([]);
        expect(a.mount!.dispatched.map(show)).toEqual(kind === "click" ? ["interrupted"] : []);   // a click command is the application's: the registry interrupts it and the dispatching mount records the exit (Stage 39)
        expect(show(await Effect.runPromise(a.mount!.followed) as never)).toBe("interrupted");   // the follower was ended by the MOUNT's finalizer
      });
    }
  }

  for (const kind of ["invoked", "click"] as const) {
    it(`independent Scopes, ${kind} command: NOTHING unmounts; the command is interrupted and the platform released with both targets still mounted; the mounts' followers end because the application ended`, async () => {
      const b = await boot("independent");
      const a = await b.mountOn("A");
      const c = await b.mountOn("B");

      if (kind === "invoked") { b.invoke("gate1"); } else { a.clickRow("gate1"); }
      await b.started("gate1");
      await b.closeApp();
      await settle(b);

      expect(timeline(b.events)).toEqual([
        "gate1 interrupted", "open(gate1) exit: interrupted",
        ...(kind === "invoked" ? ["invoke(gate1): interrupted"] : []),
        "platform resource released", "application closed",
      ]);
      expect([a.label(), c.label()]).toEqual(["init", "init"]);                                // both pages are still drawn after the application is gone
      expect(show(await Effect.runPromise(a.mount!.followed) as never)).toBe("succeeded");     // the follower ended because the value stream ended
      expect(a.mount!.dispatched.map(show)).toEqual(kind === "click" ? ["interrupted"] : []);  // the mount was open, so the interrupted dispatch recorded itself (Stage 36 D5b)
      expect(b.commits()).toEqual([]);
      await a.unmount(); await c.unmount();
      expect(timeline(b.events).slice(-2)).toEqual(["A unmounted", "B unmounted"]);            // each mount Scope still closes cleanly, once, later
    });
  }
});

describe("B3: what an application close leaves behind when the mounts are independent", () => {
  it("the mounts are mounted but dead: drawn, not updating, events reach admission and are refused, state stays readable, their Scopes close cleanly", async () => {
    const b = await boot("independent");
    const a = await b.mountOn("A");

    await b.closeApp();
    await settle(b);

    expect((await b.state()).value).toBe("init");                                           // state is readable after termination (Stage 22)
    expect(a.label()).toBe("init");                                                         // the target still shows the last render
    expect(await Effect.runPromise(Effect.exit(b.handle.invoke("home/open", [{ value: "setA" }])).pipe(Effect.map(show)))).toBe("died: NEXUS: the runtime has begun terminating");
    a.clickRow("setA");                                                                     // PORT still reports; `connect` still dispatches
    await until(() => a.mount!.dispatched.length === 1);
    expect(a.mount!.dispatched.map(show)).toEqual(["died: NEXUS: the runtime has begun terminating"]);   // refused by the runtime, recorded in the live mount's ledger
    expect(b.commits()).toEqual([]);
    expect(b.renders("A")).toEqual(["A render draw: init"]);                                // no update ever arrives
    await a.unmount();
    expect(b.renders("A").at(-1)).toBe("A unmounted");
  });

  it("B8 a mount made AFTER the application closed fails by itself: the value stream has already ended, so there is no first render (no resurrection)", async () => {
    const b = await boot("independent");

    await b.closeApp();
    const late = await b.mountOn("L");

    expect(show(late.mounted)).toBe("died: the application ended before its first render");
    expect(b.renders("L")).toEqual([]);
    await late.unmount();                                                                   // harmless
  });
});

describe("mounts close, the application remains", () => {
  it("B1 independent: closing A, then B, then the application releases in that order and each exactly once", async () => {
    const b = await boot("independent");
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    await a.unmount(); await c.unmount();
    await b.closeApp();
    expect(timeline(b.events)).toEqual(["A unmounted", "B unmounted", "platform resource released", "application closed"]);
  });

  for (const topology of ["independent", "parented"] as const) {
    it(`B2/B7 ${topology}: with every mount closed the application is fully alive: commands run and commit, values flow, a new mount draws the current state; closing it later is still ordered`, async () => {
      const b = await boot(topology);
      const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

      await a.unmount(); await c.unmount();
      await Effect.runPromise(Fiber.join(b.invoke("setA")));
      expect((await b.state()).value).toBe("A");
      expect(b.seen[0].map((state) => state.value)).toEqual(["init", "A"]);                 // values still flow with no mount
      const late = await b.mountOn("C");

      expect(late.label()).toBe("A");
      await b.closeApp();

      if (topology === "parented") {
        expect(timeline(b.events)).toEqual(["A unmounted", "B unmounted", "C unmounted", "platform resource released", "application closed"]);   // the late child closed with its parent, before the release
      } else {
        expect(timeline(b.events)).toEqual(["A unmounted", "B unmounted", "platform resource released", "application closed"]);              // the late mount is NOT closed by the application
        expect(late.label()).toBe("A");                                                                                                       // it is still drawn, mounted but dead
        await late.unmount();
        expect(timeline(b.events).at(-1)).toBe("C unmounted");
      }
    });
  }

  for (const kind of ["invoked", "click"] as const) {
    it(`B6 control, independent: closing the dispatching mount mid-command with the application alive: the ${kind} command survives (Stage 39: a click command is the application's once admitted)`, async () => {
      const b = await boot("independent");
      const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

      if (kind === "invoked") { b.invoke("gate1"); } else { a.clickRow("gate1"); }
      await b.started("gate1");
      await a.unmount();
      await b.release("gate1", "x");
      await b.seenEvent("B render update: g1:x");
      await settle(b);

      expect(b.events).not.toContain("gate1 interrupted");
      expect(b.commits()).toEqual(["commit g1:x"]);
      expect(c.label()).toBe("g1:x");
      expect(b.events).not.toContain("application closed");
    });
  }

  it("Scope.fork: a parented mount closes on its own like an independent one (the parent Scope only adds 'and with the application')", async () => {
    const b = await boot("parented");
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    await a.unmount();
    await Effect.runPromise(Fiber.join(b.invoke("setA")));
    await b.seenEvent("B render update: A");
    expect(timeline(b.events)).toEqual(["A unmounted"]);
    await b.closeApp();
    expect(timeline(b.events)).toEqual(["A unmounted", "B unmounted", "platform resource released", "application closed"]);   // the remaining child closed with the parent, before the release
    void c;
  });
});
