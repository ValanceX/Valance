/**
 * The Web target for Valance: the only module that names `@valancex/port-web`.
 * It adds nothing to PORT: it fixes `container` and `primitives` (the application's Web realization
 * table, which is target configuration, not part of the application) and hands PORT the report callback.
 */
import type { HydrationResult, WebPort, WebPortOptions, WebPrimitives } from "@valancex/port-web";
import type { BoundaryValue } from "@valancex/mesh-runtime";
import type { Ambient, ApplicationDefinition, ApplicationHandle, Mounted, StartOptions, TargetFactory } from "./index.js";

import { createWebPort } from "@valancex/port-web";
import { hydrate, mount, start } from "./index.js";
import { runningOf } from "./internal.js";
import { Cause, Effect, Exit, Fiber, Option, Queue, Scope, Stream } from "effect";

export type { HydrationResult, WebPrimitives } from "@valancex/port-web";
export { attribute, booleanAttribute, property, textProperty } from "@valancex/port-web";

export const target = (options: Omit<WebPortOptions, "report">): TargetFactory<WebPort> => (report) => createWebPort({ ...options, report });

export interface HistoryOptions<S> {
  /** The window whose URL and history are kept in step with the application (the container's own: `container.ownerDocument.defaultView`). */
  readonly window: Window;
  /** The URL (path and query) the application is shown at for `state`. What a URL means is the application's. */
  readonly urlOf: (state: S) => string;
  /** What a URL says about the application: the one argument of the navigate binding. The application's, too. */
  readonly stateOf: (url: URL) => BoundaryValue;
  /** The binding key of the application's navigate command, the same entry a MESH intent uses. */
  readonly navigate: string;
}

/**
 * Keeps `location` and the application in step, in both directions, until the caller's Scope closes.
 *
 *   start         the first state's `urlOf` is the baseline; nothing is written.
 *   later state   `urlOf(state)` differs from the last synchronized `urlOf` → `history.pushState`, which becomes the baseline.
 *   popstate      `running.invoke(navigate, [stateOf(location)])`, then the resulting state's `urlOf` becomes the baseline. Never a write.
 *
 * The question it answers is "did the application's URL change?", never "does the browser's URL equal the
 * application's?": a page sitting at a noncanonical URL (a history entry the application did not write) is left
 * alone, and an unrelated state change is not a navigation. Canonicalizing the URL is the application's, before start.
 *
 * A defect in the application's `urlOf` or `stateOf` is logged and ends only that synchronization step, never the follower.
 *
 * A popstate whose navigation fails, or leaves the state unchanged, is not repaired: nothing is written, the browser
 * stays at the URL history gave it, the baseline is the (unchanged) state's own URL, and the failure is only logged.
 * Browser URL and application URL then differ until the next application navigation; restoring one is the application's.
 *
 * Popstate is handled by the same fiber that watches state, in order, so the commit a popstate causes is seen after
 * the baseline has been updated for it, not as a new navigation. It reads and writes the URL and knows nothing of
 * what a URL means. PORT Web has no history API (it touches nothing outside its container), so this is Valance's.
 */
export const history = <S, E>(application: ApplicationHandle<S, E>, options: HistoryOptions<S>): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const running = runningOf(application);
    const scope = yield* Effect.scope;
    const { window: win } = options;
    const popped = yield* Queue.unbounded<string>();
    // The application URL of the last state this mechanism has accounted for. Unset until the first state: the baseline.
    let last: string | undefined;

    const follower = yield* Stream.runForEach(
      Stream.merge(
        Stream.map(running.states, (state) => ({ _tag: "state" as const, state })),
        Stream.map(Stream.fromQueue(popped), (href) => ({ _tag: "popstate" as const, href }))
      ),
      (event) => (event._tag === "state"
        ? Effect.sync(() => {
          const url = options.urlOf(event.state);

          if (last === undefined) {
            last = url;
          } else if (url !== last) {
            last = url;
            win.history.pushState(null, "", url);
          }
        })
        : Effect.gen(function* () {
          // Through the application's own entry: it runs in the application, and a failure or defect is logged, never the follower's.
          yield* running.invoke(options.navigate, [{ value: options.stateOf(new URL(event.href)) }]).pipe(
            Effect.catchAllCause((cause) => Effect.logError("popstate navigation failed", cause))
          );
          // The state the popstate produced is the new baseline, whatever URL history happens to hold for it.
          last = options.urlOf(yield* running.state);
        })
      ).pipe(
        // `urlOf` and `stateOf` are the application's: a defect in either is a failed synchronization, logged like a failed popstate navigation.
        // It never ends the follower, which would silently stop every later URL write; the baseline stays where it was.
        Effect.catchAllCause((cause) => Effect.logError("history synchronization failed", cause))
      )
    ).pipe(Effect.forkIn(scope));

    const onPopState = (): void => { Queue.unsafeOffer(popped, win.location.href); };

    win.addEventListener("popstate", onPopState);

    // Reverse order of the scope: before the application ends.
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* Effect.sync(() => { win.removeEventListener("popstate", onPopState); });
      yield* Fiber.interrupt(follower);
    }));
  });

export interface RunOptions<S> extends StartOptions<S> {
  /** The element the application is presented in. */
  readonly container: Element;
  /** The application's Web realization table (the same one the server rendered with, when it did). */
  readonly primitives: WebPrimitives;
  /**
   * Explicit, and never inferred from what the container holds. `"mount"` creates the presentation: whatever the container held is replaced.
   * `"hydrate"` adopts server-rendered markup in the container with the client's own render, and reports whether it did in `Host.mounted.hydration`.
   */
  readonly present: "mount" | "hydrate";
  /** The application's own URL policy, handed to `history` unread. Absent: the URL is not kept in step. */
  readonly history?: HistoryOptions<S>;
}

/** One application running on one page: the core's handle, the presentation, and the one operation the host adds. */
export interface Host<S, E> {
  /** The application's handle, unchanged: the same one `start` returns, for whatever else wants to enter or read the application. */
  readonly handle: ApplicationHandle<S, E>;
  /** The presentation, unchanged: what `mount` or `hydrate` returned (`hydration` is present when the host hydrated). */
  readonly mounted: Mounted<E> & { readonly hydration?: HydrationResult };
  /**
   * Ends the page's composition: the URL synchronization, then the presentation, then the application (its admitted commands are interrupted and
   * awaited, then its resources are released), exactly the order of one Scope holding all three. Calling it again returns the same completion.
   */
  readonly stop: () => Promise<void>;
}

/**
 * Runs one ordinary application on one page: `start`, then `mount` or `hydrate` as `present` says, then `history` if the application has a URL
 * policy, all in ONE lifetime that `stop` closes. It is the caller of the core and nothing more: it decides no state, command, URL, navigation or
 * failure, never looks at the container to choose how to present, and writes nothing to the page, the log or the application's state.
 *
 * A start or first-presentation failure rejects with the existing failure itself (the typed `StartError` or `MeshDiagnostics`; a defect as the
 * defect), after the lifetime it began has been closed. Everything after startup is observed through what the core already gives: `handle`,
 * `mounted.followed` (how the presentation ended), `mounted.settled` and `mounted.dispatched`.
 *
 * It is a convenience for the ordinary page. Several mounts, independent lifetimes, a custom target and headless use are the core's own: `start`,
 * `mount`, `hydrate` and `history`, composed by the caller.
 */
export const run = async <S, E, R extends Ambient, V extends string>(app: ApplicationDefinition<S, E, R, V>, options: RunOptions<S>): Promise<Host<S, E>> => {
  const scope = await Effect.runPromise(Scope.make());
  const startup = Effect.gen(function* () {
    const handle = yield* start(app, options);
    const web = target({ container: options.container, primitives: options.primitives });
    const mounted: Host<S, E>["mounted"] = options.present === "hydrate" ? yield* hydrate(handle, web) : yield* mount(handle, web);

    if (options.history !== undefined) {
      yield* history(handle, options.history);
    }

    return { handle, mounted };
  });
  const exit = await Effect.runPromiseExit(Scope.extend(startup, scope));

  if (Exit.isFailure(exit)) {
    // What `start` and the presentation had already acquired belongs to this lifetime: release it, then report the startup failure itself (a failure
    // to release is a second, later fact, and does not replace it).
    await Effect.runPromiseExit(Scope.close(scope, exit));

    throw Option.getOrElse(Cause.failureOption(exit.cause), () => Cause.squash(exit.cause));
  }

  let stopping: Promise<void> | undefined;

  return { ...exit.value, stop: () => stopping ??= Effect.runPromise(Scope.close(scope, Exit.void)) };
};
