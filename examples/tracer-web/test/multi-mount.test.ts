// Stage 35: one application, several independent mounts. Each mount is a real `Valance.mount` in ITS OWN Scope (so each has its own
// `connect`: follower, target, pending dispatches) over the one handle returned by `Valance.start` in the application's Scope.
// No store, no synchronisation, no new API: this only observes which lifetime owns what. Events come from real clicks in each mount's
// own page, or from `invoke`. One MESH intent `home/open(id)` carries every behavior, selected by the clicked row's id.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const ids = ["setA", "setB", "gate1", "gate2", "boom"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const programs = await compilePrograms();
const firstValue = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => { const first = args[0]; return first !== undefined && "value" in first ? first.value : undefined; };
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isFailType(exit.cause) ? "failed" : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const yields = (n: number) => Effect.runPromise(Effect.forEach(Array.from({ length: n }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));
const at = (events: ReadonlyArray<string>, event: string) => events.indexOf(event);

const boot = async () => {
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
          default: return Effect.die(new Error(`no behavior for ${id}`));
        }
      };

      return {
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
    Effect.runFork(Stream.runForEach(runningOf(handle as never).states as Stream.Stream<State>, (state) => Effect.sync(() => { seen[index].push(state); })));
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
    const scope = await Effect.runPromise(Scope.make());
    const mounted = await Effect.runPromise(Effect.exit(Valance.mount(handle as never, target).pipe(Scope.extend(scope))));

    return {
      scope, page, label, mounted,
      mount: Exit.isSuccess(mounted) ? (mounted.value as Valance.Mounted<never>) : undefined,
      unmount: () => Effect.runPromise(Scope.close(scope, Exit.void)),
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

describe("A, B, E: both mounts observe the one application state", () => {
  it("A two mounts start from the same application state: both draw the initial value; no commit, no state change by mounting", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    expect(a.label()).toBe("init");
    expect(c.label()).toBe("init");
    expect(b.renders("A")).toEqual(["A render draw: init"]);
    expect(b.renders("B")).toEqual(["B render draw: init"]);
    await b.stable();
    expect(b.commits()).toEqual([]);                                                // mounting commits nothing
    expect(b.seen[0].length).toBe(1);                                               // the state stream has emitted only its initial value
  });

  it("B one command, two observers: ONE commit; the state stream hands every subscriber the same value object; each mount updates once from it", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    await Effect.runPromise(Fiber.join(b.invoke("setA")));
    await b.seenEvent("A render update: A");
    await b.seenEvent("B render update: A");
    await b.stable();

    expect(b.commits()).toEqual(["commit A"]);                                       // a single application transition
    expect(b.seen[0].length).toBe(2);
    expect(b.seen[0][1]).toBe(b.seen[1][1]);                                         // identical object: no per-subscriber copy
    expect(b.renders("A")).toEqual(["A render draw: init", "A render update: A"]);
    expect(b.renders("B")).toEqual(["B render draw: init", "B render update: A"]);
    expect([a.label(), c.label()]).toEqual(["A", "A"]);
  });

  it("E a mount made after the state changed starts from the CURRENT state, not the initial one, and its mounting commits nothing", async () => {
    const b = await boot();
    const a = await b.mountOn("A");

    await Effect.runPromise(Fiber.join(b.invoke("setA")));
    await b.seenEvent("A render update: A");
    const c = await b.mountOn("B");

    expect(c.label()).toBe("A");
    expect(b.renders("B")).toEqual(["B render draw: A"]);
    await b.stable();
    expect(b.commits()).toEqual(["commit A"]);                                       // still the one commit
    expect(a.label()).toBe("A");
  });
});

describe("C, D: unmounting one observer", () => {
  for (const [first, second] of [["B", "A"], ["A", "B"]] as const) {
    it(`C/D unmount ${first} (the ${first === "B" ? "second" : "first"} mount), then commit: the application and mount ${second} carry on; ${first} stays silent`, async () => {
      const b = await boot();
      const mounts = { A: await b.mountOn("A"), B: await b.mountOn("B") };

      await Effect.runPromise(Fiber.join(b.invoke("setA")));
      await b.seenEvent("A render update: A"); await b.seenEvent("B render update: A");
      await mounts[first].unmount();
      await Effect.runPromise(Fiber.join(b.invoke("setB")));
      await b.seenEvent(`${second} render update: B`);
      await b.stable();

      expect(b.commits()).toEqual(["commit A", "commit B"]);
      expect((await b.state()).value).toBe("B");                                     // application state is unaffected by the unmount
      expect(b.renders(second)).toEqual([`${second} render draw: init`, `${second} render update: A`, `${second} render update: B`]);
      expect(b.renders(first)).toEqual([`${first} render draw: init`, `${first} render update: A`, `${first} unmounted`]);   // nothing after its unmount
      expect(b.events).not.toContain("application closed");
    });
  }
});

describe("F, I: async commands and mounts", () => {
  it("F an invoked async command, two mounts: neither updates before the commit; both update after; unmounting B while it is suspended leaves B silent and A updated", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];
    const caller = b.invoke("gate1");

    await b.started("gate1");
    await b.stable();
    expect(b.renders("A").length + b.renders("B").length).toBe(2);                   // only the two initial draws
    await b.release("gate1", "x");
    await Effect.runPromise(Fiber.join(caller));
    await b.seenEvent("A render update: g1:x"); await b.seenEvent("B render update: g1:x");

    const b2 = await boot();
    const [a2, c2] = [await b2.mountOn("A"), await b2.mountOn("B")];
    const caller2 = b2.invoke("gate1");

    await b2.started("gate1");
    await c2.unmount();
    await b2.release("gate1", "y");
    await Effect.runPromise(Fiber.join(caller2));
    await b2.seenEvent("A render update: g1:y");
    await b2.stable();

    expect(b2.commits()).toEqual(["commit g1:y"]);                                   // the command was not affected by B's unmount
    expect(b2.renders("B")).toEqual(["B render draw: init", "B unmounted"]);
    expect([a.label(), c.label(), a2.label()]).toEqual(["g1:x", "g1:x", "g1:y"]);
    void c2;
  });

  it("I an INVOKED command survives its unmounting initiator: unmounting A mid-command does not touch it (the application owns it)", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];
    const caller = b.invoke("gate1");

    await b.started("gate1");
    await a.unmount();
    await b.release("gate1", "z");
    await Effect.runPromise(Fiber.join(caller));
    await b.seenEvent("B render update: g1:z");

    expect(b.events).not.toContain("gate1 interrupted");
    expect(b.commits()).toEqual(["commit g1:z"]);
    expect(c.label()).toBe("g1:z");
  });

  it("I (Stage 39) a CLICK-initiated command is the application's once admitted, like an invoked one: unmounting A mid-command does NOT interrupt it; it commits, B renders it, and A's closed mount records the exit", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    a.clickRow("gate1");                                                            // real click in A's page: PORT report, A's `connect`, dispatch
    await b.started("gate1");
    await a.unmount();                                                              // A's follower and target end; its dispatch fibers are let go, not interrupted
    await b.release("gate1", "z");
    await b.seenEvent("B render update: g1:z");
    await b.stable();

    expect(b.events).not.toContain("gate1 interrupted");
    expect(b.commits()).toEqual(["commit g1:z"]);
    expect(c.label()).toBe("g1:z");
    expect(a.mount!.dispatched.map(show)).toEqual(["succeeded"]);                    // the exit lands in the dispatching mount's ledger, though that mount is closed
    expect(b.renders("A")).toEqual(["A render draw: init", "A unmounted"]);         // nothing is drawn into the closed target
    expect(b.events).not.toContain("application closed");
  });
});

describe("G, H: commands from either mount", () => {
  it("G a click in A and a click in B each run an application command: both mounts see each commit; one commit per click", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    a.clickRow("setA");
    await b.seenEvent("A render update: A"); await b.seenEvent("B render update: A");
    c.clickRow("setB");
    await b.seenEvent("A render update: B"); await b.seenEvent("B render update: B");
    await b.stable();

    expect(b.commits()).toEqual(["commit A", "commit B"]);
    expect(b.seen[0][1]).toBe(b.seen[1][1]);
    expect(a.mount!.dispatched.map(show)).toEqual(["succeeded"]);                    // the exit is recorded only by the mount that dispatched it
    expect(c.mount!.dispatched.map(show)).toEqual(["succeeded"]);
  });

  for (const [order, first, second] of [["gate1 then gate2", "gate1", "gate2"], ["gate2 then gate1", "gate2", "gate1"]] as const) {
    it(`H a suspended command in each mount, completed ${order}: the two commands run concurrently, completion order decides the state, both mounts follow every commit`, async () => {
      const b = await boot();
      const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

      a.clickRow("gate1");
      c.clickRow("gate2");
      await b.started("gate1"); await b.started("gate2");
      const tag = (g: string) => g === "gate1" ? "g1:v" : "g2:v";

      await b.release(first, "v");
      await b.seenEvent(`A render update: ${tag(first)}`); await b.seenEvent(`B render update: ${tag(first)}`);
      await b.release(second, "v");
      await b.seenEvent(`A render update: ${tag(second)}`); await b.seenEvent(`B render update: ${tag(second)}`);
      await b.stable();

      expect(b.commits()).toEqual([`commit ${tag(first)}`, `commit ${tag(second)}`]);
      expect((await b.state()).value).toBe(tag(second));
      expect([a.label(), c.label()]).toEqual([tag(second), tag(second)]);
    });
  }
});

describe("J, K, L: no mounts, remounting, a failing mount", () => {
  it("J/K the application outlives every mount: with both unmounted, commands still run and commit; a later mount draws the current state; the state survives", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    await Effect.runPromise(Fiber.join(b.invoke("setA")));
    await b.seenEvent("B render update: A");
    await a.unmount(); await c.unmount();
    await Effect.runPromise(Fiber.join(b.invoke("setB")));                           // no mount at all: still an application command
    expect((await b.state()).value).toBe("B");
    expect(b.events).not.toContain("application closed");
    expect(b.events).not.toContain("platform resource released");

    const again = await b.mountOn("C");

    expect(again.label()).toBe("B");                                                // remount: current state, not the initial one, not the state at A's unmount
    expect(b.renders("C")).toEqual(["C render draw: B"]);
    expect(b.commits()).toEqual(["commit A", "commit B"]);
    expect(b.seen[0].length).toBe(3);                                               // the state stream kept running through the empty period
  });

  it("L a mount whose first draw fails: that mount fails by itself (a defect from `mount`); the application, its state and the other mount are unaffected; it can be retried", async () => {
    const b = await boot();
    const a = await b.mountOn("A");
    const bad = await b.mountOn("B", { failDraw: true });

    expect(Exit.isFailure(bad.mounted)).toBe(true);
    expect(show(bad.mounted)).toBe("died: B draw failed");
    await Effect.runPromise(Fiber.join(b.invoke("setA")));
    await b.seenEvent("A render update: A");
    expect(a.label()).toBe("A");
    expect((await b.state()).value).toBe("A");
    expect(b.events).not.toContain("application closed");
    await bad.unmount();                                                            // closing the failed mount's Scope is harmless
    const retry = await b.mountOn("B2");

    expect(retry.label()).toBe("A");
  });

  it("closing the APPLICATION's Scope ends every mount's observation (their followers see the state stream end) and drains commands; the mounts' own Scopes close afterwards without trouble", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    await b.closeApp();
    await b.stable();
    expect(b.events.some((event) => event.endsWith("unmounted"))).toBe(false);       // with independent Scopes the application's close does NOT unmount a mount: its target is released only by its own Scope
    expect([a.label(), c.label()]).toEqual(["init", "init"]);                       // the last drawn page is still there
    await a.unmount(); await c.unmount();

    expect(at(b.events, "platform resource released")).toBeGreaterThan(-1);
    expect(b.events.filter((event) => event.endsWith("unmounted")).sort()).toEqual(["A unmounted", "B unmounted"]);   // each unmounts exactly once, however the order
  });
});
