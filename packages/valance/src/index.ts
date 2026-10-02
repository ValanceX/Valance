/**
 * @valancex/valance: the application-composition boundary over NEXUS, MESH and PORT.
 *
 * It owns the composition that no substrate may own (NEXUS ARCHITECTURE §16, PORT CONTRACT "the composer"):
 *
 *   define(app)            data: program, state, scope, command bindings. No target, no platform.
 *   start(app, options)    starts the NEXUS application in the CALLER's Scope; supplies the platform;
 *                          creates the application's state and its MESH host.
 *   mount / hydrate        connects a PORT target to a started application: draws (or adopts server
 *                          server output for) the current render, follows later renders as updates, and
 *                          dispatches each reported event with the render that was drawn.
 *
 * Nothing here is target-specific. A target is whatever satisfies `Target`, which is PORT's
 * contract (draw / update / unmount, plus hydrate where a PORT has one) and nothing more.
 */
import type { BoundaryValue, RenderTree } from "@valancex/mesh-runtime";

import * as Nexus from "@valancex/nexus";
import { Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";

/** What a command binding may require: only what the NEXUS application runtime itself provides. */
export type Ambient = Nexus.Capability.EnvironmentShape | Nexus.Event.EventBusShape;

export interface ApplicationDefinition<S, E, R extends Ambient> {
  readonly name: string;
  /** MESH program: templates compiled at build time, and the manifest's text. */
  readonly program: Nexus.Mesh.Program;
  /** The application's one NEXUS state. `initial` is the default; `start` may be given another (hydration). */
  readonly state: { readonly schema: Schema.Schema<S>; readonly initial: S };
  /** State → the MESH root's scope values, shaped to the manifest. */
  readonly scope: (state: S) => Record<string, unknown>;
  /** Behavior: NEXUS commands over the state, bound to MESH command intents ("component/name"). */
  readonly commands: (state: Nexus.State.StateHandle<S>) => Readonly<Record<string, Nexus.Mesh.Binding<E, R>>>;
}

/** The definition, typed. An application is data: defining one starts nothing. */
export const define = <S, E, R extends Ambient>(definition: ApplicationDefinition<S, E, R>): ApplicationDefinition<S, E, R> => definition;

export type StartError = Nexus.Application.ApplicationInitError | Nexus.State.StateInitError;

export interface StartOptions<S> {
  /** Supplied to NEXUS `Application.start`, where platform services (capabilities, Clock, …) enter. */
  readonly platform?: Nexus.Application.Platform;
  /** Overrides the definition's initial state: the client's, from what the server embedded. */
  readonly state?: S;
}

export interface Running<S, E, R extends Ambient> {
  readonly nexus: Nexus.Application.RunningApplication<never>;
  readonly host: Nexus.Mesh.Host<E, R>;
  /** The current MESH render. */
  readonly render: Effect.Effect<Nexus.Mesh.Render, Nexus.Mesh.MeshDiagnostics>;
  /** The application's state, read only. */
  readonly state: Effect.Effect<S>;
}

/**
 * Starts the application. Its lifetime is the caller's `Scope`: closing it, or `Application.shutdown(running.nexus)`,
 * ends the application and its state. Valance keeps nothing that outlives that scope.
 */
export const start = <S, E, R extends Ambient>(app: ApplicationDefinition<S, E, R>, options: StartOptions<S> = {}): Effect.Effect<Running<S, E, R>, StartError, Scope.Scope> =>
  Effect.gen(function* () {
    const definition = Nexus.Application.define({ name: app.name, runtime: Layer.empty });
    const nexus = yield* Nexus.Application.start(definition, options.platform === undefined ? undefined : { platform: options.platform });
    const state = yield* Nexus.Application.createState(nexus, app.state.schema, options.state ?? app.state.initial);
    const host = Nexus.Mesh.host<E, R>({ program: app.program, scope: Nexus.Selector.define(state, app.scope), commands: app.commands(state) });

    return { nexus, host, render: host.render, state: state.get };
  });

/** Reports what the user did: PORT's handler identifier and payload. */
export type Report = (handler: string, payload?: BoundaryValue) => void;

/** PORT's contract as the composer uses it. `draw`/`update` carry program continuity, which only the composer knows. */
export interface Target {
  draw(tree: RenderTree): void;
  update(tree: RenderTree): void;
  unmount(): void;
}

/** A target whose PORT can take over server output (a PORT with a `hydrate`). `H` is PORT's own result. */
export interface HydratableTarget<H> extends Target {
  hydrate(tree: RenderTree): H;
}

/** Builds a target that reports to `report`. */
export type TargetFactory<T extends Target> = (report: Report) => T;

export type DispatchExit<E> = Exit.Exit<Nexus.Mesh.Dispatched, Nexus.Mesh.MeshDiagnostics | Nexus.Mesh.UnmappedCommand | E>;

export interface Mounted<E> {
  /** Every dispatch Valance made for a reported event, as it settled. */
  readonly dispatched: ReadonlyArray<DispatchExit<E>>;
  /** Succeeds once every dispatch made so far has settled. */
  readonly settled: Effect.Effect<void>;
  /** Completes when Valance stops following renders: Success when the application ended, a Failure when a render failed, Interrupted when the scope closed. */
  readonly followed: Effect.Effect<Exit.Exit<void, Nexus.Mesh.MeshDiagnostics>>;
}

const connect = <S, E, R extends Ambient, T extends Target, A>(
  running: Running<S, E, R>,
  create: TargetFactory<T>,
  first: (target: T, tree: RenderTree) => A
): Effect.Effect<Mounted<E> & { readonly first: A }, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    // The render whose tree is drawn: the only render an event may be dispatched with (NEXUS M1, M2).
    const drawn: { render: Nexus.Mesh.Render | undefined } = { render: undefined };
    const dispatched: Array<DispatchExit<E>> = [];
    const pending: Array<Fiber.RuntimeFiber<unknown, never>> = [];

    const target = create((handler, payload) => {
      const render = drawn.render;

      if (render === undefined) {
        throw new Error("the target reported an interaction before anything was drawn");
      }

      // Runs inside the application (its platform's FiberRefs apply), but nothing flows back (NEXUS I44).
      pending.push(Nexus.Runtime.runFork(running.nexus.runtime, Effect.exit(running.host.dispatch(render, handler, payload)).pipe(
        Effect.tap((exit) => Effect.sync(() => { dispatched.push(exit); }))
      )));
    });

    // NEXUS `renders` carries future commits only (State.changes drops the replayed current value), and
    // there is no atomic "current value and then changes". So the follower subscribes BEFORE the first render
    // is taken: commits that land while it is being taken are held, not lost (probe: tracer-web
    // test/lifecycle.test.ts "a commit during the first render"). Taking the first render after subscribing
    // means it already reflects everything committed before the hold began.
    const held: { latest: Nexus.Mesh.Render | undefined } = { latest: undefined };

    // Every later render of this host is the same program: update. The fiber is Valance's, not NEXUS's (O15): the scope owns it.
    const follower = yield* Stream.runForEach(running.host.renders, (later) => Effect.sync(() => {
      if (drawn.render === undefined) {
        held.latest = later;
      } else {
        target.update(later.tree);
        drawn.render = later;
      }
    })).pipe(Effect.forkIn(scope));

    // Draw or hydrate with the current render, retain it, then catch up with anything held. One synchronous step: no event can fall between.
    const render = yield* running.render;
    const result = first(target, render.tree);
    drawn.render = render;

    if (held.latest !== undefined) {
      target.update(held.latest.tree);
      drawn.render = held.latest;
    }

    // Scope finalizers run in reverse: this runs before the application ends.
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* Fiber.interrupt(follower);
      yield* Effect.sync(() => { target.unmount(); });
      yield* Effect.forEach(pending.splice(0), Fiber.interrupt, { discard: true });
    }));

    // Dispatches may start more dispatches' worth of work only through the target, so draining until empty terminates.
    const settled: Effect.Effect<void> = Effect.suspend(() => pending.length === 0
      ? Effect.void
      : Effect.forEach(pending.splice(0), Fiber.await, { discard: true }).pipe(Effect.andThen(settled)));

    return {
      first: result,
      dispatched,
      settled,
      followed: Fiber.await(follower),
    };
  });

/** Draws the application's current render on a target, and keeps it current. Ends with the caller's Scope. */
export const mount = <S, E, R extends Ambient>(running: Running<S, E, R>, create: TargetFactory<Target>): Effect.Effect<Mounted<E>, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.map(connect(running, create, (target, tree) => { target.draw(tree); }), ({ first: _, ...mounted }) => mounted);

/**
 * Takes over server output with the client's own render (never the server's), then keeps it current.
 * What adoption or mismatch means is PORT's: `hydration` is its result, unchanged.
 */
export const hydrate = <S, E, R extends Ambient, H>(running: Running<S, E, R>, create: TargetFactory<HydratableTarget<H>>): Effect.Effect<Mounted<E> & { readonly hydration: H }, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.map(connect(running, create, (target, tree) => target.hydrate(tree)), ({ first, ...mounted }) => ({ ...mounted, hydration: first }));
