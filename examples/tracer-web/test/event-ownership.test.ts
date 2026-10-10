// Stage 36 probes, adopted in Stage 39: who owns a click-initiated command once it is admitted. Decision (docs/FINDINGS.md, Stage 39): the
// APPLICATION. Closing the dispatching mount ends its follower and target; the command goes on, commits, and is rendered by the mounts that remain.
// (Stage 36 ran these same probes against both models; the mount-owned expectations are recorded there, no longer here.)
import type { HydrationResult } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
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
    Effect.runFork(Stream.runForEach(runningOf(handle as never).states as Stream.Stream<State>, (state) => Effect.sync(() => { seen[index].push(state); })));
  }

  /** One independent mount in its own Scope, over its own page. */
  const mountOn = async (name: string, options: { readonly failDraw?: boolean } = {}) => {
    const page = load("");
    const label = () => (page.container.querySelector("span")?.textContent ?? "").replace(/^\d+ items: /, "");
    const target: Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> = (report) => {
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



describe("B: who ends a click-initiated command", () => {
  it("B1 baseline: click in A, suspended, A stays mounted, gate released: commit, render, recorded exit", async () => {
    const b = await boot();
    const a = await b.mountOn("A");

    a.clickRow("gate1");
    await b.started("gate1");
    await b.release("gate1", "x");
    await b.seenEvent("A render update: g1:x");
    await Effect.runPromise(a.mount!.settled);

    expect(b.commits()).toEqual(["commit g1:x"]);
    expect(a.mount!.dispatched.map(show)).toEqual(["succeeded"]);
  });

  it("B2 click in A, suspended, A unmounts (B and the application live on), gate released: the command goes on and B renders it", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    a.clickRow("gate1");
    await b.started("gate1");
    await a.unmount();
    await b.release("gate1", "x");
    await b.stable();
    await b.seenEvent("B render update: g1:x");

    expect(b.events.includes("gate1 interrupted")).toBe(false);                      // does the command resume?
    expect(b.commits()).toEqual(["commit g1:x"]);                                      // does state commit?
    expect(c.label()).toBe("g1:x");                                                 // does B render it?
    expect(b.renders("A")).toEqual(["A render draw: init", "A unmounted"]);                       // A is silent either way
    expect(a.mount!.dispatched.map(show)).toEqual(["succeeded"]);                      // does A's mount record the exit?
    expect(b.events).not.toContain("application closed");
  });

  it("B3 control: the same command INVOKED instead of clicked continues", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];
    const caller = b.invoke("gate1");

    await b.started("gate1");
    await a.unmount();
    await b.release("gate1", "x");
    await Effect.runPromise(Fiber.join(caller));
    await b.seenEvent("B render update: g1:x");

    expect(b.events).not.toContain("gate1 interrupted");
    expect(c.label()).toBe("g1:x");
  });

  it("B4 unmounting the NON-dispatching mount: the command survives,", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    a.clickRow("gate1");
    await b.started("gate1");
    await c.unmount();
    await b.release("gate1", "x");
    await b.seenEvent("A render update: g1:x");
    await Effect.runPromise(a.mount!.settled);

    expect(b.events).not.toContain("gate1 interrupted");
    expect(a.mount!.dispatched.map(show)).toEqual(["succeeded"]);
  });

  it("B5 a suspended click command in each mount, A unmounts, both gates released: both survive", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    a.clickRow("gate1");
    c.clickRow("gate2");
    await b.started("gate1"); await b.started("gate2");
    await a.unmount();
    await b.release("gate1", "1"); await b.release("gate2", "2");
    await until(() => b.commits().length === 2);
    const final = (await b.state()).value;                                                        // B presents the LATEST state; the other commit's render may be superseded
    await b.seenEvent(`B render update: ${final}`);
    await b.stable();

    expect(b.events.includes("gate1 interrupted")).toBe(false);                      // A's command: interrupted with its mount, or not
    expect(b.events).not.toContain("gate2 interrupted");                                          // B's command survives in both
    expect(b.commits().sort()).toEqual(["commit g1:1", "commit g2:2"]);
    expect(c.mount!.dispatched.map(show)).toEqual(["succeeded"]);
  });
});

describe("D: the discriminating probes", () => {
  it("D5a event failures are unchanged: typed failure and defect are recorded in the dispatching mount's ledger, application usable", async () => {
    const b = await boot();
    const a = await b.mountOn("A");

    a.clickRow("typed"); a.clickRow("die");
    await until(() => a.mount!.dispatched.length === 2);
    expect(a.mount!.dispatched.map(show)).toEqual(["failed", "died: defect-boom"]);
    a.clickRow("setA");
    await b.seenEvent("A render update: A");
    expect(a.mount!.dispatched.map(show)).toEqual(["failed", "died: defect-boom", "succeeded"]);
  });

  it("D5b application closes first while the dispatching mount is still open: the registry interrupts the command before the resource releases; the exit IS recorded", async () => {
    const b = await boot();
    const a = await b.mountOn("A");

    a.clickRow("gate1");
    await b.started("gate1");
    await b.closeApp();
    await b.release("gate1", "late");
    await b.stable();

    expect(at(b.events, "open(gate1) exit: interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    expect(b.commits()).toEqual([]);
    expect(a.mount!.dispatched.map(show)).toEqual(["interrupted"]);                               // the mount was still open: the interrupted dispatch recorded itself
    await a.unmount();
  });

  it("D5c the mount closes BEFORE the application (the usual shared-scope order), command suspended: the registry interrupts it before release, and its exit is recorded", async () => {
    const b = await boot();
    const a = await b.mountOn("A");

    a.clickRow("gate1");
    await b.started("gate1");
    await a.unmount();                                                                            // mount's finalizer first
    await b.closeApp();                                                                           // then the application's drain
    await b.release("gate1", "late");
    await b.stable();

    expect(at(b.events, "open(gate1) exit: interrupted")).toBeLessThan(at(b.events, "platform resource released"));   // Stage 29 holds
    expect(b.commits()).toEqual([]);
    expect(a.mount!.dispatched.map(show)).toEqual(["interrupted"]);                    // exit recorded only when the application, not the mount, ended it
  });

  it("D7 a command still suspended at application close is covered by the Stage 29 registry: exit before release, nothing commits after", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    a.clickRow("gate1");
    await b.started("gate1");
    await c.unmount();
    await b.closeApp();

    expect(at(b.events, "gate1 interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    expect(at(b.events, "open(gate1) exit: interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    void a;
  });

  it("D8 late mount: the dispatching mount disappears, a new mount appears, the gate opens while the application lives: the new mount renders the commit", async () => {
    const b = await boot();
    const [a, c] = [await b.mountOn("A"), await b.mountOn("B")];

    a.clickRow("gate1");
    await b.started("gate1");
    await a.unmount(); await c.unmount();                                                         // no mount left at all
    const late = await b.mountOn("C");

    await b.release("gate1", "x");
    await b.stable();
    await b.seenEvent("C render update: g1:x");

    expect(b.commits()).toEqual(["commit g1:x"]);
    expect(late.label()).toBe("g1:x");
    expect((await b.state()).value).toBe("g1:x");
  });

  it("D6 who holds the recorded exit: the dispatching mount's `dispatched` (the ledger belongs to the mount that dispatched, even closed, as long as someone holds Mounted)", async () => {
    const b = await boot();
    const a = await b.mountOn("A");

    a.clickRow("gate1");
    await b.started("gate1");
    await a.unmount();
    await b.release("gate1", "x");
    await b.stable();

    expect(a.mount!.dispatched.map(show)).toEqual(["succeeded"]);                      // under `app` the exit lands in a CLOSED mount's ledger, after its unmount
    expect(b.renders("A")).toEqual(["A render draw: init", "A unmounted"]);                       // and nothing is drawn into the closed target
  });
});
