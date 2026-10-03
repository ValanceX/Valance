// Stage 34: who owns an event-command Exit, how long does it live, what releases it. Characterisation only.
// The real path is exercised (click -> PORT report -> `connect` -> `running.dispatch` -> command), with ONE piece of test
// instrumentation: the Running's `dispatch` is wrapped (as Stage 28 wrapped `invoke`) so that each dispatch carries two canaries:
//   - a FIBER canary, pinned only by the fiber that `connect` forks for the event (set in that fiber's FiberRefs): alive while `pending` holds it;
//   - an EXIT canary, placed inside the Exit's value / typed error / defect: alive while anything holds the recorded Exit (`dispatched`).
// A defect cannot be marked with an exit canary without re-raising it inside the dispatch fiber, and re-raising pins that fiber (verified: an
// instrumentation artifact), so defect Exits carry no exit canary: their retention is read from `dispatched` itself, their fiber from the fiber canary.
// Canaries are WeakRefs; liveness is read after a forced full GC. `pending` is private to `connect`; this is how it is seen without changing source.
// Logical counts only (how many canaries are alive), never bytes or timing.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { handleOf, runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, Exit, Fiber, FiberRef, Schema, Scope, Stream } from "effect";
import { runInNewContext } from "node:vm";
import { setFlagsFromString } from "node:v8";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;
const collect = async () => { for (let round = 0; round < 6; round += 1) { gc(); await new Promise((resolve) => setImmediate(resolve)); } };

const ids = ["ok", "fail", "die", "asyncOk", "asyncFail", "slowA", "slowB"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const programs = await compilePrograms();
const firstValue = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => { const first = args[0]; return first !== undefined && "value" in first ? first.value : undefined; };
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isFailType(exit.cause) ? "failed" : Cause.isDieType(exit.cause) ? "died" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";

interface Canaries { readonly fibers: Array<WeakRef<object>>; readonly exits: Array<WeakRef<object>> }
const alive = (refs: ReadonlyArray<WeakRef<object>>) => refs.filter((ref) => ref.deref() !== undefined).length;
const canaryRef = FiberRef.unsafeMake<object | undefined>(undefined);

/** Builds, starts and mounts the application; returns only what a test needs. Everything else stays local so that `run` below can let it go. */
const build = async (canaries: Canaries) => {
  const gates = new Map<string, { readonly gate: Deferred.Deferred<string, string>; readonly started: Deferred.Deferred<void> }>();
  const gateOf = (name: string) => {
    let entry = gates.get(name);

    if (entry === undefined) {
      entry = { gate: Effect.runSync(Deferred.make<string, string>()), started: Effect.runSync(Deferred.make<void>()) };
      gates.set(name, entry);
    }

    return entry;
  };
  const initial: State = { items: ids.map((id) => ({ id, name: id })), value: "init" };
  const app = Valance.define({
    name: "event-retention",
    state: { schema: State, initial },
    views: { home: { program: programs.home, scope: (state: State) => ({ title: "Retention", count: state.items.length, summary: state.value, firstId: "", items: state.items.map(({ id, name }) => ({ id, name })) }) } },
    view: () => "home" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const commit = (value: string) => Effect.asVoid(state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value })));
      const wait = (name: string): Effect.Effect<string, string> => Effect.gen(function* () {
        const { gate, started } = gateOf(name);

        yield* Deferred.succeed(started, undefined);

        return yield* Deferred.await(gate);
      });
      const behavior = (id: string): Effect.Effect<void, string> => {
        switch (id) {
          case "ok": return commit("ok");
          case "fail": return Effect.fail("boom");
          case "die": return Effect.die(new Error("defect"));
          case "asyncOk": return Effect.flatMap(wait("asyncOk"), commit);
          case "asyncFail": return Effect.flatMap(wait("asyncFail"), commit);
          case "slowA": return Effect.flatMap(wait("slowA"), commit);
          case "slowB": return Effect.flatMap(wait("slowB"), commit);
          default: return Effect.die(new Error(`no behavior for ${id}`));
        }
      };

      return {
        "home/open": Nexus.Mesh.bind(Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), ({ id }) => behavior(id)), (args) => ({ id: firstValue(args) })),
      } as unknown as Record<string, Nexus.Mesh.Binding<string, never>>;
    },
  });
  const page = load("");
  const target: Valance.TargetFactory<WebPort> = (report) => Web.target({ container: page.container, primitives })(report);
  const scope = await Effect.runPromise(Scope.make());
  const started = (await Effect.runPromise(Valance.start(app as never, { state: initial }).pipe(Scope.extend(scope)))) as Valance.ApplicationHandle<State, string>;
  const real = runningOf(started as never);
  // The instrumentation: same Running, `dispatch` wrapped to attach the canaries. Nothing else about the path changes.
  const watched = handleOf({
    ...real,
    dispatch: (viewed, handler, payload) => {
      const fiberCanary = {};
      const exitCanary = {};

      canaries.fibers.push(new WeakRef(fiberCanary));
      canaries.exits.push(new WeakRef(exitCanary));

      return Effect.zipRight(FiberRef.set(canaryRef, fiberCanary), real.dispatch(viewed, handler, payload).pipe(
        Effect.map((dispatched) => ({ ...dispatched, exitCanary })),
        Effect.mapError((error) => ({ error, exitCanary })),
      )) as never;
    },
  }) as Valance.ApplicationHandle<State, string>;
  const mount = (await Effect.runPromise(Valance.mount(watched as never, target).pipe(Scope.extend(scope)))) as Valance.Mounted<string>;

  await until(() => page.container.querySelector("button") !== null);
  const row = (id: string) => page.container.querySelectorAll("div")[ids.indexOf(id as never)]!.querySelector("button")!;

  return {
    handle: watched, mount, page, scope,
    click: (id: string) => page.click(row(id)),
    closeScope: () => Effect.runPromise(Scope.close(scope, Exit.void)),
    started: (name: string) => Effect.runPromise(Deferred.await(gateOf(name).started)),
    release: (name: string, value: string) => Effect.runPromise(Deferred.succeed(gateOf(name).gate, value)),
    fail: (name: string, error: string) => Effect.runPromise(Deferred.fail(gateOf(name).gate, error)),
    settled: () => Effect.runPromise(mount.settled),
    state: () => Effect.runPromise(watched.state),
  };
};

const boot = async () => {
  const canaries: Canaries = { fibers: [], exits: [] };
  const b = await build(canaries);
  /** Waits (bounded) for N recorded exits without calling `settled` (which would itself change `pending`). */
  const recorded = (n: number) => until(() => b.mount.dispatched.length >= n);
  /** What is held right now: recorded exits, fibers still pinned, exits still pinned. */
  const census = async () => { await collect(); return { dispatched: b.mount.dispatched.length, fibersAlive: alive(canaries.fibers), exitsAlive: alive(canaries.exits), total: canaries.fibers.length }; };

  return { ...b, canaries, recorded, census };
};

describe("A: one event", () => {
  it("after completion the Exit is in `dispatched` and the fiber is still held (`pending`); `settled` drops the fiber, not the Exit", async () => {
    const b = await boot();

    b.click("ok");
    await b.recorded(1);
    expect(await b.census()).toEqual({ dispatched: 1, fibersAlive: 1, exitsAlive: 1, total: 1 });   // completed != released: both retained
    await b.settled();
    expect(await b.census()).toEqual({ dispatched: 1, fibersAlive: 0, exitsAlive: 1, total: 1 });   // `pending` emptied; the ledger entry stays
  });
});

describe("B, C: many events, success and failure", () => {
  for (const count of [10, 100, 1000]) {
    it(`B ${count} successful events: ${count} Exits recorded and ${count} fibers held, until \`settled\``, async () => {
      const b = await boot();

      for (let n = 0; n < count; n += 1) { b.click("ok"); }

      await b.recorded(count);
      expect(await b.census()).toEqual({ dispatched: count, fibersAlive: count, exitsAlive: count, total: count });   // logical growth: N events -> N and N
      await b.settled();
      expect(await b.census()).toEqual({ dispatched: count, fibersAlive: 0, exitsAlive: count, total: count });
    });
  }

  for (const [kind, id] of [["typed failures", "fail"], ["defects", "die"]] as const) {
    it(`C 100 ${kind}: retained exactly like successes (Exit in \`dispatched\`, fiber in \`pending\`); \`settled\` treats them alike`, async () => {
      const b = await boot();

      for (let n = 0; n < 100; n += 1) { b.click(id); }

      await b.recorded(100);
      expect(new Set(b.mount.dispatched.map(show))).toEqual(new Set([id === "fail" ? "failed" : "died"]));
      const exitsAlive = id === "fail" ? 100 : 0;                                // defects carry no exit canary (see the header); `dispatched.length` is the measure

      expect(await b.census()).toEqual({ dispatched: 100, fibersAlive: 100, exitsAlive, total: 100 });
      await b.settled();                                                          // returns normally: it does not fail on failed events
      expect(await b.census()).toEqual({ dispatched: 100, fibersAlive: 0, exitsAlive, total: 100 });
    });
  }
});

describe("D: mixed outcomes share one mechanism", () => {
  it("success, failure, success, defect, async success, async failure: one ledger in settle order; every fiber held; one `settled` releases them all", async () => {
    const b = await boot();

    b.click("ok"); b.click("fail"); b.click("ok"); b.click("die");
    b.click("asyncOk"); b.click("asyncFail");
    await b.recorded(4);                                                          // the four synchronous ones settle first
    expect(b.mount.dispatched.map(show)).toEqual(["succeeded", "failed", "succeeded", "died"]);
    expect((await b.census()).dispatched).toBe(4);
    await b.started("asyncOk"); await b.started("asyncFail");
    await b.fail("asyncFail", "late");                                            // the later event completes first: ledger order is settle order, not click order
    await b.release("asyncOk", "ok");
    await b.recorded(6);

    expect(b.mount.dispatched.map(show)).toEqual(["succeeded", "failed", "succeeded", "died", "failed", "succeeded"]);
    expect(await b.census()).toEqual({ dispatched: 6, fibersAlive: 6, exitsAlive: 5, total: 6 });   // 5: the defect carries no exit canary
    await b.settled();
    expect(await b.census()).toEqual({ dispatched: 6, fibersAlive: 0, exitsAlive: 5, total: 6 });
  });
});

describe("E, F, I: what `settled` is", () => {
  it("F with two suspended events: `settled` WAITS (no interrupt, no removal of running work); it returns only when both have finished, and also awaits events started while it waits", async () => {
    const b = await boot();

    b.click("slowA"); b.click("slowB");
    await b.started("slowA"); await b.started("slowB");
    expect(b.mount.dispatched.length).toBe(0);                                    // suspended events are in `pending`, not in the ledger
    const waiting = Effect.runFork(b.mount.settled);

    await Effect.runPromise(Effect.forEach(Array.from({ length: 500 }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));
    expect(await Effect.runPromise(Fiber.poll(waiting)).then((option) => option._tag)).toBe("None");   // still waiting
    expect((await b.census()).fibersAlive).toBe(2);                              // snapshot taken by `settled` does not let go of running fibers early

    await b.release("slowA", "a");
    await until(() => b.mount.dispatched.length === 1);
    await Effect.runPromise(Effect.forEach(Array.from({ length: 300 }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));
    expect(await Effect.runPromise(Fiber.poll(waiting)).then((option) => option._tag)).toBe("None");   // one of two done: still waiting

    b.click("ok");                                                                // an event dispatched while `settled` is waiting
    await until(() => b.mount.dispatched.length === 2);
    await b.release("slowB", "b");
    await Effect.runPromise(Fiber.join(waiting));

    expect(b.mount.dispatched.length).toBe(3);                                    // all three recorded, none interrupted
    expect(b.mount.dispatched.map(show).every((outcome) => outcome === "succeeded")).toBe(true);
    expect(await b.census()).toEqual({ dispatched: 3, fibersAlive: 0, exitsAlive: 3, total: 3 });
  });

  it("I `settled` is reusable and scoped to what is pending at the time: settle, more events, settle again; the ledger is cumulative and never reset", async () => {
    const b = await boot();

    for (let n = 0; n < 5; n += 1) { b.click("ok"); }

    await b.recorded(5);
    await b.settled();
    expect(await b.census()).toEqual({ dispatched: 5, fibersAlive: 0, exitsAlive: 5, total: 5 });
    await b.settled();                                                            // with nothing pending: returns at once, changes nothing
    expect((await b.census()).dispatched).toBe(5);

    for (let n = 0; n < 3; n += 1) { b.click("fail"); }

    await b.recorded(8);
    expect(await b.census()).toEqual({ dispatched: 8, fibersAlive: 3, exitsAlive: 8, total: 8 });   // new events are held again, old ones were not re-held
    await b.settled();
    expect(await b.census()).toEqual({ dispatched: 8, fibersAlive: 0, exitsAlive: 8, total: 8 });
  });

  it("E `settled` never touches `dispatched`: the ledger entries are released only when nothing references the array (see G, H)", async () => {
    const b = await boot();

    b.click("ok"); b.click("fail");
    await b.recorded(2);
    const before = [...b.mount.dispatched];

    await b.settled();
    expect(b.mount.dispatched).toEqual(before);                                   // same entries, same order
  });
});

/** Runs a whole mounted life inside this function and returns ONLY weak references, so that nothing here keeps the mount reachable afterwards. */
const lifeThenRelease = async (settleFirst: boolean) => {
  const canaries: Canaries = { fibers: [], exits: [] };
  const b = await build(canaries);

  for (let n = 0; n < 3; n += 1) { b.click("ok"); }
  b.click("fail"); b.click("die");
  await until(() => b.mount.dispatched.length === 5);
  b.click("slowA"); b.click("slowB");                                             // two events still suspended at close
  await b.started("slowA"); await b.started("slowB");

  if (settleFirst) {
    // `settled` would wait for the suspended events; open them first so it can return (this is the only difference between G and H)
    await b.release("slowA", "a"); await b.release("slowB", "b");
    await b.settled();
  }

  const before = { dispatched: b.mount.dispatched.length };

  await b.closeScope();

  return { canaries, before, after: { dispatched: b.mount.dispatched.length } };
};

describe("G, H, J, K: mount close, and what the application can see", () => {
  it("G mount close WITHOUT settled: suspended events are interrupted (no exit recorded), completed ones were already recorded; once the mount is unreachable every fiber and exit is collectable", async () => {
    const run = await lifeThenRelease(false);

    expect(run.before.dispatched).toBe(5);
    expect(run.after.dispatched).toBe(5);                                         // the two suspended events left no entry (interrupted by the close finalizer)
    await collect();
    expect(alive(run.canaries.fibers)).toBe(0);                                   // nothing outlives the mount
    expect(alive(run.canaries.exits)).toBe(0);
    expect(run.canaries.fibers.length).toBe(7);
  });

  it("H settled first, then close: the same end state; `settled` is synchronization, not required for the release", async () => {
    const run = await lifeThenRelease(true);

    expect(run.before.dispatched).toBe(7);                                        // both suspended events finished and were recorded before the close
    expect(run.after.dispatched).toBe(7);
    await collect();
    expect(alive(run.canaries.fibers)).toBe(0);
    expect(alive(run.canaries.exits)).toBe(0);
  });

  it("G the close finalizer itself empties `pending`: while the Mounted is still held, fibers are released at close, the recorded Exits are not (the holder of `Mounted` keeps the ledger)", async () => {
    const b = await boot();

    for (let n = 0; n < 4; n += 1) { b.click("ok"); }

    await b.recorded(4);
    expect((await b.census()).fibersAlive).toBe(4);
    await b.closeScope();
    expect(await b.census()).toEqual({ dispatched: 4, fibersAlive: 0, exitsAlive: 4, total: 4 });
  });

  it("J an unread failure is invisible everywhere except the ledger: state, values, render, the handle and `settled` all carry on as if nothing happened", async () => {
    const b = await boot();
    const values: Array<string> = [];

    Effect.runFork(Stream.runForEach(runningOf(b.handle as never).states as Stream.Stream<State>, (state) => Effect.sync(() => { values.push(state.value); })));
    const before = b.page.container.innerHTML;

    b.click("fail");
    b.click("die");
    await b.recorded(2);
    await b.settled();                                                            // does not fail, does not report which events failed

    expect(await b.state()).toMatchObject({ value: "init" });
    expect(values).toEqual(["init"]);
    expect(b.page.container.innerHTML).toBe(before);
    expect(Object.keys(b.handle).sort()).toEqual(["invoke", "state"]);            // the public handle exposes no failure surface
    expect(b.mount.dispatched.map(show)).toEqual(["failed", "died"]);             // the one place the failures exist
  });

  it("K `dispatched` is an append-only completion ledger in settle order: entries appear at completion (never while suspended), are never removed or reordered, and are not a pending-work tracker", async () => {
    const b = await boot();

    b.click("slowA");
    await b.started("slowA");
    expect(b.mount.dispatched.length).toBe(0);                                    // running work is not in it
    b.click("ok");
    await b.recorded(1);
    await b.release("slowA", "a");
    await b.recorded(2);

    expect(b.mount.dispatched.map(show)).toEqual(["succeeded", "succeeded"]);
    const snapshot = [...b.mount.dispatched];

    b.click("fail");
    await b.recorded(3);
    expect(b.mount.dispatched.slice(0, 2)).toEqual(snapshot);                     // append-only: earlier entries unchanged
  });
});
