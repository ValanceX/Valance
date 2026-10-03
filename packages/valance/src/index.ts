/**
 * @valancex/valance: the application-composition boundary over NEXUS, MESH and PORT.
 *
 * It owns the composition that no substrate may own (NEXUS ARCHITECTURE §16, PORT CONTRACT "the composer"):
 *
 *   define(app)            data: program, state, scope, command bindings. No target, no platform.
 *   start(app, options)    starts the NEXUS application in the CALLER's Scope; supplies the platform;
 *                          creates the application's state and its MESH host; returns the application's handle:
 *                          its `state` and `invoke`, and nothing of the composition (see ./internal).
 *   mount / hydrate        connects a PORT target to a started application: draws (or adopts server
 *                          server output for) the current render, follows later renders as updates, and
 *                          dispatches each reported event with the render that was drawn.
 *
 * Command lifetime: commands admitted through `invoke` or MESH dispatch are owned by the application until they exit; closing the
 * caller's Scope closes admission and drains them before NEXUS terminates and platform resources release (docs/FINDINGS.md, Stage 29).
 *
 * Nothing here is target-specific. A target is whatever satisfies `Target`, which is PORT's
 * contract (draw / update / unmount, plus hydrate where a PORT has one) and nothing more.
 */
import type { BoundaryValue, RenderTree } from "@valancex/mesh-runtime";

import * as Nexus from "@valancex/nexus";
import { handleOf, runningOf, type Running, type Viewed } from "./internal.js";
import { Deferred, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";

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

export interface StartOptions<S> {
  /** Supplied to NEXUS `Application.start`, where platform services (capabilities, Clock, …) enter. */
  readonly platform?: Nexus.Application.Platform;
  /** Overrides the definition's initial state: the client's, from what the server embedded. */
  readonly state?: S;
}

/**
 * The application's external face: what code outside its definition, and outside any MESH render, may do with it.
 * Whoever holds it (a host page, a custom producer, a headless host, one of Valance's own bindings) holds exactly this.
 *
 * It carries no runtime, no render, no dispatch, and no lifecycle: the application's lifetime is the `Scope` `start`
 * ran in, and nothing here ends it, restarts it, or reports on it.
 */
export interface ApplicationHandle<S, E> {
  /**
   * The application's current state: one read, as of when it runs. A read, not a subscription: the state a host sees
   * is the state commands have committed, whatever view is shown.
   */
  readonly state: Effect.Effect<S>;
  /**
   * Runs the command bound to `key` with the given arguments, exactly as a MESH intent for that key would:
   * through the same table, so there is one way into application behavior. For input that does not come from a MESH
   * render (a browser event, a host page, a headless caller).
   *
   * It executes in the application's own context, with the platform's FiberRefs, and nothing of that context flows
   * back to the caller (NEXUS I44). The caller needs no runtime and provides no services: interrupting the returned
   * effect interrupts the command, and typed failures and defects pass through unchanged.
   */
  readonly invoke: (key: string, args: ReadonlyArray<Nexus.Mesh.IntentArgument>) => Effect.Effect<unknown, Nexus.Mesh.UnmappedCommand | E>;
}

/**
 * Starts the application. Its lifetime is the caller's `Scope`: closing it ends the application and its state, and
 * Valance keeps nothing that outlives that scope. (NEXUS can also end an application early; that is the substrate's,
 * is outside this model, and nothing here asks for it. The command drain below belongs to the Scope close, so that route does not pass it.)
 */
export const start = <S, E, R extends Ambient, V extends string>(app: ApplicationDefinition<S, E, R, V>, options: StartOptions<S> = {}): Effect.Effect<ApplicationHandle<S, E>, StartError, Scope.Scope> =>
  Effect.gen(function* () {
    const definition = Nexus.Application.define({ name: app.name, runtime: Layer.empty });
    const nexus = yield* Nexus.Application.start(definition, options.platform === undefined ? undefined : { platform: options.platform });

    // Command lifetime: a command admitted through `inApplication` stays owned by the application until it exits. When the
    // application's Scope closes, VALANCE closes admission and interrupts and awaits every admitted command BEFORE NEXUS
    // terminates and the platform releases its resources. This finalizer is added right after `Application.start` registered
    // NEXUS's own; Scope finalizers run in reverse order, so it runs first. It owns commands only, not daemons or escaped fibers.
    const admitted = new Set<Fiber.RuntimeFiber<unknown, unknown>>();
    let admissionClosed = false;

    yield* Effect.addFinalizer(() => Effect.suspend(() => {
      admissionClosed = true;                                                  // closes synchronously, before anything below can run

      return Effect.forEach([...admitted], (command) => Fiber.interrupt(command), { discard: true });   // interrupts, and awaits each ACTUAL exit
    }));
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

    // The one place an event enters the application's execution: its own fiber, with its own FiberRefs (NEXUS
    // `runFork`: the handle holds none of them, so joining it imports nothing into the caller). The caller's
    // interruption interrupts the event; results, typed failures and defects pass through unchanged.
    // Admission: the command registers ITS OWN fiber as its first step. The admission check and the registration are one
    // synchronous step inside that fiber (no gap in which the drain's snapshot could be taken between them); a refusal is a
    // defect, by Effect's own means. The command leaves the registry on every exit.
    const admit = <A, F>(effect: Effect.Effect<A, F, R>): Effect.Effect<A, F, R> => Effect.acquireUseRelease(
      Effect.withFiberRuntime<void>((fiber) => Effect.sync(() => {
        if (admissionClosed) {
          throw new Error("VALANCE: admission is closed (draining)");
        }

        admitted.add(fiber as Fiber.RuntimeFiber<unknown, unknown>);
      })),
      () => effect,
      () => Effect.withFiberRuntime<void>((fiber) => Effect.sync(() => { admitted.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>); }))
    );
    const inApplication = <A, F>(effect: Effect.Effect<A, F, R>): Effect.Effect<A, F> => Effect.suspend(() => {
      const handle = Nexus.Runtime.runFork(nexus.runtime, admit(effect));

      return Fiber.join(handle).pipe(Effect.onInterrupt(() => Fiber.interrupt(handle)));
    });

    const running: Running<S, E> = {
      nexus,
      render: Effect.flatMap(state.get, renderOf),
      values: Stream.mapEffect(state.values, renderOf),
      dispatch: (viewed, handler, payload) => {
        const host = hosts.get(viewed.view);

        return host === undefined ? Effect.die(new Error(`no view named ${viewed.view}`)) : inApplication(host.dispatch(viewed.render, handler, payload));
      },
      state: state.get,
      states: state.values,
      invoke: (key, args) => {
        const binding = Object.hasOwn(commands, key) ? commands[key] : undefined;
        const [component = "", name = ""] = key.split("/");

        return binding === undefined ? Effect.fail<Nexus.Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component, name }) : inApplication(binding(args));
      },
    };

    return handleOf(running);
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

const connect = <S, E, T extends Target, A>(
  application: ApplicationHandle<S, E>,
  create: TargetFactory<T>,
  first: (target: T, tree: RenderTree) => A
): Effect.Effect<Mounted<E> & { readonly first: A }, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.gen(function* () {
    const running = runningOf(application);
    const scope = yield* Effect.scope;
    // The render whose tree is drawn: the only render an event may be dispatched with (NEXUS M1, M2).
    const drawn: { current: Viewed | undefined } = { current: undefined };
    const dispatched: Array<DispatchExit<E>> = [];
    const pending: Array<Fiber.RuntimeFiber<unknown, never>> = [];

    const target = create((handler, payload) => {
      const render = drawn.current;

      if (render === undefined) {
        throw new Error("the target reported an interaction before anything was drawn");
      }

      // `dispatch` runs inside the application (its platform's FiberRefs apply) and nothing flows back (NEXUS I44).
      pending.push(Effect.runFork(Effect.exit(running.dispatch(render, handler, payload)).pipe(
        Effect.tap((exit) => Effect.sync(() => { dispatched.push(exit); }))
      )));
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
export const mount = <S, E>(application: ApplicationHandle<S, E>, create: TargetFactory<Target>): Effect.Effect<Mounted<E>, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.map(connect(application, create, (target, tree) => { target.draw(tree); }), ({ first: _, ...mounted }) => mounted);

/**
 * Takes over server output with the client's own render (never the server's), then keeps it current.
 * What adoption or mismatch means is PORT's: `hydration` is its result, unchanged.
 */
export const hydrate = <S, E, H>(application: ApplicationHandle<S, E>, create: TargetFactory<HydratableTarget<H>>): Effect.Effect<Mounted<E> & { readonly hydration: H }, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.map(connect(application, create, (target, tree) => target.hydrate(tree)), ({ first, ...mounted }) => ({ ...mounted, hydration: first }));
