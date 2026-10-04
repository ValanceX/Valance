// Stage 31: async data flow, observed. No abstraction is added anywhere: an ordinary application whose commands suspend on a gate the
// test controls, then commit into ordinary application state. Every step lands in ONE ordered trace: the commands' own steps, the
// `State.values` emissions (the internal composition face, read on purpose), and the render/update the target receives.
// Nothing is timed: completion is a gate the test opens; where something must NOT happen, a bounded run of cooperative yields stands in.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const State = Schema.Struct({ value: Schema.String });
type State = Schema.Schema.Type<typeof State>;


const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded"
  : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : `other: ${exit.cause._tag}`;
const yields = (n: number) => Effect.runPromise(Effect.forEach(Array.from({ length: n }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));

/** The smallest application: one state `{ value }`, one view showing it, commands that suspend on a gate and then commit. */
const boot = async (options: { readonly mount?: boolean } = {}) => {
  const events: Array<string> = [];
  const slots = new Map<string, { readonly gate: Deferred.Deferred<string>; readonly started: Deferred.Deferred<void> }>();
  const counts = new Map<string, number>();
  const slot = (label: string, index: number) => {
    const key = `${label}#${index}`;
    let entry = slots.get(key);

    if (entry === undefined) {
      entry = { gate: Effect.runSync(Deferred.make<string>()), started: Effect.runSync(Deferred.make<void>()) };
      slots.set(key, entry);
    }

    return entry;
  };
  const next = (label: string) => { const index = counts.get(label) ?? 0; counts.set(label, index + 1); return index; };

  const app = Valance.define({
    name: "async-flow",
    state: { schema: State, initial: { value: "init" } },
    views: { only: { program: titleProgram, scope: (state: State) => ({ title: state.value }) } },
    view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const commit = (label: string, value: string) => Effect.gen(function* () {
        yield* state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value }));
        events.push(`${label} committed ${value}`);
      });
      /** Suspend on the gate of this invocation, then commit what the test released. */
      const waitAndCommit = (label: string) => Effect.gen(function* () {
        const { gate, started } = slot(label, next(label));
        const name = `${label}#${(counts.get(label) ?? 1) - 1}`;

        events.push(`${name} started`);
        yield* Deferred.succeed(started, undefined);
        const value = yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { events.push(`${name} gate wait interrupted`); })));

        events.push(`${name} resumed ${value}`);
        yield* commit(name, value);
      }).pipe(Effect.onExit((exit) => Effect.sync(() => { events.push(`${label} command exit: ${show(exit)}`); })));
      const define = (label: string, body: Effect.Effect<void>) => Nexus.Mesh.bind(Nexus.Command.define(`t.${label}`, Schema.Struct({}), () => body), () => ({}));
      /** A command that forks the awaiting-and-committing work as a child and RETURNS (structured: `fork`; escaping: `forkDaemon`). */
      const forking = (label: string, how: "fork" | "daemon") => define(label, Effect.gen(function* () {
        const index = next(label);
        const name = `${label}#${index}`;
        const { gate, started } = slot(label, index);
        const child = Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined);                                // the child is at its gate before the command returns
          const value = yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { events.push(`${name} child interrupted`); })));

          events.push(`${name} child resumed ${value}`);
          yield* commit(name, value);
        });

        yield* how === "fork" ? Effect.fork(child) : Effect.forkDaemon(child);
        yield* Deferred.await(started);
        events.push(`${name} command returning (${how} child)`);
      }).pipe(Effect.onExit((exit) => Effect.sync(() => { events.push(`${label} command exit: ${show(exit)}`); }))));
      /** A command that forks the child and WAITS for it (the child stays inside the command's lifetime). */
      const joining = define("joinChild", Effect.gen(function* () {
        const index = next("J");
        const name = `J#${index}`;
        const { gate, started } = slot("J", index);
        const child = Effect.gen(function* () {
          const value = yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { events.push(`${name} child interrupted`); })));

          events.push(`${name} child resumed ${value}`);
          yield* commit(name, value);
        });
        const fiber = yield* Effect.fork(child);

        yield* Deferred.succeed(started, undefined);
        yield* Fiber.join(fiber);
      }).pipe(Effect.onExit((exit) => Effect.sync(() => { events.push(`J command exit: ${show(exit)}`); }))));

      return {
        "app/startA": define("A", waitAndCommit("A")),
        "app/startB": define("B", waitAndCommit("B")),
        "app/forkChild": forking("F", "fork"),
        "app/daemonChild": forking("D", "daemon"),
        "app/joinChild": joining,
      };
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

  await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { events.push("platform resource released"); })));   // registered BEFORE start: runs after NEXUS terminates, as a platform resource would
  const handle = await Effect.runPromise(Valance.start(app, { state: { value: "init" } }).pipe(Scope.extend(scope)));

  Effect.runFork(Stream.runForEach(runningOf(handle).states, (state) => Effect.sync(() => { events.push(`values: ${state.value}`); })).pipe(Effect.onExit(() => Effect.sync(() => { events.push("values ended"); }))));

  if (options.mount !== false) {
    await Effect.runPromise(Valance.mount(handle, target).pipe(Scope.extend(scope)));
  }

  const invoke = (key: string) => Effect.runFork(Effect.onExit(handle.invoke(key, []), (exit) => Effect.sync(() => { events.push(`caller of ${key}: ${show(exit)}`); })));
  const closeScope = () => Effect.runFork(Scope.close(scope, Exit.void).pipe(Effect.tap(() => Effect.sync(() => { events.push("scope closed"); }))));

  return {
    events, handle, page, label, scope, invoke, closeScope,
    started: (name: string) => { const [l, i] = name.split("#"); return Effect.runPromise(Deferred.await(slot(l!, Number(i)).started)); },
    release: (name: string, value: string) => { const [l, i] = name.split("#"); return Effect.runPromise(Deferred.succeed(slot(l!, Number(i)).gate, value)); },
    seen: (event: string) => until(() => events.includes(event)),
    state: async () => (await Effect.runPromise(handle.state)).value,
    poll: async (fiber: Fiber.RuntimeFiber<unknown, unknown>) => (await Effect.runPromise(Fiber.poll(fiber)))._tag === "Some",
  };
};

const at = (events: ReadonlyArray<string>, event: string) => events.indexOf(event);

describe("async data flow, observed", () => {
  it("A: one async result: nothing happens until the gate opens; then commit -> values -> render, in that order", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    const caller = b.invoke("app/startA");

    await b.started("A#0");
    await yields(500);
    expect(b.events).toEqual(["values: init", "render draw: init", "A#0 started"]);     // suspended: no commit, no emission, no render
    expect(await b.state()).toBe("init");

    await b.release("A#0", "a1");
    await Effect.runPromise(Fiber.join(caller));
    await b.seen("render update: a1");

    expect(b.events.slice(3)).toEqual(["A#0 resumed a1", "A#0 committed a1", "A command exit: succeeded", "caller of app/startA: succeeded", "values: a1", "render update: a1"]);
    expect(await b.state()).toBe("a1");
  });

  it("B: sequential results are independent transitions, each emitted and (the test waits for each render) rendered; nothing is replaced", async () => {
    const b = await boot();

    await b.seen("render draw: init");

    for (const [index, value] of [[0, "a1"], [1, "a2"]] as const) {
      const caller = b.invoke("app/startA");

      await b.started(`A#${index}`);
      await b.release(`A#${index}`, value);
      await Effect.runPromise(Fiber.join(caller));
      await b.seen(`render update: ${value}`);
    }

    expect(b.events.filter((event) => event.startsWith("values:"))).toEqual(["values: init", "values: a1", "values: a2"]);
    expect(b.events.filter((event) => event.startsWith("render"))).toEqual(["render draw: init", "render update: a1", "render update: a2"]);
  });

  for (const [order, first, second] of [["B then A", "B#0", "A#0"], ["A then B", "A#0", "B#0"]] as const) {
    it(`C/D: A and B started in that order, completed ${order}: completion order decides the state; the older start can overwrite the newer`, async () => {
      const b = await boot();

      await b.seen("render draw: init");
      const callers = [b.invoke("app/startA"), b.invoke("app/startB")];

      await b.started("A#0");
      await b.started("B#0");
      await b.release(first, first.startsWith("A") ? "from-A" : "from-B");
      await b.seen(`render update: ${first.startsWith("A") ? "from-A" : "from-B"}`);
      await b.release(second, second.startsWith("A") ? "from-A" : "from-B");
      await Promise.all(callers.map((caller) => Effect.runPromise(Fiber.join(caller))));
      await b.seen(`render update: ${second.startsWith("A") ? "from-A" : "from-B"}`);

      const firstValue = first.startsWith("A") ? "from-A" : "from-B";
      const secondValue = second.startsWith("A") ? "from-A" : "from-B";

      expect(b.events.filter((event) => event.startsWith("values:"))).toEqual(["values: init", `values: ${firstValue}`, `values: ${secondValue}`]);
      expect(b.events.filter((event) => event.startsWith("render"))).toEqual(["render draw: init", `render update: ${firstValue}`, `render update: ${secondValue}`]);
      expect(await b.state()).toBe(secondValue);                         // the LAST COMPLETION wins; the invocation order is irrelevant
    });
  }

  it("E: interrupting the caller interrupts the command and its gate wait; releasing the gate afterwards changes nothing; the application stays healthy", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    const caller = b.invoke("app/startA");

    await b.started("A#0");
    await Effect.runPromise(Fiber.interrupt(caller));
    await b.release("A#0", "late");                                       // too late: nobody is waiting
    await yields(500);

    expect(b.events.slice(2)).toEqual(["A#0 started", "A#0 gate wait interrupted", "A command exit: interrupted", "caller of app/startA: interrupted"]);
    expect(await b.state()).toBe("init");                                // no commit, no emission, no render
    expect(b.events.filter((event) => event.startsWith("values:") || event.startsWith("render"))).toEqual(["values: init", "render draw: init"]);

    // healthy: a new command runs end to end, and the Scope closes without waiting for the interrupted one
    const again = b.invoke("app/startB");

    await b.started("B#0");
    await b.release("B#0", "b1");
    await Effect.runPromise(Fiber.join(again));
    await b.seen("render update: b1");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    expect(b.events.filter((event) => event.includes("command exit")).filter((event) => event.startsWith("A"))).toEqual(["A command exit: interrupted"]);   // exited once, not drained again
    expect(b.events.at(-1)).toBe("scope closed");
  });

  it("G: a command suspended when the Scope closes is interrupted (not completed) before the platform resource releases; a gate opened afterwards changes nothing", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    const caller = b.invoke("app/startA");

    await b.started("A#0");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("A#0", "after-drain");
    await yields(500);

    const e = b.events;

    expect(e).toContain("A#0 gate wait interrupted");
    expect(at(e, "A command exit: interrupted")).toBeLessThan(at(e, "platform resource released"));
    expect(at(e, "platform resource released")).toBeLessThan(at(e, "scope closed"));
    expect(e.some((event) => event.startsWith("A#0 resumed"))).toBe(false);
    expect(e.some((event) => event.startsWith("values: after") || event.startsWith("render update"))).toBe(false);
    expect(show(await Effect.runPromise(Fiber.await(caller)))).toBe("interrupted");
    expect(await b.state()).toBe("init");
  });

  for (const order of ["gate first", "close forked first"] as const) {
    it(`G (race, ${order}): the gate is opened and the Scope close begun in the same turn, ${order}; the outcome is observed over 25 repeats`, async () => {
      const outcomes = new Map<string, number>();

      for (let run = 0; run < 25; run += 1) {
        const b = await boot();

        await b.seen("render draw: init");
        const caller = b.invoke("app/startA");

        await b.started("A#0");
        // "close forked first": `Scope.close` runs on its own fiber, which only starts after the caller's turn, so the gate's waiter is
        // resumed first in both orders; this variant records that the fork order does not change the outcome.
        const closing = order === "close forked first" ? b.closeScope() : undefined;
        const released = b.release("A#0", "race");
        const closingLate = closing ?? b.closeScope();

        await released;
        await Effect.runPromise(Fiber.join(closingLate));
        await Effect.runPromise(Fiber.await(caller));
        const e = b.events;
        const exit = e.find((event) => event.startsWith("A command exit:"));
        const key = `${e.includes("A#0 committed race") ? "committed" : "not committed"}; ${exit}; exit before release: ${at(e, exit!) < at(e, "platform resource released")}; values: ${e.includes("values: race")}; render: ${e.includes("render update: race")}`;

        outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
      }

      console.log(`G race (${order}) outcomes`, JSON.stringify([...outcomes]));
      expect(outcomes.size).toBe(1);                                     // one deterministic outcome
      expect([...outcomes.keys()][0]).toContain("exit before release: true");   // and the lifetime contract holds in it
    });
  }

  it("H: two commands suspended at drain: both exit interrupted before the resource releases; neither commits", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    const callers = [b.invoke("app/startA"), b.invoke("app/startB")];

    await b.started("A#0");
    await b.started("B#0");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("A#0", "a");
    await b.release("B#0", "b");
    await yields(500);

    const e = b.events;

    expect(at(e, "A command exit: interrupted")).toBeGreaterThan(-1);
    expect(at(e, "B command exit: interrupted")).toBeGreaterThan(-1);
    expect(Math.max(at(e, "A command exit: interrupted"), at(e, "B command exit: interrupted"))).toBeLessThan(at(e, "platform resource released"));
    expect(e.some((event) => event.includes("committed"))).toBe(false);
    expect((await Promise.all(callers.map((caller) => Effect.runPromise(Fiber.await(caller))))).map(show)).toEqual(["interrupted", "interrupted"]);
  });

  it("F1: a structured (fork) child that outlives its returning command is interrupted when the command exits: async work does not outlive the command unless the command waits for it", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    await Effect.runPromise(Fiber.join(b.invoke("app/forkChild")));
    await b.started("F#0");
    await b.release("F#0", "late-child");
    await yields(500);

    expect(b.events).toContain("F#0 child interrupted");
    expect(b.events.some((event) => event.includes("committed"))).toBe(false);
    expect(await b.state()).toBe("init");
  });

  it("F2: a daemon child outlives the command and commits later: outside VALANCE's command ownership; it publishes and renders like any commit while the application lives", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    await Effect.runPromise(Fiber.join(b.invoke("app/daemonChild")));
    await b.started("D#0");
    await b.release("D#0", "from-daemon");
    await b.seen("render update: from-daemon");

    expect(b.events).toContain("D#0 committed from-daemon");
    expect(b.events).not.toContain("D#0 child interrupted");
    expect(await b.state()).toBe("from-daemon");
  });

  it("F3: a structured child the command waits for stays inside the command lifetime: the drain interrupts the command and the child with it", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    const caller = b.invoke("app/joinChild");

    await b.started("J#0");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("J#0", "x");
    await yields(500);

    expect(b.events).toContain("J#0 child interrupted");
    expect(at(b.events, "J command exit: interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    expect(b.events.some((event) => event.includes("committed"))).toBe(false);
    expect(show(await Effect.runPromise(Fiber.await(caller)))).toBe("interrupted");
  });

  it("F4: a daemon child still pending at drain is outside the contract: it survives the Scope close and commits afterwards; the commit is neither emitted nor rendered", async () => {
    const b = await boot();

    await b.seen("render draw: init");
    await Effect.runPromise(Fiber.join(b.invoke("app/daemonChild")));
    await b.started("D#0");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("D#0", "after-close");
    await b.seen("D#0 committed after-close");
    await b.seen("values ended");

    expect(at(b.events, "scope closed")).toBeLessThan(at(b.events, "D#0 committed after-close"));
    expect(b.events).toContain("values ended");
    expect(b.events.some((event) => event === "values: after-close" || event === "render update: after-close")).toBe(false);
    expect(await b.state()).toBe("after-close");
  });
});
