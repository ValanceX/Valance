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
import { Deferred, Effect, Equal, Exit, Fiber, FiberId, Layer, Option, Schema, Scope, Stream } from "effect";

/** What a command binding may require: only what the NEXUS application runtime itself provides. */
export type Ambient = Nexus.Capability.EnvironmentShape | Nexus.Event.EventBusShape;

/** One MESH program the application can show, and the manifest-shaped values it is rendered from. */
export interface View<S> {
  /** MESH program: templates compiled at build time, and the manifest's text. */
  readonly program: Nexus.Mesh.Program;
  /** State → the program root's scope values, shaped to the manifest. */
  readonly scope: (state: S) => Record<string, unknown>;
}

export interface ApplicationDefinition<S, E, R extends Ambient, V extends string> {
  readonly name: string;
  /** The application's one NEXUS state. `initial` is the default; `start` may be given another (hydration). */
  readonly state: { readonly schema: Schema.Schema<S>; readonly initial: S };
  /** The MESH programs the application can show. The application's state outlives a change of program. */
  readonly views: { readonly [K in V]: View<S> };
  /** Which program the current state shows. A function of application state: what the active view is, is the application's. */
  readonly view: (state: S) => V;
  /** Behavior: NEXUS commands over the state, bound to MESH command intents ("component/name"), for every view. */
  readonly commands: (state: Nexus.State.StateHandle<S>) => Readonly<Record<string, Nexus.Mesh.Binding<E, R>>>;
}

/** The definition, typed. An application is data: defining one starts nothing. */
export const define = <S, E, R extends Ambient, V extends string>(definition: ApplicationDefinition<S, E, R, V>): ApplicationDefinition<S, E, R, V> => definition;

export type StartError = Nexus.Application.ApplicationInitError | Nexus.State.StateInitError;

/**
 * The dispatches an application has in flight. `Runtime.runFork` gives a root fiber that NEXUS termination does not
 * interrupt (NEXUS runtime.md: "Effects already running when termination begins are not interrupted by it"), so
 * whoever forks the work owns it. The application's own runtime layer (see `start`) ends them when the application
 * terminates, by either route. Private: `connect` is the only writer.
 */
interface Dispatch {
  /** The handle `Runtime.runFork` returned. */
  fiber?: Fiber.RuntimeFiber<unknown, never> | undefined;
  /** The fiber the dispatch actually runs in, once it has started: what a command that terminates the application runs in. */
  execution?: Fiber.RuntimeFiber<unknown, unknown> | undefined;
}

type InFlight = Set<Dispatch>;

/** Whether the current fiber was forked, directly or not, by `ancestor`. */
const within = (ancestor: Fiber.RuntimeFiber<unknown, unknown>, id: FiberId.FiberId): Effect.Effect<boolean> =>
  Effect.flatMap(Fiber.children(ancestor), (children) => Effect.exists(children, (child) => Equal.equals(child.id(), id) ? Effect.succeed(true) : within(child, id)));

const inFlightOf = new WeakMap<object, InFlight>();

export interface StartOptions<S> {
  /** Supplied to NEXUS `Application.start`, where platform services (capabilities, Clock, …) enter. */
  readonly platform?: Nexus.Application.Platform;
  /** Overrides the definition's initial state: the client's, from what the server embedded. */
  readonly state?: S;
}

/** A MESH render, and which view's program made it. Program continuity is "same view as the drawn one". */
export interface Viewed {
  readonly view: string;
  readonly render: Nexus.Mesh.Render;
}

export interface Running<S, E, R extends Ambient> {
  readonly nexus: Nexus.Application.RunningApplication<never>;
  /** The render of the current state, in the view the current state selects. */
  readonly render: Effect.Effect<Viewed, Nexus.Mesh.MeshDiagnostics>;
  /** The render of the state current at subscription, then one per later commit, in order, with no gap (NEXUS `State.values`). */
  readonly values: Stream.Stream<Viewed, Nexus.Mesh.MeshDiagnostics>;
  /** Dispatches an event against exactly the render it was reported on, through its own view's command table. */
  readonly dispatch: (viewed: Viewed, handler: string, payload?: BoundaryValue) => Effect.Effect<Nexus.Mesh.Dispatched, Nexus.Mesh.MeshDiagnostics | Nexus.Mesh.UnmappedCommand | E, R>;
  /** The application's state, read only. */
  readonly state: Effect.Effect<S>;
  /** The state current at subscription, then every later commit, with no gap (NEXUS `State.values`). Read only. */
  readonly states: Stream.Stream<S>;
  /**
   * Runs the command bound to `key` with the given arguments, exactly as a MESH intent for that key would:
   * through the same table `dispatch` uses, so there is one way into application behavior. For input that does
   * not come from a MESH render (a browser event). Run it in `nexus.runtime`.
   */
  readonly invoke: (key: string, args: ReadonlyArray<Nexus.Mesh.IntentArgument>) => Effect.Effect<unknown, Nexus.Mesh.UnmappedCommand | E, R>;
}

/**
 * Starts the application. Its lifetime is the caller's `Scope`: closing it, or `Application.shutdown(running.nexus)`,
 * ends the application and its state. Valance keeps nothing that outlives that scope.
 */
export const start = <S, E, R extends Ambient, V extends string>(app: ApplicationDefinition<S, E, R, V>, options: StartOptions<S> = {}): Effect.Effect<Running<S, E, R>, StartError, Scope.Scope> =>
  Effect.gen(function* () {
    const inFlight: InFlight = new Set();
    // Built in the application's own runtime scope, so this finalizer runs when the application terminates, whether by
    // `Application.shutdown` or by the caller's scope closing, after the runtime's State has ended and before the
    // platform's resources are released (layers are released in reverse order of construction), and before `Stopped`.
    // A dispatch that is itself performing the termination (a command that shuts its application down) cannot be
    // awaited from inside it: termination is uninterruptible, so it is signalled, and ends as it leaves it.
    const dispatches = Layer.scopedDiscard(Effect.addFinalizer(() => Effect.gen(function* () {
      const me = yield* Effect.fiberId;

      yield* Effect.forEach([...inFlight], (dispatch) => Effect.gen(function* () {
        if (dispatch.execution !== undefined && (yield* within(dispatch.execution, me))) {
          // Told now, not awaited: the interrupt takes effect as the dispatch leaves the termination, before it runs on.
          yield* Fiber.interruptAsFork(dispatch.execution, me);
        } else if (dispatch.fiber !== undefined) {
          yield* Fiber.interrupt(dispatch.fiber);
        }
      }), { discard: true });
    })));
    const definition = Nexus.Application.define({ name: app.name, runtime: dispatches });
    const nexus = yield* Nexus.Application.start(definition, options.platform === undefined ? undefined : { platform: options.platform });
    const state = yield* Nexus.Application.createState(nexus, app.state.schema, options.state ?? app.state.initial);
    const commands = app.commands(state);
    // One host per view, used to dispatch (render, handler) → intent → command. The one NEXUS state is shared by all of them.
    const hosts = new Map<string, Nexus.Mesh.Host<E, R>>(Object.entries<View<S>>(app.views).map(([name, view]) => [name, Nexus.Mesh.host<E, R>({ program: view.program, scope: Nexus.Selector.define(state, view.scope), commands })]));
    // The render of one given state. The adapter renders a host's scope value, not a value it is handed, and a
    // sequential stream must render each emitted state exactly: a constant scope does that.
    const renderOf = (value: S): Effect.Effect<Viewed, Nexus.Mesh.MeshDiagnostics> => {
      const view = app.view(value);
      const snapshot = app.views[view].scope(value);
      const scope = { value: Effect.succeed(snapshot), changes: Stream.empty, values: Stream.make(snapshot) };

      return Nexus.Mesh.host<never, never>({ program: app.views[view].program, scope, commands: {} }).render.pipe(Effect.map((render) => ({ view, render })));
    };

    const running: Running<S, E, R> = {
      nexus,
      render: Effect.flatMap(state.get, renderOf),
      values: Stream.mapEffect(state.values, renderOf),
      dispatch: (viewed, handler, payload) => {
        const host = hosts.get(viewed.view);

        return host === undefined ? Effect.die(new Error(`no view named ${viewed.view}`)) : host.dispatch(viewed.render, handler, payload);
      },
      state: state.get,
      states: state.values,
      invoke: (key, args) => {
        const binding = Object.hasOwn(commands, key) ? commands[key] : undefined;
        const [component = "", name = ""] = key.split("/");

        return binding === undefined ? Effect.fail<Nexus.Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component, name }) : binding(args);
      },
    };

    inFlightOf.set(running, inFlight);

    return running;
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
    const drawn: { current: Viewed | undefined } = { current: undefined };
    const dispatched: Array<DispatchExit<E>> = [];
    const pending: Array<Fiber.RuntimeFiber<unknown, never>> = [];
    const inFlight = inFlightOf.get(running);

    const target = create((handler, payload) => {
      const render = drawn.current;

      if (render === undefined) {
        throw new Error("the target reported an interaction before anything was drawn");
      }

      // Runs inside the application (its platform's FiberRefs apply), but nothing flows back (NEXUS I44).
      const dispatch: Dispatch = {};
      const fiber = Nexus.Runtime.runFork(running.nexus.runtime, Effect.sync(() => { dispatch.execution = Option.getOrUndefined(Fiber.getCurrentFiber()); }).pipe(
        Effect.andThen(Effect.exit(running.dispatch(render, handler, payload))),
        Effect.tap((exit) => Effect.sync(() => { dispatched.push(exit); }))
      ));

      pending.push(fiber);

      // The application owns it too (see `InFlight`): it ends with the application, not only with this caller's scope.
      if (inFlight !== undefined) {
        dispatch.fiber = fiber;
        inFlight.add(dispatch);
        fiber.addObserver(() => { inFlight.delete(dispatch); });
      }
    });

    // `running.values` is the render of the current state, then one per later commit, atomically (NEXUS 0.10): the
    // first element is the first draw (or hydration), no commit can fall between. A later render of the SAME view is
    // the same program: update. One of ANOTHER view is another program, and only the composer knows that: draw afresh.
    // The follower is Valance's fiber, not NEXUS's (O15): the caller's scope owns it.
    const firstDone = yield* Deferred.make<A, Nexus.Mesh.MeshDiagnostics>();
    const follower = yield* Stream.runForEach(running.values, (viewed) => Effect.suspend(() => {
      if (drawn.current !== undefined) {
        if (drawn.current.view === viewed.view) {
          target.update(viewed.render.tree);
        } else {
          target.draw(viewed.render.tree);
        }

        drawn.current = viewed;

        return Effect.void;
      }

      // Draw or hydrate, and retain the render, in one synchronous step: no event can be reported in between.
      const result = first(target, viewed.render.tree);
      drawn.current = viewed;

      return Deferred.succeed(firstDone, result);
    })).pipe(
      // Ending before the first render (a diagnostic, a failure of the target, an application that ended) is mount's failure.
      Effect.onExit((exit) => Exit.match(exit, {
        onFailure: (cause) => Deferred.failCause(firstDone, cause),
        onSuccess: () => Deferred.die(firstDone, new Error("the application ended before its first render")),
      })),
      Effect.forkIn(scope)
    );
    const result = yield* Deferred.await(firstDone);

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
