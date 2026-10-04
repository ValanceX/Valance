// Stage 32: async COMPOSITION, observed. Same rules as Stage 31: ordinary application, ordinary commands, ordinary Effect, deterministic gates;
// no async abstraction anywhere. Each command composes gate-controlled operations with plain Effect (sequencing, `Effect.all`, `Effect.either`,
// `fork`, `forkDaemon`). One ordered trace records the commands' steps, `State.values` emissions (internal face, read on purpose) and renders.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const State = Schema.Struct({ value: Schema.String, ticket: Schema.Number });
type State = Schema.Schema.Type<typeof State>;

const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded"
  : Cause.isFailType(exit.cause) ? `failed ${JSON.stringify(exit.cause.error)}`
  : Option.isSome(Cause.failureOption(exit.cause)) ? `failed ${JSON.stringify(Cause.failureOption(exit.cause).pipe(Option.getOrThrow))} (cause also records an interrupted sibling)` : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}`
  : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : `other: ${exit.cause._tag}`;
const yields = (n: number) => Effect.runPromise(Effect.forEach(Array.from({ length: n }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));
const at = (events: ReadonlyArray<string>, event: string) => events.indexOf(event);

const boot = async () => {
  const events: Array<string> = [];
  const gates = new Map<string, { readonly gate: Deferred.Deferred<string, string>; readonly started: Deferred.Deferred<void> }>();
  const gateOf = (name: string) => {
    let entry = gates.get(name);

    if (entry === undefined) {
      entry = { gate: Effect.runSync(Deferred.make<string, string>()), started: Effect.runSync(Deferred.make<void>()) };
      gates.set(name, entry);
    }

    return entry;
  };

  const app = Valance.define({
    name: "async-compose",
    state: { schema: State, initial: { value: "init", ticket: 0 } },
    views: { only: { program: titleProgram, scope: (state: State) => ({ title: state.value }) } },
    view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      /** One async operation: starts, suspends on its gate, yields what the test released (or fails with what it failed with). */
      const op = (name: string): Effect.Effect<string, string> => Effect.gen(function* () {
        const { gate, started } = gateOf(name);

        events.push(`${name} started`);
        yield* Deferred.succeed(started, undefined);
        const value = yield* Deferred.await(gate).pipe(
          Effect.onInterrupt(() => Effect.sync(() => { events.push(`${name} interrupted`); })),
          Effect.tapError((error) => Effect.sync(() => { events.push(`${name} failed ${error}`); }))
        );

        events.push(`${name} done ${value}`);

        return value;
      });
      const commit = (value: string) => Effect.gen(function* () {
        yield* state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value }));
        events.push(`commit ${value}`);
      });
      const branch = (name: string) => Effect.flatMap(op(name), commit);
      const define = (key: string, body: Effect.Effect<void, string>) => [`app/${key}`, Nexus.Mesh.bind(Nexus.Command.define(`t.${key}`, Schema.Struct({}), () =>
        body.pipe(Effect.onExit((exit) => Effect.sync(() => { events.push(`${key} exit: ${show(exit)}`); })))), () => ({}))] as const;

      return Object.fromEntries([
        define("seq", Effect.gen(function* () { yield* branch("A"); yield* branch("B"); })),                                           // A, commit, B, commit
        define("par", Effect.all([branch("A"), branch("B")], { concurrency: "unbounded", discard: true })),                          // two owned branches, each commits
        define("parJoin", Effect.flatMap(Effect.all([op("A"), op("B")], { concurrency: "unbounded" }), ([a, b]) => commit(`${a}+${b}`))),   // join, then one commit
        define("parSettled", Effect.gen(function* () {                                                                               // failures caught, then one commit
          const [a, b] = yield* Effect.all([Effect.either(op("A")), Effect.either(op("B"))], { concurrency: "unbounded" });

          yield* commit(`A:${a._tag === "Right" ? "ok" : "failed"},B:${b._tag === "Right" ? "ok" : "failed"}`);
        })),
        define("owned", Effect.gen(function* () { const child = yield* Effect.fork(branch("A")); yield* Fiber.join(child); })),         // structured child, awaited
        define("detached", Effect.gen(function* () {                                                                                 // daemon child, command exits
          yield* Effect.forkDaemon(branch("A"));
          yield* Deferred.await(gateOf("A").started);
          events.push("detached command returning");
        })),
        define("startA", branch("A")),                                                                                               // independent commands
        define("startB", branch("B")),
        ...(["A", "B"] as const).map((name) => define(`tag${name}`, Effect.gen(function* () {                                         // APPLICATION policy, in ordinary state
          const mine = (yield* state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, ticket: current.ticket + 1 }))).ticket;
          const value = yield* op(name);
          const current = yield* state.get;

          if (current.ticket !== mine) {
            events.push(`${name} result dropped by the application (ticket ${mine}, now ${current.ticket})`);

            return;
          }

          yield* commit(value);
        }))),
      ]) as Record<string, Nexus.Mesh.Binding<string, never>>;
    },
  });

  const page = load("");
  const label = () => page.container.querySelector("section")?.getAttribute("aria-label") ?? "";
  const target: Valance.TargetFactory<WebPort> = (report) => {
    const port = Web.target({ container: page.container, primitives })(report);

    return {
      draw: (tree) => { port.draw(tree); events.push(`render draw: ${label()}`); },
      update: (tree) => { port.update(tree); events.push(`render update: ${label()}`); },
      hydrate: (tree) => port.hydrate(tree),
      unmount: () => { port.unmount(); events.push("render unmounted"); },
    };
  };
  const scope = await Effect.runPromise(Scope.make());

  await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { events.push("platform resource released"); })));   // runs after NEXUS terminates, as a resource would
  const handle = await Effect.runPromise(Valance.start(app as never, { state: { value: "init", ticket: 0 } }).pipe(Scope.extend(scope))) as Valance.ApplicationHandle<State, string>;

  Effect.runFork(Stream.runForEach(runningOf(handle as never).states as Stream.Stream<State>, (state) => Effect.sync(() => { events.push(`values: ${state.value}${state.ticket > 0 ? ` t${state.ticket}` : ""}`); })).pipe(Effect.onExit(() => Effect.sync(() => { events.push("values ended"); }))));
  await Effect.runPromise(Valance.mount(handle as never, target).pipe(Scope.extend(scope)));
  await until(() => events.includes("render draw: init"));

  return {
    events, label,
    invoke: (key: string) => Effect.runFork(Effect.onExit(handle.invoke(`app/${key}`, []), (exit) => Effect.sync(() => { events.push(`caller of ${key}: ${show(exit)}`); }))),
    closeScope: () => Effect.runFork(Scope.close(scope, Exit.void).pipe(Effect.tap(() => Effect.sync(() => { events.push("scope closed"); })))),
    started: (name: string) => Effect.runPromise(Deferred.await(gateOf(name).started)),
    release: (name: string, value: string) => Effect.runPromise(Deferred.succeed(gateOf(name).gate, value)),
    fail: (name: string, error: string) => Effect.runPromise(Deferred.fail(gateOf(name).gate, error)),
    seen: (event: string) => until(() => events.includes(event)),
    state: async () => Effect.runPromise(handle.state),
    exit: (fiber: Fiber.RuntimeFiber<unknown, unknown>) => Effect.runPromise(Fiber.await(fiber)).then(show),
    poll: async (fiber: Fiber.RuntimeFiber<unknown, unknown>) => (await Effect.runPromise(Fiber.poll(fiber)))._tag === "Some",
    values: () => events.filter((event) => event.startsWith("values:")),
    renders: () => events.filter((event) => event.startsWith("render")),
  };
};
type Booted = Awaited<ReturnType<typeof boot>>;

/** The trace between two markers, for the command-owned steps. */
const slice = (b: Booted, from: string) => b.events.slice(at(b.events, from));
const joinAll = (...fibers: Array<Fiber.RuntimeFiber<unknown, unknown>>) => Promise.all(fibers.map((fiber) => Effect.runPromise(Fiber.await(fiber))));

describe("A: sequential composition is ordinary sequencing", () => {
  it("start A, await, commit, start B, await, commit: B does not start until A's commit; each commit is its own value (and, the test waiting for each render, its own render)", async () => {
    const b = await boot();
    const caller = b.invoke("seq");

    await b.started("A");
    await yields(300);
    expect(b.events.includes("B started")).toBe(false);                        // B has not begun: sequencing is the command's own order
    await b.release("A", "a");
    await b.seen("render update: a");                                          // the test paces itself on the presentation: a mount may skip a superseded state (C32)
    await b.started("B");
    expect(b.events.indexOf("commit a")).toBeLessThan(b.events.indexOf("B started"));
    await b.release("B", "b");
    await joinAll(caller);
    await b.seen("render update: b");

    expect(slice(b, "A started").filter((event) => !event.startsWith("render") && !event.startsWith("values"))).toEqual(["A started", "A done a", "commit a", "B started", "B done b", "commit b", "seq exit: succeeded", "caller of seq: succeeded"]);
    expect(b.values()).toEqual(["values: init", "values: a", "values: b"]);
    expect(b.renders()).toEqual(["render draw: init", "render update: a", "render update: b"]);
    expect((await b.state()).value).toBe("b");
  });
});

describe("B: parallel owned composition", () => {
  for (const [order, first, second] of [["A then B", "A", "B"], ["B then A", "B", "A"]] as const) {
    it(`one command owns A and B, completed ${order}: it stays alive until both finish; each branch's commit is a state change; last completion wins`, async () => {
      const b = await boot();
      const caller = b.invoke("par");

      await b.started("A");
      await b.started("B");                                                      // both are in flight at once
      await b.release(first, first.toLowerCase());
      await b.seen(`commit ${first.toLowerCase()}`);
      await yields(300);
      expect(await b.poll(caller)).toBe(false);                                  // one branch done: the command is still alive
      expect(b.events.some((event) => event.startsWith("par exit"))).toBe(false);
      await b.release(second, second.toLowerCase());
      expect(await b.exit(caller)).toBe("succeeded");
      await b.seen(`render update: ${second.toLowerCase()}`);

      expect(b.events.filter((event) => event.startsWith("commit"))).toEqual([`commit ${first.toLowerCase()}`, `commit ${second.toLowerCase()}`]);
      expect(at(b.events, `commit ${second.toLowerCase()}`)).toBeLessThan(at(b.events, "par exit: succeeded"));
      expect(b.values()).toEqual(["values: init", `values: ${first.toLowerCase()}`, `values: ${second.toLowerCase()}`]);
      // The state stream carries both commits. A mount presents the LATEST state, so the first commit's render may be superseded by the second's (not guaranteed either way).
      const renders = b.renders();

      expect(renders[0]).toBe("render draw: init");
      expect(renders.at(-1)).toBe(`render update: ${second.toLowerCase()}`);
      expect(renders.every((render) => ["render draw: init", `render update: ${first.toLowerCase()}`, `render update: ${second.toLowerCase()}`].includes(render))).toBe(true);
      expect((await b.state()).value).toBe(second.toLowerCase());
    });

    it(`one command owns A and B and commits ONCE after both (join), completed ${order}: the result is fixed by the composition, not by completion order`, async () => {
      const b = await boot();
      const caller = b.invoke("parJoin");

      await b.started("A");
      await b.started("B");
      await b.release(first, first.toLowerCase());
      await yields(300);
      expect(b.events.some((event) => event.startsWith("commit"))).toBe(false);   // nothing is state until the composition completes
      await b.release(second, second.toLowerCase());
      expect(await b.exit(caller)).toBe("succeeded");
      await b.seen("render update: a+b");

      expect(b.values()).toEqual(["values: init", "values: a+b"]);                // one transition, whichever finished first
      expect((await b.state()).value).toBe("a+b");
    });
  }
});

describe("C: partial failure is ordinary Effect failure", () => {
  it("C3: both succeed: the command succeeds (see B)", async () => {
    const b = await boot();
    const caller = b.invoke("par");

    await b.started("A"); await b.started("B");
    await b.release("A", "a"); await b.release("B", "b");
    expect(await b.exit(caller)).toBe("succeeded");
  });

  it("C1: A succeeds (and commits), then B fails: the command fails with B's error; A's commit stays; nothing after", async () => {
    const b = await boot();
    const caller = b.invoke("par");

    await b.started("A"); await b.started("B");
    await b.release("A", "a");
    await b.seen("commit a");
    await b.fail("B", "boom-B");
    expect(await b.exit(caller)).toBe('failed "boom-B"');
    await b.seen("render update: a");
    await yields(300);

    expect(b.events.filter((event) => event.startsWith("commit"))).toEqual(["commit a"]);   // the partial result is state: Effect does not roll it back
    expect(b.values()).toEqual(["values: init", "values: a"]);
    expect((await b.state()).value).toBe("a");
  });

  it("C2 (A fails first): the sibling B is interrupted by Effect.all; opening B's gate later changes nothing; no commit at all", async () => {
    const b = await boot();
    const caller = b.invoke("par");

    await b.started("A"); await b.started("B");
    await b.fail("A", "boom-A");
    expect(await b.exit(caller)).toBe('failed "boom-A" (cause also records an interrupted sibling)');
    await b.release("B", "late-b");
    await yields(500);

    expect(b.events).toContain("B interrupted");
    expect(b.events.some((event) => event.startsWith("commit"))).toBe(false);
    expect(b.values()).toEqual(["values: init"]);
    expect((await b.state()).value).toBe("init");
  });

  it("C2 (B succeeds first, then A fails): B's commit stays; the command fails with A's error", async () => {
    const b = await boot();
    const caller = b.invoke("par");

    await b.started("A"); await b.started("B");
    await b.release("B", "b");
    await b.seen("commit b");
    await b.fail("A", "boom-A");
    expect(await b.exit(caller)).toBe('failed "boom-A"');
    await b.seen("render update: b");

    expect(b.values()).toEqual(["values: init", "values: b"]);
  });

  it("caught failure (Effect.either per branch): the sibling is NOT interrupted; the command succeeds and commits the settled outcome once", async () => {
    const b = await boot();
    const caller = b.invoke("parSettled");

    await b.started("A"); await b.started("B");
    await b.fail("B", "boom-B");
    await yields(300);
    expect(await b.poll(caller)).toBe(false);                                    // A is still running: a caught failure does not stop it
    expect(b.events).not.toContain("A interrupted");
    await b.release("A", "a");
    expect(await b.exit(caller)).toBe("succeeded");
    await b.seen("render update: A:ok,B:failed");

    expect(b.values()).toEqual(["values: init", "values: A:ok,B:failed"]);
  });
});

describe("D: command-owned vs detached", () => {
  it("D1 owned: a pending owned child is interrupted at drain, before the resource releases; a gate opened afterwards changes nothing", async () => {
    const b = await boot();
    const caller = b.invoke("owned");

    await b.started("A");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("A", "after");
    await yields(300);

    // the child is interrupted as part of the command fiber's own exit: after the command body's last step, before the fiber has ended
    expect(b.events).toContain("A interrupted");
    expect(at(b.events, "owned exit: interrupted")).toBeLessThan(at(b.events, "A interrupted"));
    expect(at(b.events, "A interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    expect(b.events.some((event) => event.startsWith("commit"))).toBe(false);
    expect(await b.exit(caller)).toBe("interrupted");
  });

  it("D2 detached, application alive: the command has exited; the daemon work still commits, emits and renders like any commit", async () => {
    const b = await boot();

    await b.exit(b.invoke("detached"));
    await b.release("A", "from-daemon");
    await b.seen("render update: from-daemon");

    expect(at(b.events, "detached exit: succeeded")).toBeLessThan(at(b.events, "commit from-daemon"));
    expect(b.values()).toEqual(["values: init", "values: from-daemon"]);
  });

  it("D2 detached, drain: nothing is interrupted (the command is gone); the gate opened after the Scope closed commits after termination, unemitted and unrendered", async () => {
    const b = await boot();

    await b.exit(b.invoke("detached"));
    await Effect.runPromise(Fiber.join(b.closeScope()));
    expect(b.events).not.toContain("A interrupted");
    await b.release("A", "after-close");
    await b.seen("commit after-close");
    await b.seen("values ended");

    expect(at(b.events, "scope closed")).toBeLessThan(at(b.events, "commit after-close"));
    expect(b.values()).toEqual(["values: init"]);
    expect(b.renders().includes("render update: after-close")).toBe(false);
    expect((await b.state()).value).toBe("after-close");
  });
});

describe("E: a composed workflow during drain", () => {
  it("both operations pending: the drain interrupts the command and both operations; exit before release; nothing commits", async () => {
    const b = await boot();
    const caller = b.invoke("par");

    await b.started("A"); await b.started("B");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("A", "a"); await b.release("B", "b");
    await yields(300);

    expect(b.events).toContain("A interrupted");
    expect(b.events).toContain("B interrupted");
    expect(at(b.events, "par exit: interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    expect(b.events.some((event) => event.startsWith("commit"))).toBe(false);
    expect(await b.exit(caller)).toBe("interrupted");
  });

  it("one operation already committed, the other pending: the earlier commit stays; the pending one is interrupted; exit before release", async () => {
    const b = await boot();
    const caller = b.invoke("par");

    await b.started("A"); await b.started("B");
    await b.release("A", "a");
    await b.seen("render update: a");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("B", "b");
    await yields(300);

    expect(b.events.filter((event) => event.startsWith("commit"))).toEqual(["commit a"]);
    expect(b.events).toContain("B interrupted");
    expect(at(b.events, "par exit: interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    expect((await b.state()).value).toBe("a");
    expect(await b.exit(caller)).toBe("interrupted");
  });
});

describe("F: completion race against drain, composed", () => {
  it("both gates opened in the same turn as the close begins (25 repeats): one deterministic outcome", async () => {
    const outcomes = new Map<string, number>();

    for (let run = 0; run < 25; run += 1) {
      const b = await boot();
      const caller = b.invoke("par");

      await b.started("A"); await b.started("B");
      const released = Promise.all([b.release("A", "a"), b.release("B", "b")]);
      const closing = b.closeScope();

      await released;
      await Effect.runPromise(Fiber.join(closing));
      const exit = await b.exit(caller);
      const e = b.events;
      const exitAt = e.findIndex((event) => event.startsWith("par exit"));

      outcomes.set(`${exit}; commits: ${e.filter((event) => event.startsWith("commit")).join(",") || "none"}; exit before release: ${exitAt < at(e, "platform resource released")}; values: ${b.values().length - 1}; renders after draw: ${b.renders().length - 1}`, (outcomes.get(`${exit}`) ?? 0) + 1);
    }

    console.log("F race outcomes", JSON.stringify([...outcomes.keys()]));
    expect(outcomes.size).toBe(1);
    expect([...outcomes.keys()][0]).toContain("exit before release: true");
  });
});

describe("G: one command owning A+B vs two independent commands", () => {
  for (const [order, first, second] of [["A then B", "A", "B"], ["B then A", "B", "A"]] as const) {
    it(`two commands, ${order}: the same states, emissions and renders as one command owning both (B); two exits, two callers`, async () => {
      const b = await boot();
      const callers = [b.invoke("startA"), b.invoke("startB")];

      await b.started("A"); await b.started("B");
      await b.release(first, first.toLowerCase());
      await b.seen(`commit ${first.toLowerCase()}`);
      await b.release(second, second.toLowerCase());
      await joinAll(...callers);
      await b.seen(`render update: ${second.toLowerCase()}`);

      expect(b.values()).toEqual(["values: init", `values: ${first.toLowerCase()}`, `values: ${second.toLowerCase()}`]);
      // The state stream carries both commits. A mount presents the LATEST state, so the first commit's render may be superseded by the second's (not guaranteed either way).
      const renders = b.renders();

      expect(renders[0]).toBe("render draw: init");
      expect(renders.at(-1)).toBe(`render update: ${second.toLowerCase()}`);
      expect(renders.every((render) => ["render draw: init", `render update: ${first.toLowerCase()}`, `render update: ${second.toLowerCase()}`].includes(render))).toBe(true);
      expect(b.events.filter((event) => event.endsWith("exit: succeeded") && !event.startsWith("caller")).sort()).toEqual(["startA exit: succeeded", "startB exit: succeeded"]);
    });
  }

  it("the difference is failure and cancellation scope: B failing does not touch independent A (contrast C2, where Effect.all interrupted the sibling)", async () => {
    const b = await boot();
    const [a, bb] = [b.invoke("startA"), b.invoke("startB")];

    await b.started("A"); await b.started("B");
    await b.fail("B", "boom-B");
    expect(await b.exit(bb)).toBe('failed "boom-B"');
    expect(b.events).not.toContain("A interrupted");
    await b.release("A", "a");
    expect(await b.exit(a)).toBe("succeeded");
    await b.seen("render update: a");
    expect((await b.state()).value).toBe("a");
  });

  it("interrupting one command's caller leaves the other command running; interrupting the owning command's caller stops both of its operations", async () => {
    const b = await boot();
    const [a, bb] = [b.invoke("startA"), b.invoke("startB")];

    await b.started("A"); await b.started("B");
    await Effect.runPromise(Fiber.interrupt(a));
    expect(b.events).toContain("A interrupted");
    expect(b.events).not.toContain("B interrupted");
    await b.release("B", "b");
    expect(await b.exit(bb)).toBe("succeeded");

    const c = await boot();
    const owner = c.invoke("par");

    await c.started("A"); await c.started("B");
    await Effect.runPromise(Fiber.interrupt(owner));
    expect(c.events).toContain("A interrupted");
    expect(c.events).toContain("B interrupted");
  });
});

describe("H: stale results", () => {
  it("as in Stage 31: two commands, B completes then A: A overwrites B (no staleness notion)", async () => {
    const b = await boot();
    const callers = [b.invoke("startA"), b.invoke("startB")];

    await b.started("A"); await b.started("B");
    await b.release("B", "b");
    await b.seen("render update: b");
    await b.release("A", "a");
    await joinAll(...callers);
    await b.seen("render update: a");

    expect((await b.state()).value).toBe("a");
  });

  it("the same race with the policy written by the APPLICATION in ordinary state (a ticket in state, checked in the command): the stale result is dropped, with no new VALANCE concept", async () => {
    const b = await boot();
    const callers = [b.invoke("tagA"), b.invoke("tagB")];

    await b.started("A"); await b.started("B");                                  // A took ticket 1, B took ticket 2
    await b.release("B", "b");
    await b.seen("render update: b");
    await b.release("A", "a");
    await joinAll(...callers);

    expect(b.events).toContain("A result dropped by the application (ticket 1, now 2)");
    expect((await b.state()).value).toBe("b");
    expect(b.events.filter((event) => event.startsWith("commit"))).toEqual(["commit b"]);
    // the cost of expressing it as state: the tickets themselves are state, so they are emitted (and the view re-rendered, unchanged)
    expect(b.values().slice(0, 3)).toEqual(["values: init", "values: init t1", "values: init t2"]);
  });
});
