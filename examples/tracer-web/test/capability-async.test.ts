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

// Stage 25 (test-only): a platform-owned registry of admitted command fibers, supplied as an ordinary capability.
interface AdmittedRegistry {
  /** Registers the CURRENT fiber: the command's own, wherever it is called from. */
  readonly register: Effect.Effect<void>;
  readonly unregister: Effect.Effect<void>;
}
const Registry = Nexus.Capability.define<AdmittedRegistry>("example/admitted-registry");

/**
 * The external platform: a controllable asynchronous implementation backed by a scoped resource. `lookup(id)` raises
 * "started", then waits on a gate the test opens with `complete(id)`; an interruption of that wait is recorded. Every
 * step is recorded in order in `events`, with the resource's acquisition and release.
 */
const controllable = (options: { readonly useAfterRelease?: "fail" | "die"; readonly second?: boolean; readonly drain?: boolean | "interrupt"; readonly registry?: boolean } = {}) => {
  const events: Array<string> = [];
  let closed = false;                                                              // set only by the resource's own finalizer
  let secondClosed = false;
  // Resource-owned draining (Stage 23; only when `drain` is set): the resource counts its own in-flight users.
  const wait = options.drain === true;                                            // Stage 23: the finalizer waits for tracked calls to finish
  const interrupt = options.drain === "interrupt";                                // Stage 24: the finalizer interrupts tracked calls, then waits for them to exit
  let inFlight = 0;
  let idle: Deferred.Deferred<void> | undefined;
  const tracked = new Set<Fiber.RuntimeFiber<CatalogEntry, LookupError>>();      // interrupt mode: the resource's own fibers, one per call
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
  // In interrupt mode the call runs in a fiber the RESOURCE owns (so the finalizer can interrupt the call without touching the
  // caller's fiber); the caller joins it, and its interruption still cancels the call.
  const service: CatalogAsync = !wait && !interrupt ? serviceBase : {
    lookup: (id) => Effect.acquireUseRelease(
      Effect.sync(() => { inFlight += 1; events.push(`in flight: ${inFlight} (lookup ${id} entered)`); }),
      () => wait ? serviceBase.lookup(id) : Effect.gen(function* () {
        const call = yield* Effect.forkDaemon(serviceBase.lookup(id));

        tracked.add(call);

        return yield* Fiber.join(call).pipe(
          Effect.onInterrupt(() => Fiber.interrupt(call)),
          Effect.onExit((exit) => Effect.sync(() => { tracked.delete(call); events.push(`lookup call joined: ${show(exit)}`); }))
        );
      }),
      () => Effect.suspend(() => {
        inFlight -= 1;
        events.push(`in flight: ${inFlight} (lookup ${id} left)`);

        return inFlight === 0 && idle !== undefined ? Deferred.succeed(idle, undefined) : Effect.void;
      })
    ),
  };
  const release = !wait && !interrupt
    ? Effect.sync(() => { events.push("resource released"); closed = true; })
    : Effect.gen(function* () {
      events.push("finalizer started");

      if (interrupt) {
        // Interrupt the tracked calls, wait for those fibers to exit, then for their callers to leave. No admission is needed.
        const calls = [...tracked];

        if (calls.length > 0) {
          events.push(`finalizer interrupting ${calls.length} in flight`);
          yield* Effect.forEach(calls, (call) => Fiber.interrupt(call), { discard: true });
          events.push("finalizer: tracked calls exited");
        }
      }

      // Drain: wait until every tracked user has left, and only then mark the resource closed.
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
  // Stage 25: the registry. Commands register their own fiber at entry; the finalizer interrupts the registered fibers and
  // awaits their ACTUAL exit (Fiber.interrupt returns only when the fiber has ended), then releases.
  const admitted = new Set<Fiber.RuntimeFiber<unknown, unknown>>();
  let registryClosed = false;
  const registryReached = Effect.runSync(Deferred.make<void>());                  // raised when the registry's finalizer begins
  const registryService: AdmittedRegistry = {
    register: Effect.withFiberRuntime<void>((fiber) => Effect.sync(() => { admitted.add(fiber as Fiber.RuntimeFiber<unknown, unknown>); events.push(`registry: command registered (${admitted.size})${registryClosed ? " AFTER the registry finalizer began" : ""}`); })),
    unregister: Effect.withFiberRuntime<void>((fiber) => Effect.sync(() => { admitted.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>); events.push(`registry: command left (${admitted.size})`); })),
  };
  const acquireRegistry = Effect.acquireRelease(Effect.sync(() => { events.push("registry acquired"); return registryService; }), () => Effect.gen(function* () {
    events.push("registry finalizer started");
    registryClosed = true;
    const commands = [...admitted];

    yield* Deferred.succeed(registryReached, undefined);

    if (commands.length > 0) {
      events.push(`registry interrupting ${commands.length} admitted command(s)`);
      yield* Effect.forEach(commands, (command) => Fiber.interrupt(command), { discard: true });
      events.push("registry: admitted commands exited");
    }

    events.push("registry released");
  }));
  // One platform, one scoped Environment. Resources acquired in this order are released in the reverse order.
  const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.all([
      acquireCatalog,
      options.second === true ? Effect.map(acquireSecond, (value) => Option.some(value)) : Effect.succeed(Option.none<SecondService>()),
      options.registry === true ? Effect.map(acquireRegistry, (value) => Option.some(value)) : Effect.succeed(Option.none<AdmittedRegistry>()),
    ]),
    ([implementation, secondImplementation, registryImplementation]) => ({ resolutions: new Map<string, Nexus.Capability.CapabilityResolution<unknown>>([
      [CatalogAsync.id, { _tag: "Available" as const, implementation }],
      ...(Option.isSome(secondImplementation) ? [[Second.id, { _tag: "Available" as const, implementation: secondImplementation.value }] as const] : []),
      ...(Option.isSome(registryImplementation) ? [[Registry.id, { _tag: "Available" as const, implementation: registryImplementation.value }] as const] : []),
    ]) })
  ));

  return {
    events,
    platform,
    started: (id: string) => Deferred.await(gateOf(id).started),
    inFlight: () => inFlight,
    draining: Deferred.await(draining),
    registryReached: Deferred.await(registryReached),
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
// Shared by the Stage 23 and Stage 24 probes.
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
      // Stage 24, probe G: the same lookup, but the command records the call's exit and carries on, to show whether the
    // command itself was interrupted when its resource call was.
    const capturing = Nexus.Command.define("t.drainLookupCapturing", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.gen(function* () {
      w.events.push("command admitted");
      const catalog = yield* Nexus.Capability.require(CatalogAsync);
      const exit = yield* Effect.exit(catalog.lookup(id));

      w.events.push(`command: lookup exit: ${show(exit)}`);
      w.events.push("command: still running after its call ended");
    }));
    const signal = Nexus.Command.define("t.signal", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.asVoid(w.complete(id)));

      return {
        ...base.commands(state),
        "app/drainLookup": Nexus.Mesh.bind(lookup, (args) => ({ id: firstValue(args) })),
        "app/signal": Nexus.Mesh.bind(signal, (args) => ({ id: firstValue(args) })),
        "app/drainLookupCapturing": Nexus.Mesh.bind(capturing, (args) => ({ id: firstValue(args) })),
      };
    },
  });
};

const boot = async (before?: Parameters<typeof drainApplication>[2], drain: true | "interrupt" = true) => {
  const w = controllable({ useAfterRelease: "fail", drain });
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

describe("a resource that drains its in-flight users before it is released", () => {
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

// Stage 24 probe: the OTHER resource-local policy. Same tracked resource, but on finalization the resource interrupts its
// tracked in-flight calls (each runs in a fiber the resource owns), waits for them to exit, and only then closes. Interruption
// is not caught or translated anywhere. A comparison with Stage 23, not an adopted policy.
describe("a resource that interrupts its in-flight users when it is finalized", () => {
  const at = (w: ReturnType<typeof controllable>, event: string) => w.events.indexOf(event);

  it("probe A (control): a lookup that finishes before termination is not interrupted, and the finalizer has nothing to interrupt", async () => {
    const { w, handle, closeScope } = await boot(undefined, "interrupt");
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    await Effect.runPromise(w.complete("A"));
    await Effect.runPromise(Fiber.join(invoked));
    expect(w.inFlight()).toBe(0);
    await Effect.runPromise(Fiber.join(closeScope()));

    expect(w.events).toEqual([
      "resource acquired", "command admitted", "in flight: 1 (lookup A entered)", "lookup started A", "lookup resumed A", "lookup completed A",
      "lookup call joined: succeeded", "in flight: 0 (lookup A left)", "command: lookup returned", "command: state committed",
      "finalizer started", "resource released", "scope closed",                    // no interruption anywhere
    ]);
  });

  it("probe B: the finalizer interrupts the in-flight lookup; the command ends interrupted, nothing commits, the resource releases only after the call and its caller have left", async () => {
    const { w, m, handle, emitted, closeScope, poll } = await boot(undefined, "interrupt");
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    const closing = closeScope();

    await Effect.runPromise(Fiber.join(closing));                                 // no gate was opened: Scope.close completes by itself
    const exit = await Effect.runPromise(Fiber.await(invoked));

    expect(await poll(closing)).toBe(true);
    // The call was interrupted by the resource, not completed; the resource closed only after it had exited and its caller had left.
    expect(w.events).toContain("lookup interrupted A");
    expect(w.events).not.toContain("lookup completed A");
    expect(at(w, "lookup interrupted A")).toBeLessThan(at(w, "finalizer: tracked calls exited"));
    expect(at(w, "lookup call joined: interrupted")).toBeLessThan(at(w, "in flight: 0 (lookup A left)"));
    expect(at(w, "finalizer: tracked calls exited")).toBeLessThan(at(w, "resource released"));
    expect(at(w, "in flight: 0 (lookup A left)")).toBeLessThan(at(w, "resource released"));
    expect(at(w, "resource released")).toBeLessThan(at(w, "scope closed"));
    expect(w.events).not.toContain("resource used after release A");

    // The caller receives interruption (untranslated); the command did not continue; nothing committed, published or rendered.
    expect(show(exit)).toBe("interrupted");
    expect(w.events).not.toContain("command: lookup returned");
    expect(w.events).not.toContain("command: state committed");
    expect((await Effect.runPromise(handle.state)).items.map((item) => item.id)).toEqual(["A0"]);
    expect((await emitted).map((state) => state.items.length)).toEqual([1]);
    expect(m.operations).toEqual(["draw"]);
    expect(m.page.container.innerHTML).toBe("");
  });

  it("probe C: the circular wait of Stage 23 disappears: the interrupt needs no admission, so Scope.close completes and the command exits", async () => {
    const { w, handle, closeScope, poll } = await boot(undefined, "interrupt");
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    const closing = closeScope();

    try {
      // The same bounded run of cooperative yields as Stage 23's block: here something DOES happen in it.
      await Effect.runPromise(Effect.forEach(Array.from({ length: 2000 }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));

      expect(await poll(closing)).toBe(true);                                     // Scope.close returned: no gate, no new invocation, no cleanup
      expect(await poll(invoked)).toBe(true);                                     // the admitted command exited
      expect(show(await Effect.runPromise(Fiber.await(invoked)))).toBe("interrupted");
      expect(w.events).not.toContain("lookup completed A");
      expect(w.events.slice(-2)).toEqual(["resource released", "scope closed"]);
    } finally {
      await Effect.runPromise(w.complete("A"));                                   // harness only: never leave a fiber hanging if the assertions above failed
    }
  });

  it("probe F: interruption protects calls already registered with the resource, not an admitted command that has not reached it", async () => {
    const before = { waiting: await Effect.runPromise(Deferred.make<void>()), go: await Effect.runPromise(Deferred.make<void>()) };
    const { w, handle, closeScope } = await boot(before, "interrupt");
    const invoked = Effect.runFork(handle.invoke("app/drainLookup", [{ value: "A" }]));

    await Effect.runPromise(Deferred.await(before.waiting));
    expect(w.inFlight()).toBe(0);
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));                            // nothing registered: nothing to interrupt

    expect(w.events.slice(-4)).toEqual(["scope closing", "finalizer started", "resource released", "scope closed"]);

    await Effect.runPromise(Deferred.succeed(before.go, undefined));              // the command now goes to the resource
    await Effect.runPromise(w.started("A"));
    await Effect.runPromise(w.complete("A"));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    // It REGISTERS after the resource was released (the resource refuses nobody), and finds it closed.
    expect(at(w, "resource released")).toBeLessThan(at(w, "in flight: 1 (lookup A entered)"));
    expect(w.events).toContain("resource used after release A");
    expect(show(exit)).toBe('failed (typed) {"_tag":"LookupError","id":"A"}');
  });

  it("probe G: interrupting the resource's call does not interrupt the containing command; the command only ends if it lets the interruption propagate", async () => {
    const { w, handle, closeScope } = await boot(undefined, "interrupt");
    const invoked = Effect.runFork(handle.invoke("app/drainLookupCapturing", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    expect(w.events).toContain("command: lookup exit: interrupted");              // the command saw its call interrupted ...
    expect(w.events).toContain("command: still running after its call ended");   // ... and was still running: it was not itself interrupted
    expect(at(w, "lookup call joined: interrupted")).toBeLessThan(at(w, "command: still running after its call ended"));
    expect(show(exit)).toBe("succeeded");                                         // so the caller's invoke succeeded
    expect(w.events).not.toContain("resource used after release A");
  });
});

// Stage 25 probe: can application-work lifetime be established ABOVE NEXUS, by tracking admitted command fibers as an
// ordinary platform-owned resource? Every command registers its OWN fiber at entry (one wrapper, applied at the definition);
// the registry is acquired AFTER the capability resource, so its finalizer is expected (and checked, not assumed) to run
// first: interrupt the registered fibers, await their actual exit, release. Test-only; nothing in NEXUS or VALANCE changes.
interface TrackedOptions {
  /** Probe B: suspend the command after it registered, before its first capability use. */
  readonly before?: { readonly waiting: Deferred.Deferred<void>; readonly go: Deferred.Deferred<void> };
  /** Probe D2: an uninterruptible region the command enters, held open by `gate`. */
  readonly region?: { readonly entered: Deferred.Deferred<void>; readonly gate: Deferred.Deferred<void> };
  /** Probe D3: work the command forks as a daemon, released by `gate`. */
  readonly escape?: { readonly forked: Deferred.Deferred<void>; readonly gate: Deferred.Deferred<void> };
}

const trackedApplication = (programs: Awaited<ReturnType<typeof compilePrograms>>, w: ReturnType<typeof controllable>, options: TrackedOptions = {}) => {
  const base = applicationWithAsyncCatalog(programs);

  return Valance.define({
    ...base,
    commands: (state: Nexus.State.StateHandle<AppState>) => {
      // THE wrapper: registers the command's own fiber at entry, unregisters on any exit, records the exit.
      const tracked = <A, F, R>(body: Effect.Effect<A, F, R>) => Effect.gen(function* () {
        const registry = yield* Nexus.Capability.require(Registry);

        return yield* Effect.acquireUseRelease(registry.register, () => body, () => registry.unregister).pipe(
          Effect.onExit((exit) => Effect.sync(() => { w.events.push(`command exit: ${show(exit)}`); }))
        );
      });
      const commit = (id: string) => state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...current.items, { id, name: `committed-${id}` }] }));

      const lookup = Nexus.Command.define("t.trackedLookup", Schema.Struct({ id: Schema.String }), ({ id }) => tracked(Effect.gen(function* () {
        w.events.push("command admitted");
        const catalog = yield* Nexus.Capability.require(CatalogAsync);

        if (options.before !== undefined) {
          w.events.push("command waiting before its lookup");
          yield* Deferred.succeed(options.before.waiting, undefined);
          yield* Deferred.await(options.before.go);
        }

        const entry = yield* catalog.lookup(id);

        w.events.push("command: lookup returned");
        yield* commit(entry.id);
        w.events.push("command: state committed");
      })));
      // D1: the command tries to handle the interruption of its own execution and carry on.
      const catches = Nexus.Command.define("t.trackedCatches", Schema.Struct({ id: Schema.String }), ({ id }) => tracked(Effect.gen(function* () {
        w.events.push("command admitted");
        const catalog = yield* Nexus.Capability.require(CatalogAsync);

        yield* Effect.catchAllCause(catalog.lookup(id), (cause) => Effect.sync(() => { w.events.push(`command: caught ${Cause.isInterruptedOnly(cause) ? "an interruption" : "something else"}, continuing`); }));
        w.events.push("command: continued after catching");
        yield* commit("after-catch");
        w.events.push("command: state committed");
      })));
      // D2: the command is inside an uninterruptible region when termination reaches it.
      const region = Nexus.Command.define("t.trackedRegion", Schema.Struct({}), () => tracked(Effect.gen(function* () {
        w.events.push("command admitted");
        yield* Effect.uninterruptible(Effect.gen(function* () {
          w.events.push("command: inside its uninterruptible region");
          yield* Deferred.succeed(options.region!.entered, undefined);
          yield* Deferred.await(options.region!.gate);
          yield* commit("in-region");
          w.events.push("command: committed inside the region");
        }));
        w.events.push("command: ran past its uninterruptible region");
      })));
      // D3: the command hands further work to a fiber the registry does not know.
      const escapes = Nexus.Command.define("t.trackedEscapes", Schema.Struct({}), () => tracked(Effect.gen(function* () {
        w.events.push("command admitted");
        const catalog = yield* Nexus.Capability.require(CatalogAsync);

        yield* Effect.forkDaemon(Effect.gen(function* () {
          yield* Deferred.await(options.escape!.gate);
          w.events.push("escaped work resumed");
          w.events.push(`escaped work: lookup B: ${show(yield* Effect.exit(catalog.lookup("B")))}`);
        }));
        w.events.push("command forked escaped work");
        yield* Deferred.succeed(options.escape!.forked, undefined);
        yield* catalog.lookup("A");
        w.events.push("command: lookup returned");
      })));
      // Opens a lookup's gate: reachable only by a NEW invocation (untracked, like any command that needs no registry).
      const signal = Nexus.Command.define("t.signal2", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.asVoid(w.complete(id)));

      return {
        ...base.commands(state),
        "app/trackedLookup": Nexus.Mesh.bind(lookup, (args) => ({ id: firstValue(args) })),
        "app/trackedCatches": Nexus.Mesh.bind(catches, (args) => ({ id: firstValue(args) })),
        "app/trackedRegion": Nexus.Mesh.bind(region, () => ({})),
        "app/trackedEscapes": Nexus.Mesh.bind(escapes, () => ({})),
        "app/signal2": Nexus.Mesh.bind(signal, (args) => ({ id: firstValue(args) })),
      };
    },
  });
};

const bootTracked = async (options: TrackedOptions = {}) => {
  const w = controllable({ useAfterRelease: "fail", registry: true });
  const m = mounted();
  const app = trackedApplication(await compilePrograms(), w, options);
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app, { platform: w.platform, state: start }).pipe(Scope.extend(scope)));

  await Effect.runPromise(Valance.mount(handle, m.target).pipe(Scope.extend(scope)));
  const emitted = Effect.runPromise(Stream.runCollect(runningOf(handle).states).pipe(Effect.map(Chunk.toReadonlyArray)));
  const closeScope = () => Effect.runFork(Scope.close(scope, Exit.void).pipe(Effect.tap(() => Effect.sync(() => { w.events.push("scope closed"); }))));
  const poll = async (fiber: Fiber.RuntimeFiber<unknown, unknown>) => Option.isSome(await Effect.runPromise(Fiber.poll(fiber)));
  const yields = (n: number) => Effect.runPromise(Effect.forEach(Array.from({ length: n }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));

  return { w, m, scope, handle, emitted, closeScope, poll, yields };
};

describe("a platform-owned registry of admitted command fibers", () => {
  const at = (w: ReturnType<typeof controllable>, event: string) => w.events.indexOf(event);
  const strictlyIn = (w: ReturnType<typeof controllable>, ...order: ReadonlyArray<string>) => {
    for (const [index, event] of order.entries()) {
      expect(at(w, event), event).toBeGreaterThanOrEqual(0);

      if (index > 0) {
        expect(at(w, order[index - 1]!), `${order[index - 1]} < ${event}`).toBeLessThan(at(w, event));
      }
    }
  };
  const ids = async (handle: Valance.ApplicationHandle<AppState, unknown>) => (await Effect.runPromise(handle.state)).items.map((item) => item.id);

  it("ordering and ownership: the registry is acquired after the resource and released before it; commands register their own fiber first", async () => {
    const { w, handle, closeScope } = await bootTracked();
    const invoked = Effect.runFork(handle.invoke("app/trackedLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    await Effect.runPromise(w.complete("A"));
    await Effect.runPromise(Fiber.join(invoked));
    await Effect.runPromise(Fiber.join(closeScope()));

    // Probe A (control): registered at entry (before the command's own first step), left on exit, nothing to interrupt.
    expect(w.events).toEqual([
      "resource acquired", "registry acquired",                                    // acquisition order ...
      "registry: command registered (1)", "command admitted",
      "lookup started A", "lookup resumed A", "lookup completed A", "command: lookup returned", "command: state committed",
      "registry: command left (0)", "command exit: succeeded",
      "registry finalizer started", "registry released", "resource released",      // ... release is its reverse: the registry FIRST
      "scope closed",
    ]);
  });

  it("probe B: an admitted command that has not reached the resource is interrupted, and can never reach it afterwards", async () => {
    const before = { waiting: await Effect.runPromise(Deferred.make<void>()), go: await Effect.runPromise(Deferred.make<void>()) };
    const { w, m, handle, emitted, closeScope, yields } = await bootTracked({ before });
    const invoked = Effect.runFork(handle.invoke("app/trackedLookup", [{ value: "A" }]));

    await Effect.runPromise(Deferred.await(before.waiting));                      // registered, not yet inside any capability
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));                            // completes by itself: the command is interrupted promptly
    const exit = await Effect.runPromise(Fiber.await(invoked));

    expect(w.events).toContain("registry interrupting 1 admitted command(s)");
    strictlyIn(w, "scope closing", "registry finalizer started", "command exit: interrupted", "registry: admitted commands exited", "registry released", "resource released", "scope closed");
    expect(show(exit)).toBe("interrupted");                                       // the caller receives interruption
    expect(await ids(handle)).toEqual(["A0"]);                                    // nothing committed
    expect((await emitted).map((state) => state.items.length)).toEqual([1]);
    expect(m.operations).toEqual(["draw"]);

    await Effect.runPromise(Deferred.succeed(before.go, undefined));              // the command's way to its resource is open ...
    await yields(500);
    expect(w.events.some((event) => event.startsWith("lookup started"))).toBe(false);   // ... and nothing ever uses it
    expect(w.events).not.toContain("resource used after release A");
  });

  it("probe C: a command inside a capability call is interrupted as a whole; the call exits as a consequence; the resource releases after the command has exited", async () => {
    const { w, handle, closeScope } = await bootTracked();
    const invoked = Effect.runFork(handle.invoke("app/trackedLookup", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    // No separate interrupt of the call was issued: interrupting the command fiber reached the call it was inside.
    strictlyIn(w, "registry interrupting 1 admitted command(s)", "lookup interrupted A", "command exit: interrupted", "registry: admitted commands exited", "registry released", "resource released", "scope closed");
    expect(w.events).not.toContain("lookup completed A");
    expect(w.events).not.toContain("resource used after release A");
    expect(show(exit)).toBe("interrupted");
    expect(await ids(handle)).toEqual(["A0"]);
  });

  it("probe D1: a command cannot handle the interruption of its own fiber and carry on; its handler never runs", async () => {
    const { w, handle, closeScope } = await bootTracked();
    const invoked = Effect.runFork(handle.invoke("app/trackedCatches", [{ value: "A" }]));

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    expect(w.events.some((event) => event.startsWith("command: caught"))).toBe(false);        // catchAllCause did not run
    expect(w.events).not.toContain("command: continued after catching");
    expect(w.events).not.toContain("command: state committed");
    expect(show(exit)).toBe("interrupted");
    strictlyIn(w, "command exit: interrupted", "registry: admitted commands exited", "registry released", "resource released");
  });

  it("probes D2 + E: an uninterruptible command keeps the registry (and Scope.close) waiting for its ACTUAL exit; new invocations stay refused meanwhile", async () => {
    const region = { entered: await Effect.runPromise(Deferred.make<void>()), gate: await Effect.runPromise(Deferred.make<void>()) };
    const { w, m, handle, emitted, closeScope, poll, yields } = await bootTracked({ region });
    const invoked = Effect.runFork(handle.invoke("app/trackedRegion", []));

    await Effect.runPromise(Deferred.await(region.entered));
    w.events.push("scope closing");
    const closing = closeScope();

    await Effect.runPromise(w.registryReached);
    await yields(1000);

    // The interrupt was REQUESTED, but the command has not exited: the registry does not treat the request as termination.
    expect(w.events).toContain("registry interrupting 1 admitted command(s)");
    expect(await poll(closing)).toBe(false);
    expect(await poll(invoked)).toBe(false);
    expect(w.events).not.toContain("registry released");
    expect(w.events).not.toContain("resource released");

    // E. New work during the registry's drain is refused exactly as after termination: admission was not reopened.
    for (const [key, args] of [["app/home", []], ["app/trackedLookup", [{ value: "Z" }]]] as const) {
      expect(show(await Effect.runPromise(Effect.exit(handle.invoke(key, args))))).toBe("died: NEXUS: the runtime has begun terminating");
    }

    await Effect.runPromise(Deferred.succeed(region.gate, undefined));
    await Effect.runPromise(Fiber.join(closing));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    // The command finished its uninterruptible region (and committed inside it, with termination already underway), then the
    // pending interruption took effect at once: nothing after the region ran.
    expect(w.events).toContain("command: committed inside the region");
    expect(w.events).not.toContain("command: ran past its uninterruptible region");
    strictlyIn(w, "command: committed inside the region", "command exit: interrupted", "registry: admitted commands exited", "registry released", "resource released", "scope closed");
    expect(show(exit)).toBe("interrupted");
    expect(await ids(handle)).toEqual(["A0", "in-region"]);                       // a post-termination-request commit, while the resource was still valid
    expect((await emitted).map((state) => state.items.length)).toEqual([1]);       // not published
    expect(m.operations).toEqual(["draw"]);
  });

  it("probe D2b: an uninterruptible command that needs a NEW invocation to finish blocks the registry indefinitely (the Stage 23 cycle, at command level)", async () => {
    const region = { entered: await Effect.runPromise(Deferred.make<void>()), gate: await Effect.runPromise(Deferred.make<void>()) };
    const { w, handle, closeScope, poll, yields } = await bootTracked({ region });
    const invoked = Effect.runFork(handle.invoke("app/trackedRegion", []));

    await Effect.runPromise(Deferred.await(region.entered));
    w.events.push("scope closing");
    const closing = closeScope();

    try {
      await Effect.runPromise(w.registryReached);
      // The only application door to this region's gate is a new invocation: refused.
      expect(show(await Effect.runPromise(Effect.exit(handle.invoke("app/signal2", [{ value: "x" }]))))).toBe("died: NEXUS: the runtime has begun terminating");
      await yields(2000);

      expect(await poll(closing)).toBe(false);                                    // Scope.close is blocked
      expect(await poll(invoked)).toBe(false);
      expect(w.events).not.toContain("registry: admitted commands exited");
      expect(w.events).not.toContain("resource released");
    } finally {
      await Effect.runPromise(Deferred.succeed(region.gate, undefined));          // harness cleanup, from outside the application's admission
    }

    await Effect.runPromise(Fiber.join(closing));
    await Effect.runPromise(Fiber.await(invoked));
  });

  it("probe D3: work a command hands to an untracked (daemon) fiber escapes the registry and can still reach the released resource", async () => {
    const escape = { forked: await Effect.runPromise(Deferred.make<void>()), gate: await Effect.runPromise(Deferred.make<void>()) };
    const { w, handle, closeScope, yields } = await bootTracked({ escape });

    await Effect.runPromise(w.complete("B"));
    const invoked = Effect.runFork(handle.invoke("app/trackedEscapes", []));

    await Effect.runPromise(Deferred.await(escape.forked));
    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));
    const exit = await Effect.runPromise(Fiber.await(invoked));

    expect(show(exit)).toBe("interrupted");                                       // the registered command fiber was interrupted and exited ...
    strictlyIn(w, "command exit: interrupted", "registry: admitted commands exited", "registry released", "resource released", "scope closed");

    await Effect.runPromise(Deferred.succeed(escape.gate, undefined));            // ... but the fiber it forked as a daemon was not the registry's
    await yields(500);

    strictlyIn(w, "scope closed", "escaped work resumed", "resource used after release B");
    expect(w.events).toContain('escaped work: lookup B: failed (typed) {"_tag":"LookupError","id":"B"}');
  });

  it("probe H: coverage is by convention: a command that does not use the wrapper is invisible to the registry and behaves as in Stage 22", async () => {
    const { w, handle, closeScope } = await bootTracked();
    const invoked = Effect.runFork(handle.invoke("app/lookupAsync", [{ value: "A" }]));      // the application's own command: not wrapped

    await Effect.runPromise(w.started("A"));
    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));                            // the registry has nothing registered: nothing to interrupt

    expect(w.events.slice(-5)).toEqual(["scope closing", "registry finalizer started", "registry released", "resource released", "scope closed"]);
    expect(w.events).not.toContain("registry interrupting 1 admitted command(s)");

    await Effect.runPromise(w.complete("A"));                                     // the command, never told anything, goes on
    const exit = await Effect.runPromise(Fiber.await(invoked));

    expect(w.events).toContain("resource used after release A");
    expect(show(exit)).toBe('failed (typed) {"_tag":"LookupError","id":"A"}');
  });
});

// Stage 26 probe: where does VALANCE own command lifetime? Two real entry paths (`ApplicationHandle.invoke`, and a MESH click
// through PORT and `connect`'s dispatch) are driven against the same application, first with nothing added (what exists today),
// then with ONE central wrapper over the whole binding table (no command registers itself). Test-only, nothing in VALANCE moves.
interface TableOptions {
  /** How the central wrapper registers: with the platform-owned registry (Stage 25), a registry owned by the caller's Scope, or not at all. */
  readonly wrap?: "platform" | "valance";
  readonly valance?: { readonly service: AdmittedRegistry };
  readonly before?: { readonly waiting: Deferred.Deferred<void>; readonly go: Deferred.Deferred<void> };
  readonly region?: { readonly entered: Deferred.Deferred<void>; readonly gate: Deferred.Deferred<void> };
  readonly child?: { readonly kind: "daemon" | "fork"; readonly forked: Deferred.Deferred<void>; readonly gate: Deferred.Deferred<void> };
}

/** A registry owned by the CALLER'S Scope, not by the platform: a plain closure, drained by a Scope finalizer registered right after `Valance.start`. */
const valanceRegistry = (w: ReturnType<typeof controllable>) => {
  const admitted = new Set<Fiber.RuntimeFiber<unknown, unknown>>();
  let closed = false;
  const reached = Effect.runSync(Deferred.make<void>());
  const service: AdmittedRegistry = {
    register: Effect.withFiberRuntime<void>((fiber) => Effect.sync(() => { admitted.add(fiber as Fiber.RuntimeFiber<unknown, unknown>); w.events.push(`valance registry: command registered (${admitted.size})${closed ? " AFTER the drain began" : ""}`); })),
    unregister: Effect.withFiberRuntime<void>((fiber) => Effect.sync(() => { admitted.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>); w.events.push(`valance registry: command left (${admitted.size})`); })),
  };
  const drain = Effect.gen(function* () {
    w.events.push("valance registry finalizer started");
    closed = true;
    const fibers = [...admitted];

    yield* Deferred.succeed(reached, undefined);

    if (fibers.length > 0) {
      w.events.push(`valance registry interrupting ${fibers.length} admitted command(s)`);
      yield* Effect.forEach(fibers, (fiber) => Fiber.interrupt(fiber), { discard: true });
    }

    w.events.push("valance registry drained");
  });

  return { service, drain, reached: Deferred.await(reached) };
};

const tableApplication = (programs: Awaited<ReturnType<typeof compilePrograms>>, w: ReturnType<typeof controllable>, options: TableOptions = {}) => {
  const base = applicationWithAsyncCatalog(programs);

  return Valance.define({
    ...base,
    commands: (state: Nexus.State.StateHandle<AppState>) => {
      const commit = (id: string) => state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...current.items, { id, name: `committed-${id}` }] }));
      // The command logs its own exit, so it is observable with or without a wrapper.
      const logged = <A, F, R>(body: Effect.Effect<A, F, R>) => body.pipe(Effect.onExit((exit) => Effect.sync(() => { w.events.push(`command exit: ${show(exit)}`); })));

      const slow = Nexus.Command.define("t.slowOpen", Schema.Struct({ id: Schema.String }), ({ id }) => logged(Effect.gen(function* () {
        w.events.push("command admitted");

        if (options.before !== undefined) {
          w.events.push("command waiting before touching any capability");
          yield* Deferred.succeed(options.before.waiting, undefined);
          yield* Deferred.await(options.before.go);
        }

        const catalog = yield* Nexus.Capability.require(CatalogAsync);
        const entry = yield* catalog.lookup(id);

        w.events.push("command: lookup returned");
        yield* commit(entry.id);
        w.events.push("command: state committed");
      })));
      const region = Nexus.Command.define("t.slowRegion", Schema.Struct({}), () => logged(Effect.gen(function* () {
        w.events.push("command admitted");
        yield* Effect.uninterruptible(Effect.gen(function* () {
          w.events.push("command: inside its uninterruptible region");
          yield* Deferred.succeed(options.region!.entered, undefined);
          yield* Deferred.await(options.region!.gate);
          w.events.push("command: left its region");
        }));
        w.events.push("command: ran past its region");
      })));
      const spawns = Nexus.Command.define("t.slowChild", Schema.Struct({}), () => logged(Effect.gen(function* () {
        w.events.push("command admitted");
        const catalog = yield* Nexus.Capability.require(CatalogAsync);
        const work = Effect.gen(function* () {
          yield* Deferred.await(options.child!.gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { w.events.push(`child (${options.child!.kind}) interrupted`); })));
          w.events.push(`child (${options.child!.kind}) resumed`);
          w.events.push(`child: lookup B: ${show(yield* Effect.exit(catalog.lookup("B")))}`);
        });

        yield* options.child!.kind === "daemon" ? Effect.forkDaemon(work) : Effect.fork(work);
        w.events.push(`command forked a ${options.child!.kind} child`);
        yield* Deferred.succeed(options.child!.forked, undefined);
        yield* catalog.lookup("A");
      })));

      // `home/open` is a real MESH intent (a row's button in the home view); `app/*` entries are for `invoke`. The SAME command serves both.
      const table: Record<string, Nexus.Mesh.Binding<unknown, never>> = {
        ...(base.commands(state) as Record<string, Nexus.Mesh.Binding<unknown, never>>),
        "home/open": Nexus.Mesh.bind(slow, (args) => ({ id: firstValue(args) })) as never,
        "app/slowOpen": Nexus.Mesh.bind(slow, (args) => ({ id: firstValue(args) })) as never,
        ...(options.region === undefined ? {} : {
          "app/slowRegion": Nexus.Mesh.bind(region, () => ({})) as never,
          "app/openRegion": Nexus.Mesh.bind(Nexus.Command.define("t.openRegion", Schema.Struct({}), () => Effect.asVoid(Deferred.succeed(options.region!.gate, undefined))), () => ({})) as never,
        }),
        ...(options.child === undefined ? {} : { "app/slowChild": Nexus.Mesh.bind(spawns, () => ({})) as never }),
      };

      if (options.wrap === undefined) {
        return table;
      }

      // THE central wrapper: one function over the whole table. No command registers itself.
      return Object.fromEntries(Object.entries(table).map(([key, binding]) => [key, ((args) => Effect.gen(function* () {
        const registry = options.wrap === "valance" ? options.valance!.service : yield* Nexus.Capability.require(Registry);

        return yield* Effect.acquireUseRelease(
          Effect.zipRight(registry.register, Effect.sync(() => { w.events.push(`table wrapper: ${key} registered`); })),
          () => binding(args),
          () => registry.unregister
        );
      })) as Nexus.Mesh.Binding<unknown, never>])) as typeof table;
    },
  });
};

const bootTable = async (options: TableOptions = {}) => {
  const w = controllable({ useAfterRelease: "fail", registry: options.wrap === "platform" });
  const m = mounted();
  const valance = options.wrap === "valance" ? valanceRegistry(w) : undefined;
  const app = tableApplication(await compilePrograms(), w, valance === undefined ? options : { ...options, valance });
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app, { platform: w.platform, state: start }).pipe(Scope.extend(scope)));

  if (valance !== undefined) {
    await Effect.runPromise(Scope.addFinalizer(scope, valance.drain));       // right after start, as VALANCE's own `start` could
  }

  const mount = await Effect.runPromise(Valance.mount(handle, m.target).pipe(Scope.extend(scope)));
  const emitted = Effect.runPromise(Stream.runCollect(runningOf(handle).states).pipe(Effect.map(Chunk.toReadonlyArray)));
  const closeScope = () => Effect.runFork(Scope.close(scope, Exit.void).pipe(Effect.tap(() => Effect.sync(() => { w.events.push("scope closed"); }))));
  const poll = async (fiber: Fiber.RuntimeFiber<unknown, unknown>) => Option.isSome(await Effect.runPromise(Fiber.poll(fiber)));
  const yields = (n: number) => Effect.runPromise(Effect.forEach(Array.from({ length: n }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));
  // A real MESH intent: the "Open" button of the first row of the home view, through PORT, `connect` and `dispatch`.
  const clickOpen = () => m.page.click(m.page.container.querySelector("div button")!);

  return { w, m, scope, handle, mount, emitted, closeScope, poll, yields, clickOpen, valanceReached: valance?.reached };
};

describe("where VALANCE owns command lifetime: the two entry paths", () => {
  const at = (w: ReturnType<typeof controllable>, event: string) => w.events.indexOf(event);
  const strictlyIn = (w: ReturnType<typeof controllable>, ...order: ReadonlyArray<string>) => {
    for (const [index, event] of order.entries()) {
      expect(at(w, event), event).toBeGreaterThanOrEqual(0);

      if (index > 0) {
        expect(at(w, order[index - 1]!), `${order[index - 1]} < ${event}`).toBeLessThan(at(w, event));
      }
    }
  };
  const ids = async (handle: Valance.ApplicationHandle<AppState, unknown>) => (await Effect.runPromise(handle.state)).items.map((item) => item.id);
  const gates = async () => ({ waiting: await Effect.runPromise(Deferred.make<void>()), go: await Effect.runPromise(Deferred.make<void>()) });

  /** Suspends a command (before any capability) through the named path and returns once it is in flight. */
  const start_ = async (path: "invoke" | "dispatch", options: TableOptions) => {
    const before = await gates();
    const booted = await bootTable({ ...options, before });
    const invoked = path === "invoke" ? Effect.runFork(booted.handle.invoke("app/slowOpen", [{ value: "A0" }])) : undefined;

    if (path === "dispatch") {
      booted.clickOpen();
    }

    await Effect.runPromise(Deferred.await(before.waiting));

    return { ...booted, before, invoked };
  };

  it("baseline, invoke (nothing added): the command is NOT interrupted when the Scope closes; it goes on to the released resource", async () => {
    const { w, closeScope, before, invoked } = await start_("invoke", {});

    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));
    await Effect.runPromise(Deferred.succeed(before.go, undefined));
    await Effect.runPromise(w.complete("A0"));

    expect(show(await Effect.runPromise(Fiber.await(invoked!)))).toBe('failed (typed) {"_tag":"LookupError","id":"A0"}');
    strictlyIn(w, "scope closing", "resource released", "scope closed", "resource used after release A0");
    expect(w.events).not.toContain("command exit: interrupted");
  });

  it("baseline, MESH dispatch (nothing added): the command IS interrupted, before the resource is released, by VALANCE's own connect finalizer", async () => {
    const { w, m, handle, mount, closeScope, before, yields } = await start_("dispatch", {});

    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));
    await Effect.runPromise(Deferred.succeed(before.go, undefined));
    await Effect.runPromise(w.complete("A0"));
    await yields(500);

    strictlyIn(w, "scope closing", "command exit: interrupted", "resource released", "scope closed");
    expect(w.events.some((event) => event.startsWith("lookup started"))).toBe(false);          // it never reaches the resource
    expect(mount.dispatched).toEqual([]);                                          // the interrupted dispatch leaves no result for the target
    expect(await ids(handle)).toEqual(["A0"]);
    expect(m.operations).toEqual(["draw"]);
  });

  it("probe A, invoke path: a central wrapper over the binding table registers the command's own fiber; the registry interrupts and awaits it before the resource releases", async () => {
    const { w, handle, closeScope, invoked } = await start_("invoke", { wrap: "platform" });

    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));

    expect(w.events).toContain("table wrapper: app/slowOpen registered");           // no command registered itself
    strictlyIn(w, "table wrapper: app/slowOpen registered", "scope closing", "registry finalizer started", "registry interrupting 1 admitted command(s)", "command exit: interrupted", "registry: admitted commands exited", "registry released", "resource released", "scope closed");
    expect(show(await Effect.runPromise(Fiber.await(invoked!)))).toBe("interrupted");
    expect(await ids(handle)).toEqual(["A0"]);
    expect(w.events.some((event) => event.startsWith("lookup started"))).toBe(false);
  });

  it("probe B, MESH dispatch path: the SAME wrapper registers it, but VALANCE's connect finalizer interrupts it first, so the registry finds nothing left", async () => {
    const { w, handle, closeScope } = await start_("dispatch", { wrap: "platform" });

    w.events.push("scope closing");
    await Effect.runPromise(Fiber.join(closeScope()));

    expect(w.events).toContain("table wrapper: home/open registered");              // the MESH intent's key, through the same central wrapper
    strictlyIn(w, "table wrapper: home/open registered", "scope closing", "command exit: interrupted", "registry: command left (0)", "registry finalizer started", "registry released", "resource released", "scope closed");
    expect(w.events).not.toContain("registry interrupting 1 admitted command(s)");  // nothing for the registry to do
    expect(await ids(handle)).toEqual(["A0"]);
  });

  it("probe C: both paths converge: the same wrapped binding table is where each command runs", async () => {
    const { w, handle, clickOpen } = await bootTable({ wrap: "platform" });

    await Effect.runPromise(handle.invoke("app/changeItems", [{ value: [{ id: "A0", name: "Alpha" }] as never }]));
    clickOpen();                                                                   // MESH intent "home/open" (the probe's command, completes below)
    await Effect.runPromise(w.started("A0"));
    await Effect.runPromise(w.complete("A0"));
    await until(() => w.events.includes("command: state committed"));

    // The invoke path (app/changeItems) and the dispatch path (home/open) each went through the table wrapper, with their own key.
    expect(w.events.filter((event) => event.startsWith("table wrapper:"))).toEqual(["table wrapper: app/changeItems registered", "table wrapper: home/open registered"]);
  });

  it("probe D1: no ordinary entry escapes the wrapper: every key in the table, application-defined or probe-defined, is registered", async () => {
    const { w, m, handle, closeScope } = await bootTable({ wrap: "platform" });

    await Effect.runPromise(handle.invoke("app/home", []));                         // an application-defined entry, by invoke
    m.page.click([...m.page.container.querySelectorAll("button")].find((button) => button.textContent === "Reverse")!);   // an application-defined MESH intent, by dispatch
    await until(() => w.events.includes("table wrapper: home/reverse registered"));
    await Effect.runPromise(Fiber.join(closeScope()));

    expect(w.events.filter((event) => event.startsWith("table wrapper:"))).toEqual(["table wrapper: app/home registered", "table wrapper: home/reverse registered"]);
    expect(w.events.filter((event) => event.startsWith("registry: command left")).length).toBe(2);   // each left cleanly: nothing was ever left registered
  });

  for (const kind of ["fork", "daemon"] as const) {
    it(`probe D2 (${kind} child): ${kind === "fork" ? "a structured child is interrupted with its command" : "a daemon child escapes the command, outlives the resource's release, and fails against it"}`, async () => {
      const child = { kind, forked: await Effect.runPromise(Deferred.make<void>()), gate: await Effect.runPromise(Deferred.make<void>()) };
      const { w, handle, closeScope, yields } = await bootTable({ wrap: "platform", child });

      await Effect.runPromise(w.complete("B"));
      const invoked = Effect.runFork(handle.invoke("app/slowChild", []));

      await Effect.runPromise(Deferred.await(child.forked));
      await Effect.runPromise(w.started("A"));
      w.events.push("scope closing");
      await Effect.runPromise(Fiber.join(closeScope()));

      expect(show(await Effect.runPromise(Fiber.await(invoked)))).toBe("interrupted");
      await Effect.runPromise(Deferred.succeed(child.gate, undefined));
      await yields(500);

      if (kind === "fork") {
        strictlyIn(w, "command exit: interrupted", "child (fork) interrupted", "registry released", "resource released");
        expect(w.events).not.toContain("child (fork) resumed");
      } else {
        strictlyIn(w, "command exit: interrupted", "registry released", "resource released", "scope closed", "child (daemon) resumed", "resource used after release B");
        expect(w.events).toContain('child: lookup B: failed (typed) {"_tag":"LookupError","id":"B"}');
        expect(w.events).not.toContain("child (daemon) interrupted");
      }
    });
  }

  it("probe E: a registry owned by the caller's Scope drains BEFORE NEXUS terminates, but admission is still open during the drain, so a snapshot drain misses a late command", async () => {
    const region = { entered: await Effect.runPromise(Deferred.make<void>()), gate: await Effect.runPromise(Deferred.make<void>()) };
    const { w, m, handle, closeScope, poll, yields, valanceReached } = await bootTable({ wrap: "valance", region });
    const held = Effect.runFork(handle.invoke("app/slowRegion", []));

    await Effect.runPromise(Deferred.await(region.entered));
    w.events.push("scope closing");
    const closing = closeScope();

    await Effect.runPromise(valanceReached!);
    await yields(1000);

    // VALANCE's drain is in progress and blocked; NEXUS has not begun to terminate: nothing is released ...
    expect(await poll(closing)).toBe(false);
    expect(w.events).not.toContain("resource released");
    // ... and admission is OPEN: a new invocation is accepted (NEXUS refuses only once ITS termination begins) ...
    expect(show(await Effect.runPromise(Effect.exit(handle.invoke("app/home", []))))).toBe("succeeded");
    // ... so a command admitted now registers AFTER the drain began, and the drain does not know it.
    const late = Effect.runFork(handle.invoke("app/slowOpen", [{ value: "L" }]));

    await Effect.runPromise(w.started("L"));
    expect(w.events).toContain("valance registry: command registered (2) AFTER the drain began");

    await Effect.runPromise(Deferred.succeed(region.gate, undefined));
    await Effect.runPromise(Fiber.join(closing));
    await Effect.runPromise(Fiber.await(held));

    // The order that actually results: VALANCE drain, then NEXUS termination and platform release, then the Scope closes.
    strictlyIn(w, "scope closing", "valance registry finalizer started", "valance registry drained", "resource released", "scope closed");
    // After the Scope closes admission IS refused ...
    expect(show(await Effect.runPromise(Effect.exit(handle.invoke("app/home", []))))).toBe("died: NEXUS: the runtime has begun terminating");
    // ... but the late command was never interrupted: it escaped, and reaches the released resource.
    await Effect.runPromise(w.complete("L"));
    expect(show(await Effect.runPromise(Fiber.await(late)))).toBe('failed (typed) {"_tag":"LookupError","id":"L"}');
    strictlyIn(w, "scope closed", "resource used after release L");
    expect(m.operations).toEqual(["draw"]);
  });

  it("probe E2: during the VALANCE-level drain a command that needs a NEW invocation to finish CAN get it: the Stage 23/25 circular wait does not arise here", async () => {
    const region = { entered: await Effect.runPromise(Deferred.make<void>()), gate: await Effect.runPromise(Deferred.make<void>()) };
    const { w, handle, closeScope, poll, yields, valanceReached } = await bootTable({ wrap: "valance", region });
    const held = Effect.runFork(handle.invoke("app/slowRegion", []));

    await Effect.runPromise(Deferred.await(region.entered));
    w.events.push("scope closing");
    const closing = closeScope();

    await Effect.runPromise(valanceReached!);
    await yields(500);
    expect(await poll(closing)).toBe(false);                                        // blocked on the uninterruptible command

    // The only way to open its gate is a new invocation: here it is ACCEPTED, because NEXUS has not begun to terminate.
    expect(show(await Effect.runPromise(Effect.exit(handle.invoke("app/openRegion", []))))).toBe("succeeded");
    await Effect.runPromise(Fiber.join(closing));                                   // no external cleanup: the drain completes by itself
    await Effect.runPromise(Fiber.await(held));

    strictlyIn(w, "valance registry finalizer started", "command: left its region", "command exit: interrupted", "valance registry drained", "resource released", "scope closed");
  });
});
