/**
 * The Web target for Valance: the only module that names `@valancex/port-web`.
 * It adds nothing to PORT: it fixes `container` and `primitives` (the application's Web realization
 * table, which is target configuration, not part of the application) and hands PORT the report callback.
 */
import type { WebPort, WebPortOptions } from "@valancex/port-web";
import type { Ambient, Running, TargetFactory } from "./index.js";

import * as Nexus from "@valancex/nexus";
import { createWebPort } from "@valancex/port-web";
import { Effect, Fiber, Scope, Stream } from "effect";

export type { HydrationResult, WebPrimitives } from "@valancex/port-web";
export { attribute, booleanAttribute, property, textProperty } from "@valancex/port-web";

export const target = (options: Omit<WebPortOptions, "report">): TargetFactory<WebPort> => (report) => createWebPort({ ...options, report });

export interface HistoryOptions<S> {
  /** The window whose URL and history are kept in step with the application (the container's own: `container.ownerDocument.defaultView`). */
  readonly window: Window;
  /** The application's path in `state`. It is compared with `location.pathname` exactly: no parsing, no matching. */
  readonly path: (state: S) => string;
  /** The binding key of the application's navigate command. It takes the path as its one argument, the same entry a MESH intent uses. */
  readonly navigate: string;
}

/**
 * Keeps `location` and the application's path in step, in both directions, until the caller's Scope closes.
 *
 *   state commit → `path(state)` differs from `location.pathname` → `history.pushState`
 *   popstate     → `running.invoke(navigate, [location.pathname])`: the application's own navigate command
 *
 * There is no feedback flag. A `pushState` makes the URL equal to the path, so the state commit it follows is
 * not pushed again; a `popstate` changes the path through the command and the URL already equals it.
 * PORT Web has no history API (it touches nothing outside its container), so this is Valance's, not PORT's.
 */
export const history = <S, E, R extends Ambient>(running: Running<S, E, R>, options: HistoryOptions<S>): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const { window: win } = options;
    const pending: Array<Fiber.RuntimeFiber<unknown, never>> = [];

    // Every state commit, starting with the current one, so a page that loads at its own URL is not pushed again.
    const follower = yield* Stream.runForEach(running.states, (state) => Effect.sync(() => {
      const path = options.path(state);

      if (win.location.pathname !== path) {
        win.history.pushState(null, "", path);
      }
    })).pipe(Effect.forkIn(scope));

    const onPopState = (): void => {
      // The application's runtime, like a dispatch: its platform's FiberRefs apply, and nothing flows back (NEXUS I44).
      pending.push(Nexus.Runtime.runFork(running.nexus.runtime, running.invoke(options.navigate, [{ value: win.location.pathname }]).pipe(
        Effect.tapErrorCause((cause) => Effect.logError("popstate navigation failed", cause)),
        Effect.ignore
      )));
    };

    win.addEventListener("popstate", onPopState);

    // Reverse order of the scope: before the application ends.
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* Effect.sync(() => { win.removeEventListener("popstate", onPopState); });
      yield* Fiber.interrupt(follower);
      yield* Effect.forEach(pending.splice(0), Fiber.interrupt, { discard: true });
    }));
  });
