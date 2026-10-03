/**
 * The Web target for Valance: the only module that names `@valancex/port-web`.
 * It adds nothing to PORT: it fixes `container` and `primitives` (the application's Web realization
 * table, which is target configuration, not part of the application) and hands PORT the report callback.
 */
import type { WebPort, WebPortOptions } from "@valancex/port-web";
import type { BoundaryValue } from "@valancex/mesh-runtime";
import type { ApplicationHandle, TargetFactory } from "./index.js";

import { createWebPort } from "@valancex/port-web";
import { runningOf } from "./internal.js";
import { Effect, Fiber, Queue, Scope, Stream } from "effect";

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
      (event) => event._tag === "state"
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
    ).pipe(Effect.forkIn(scope));

    const onPopState = (): void => { Queue.unsafeOffer(popped, win.location.href); };

    win.addEventListener("popstate", onPopState);

    // Reverse order of the scope: before the application ends.
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* Effect.sync(() => { win.removeEventListener("popstate", onPopState); });
      yield* Fiber.interrupt(follower);
    }));
  });
