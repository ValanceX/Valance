// Stage 20: the Stage 19 capability, made asynchronous. Same ownership, same platform mechanism, same command boundary, same
// render path; the capability's operation is now an Effect that can suspend, be completed by the test, and be interrupted.
// No timing: the test waits on signals the controllable implementation raises, and completes operations by hand.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Chunk, Deferred, Effect, Exit, Fiber, Layer, Option, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { CatalogAsync, type CatalogEntry, type LookupError } from "../src/catalog/async-service.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { applicationWithAsyncCatalog } from "../src/catalog/with-async-service.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const start = { view: "home" as const, items: [{ id: "A0", name: "Alpha" }] };

/**
 * The external platform: a controllable asynchronous implementation backed by a scoped resource. `lookup(id)` raises
 * "started", then waits on a gate the test opens with `complete(id)`; an interruption of that wait is recorded. Every
 * step is recorded in order in `events`, with the resource's acquisition and release.
 */
const controllable = (options: { readonly useAfterRelease?: "fail" | "die" } = {}) => {
  const events: Array<string> = [];
  let closed = false;                                                              // set only by the resource's own finalizer
  const gates = new Map<string, { readonly gate: Deferred.Deferred<CatalogEntry, LookupError>; readonly started: Deferred.Deferred<void> }>();
  const gateOf = (id: string) => {
    let entry = gates.get(id);

    if (entry === undefined) {
      entry = { gate: Effect.runSync(Deferred.make<CatalogEntry, LookupError>()), started: Effect.runSync(Deferred.make<void>()) };
      gates.set(id, entry);
    }

    return entry;
  };
  const service: CatalogAsync = {
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
  const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.acquireRelease(Effect.sync(() => { events.push("resource acquired"); return service; }), () => Effect.sync(() => { events.push("resource released"); closed = true; })),
    (implementation) => ({ resolutions: new Map([[CatalogAsync.id, { _tag: "Available" as const, implementation }]]) })
  ));

  return {
    events,
    platform,
    started: (id: string) => Deferred.await(gateOf(id).started),
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
