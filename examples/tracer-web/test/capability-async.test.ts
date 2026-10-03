// Stage 20: the Stage 19 capability, made asynchronous. Same ownership, same platform mechanism, same command boundary, same
// render path; the capability's operation is now an Effect that can suspend, be completed by the test, and be interrupted.
// No timing: the test waits on signals the controllable implementation raises, and completes operations by hand.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Chunk, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { CatalogAsync, type CatalogEntry, type LookupError } from "../src/catalog/async-service.js";
import { compilePrograms } from "../src/catalog/compile.js";
import type { AppState } from "../src/catalog/app.js";
import { applicationWithAsyncCatalog } from "../src/catalog/with-async-service.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const start = { view: "home" as const, items: [{ id: "A0", name: "Alpha" }] };

// A second application-owned capability, for the boundary probe: another resource the same platform supplies and releases.
type SecondClosed = { readonly _tag: "SecondClosed" };
interface SecondService { readonly touch: () => Effect.Effect<string, SecondClosed> }
const Second = Nexus.Capability.define<SecondService>("example/second");

/**
 * The external platform: a controllable asynchronous implementation backed by a scoped resource. `lookup(id)` raises
 * "started", then waits on a gate the test opens with `complete(id)`; an interruption of that wait is recorded. Every
 * step is recorded in order in `events`, with the resource's acquisition and release.
 */
const controllable = (options: { readonly useAfterRelease?: "fail" | "die"; readonly second?: boolean; readonly drain?: boolean } = {}) => {
  const events: Array<string> = [];
  let closed = false;                                                              // set only by the resource's own finalizer
  let secondClosed = false;
  // Resource-owned draining (Stage 23; only when `drain` is set): the resource counts its own in-flight users.
  let inFlight = 0;
  let idle: Deferred.Deferred<void> | undefined;
  const draining = Effect.runSync(Deferred.make<void>());                         // raised when the finalizer begins to wait
  const gates = new Map<string, { readonly gate: Deferred.Deferred<CatalogEntry, LookupError>; readonly started: Deferred.Deferred<void> }>();
  const gateOf = (id: string) => {
    let entry = gates.get(id);

    if (entry === undefined) {
      entry = { gate: Effect.runSync(Deferred.make<CatalogEntry, LookupError>()), started: Effect.runSync(Deferred.make<void>()) };
      gates.set(id, entry);
    }

    return entry;
  };
  const serviceBase: CatalogAsync = {
    lookup: (id) => Effect.gen(function* () {
      events.push(`lookup started ${id}`);
      yield* Deferred.succeed(gateOf(id).started, undefined);
      const entry = yield* Deferred.await(gateOf(id).gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { events.push(`lookup interrupted ${id}`); })));

      // Only when asked: past its gate the lookup needs the resource, which refuses work once its finalizer has run.
      if (options.useAfterRelease !== undefined) {
        events.push(`lookup resumed ${id}`);

        if (closed) {
          events.push(`resource used after release ${id}`);

          return yield* (options.useAfterRelease === "fail" ? Effect.fail<LookupError>({ _tag: "LookupError", id }) : Effect.die(new Error(`resource used after release (${id})`)));
        }
      }

      events.push(`lookup completed ${id}`);

      return entry;
    }),
  };
  // A user registers when its lookup starts and leaves when it ends, by any exit (completion, failure, interruption).
  const service: CatalogAsync = options.drain !== true ? serviceBase : {
    lookup: (id) => Effect.acquireUseRelease(
      Effect.sync(() => { inFlight += 1; events.push(`in flight: ${inFlight} (lookup ${id} entered)`); }),
      () => serviceBase.lookup(id),
      () => Effect.suspend(() => {
        inFlight -= 1;
        events.push(`in flight: ${inFlight} (lookup ${id} left)`);

        return inFlight === 0 && idle !== undefined ? Deferred.succeed(idle, undefined) : Effect.void;
      })
    ),
  };
  const release = options.drain !== true
    ? Effect.sync(() => { events.push("resource released"); closed = true; })
    : Effect.gen(function* () {
      // Drain first: wait until every tracked user has left, and only then mark the resource closed.
      events.push("finalizer started");

      if (inFlight > 0) {
        idle = yield* Deferred.make<void>();
        events.push(`finalizer draining: ${inFlight} in flight`);
        yield* Deferred.succeed(draining, undefined);
        yield* Deferred.await(idle);
        events.push("finalizer drained");
      }

      closed = true;
      events.push("resource released");
    });
  const acquireCatalog = Effect.acquireRelease(Effect.sync(() => { events.push("resource acquired"); return service; }), () => release);
  const second: SecondService = { touch: () => Effect.suspend(() => {
    events.push("second resource touched");

    return secondClosed ? Effect.fail<SecondClosed>({ _tag: "SecondClosed" }) : Effect.succeed("second:ok");
  }) };
  const acquireSecond = Effect.acquireRelease(Effect.sync(() => { events.push("second resource acquired"); return second; }), () => Effect.sync(() => { events.push("second resource released"); secondClosed = true; }));
  // One platform, one scoped Environment. Resources acquired in this order are released in the reverse order.
  const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.all([acquireCatalog, options.second === true ? Effect.map(acquireSecond, (value) => Option.some(value)) : Effect.succeed(Option.none<SecondService>())]),
    ([implementation, secondImplementation]) => ({ resolutions: new Map<string, Nexus.Capability.CapabilityResolution<unknown>>([
      [CatalogAsync.id, { _tag: "Available" as const, implementation }],
      ...(Option.isSome(secondImplementation) ? [[Second.id, { _tag: "Available" as const, implementation: secondImplementation.value }] as const] : []),
    ]) })
  ));

  return {
    events,
    platform,
    started: (id: string) => Deferred.await(gateOf(id).started),
    inFlight: () => inFlight,
    draining: Deferred.await(draining),
    complete: (id: string) => Deferred.succeed(gateOf(id).gate, { id, name: `item-${id}` }),
  };
};

/** A page the application is mounted on, recording the PORT operations it receives. */
const mounted = () => {
  const page = load("");
  const operations: Array<string> = [];
  const target: Valance.TargetFactory<WebPort> = (report) => {
    const port = Web.target({ container: page.container, primitives })(report);

    return { draw: (tree) => { operations.push("draw"); port.draw(tree); }, update: (tree) => { operations.push("update"); port.update(tree); }, hydrate: (tree) => port.hydrate(tree), unmount: () => { port.unmount(); } };
  };
  const names = () => [...page.container.querySelectorAll("div span")].map((span) => span.textContent);

  return { page, operations, target, names };
};

/** How an exit looks in the trace: the kind, and the typed error or the defect's message. */
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit)
  ? "succeeded"
  : Cause.isFailType(exit.cause) ? `failed (typed) ${JSON.stringify(exit.cause.error)}`
  : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}`
  : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : `other: ${exit.cause._tag}`;

describe("an asynchronous application-owned capability, through the existing boundary", () => {
  it("A: the command suspends on the capability and commits only when it completes; the ordinary render path then updates", async () => {
    const app = applicationWithAsyncCatalog(await compilePrograms());
    const w = controllable();
    const m = mounted();

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform: w.platform, state: start });
      yield* Valance.mount(handle, m.target);
      const section = m.page.container.firstElementChild;
      const alpha = m.page.container.querySelector("div");

      const invoke = yield* Effect.fork(handle.invoke("app/lookupAsync", [{ value: "A" }]));
      yield* w.started("A");

      // In flight: the command has not finished, nothing is committed, nothing was rendered for it.
      expect(Option.isNone(yield* Fiber.poll(invoke))).toBe(true);
      expect((yield* handle.state).items).toEqual(start.items);
      expect(m.operations).toEqual(["draw"]);
      expect(m.names()).toEqual(["Alpha"]);

      yield* w.complete("A");
      yield* Fiber.join(invoke);

      // capability completion -> command continuation -> state commit -> values -> the existing update
      expect((yield* handle.state).items).toEqual([...start.items, { id: "A", name: "item-A" }]);
      yield* Effect.promise(() => until(() => m.names().length === 2));
      expect(m.names()).toEqual(["Alpha", "item-A"]);
      expect(m.operations).toEqual(["draw", "update"]);                          // same view: an update, never a second draw
      expect(m.page.container.firstElementChild).toBe(section);
      expect(m.page.container.querySelector("div")).toBe(alpha);                 // the keyed row kept its element
    })));

    expect(w.events).toEqual(["resource acquired", "lookup started A", "lookup completed A", "resource released"]);
  });

  it("B + D: interrupting the caller interrupts the in-flight capability call, commits nothing, and leaves the application and its resource running", async () => {
    const app = applicationWithAsyncCatalog(await compilePrograms());
    const w = controllable();
    const m = mounted();

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform: w.platform, state: start });
      yield* Valance.mount(handle, m.target);

      const first = yield* Effect.fork(handle.invoke("app/lookupAsync", [{ value: "A" }]));
      yield* w.started("A");
      const exit = yield* Fiber.interrupt(first);

      expect(Exit.isInterrupted(exit)).toBe(true);                                // the caller receives interruption
      expect(w.events).toContain("lookup interrupted A");                         // the capability operation was cancelled
      expect(w.events).not.toContain("lookup completed A");
      expect(w.events).not.toContain("resource released");                        // one operation is not the application
      expect((yield* handle.state).items).toEqual(start.items);                   // D: no partial mutation, no continuation
      expect(m.operations).toEqual(["draw"]);
      expect(m.names()).toEqual(["Alpha"]);

      // The application can still do work, with the same resource.
      const second = yield* Effect.fork(handle.invoke("app/lookupAsync", [{ value: "B" }]));
      yield* w.started("B");
      yield* w.complete("B");
      yield* Fiber.join(second);

      expect((yield* handle.state).items).toEqual([...start.items, { id: "B", name: "item-B" }]);   // B only: A never committed
      expect(w.events.filter((event) => event === "resource acquired")).toHaveLength(1);
      yield* Effect.promise(() => until(() => m.names().length === 2));
      expect(m.operations).toEqual(["draw", "update"]);
    })));

    expect(w.events.at(-1)).toBe("resource released");
  });

  // OBSERVATION, not a guarantee VALANCE makes. NEXUS documents that effects already running when termination begins are
  // not interrupted by it; this pins what that means with a resource-backed asynchronous capability. It is evidence for a
  // later decision, and must change if that decision changes the behavior.
  it("C (observation): closing the Scope during an in-flight call neither waits for it nor interrupts it; the resource is released under it; it can still commit to the stopped application", async () => {
    const app = applicationWithAsyncCatalog(await compilePrograms());
    const w = controllable();
    const m = mounted();
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app, { platform: w.platform, state: start }).pipe(Scope.extend(scope)));

    await Effect.runPromise(Valance.mount(handle, m.target).pipe(Scope.extend(scope)));
    const invoke = Effect.runFork(handle.invoke("app/lookupAsync", [{ value: "A" }]).pipe(Effect.onExit((exit) => Effect.sync(() => { w.events.push(`invoke ${Exit.isSuccess(exit) ? "succeeded" : "ended otherwise"}`); }))));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    await Effect.runPromise(Scope.close(scope, Exit.void));                       // returns: it does not wait for the in-flight call
    w.events.push("scope closed");

    expect(w.events).toEqual(["resource acquired", "lookup started A", "scope closing", "resource released", "scope closed"]);
    expect(w.events).not.toContain("lookup interrupted A");                       // not interrupted
    expect(m.page.container.innerHTML).toBe("");                                  // the target is gone

    await Effect.runPromise(w.complete("A"));                                     // the call, released-from-under, completes
    await Effect.runPromise(Fiber.join(invoke));

    expect(w.events.slice(5)).toEqual(["lookup completed A", "invoke succeeded"]);
    expect((await Effect.runPromise(handle.state)).items).toEqual([...start.items, { id: "A", name: "item-A" }]);   // committed to a stopped application
    expect(m.operations).toEqual(["draw"]);                                       // and never rendered: the follower ended with the Scope
  });

  it("E (observation): two calls in flight are not serialized or cancelled; both commit, in completion order, as updates", async () => {
    const app = applicationWithAsyncCatalog(await compilePrograms());
    const w = controllable();
    const m = mounted();

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform: w.platform, state: start });
      yield* Valance.mount(handle, m.target);

      const a = yield* Effect.fork(handle.invoke("app/lookupAsync", [{ value: "A" }]));
      const b = yield* Effect.fork(handle.invoke("app/lookupAsync", [{ value: "B" }]));
      yield* w.started("A");
      yield* w.started("B");                                                      // both in flight at once: not serialized

      yield* w.complete("B");
      yield* Fiber.join(b);
      yield* w.complete("A");
      yield* Fiber.join(a);

      // Invoked A then B, completed B then A: the state holds them in completion order. Nothing superseded either.
      expect((yield* handle.state).items.map((item) => item.id)).toEqual(["A0", "B", "A"]);
      yield* Effect.promise(() => until(() => m.names().length === 3));
      expect(m.names()).toEqual(["Alpha", "item-B", "item-A"]);
      expect(m.operations.every((operation, index) => (index === 0 ? operation === "draw" : operation === "update"))).toBe(true);
    })));
  });
});

// Stage 21 probe. The resource's finalizer now makes it unusable, and the lookup needs it after its gate. Nothing is caught,
// rewritten or kept alive: this records what the existing semantics do. Run once as a control (Scope open) and once with the
// Scope closed while the lookup is suspended, for a resource that fails with a typed error and one that throws.
describe("an in-flight capability call whose resource has been finalized", () => {
  type Kind = "fail" | "die";

  /** Runs one lookup of A to the gate, optionally closes the Scope first, opens the gate, and records everything seen. */
  const run = async (kind: Kind, closeScope: boolean) => {
    const app = applicationWithAsyncCatalog(await compilePrograms());
    const w = controllable({ useAfterRelease: kind });
    const m = mounted();
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app, { platform: w.platform, state: start }).pipe(Scope.extend(scope)));

    await Effect.runPromise(Valance.mount(handle, m.target).pipe(Scope.extend(scope)));
    // The values the application emitted until it ended (the internal composition face, read on purpose).
    const emitted = Effect.runPromise(Stream.runCollect(runningOf(handle).states).pipe(Effect.map(Chunk.toReadonlyArray)));
    const invoke = Effect.runFork(handle.invoke("app/lookupAsync", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    expect(w.events).toEqual(["resource acquired", "lookup started A"]);         // acquired, and the lookup is in flight

    if (closeScope) {
      w.events.push("scope closing");
      await Effect.runPromise(Scope.close(scope, Exit.void));
      w.events.push("scope closed");
      expect(w.events.at(-2)).toBe("resource released");                          // the finalizer has run
    }

    await Effect.runPromise(w.complete("A"));                                     // open the gate
    const exit = await Effect.runPromise(Fiber.await(invoke));

    if (!closeScope) {
      await until(() => m.names().length === 2);                                  // the commit is rendered asynchronously: let it land before ending
      await Effect.runPromise(Scope.close(scope, Exit.void));                     // after everything: the control ends normally
    }

    return { events: w.events, exit, state: await Effect.runPromise(handle.state), emitted: await emitted, operations: m.operations, dom: m.page.container.innerHTML };
  };

  const describeExit = (exit: Exit.Exit<unknown, unknown>) => Exit.isSuccess(exit)
    ? { _tag: "Success" }
    : Cause.isFailType(exit.cause) ? { _tag: "Fail", error: exit.cause.error } : Cause.isDieType(exit.cause) ? { _tag: "Die", message: (exit.cause.defect as Error).message } : { _tag: exit.cause._tag };

  for (const kind of ["fail", "die"] as const) {
    it(`control (${kind}): without closing the Scope, the same call completes and commits through the ordinary path`, async () => {
      const r = await run(kind, false);

      expect(r.events).toEqual(["resource acquired", "lookup started A", "lookup resumed A", "lookup completed A", "resource released"]);
      expect(describeExit(r.exit)).toEqual({ _tag: "Success" });
      expect(r.state.items).toEqual([...start.items, { id: "A", name: "item-A" }]);
      expect(r.emitted.map((state) => state.items.length)).toEqual([1, 2]);        // State.values emitted the commit
      expect(r.operations).toEqual(["draw", "update"]);
    });

    it(`probe (${kind}): the Scope closes while the call is suspended, then the call needs its released resource`, async () => {
      const r = await run(kind, true);

      // Exact ordering: the finalizer runs, THEN the call resumes and touches the released resource.
      expect(r.events).toEqual([
        "resource acquired", "lookup started A", "scope closing", "resource released", "scope closed",
        "lookup resumed A", "resource used after release A",
      ]);
      // What the caller observes: the resource's own failure, unchanged. Not interruption, not success.
      expect(describeExit(r.exit)).toEqual(kind === "fail" ? { _tag: "Fail", error: { _tag: "LookupError", id: "A" } } : { _tag: "Die", message: "resource used after release (A)" });
      expect(r.state).toEqual(start);                                              // the command failed before its commit
      expect(r.emitted).toEqual([start]);                                          // State.values emitted nothing after the start
      expect(r.operations).toEqual(["draw"]);                                      // nothing rendered
      expect(r.dom).toBe("");
    });
  }
});

// Stage 22 probe: the execution boundary after termination, mapped in two separate cases. Nothing here is guarded, caught on
// behalf of the application, or made to fail. The only instrumentation is that each step of the admitted command records its
// own exit before the next step runs, so one run maps every operation (the step's effect itself is unmodified).
describe("what remains executable after the application's Scope closes", () => {
  const Probed = Nexus.Event.define("Probed", Schema.Struct({ id: Schema.String }));

  /** The admitted command: acquires nothing itself, resolves the original capability, suspends behind `gate`, then, after the Scope has closed, tries each operation in turn. */
  const probeApplication = (programs: Awaited<ReturnType<typeof compilePrograms>>, w: ReturnType<typeof controllable>, gate: Deferred.Deferred<void>, suspended: Deferred.Deferred<void>) => {
    const base = applicationWithAsyncCatalog(programs);

    return Valance.define({
      ...base,
      commands: (state: Nexus.State.StateHandle<AppState>) => {
        const step = <A, F, R>(name: string, effect: Effect.Effect<A, F, R>) => Effect.gen(function* () {
          w.events.push(`op started: ${name}`);
          const exit = yield* Effect.exit(effect);

          w.events.push(`op ${name}: ${show(exit)}`);

          return exit;
        });
        const probe = Nexus.Command.define("t.probe", Schema.Struct({}), () => Effect.gen(function* () {
          w.events.push("command admitted");
          const catalog = yield* Nexus.Capability.require(CatalogAsync);         // resolved while the application is running
          w.events.push("command suspended");
          yield* Deferred.succeed(suspended, undefined);
          yield* Deferred.await(gate);
          w.events.push("command resumed");

          yield* step("state.update", state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...current.items, { id: "P1", name: "committed-after" }] })));
          yield* step("event publish", Nexus.Event.publish(Probed, { id: "P1" }));
          const second = yield* step("require second capability", Nexus.Capability.require(Second));

          if (Exit.isSuccess(second)) {
            yield* step("use second capability", second.value.touch());
          }

          yield* step("original capability (captured): lookup B", catalog.lookup("B"));
          w.events.push("command completing");
        }));

        return { ...base.commands(state), "app/probe": Nexus.Mesh.bind(probe, () => ({})) };
      },
    });
  };

  it("A + B: an already-admitted command, and a new invocation, after the Scope has closed", async () => {
    const w = controllable({ useAfterRelease: "fail", second: true });
    const m = mounted();
    const gate = await Effect.runPromise(Deferred.make<void>());
    const suspended = await Effect.runPromise(Deferred.make<void>());
    const app = probeApplication(await compilePrograms(), w, gate, suspended);
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app, { platform: w.platform, state: start }).pipe(Scope.extend(scope)));
    const running = runningOf(handle);

    await Effect.runPromise(Valance.mount(handle, m.target).pipe(Scope.extend(scope)));

    // Three separate things to watch, so "not rendered" is never read as "did not run":
    //   the command's own effects (state, events, capabilities)  <- the trace and the state read
    //   values publication                                       <- `emitted`, the application's state stream
    //   the render follower                                      <- `m.operations`
    const emitted = Effect.runPromise(Stream.runCollect(running.states).pipe(Effect.map(Chunk.toReadonlyArray)));
    const delivered: Array<string> = [];
    Effect.runFork(Nexus.Runtime.runFork(running.nexus.runtime, Stream.runForEach(Nexus.Event.subscribe(Probed), ({ id }) => Effect.sync(() => { delivered.push(id); })).pipe(Effect.tap(() => Effect.sync(() => { w.events.push("event subscriber stream ended"); })))).pipe(Fiber.await));

    // The subscription is live: an event published through the runtime before termination arrives.
    for (let attempt = 0; attempt < 200 && !delivered.includes("before"); attempt += 1) {
      await Nexus.Runtime.run(running.nexus.runtime, Nexus.Event.publish(Probed, { id: "before" }));
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(delivered).toContain("before");
    await Effect.runPromise(w.complete("B"));                                     // so the original capability's second use does not suspend

    const invoked = Effect.runFork(handle.invoke("app/probe", []));
    await Effect.runPromise(Deferred.await(suspended));
    w.events.push("scope closing");
    await Effect.runPromise(Scope.close(scope, Exit.void));
    w.events.push("scope closed");
    await until(() => w.events.includes("event subscriber stream ended"));

    // B. A NEW invocation after termination, while the admitted command is still suspended. Observed, not guarded.
    const fresh: Array<readonly [string, string]> = [];

    for (const [label, key, args] of [
      ["capability command", "app/lookupAsync", [{ value: "C" }]],
      ["command without a capability", "app/home", []],
      ["unknown entry", "nowhere/at-all", []],
    ] as const) {
      const exit = await Effect.runPromise(Effect.exit(handle.invoke(key, args)));

      fresh.push([label, show(exit)]);
      w.events.push(`new invoke after close: ${label}: ${show(exit)}`);
    }

    // A. Resume the admitted command: every operation it attempts now runs after termination.
    await Effect.runPromise(Deferred.succeed(gate, undefined));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    w.events.push(`caller invoke of the admitted command: ${show(exit)}`);
    const after = (marker: string) => w.events.slice(w.events.indexOf(marker));
    const index = (event: string) => w.events.indexOf(event);

    // Termination, in order: the resources are released (in the reverse of their acquisition), the Scope returns; the event
    // stream the application's subscribers hold has ended by then. Nothing waited for, or interrupted, the admitted command.
    expect(w.events.slice(0, 4)).toEqual(["resource acquired", "second resource acquired", "command admitted", "command suspended"]);
    expect(index("scope closing")).toBeLessThan(index("second resource released"));
    expect(index("second resource released")).toBeLessThan(index("resource released"));
    expect(index("resource released")).toBeLessThan(index("scope closed"));
    expect(index("event subscriber stream ended")).toBeLessThan(index("command resumed"));
    expect(w.events.some((event) => event.includes("interrupted"))).toBe(false);

    // B. A new invocation after termination: refused by the runtime as a defect, whether or not the command needs a capability.
    // An unknown entry never reaches the runtime: it is the ordinary typed UnmappedCommand.
    expect(fresh).toEqual([
      ["capability command", "died: NEXUS: the runtime has begun terminating"],
      ["command without a capability", "died: NEXUS: the runtime has begun terminating"],
      ["unknown entry", 'failed (typed) {"_tag":"UnmappedCommand","component":"nowhere","name":"at-all"}'],
    ]);

    // A. The already-admitted command, resumed after termination, in order. Every operation ran; none was refused.
    expect(after("command resumed")).toEqual([
      "command resumed",
      "op started: state.update", "op state.update: succeeded",
      "op started: event publish", "op event publish: succeeded",
      "op started: require second capability", "op require second capability: succeeded",
      "op started: use second capability", "second resource touched", 'op use second capability: failed (typed) {"_tag":"SecondClosed"}',
      "op started: original capability (captured): lookup B", "lookup started B", "lookup resumed B", "resource used after release B",
      'op original capability (captured): lookup B: failed (typed) {"_tag":"LookupError","id":"B"}',
      "command completing",
      "caller invoke of the admitted command: succeeded",
    ]);

    // State: the post-termination commit happened and is readable.
    expect((await Effect.runPromise(handle.state)).items.map((item) => item.id)).toEqual(["A0", "P1"]);
    // Values publication and the render follower never saw it: the state stream and the follower had ended with the Scope.
    expect((await emitted).map((state) => state.items.map((item) => item.id))).toEqual([["A0"]]);
    expect(m.operations).toEqual(["draw"]);
    expect(m.page.container.innerHTML).toBe("");
    // Events: the post-termination publish succeeded and reached no subscriber.
    expect(delivered).toEqual(["before"]);
  });
});

// Stage 23 probe: can the RESOURCE OWNER keep its resource alive until admitted users finish, with only ordinary Effect?
// The test platform's resource counts its in-flight lookups and its finalizer waits for them to leave before it marks the
// resource closed. Nothing in NEXUS, VALANCE, the command or the application changes. Positive paths synchronize on signals,
// never on time; where a block has to be shown, a bounded run of cooperative yields stands in for "no progress is possible".
describe("a resource that drains its in-flight users before it is released", () => {
  const firstValue = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => {
    const first = args[0];

    return first !== undefined && "value" in first ? first.value : undefined;
  };

  /** The application: the async catalog, plus a lookup command that logs its steps, and a command that opens a lookup's gate. */
  const drainApplication = (programs: Awaited<ReturnType<typeof compilePrograms>>, w: ReturnType<typeof controllable>, before?: { readonly waiting: Deferred.Deferred<void>; readonly go: Deferred.Deferred<void> }) => {
    const base = applicationWithAsyncCatalog(programs);

    return Valance.define({
      ...base,
      commands: (state: Nexus.State.StateHandle<AppState>) => {
        const lookup = Nexus.Command.define("t.drainLookup", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.gen(function* () {
          w.events.push("command admitted");
          const catalog = yield* Nexus.Capability.require(CatalogAsync);

          // Probe F only: admitted, and not yet inside the resource.
          if (before !== undefined) {
            w.events.push("command waiting before its lookup");
            yield* Deferred.succeed(before.waiting, undefined);
            yield* Deferred.await(before.go);
          }

          const entry = yield* catalog.lookup(id);

          w.events.push("command: lookup returned");
          yield* state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...current.items, { id: entry.id, name: entry.name }] }));
          w.events.push("command: state committed");
        }));
        // What a host-driven handshake looks like: the only thing that opens the gate is another invocation of the application.
        const signal = Nexus.Command.define("t.signal", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.asVoid(w.complete(id)));

        return {
          ...base.commands(state),
          "app/drainLookup": Nexus.Mesh.bind(lookup, (args) => ({ id: firstValue(args) })),
          "app/signal": Nexus.Mesh.bind(signal, (args) => ({ id: firstValue(args) })),
        };
      },
    });
  };

  const boot = async (before?: Parameters<typeof drainApplication>[2]) => {
    const w = controllable({ useAfterRelease: "fail", drain: true });
    const m = mounted();
    const app = drainApplication(await compilePrograms(), w, before);
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app, { platform: w.platform, state: start }).pipe(Scope.extend(scope)));

    await Effect.runPromise(Valance.mount(handle, m.target).pipe(Scope.extend(scope)));
    const emitted = Effect.runPromise(Stream.runCollect(runningOf(handle).states).pipe(Effect.map(Chunk.toReadonlyArray)));
    const closeScope = () => Effect.runFork(Scope.close(scope, Exit.void).pipe(Effect.tap(() => Effect.sync(() => { w.events.push("scope closed"); }))));
    const poll = async (fiber: Fiber.RuntimeFiber<unknown, unknown>) => Option.isSome(await Effect.runPromise(Fiber.poll(fiber)));

    return { w, m, scope, handle, emitted, closeScope, poll };
  };

  const trace = (w: ReturnType<typeof controllable>) => "TRACE\n" + w.events.map((event, index) => `${String(index).padStart(2)} ${event}`).join("\n");

  it("probe A (control): a lookup that finishes before termination leaves nothing in flight, and the finalizer has nothing to drain", async () => {
    const { w, handle, closeScope } = await boot();
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    expect(w.inFlight()).toBe(1);
    await Effect.runPromise(w.complete("A"));
    await Effect.runPromise(Fiber.join(invoked));
    expect(w.inFlight()).toBe(0);                                                 // the tracking is sound: it returned to zero

    await Effect.runPromise(Fiber.join(closeScope()));

    expect(w.events).toEqual([
      "resource acquired", "command admitted", "in flight: 1 (lookup A entered)", "lookup started A", "lookup resumed A", "lookup completed A",
      "in flight: 0 (lookup A left)", "command: lookup returned", "command: state committed",
      "finalizer started", "resource released", "scope closed",                    // no "draining": there was nothing to wait for
    ]);
  });

  it("probes B + D + E: termination while a lookup is suspended: Scope.close waits for it, the resource stays valid, new work is still refused", async () => {
    const { w, m, handle, emitted, closeScope, poll } = await boot();
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    const closing = closeScope();

    await Effect.runPromise(w.draining);                                          // the finalizer has reached its wait: a signal, not a delay

    // B. Scope.close has NOT returned, because the resource's finalizer is waiting for the in-flight lookup.
    expect(await poll(closing)).toBe(false);
    expect(w.inFlight()).toBe(1);
    expect(w.events.slice(-2)).toEqual(["finalizer started", "finalizer draining: 1 in flight"]);
    expect(w.events).not.toContain("resource released");

    // D. A new invocation while the application is draining is refused exactly as after termination (Stage 22): the drain
    // did not reopen admission. Nothing in the runtime was changed to make this so.
    for (const [key, args] of [["app/lookupAsync", [{ value: "C" }]], ["app/home", []]] as const) {
      expect(show(await Effect.runPromise(Effect.exit(handle.invoke(key, args))))).toBe("died: NEXUS: the runtime has begun terminating");
    }

    expect(await poll(closing)).toBe(false);                                      // still waiting

    // The lookup is allowed to finish. It does so against a LIVE resource.
    await Effect.runPromise(w.complete("A"));
    await Effect.runPromise(Fiber.join(closing));
    const exit = await Effect.runPromise(Fiber.await(invoked));
    const at = (event: string) => w.events.indexOf(event);

    expect(w.events).not.toContain("resource used after release A");
    expect(at("lookup completed A")).toBeLessThan(at("in flight: 0 (lookup A left)"));
    expect(at("in flight: 0 (lookup A left)")).toBeLessThan(at("finalizer drained"));
    expect(at("finalizer drained")).toBeLessThan(at("resource released"));
    expect(at("resource released")).toBeLessThan(at("scope closed"));

    // E. The admitted command: result, commit, publication, rendering.
    expect(show(exit)).toBe("succeeded");                                         // the caller's invoke
    expect(w.events).toContain("command: state committed");
    expect((await Effect.runPromise(handle.state)).items.map((item) => item.id)).toEqual(["A0", "A"]);   // the commit happened
    expect((await emitted).map((state) => state.items.length)).toEqual([1]);       // but `values` had already ended: not published
    expect(m.operations).toEqual(["draw"]);                                       // and not rendered
    expect(m.page.container.innerHTML).toBe("");
  });

  it("probe C: when the in-flight lookup can only be completed by a NEW invocation, the drain waits forever and Scope.close never returns", async () => {
    const { w, handle, closeScope, poll } = await boot();
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    const closing = closeScope();

    await Effect.runPromise(w.draining);

    // The only thing that opens this gate is the application's own `app/signal`, which is a new invocation: refused.
    expect(show(await Effect.runPromise(Effect.exit(handle.invoke("app/signal", [{ value: "A" }]))))).toBe("died: NEXUS: the runtime has begun terminating");

    // Bounded, deterministic evidence of no progress: a long run of cooperative yields in which nothing can happen, because
    // every path forward needs the gate. (A proof of absence needs a bound; this is the harness's, not production's.)
    await Effect.runPromise(Effect.forEach(Array.from({ length: 2000 }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));

    expect(await poll(closing)).toBe(false);                                      // Scope.close is blocked
    expect(await poll(invoked)).toBe(false);                                      // the admitted command is blocked
    expect(w.inFlight()).toBe(1);
    expect(w.events).not.toContain("lookup completed A");
    expect(w.events).not.toContain("finalizer drained");
    expect(w.events).not.toContain("resource released");

    // Test cleanup only: open the gate from OUTSIDE the application's admission. It proves the block was exactly this
    // dependency: finalization waits for the command, the command waits for an admission that finalization has closed.
    await Effect.runPromise(w.complete("A"));
    await Effect.runPromise(Fiber.join(closing));
    expect(show(await Effect.runPromise(Fiber.await(invoked)))).toBe("succeeded");
  });

  it("probe F: draining protects calls already inside the resource, not an admitted command that has not reached it yet", async () => {
    const before = { waiting: await Effect.runPromise(Deferred.make<void>()), go: await Effect.runPromise(Deferred.make<void>()) };
    const { w, handle, closeScope } = await boot(before);
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(Deferred.await(before.waiting));                      // admitted, resolved the capability, not yet inside a lookup
    expect(w.inFlight()).toBe(0);
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));                            // nothing to drain: closes and releases at once

    expect(w.events.slice(-4)).toEqual(["scope closing", "finalizer started", "resource released", "scope closed"]);

    await Effect.runPromise(Deferred.succeed(before.go, undefined));              // the command now goes to use its resource
    await Effect.runPromise(w.started("A"));
    await Effect.runPromise(w.complete("A"));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    expect(w.events).toContain("resource used after release A");                  // it found the resource closed
    expect(show(exit)).toBe('failed (typed) {"_tag":"LookupError","id":"A"}');
  });
});
