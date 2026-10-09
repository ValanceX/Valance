/**
 * The composition protocol between Valance's core and the code that binds an application to something outside it
 * (a PORT target, browser history, a server render, a test). It is NOT the application's face: the public handle
 * (`ApplicationHandle`, from the package entry) carries only `state` and `invoke`, and does not reach this.
 *
 * `Running` is what `start` builds. A handle is registered against the `Running` it fronts in a module-private map,
 * so nothing reachable from a handle leads here; only code that imports this module (the package's own bindings and,
 * through the `./internal` entry, binding authors and tests) can resolve one. Unstable by design.
 */
import type * as Nexus from "@valancex/nexus";
import type { Effect, Exit, Stream } from "effect";
import { ValanceError } from "./errors.js";
import type { ApplicationHandle } from "./index.js";

/**
 * How one event dispatch ended, as `Mounted.dispatched` records it: what MESH dispatched, or why it did not (a MESH diagnostic, an unmapped
 * command, the command's own typed failure, a defect, interruption). A diagnostic type: it is not nameable from the package entry, which commits to
 * no consumer of it (Stage 42); readers of `dispatched` use its structure.
 */
export type DispatchExit<E> = Exit.Exit<Nexus.Mesh.Dispatched, Nexus.Mesh.MeshDiagnostics | Nexus.Mesh.UnmappedCommand | E>;

/** A MESH render, and which view's program made it. Program continuity is "same view as the drawn one". */
export interface Viewed {
  readonly view: string;
  readonly render: Nexus.Mesh.Render;
}

export interface Running<S, E> {
  /** The NEXUS application. Read only to observe the substrate (a test); never needed to deliver an event. */
  readonly nexus: Nexus.Application.RunningApplication<never>;
  /** The render of the current state, in the view the current state selects. */
  readonly render: Effect.Effect<Viewed, Nexus.Mesh.MeshDiagnostics>;
  /** The render of the state current at subscription, then of the latest state each time the state changes: superseded intermediates may be skipped, order is kept, the last render is the last committed state, and a state already rendered is not rendered twice. */
  readonly values: Stream.Stream<Viewed, Nexus.Mesh.MeshDiagnostics>;
  /**
   * Dispatches an event against exactly the render it was reported on, through its own view's command table. It runs
   * in the application, whoever calls it: the caller needs no runtime.
   */
  readonly dispatch: (viewed: Viewed, handler: string, payload?: Parameters<Nexus.Mesh.Host<never, never>["dispatch"]>[2]) => Effect.Effect<Nexus.Mesh.Dispatched, Nexus.Mesh.MeshDiagnostics | Nexus.Mesh.UnmappedCommand | E>;
  /** The application's state, read only. */
  readonly state: Effect.Effect<S>;
  /** The state current at subscription, then every later commit, with no gap (NEXUS `State.values`). Read only. */
  readonly states: Stream.Stream<S>;
  /** Runs the command bound to `key`, in the application's own context (see `ApplicationHandle.invoke`). */
  readonly invoke: (key: string, args: ReadonlyArray<Nexus.Mesh.IntentArgument>) => Effect.Effect<unknown, Nexus.Mesh.UnmappedCommand | E>;
}

const registry = new WeakMap<object, Running<never, never>>();

/** The public face of a `Running`: its `state` and `invoke`, and nothing else. Registered, so bindings can resolve it. */
export const handleOf = <S, E>(running: Running<S, E>): ApplicationHandle<S, E> => {
  const handle: ApplicationHandle<S, E> = Object.freeze({ state: running.state, invoke: running.invoke });

  registry.set(handle, running as unknown as Running<never, never>);

  return handle;
};

/** The `Running` a handle fronts. For bindings (and tests): an application's caller never needs it. */
export const runningOf = <S, E>(handle: ApplicationHandle<S, E>): Running<S, E> => {
  const running = registry.get(handle);

  if (running === undefined) {
    throw new ValanceError("not-an-application", "not an application handle that Valance started");
  }

  return running as unknown as Running<S, E>;
};

/** The registry key under which a bare command receives its input WHOLE (the navigation fact history reads from a URL). Reserved for history's `navigate`; not a key a MESH program declares or a caller needs. */
export const INPUT_KEY = (name: string): string => `navigation/${name}`;
