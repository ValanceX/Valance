/**
 * The Web target for Valance: the only module that names `@valancex/port-web`.
 * It adds nothing to PORT: it fixes `container` and `primitives` (the application's Web realization
 * table, which is target configuration, not part of the application) and hands PORT the report callback.
 */
import type { WebPort, WebPortOptions } from "@valancex/port-web";
import type { BoundaryValue } from "@valancex/mesh-runtime";
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
 *   state commit → `urlOf(state)` differs from `location.pathname + location.search` → `history.pushState`
 *   popstate     → `running.invoke(navigate, [stateOf(location)])`: the application's own navigate command
 *
 * The first state is only a baseline: starting never writes. The page's URL is the application's to interpret and,
 * if it wants, canonicalize (with `replaceState`, before `start`); this assumes it then equals `urlOf(state)`. If it
 * does not, the first LATER commit of any kind pushes `urlOf(state)`: an entry no navigation asked for.
 *
 * It reads and writes the URL and knows nothing of what a URL means. There is no feedback flag: a `pushState`
 * makes the URL equal `urlOf(state)`, so the commit it follows is not pushed again; a `popstate` changes the state
 * through the command and the URL already equals what that state maps to. PORT Web has no history API (it touches
 * nothing outside its container), so this is Valance's, not PORT's.
 */
export const history = <S, E, R extends Ambient>(running: Running<S, E, R>, options: HistoryOptions<S>): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const { window: win } = options;
    const pending: Array<Fiber.RuntimeFiber<unknown, never>> = [];

    // The first state is the baseline, not a navigation: the URL the page was loaded at is the application's to
    // interpret (and, if it wants, canonicalize) before this starts. Only later commits are written.
    const follower = yield* Stream.runForEach(Stream.drop(running.states, 1), (state) => Effect.sync(() => {
      const url = options.urlOf(state);

      if (win.location.pathname + win.location.search !== url) {
        win.history.pushState(null, "", url);
      }
    })).pipe(Effect.forkIn(scope));

    const onPopState = (): void => {
      // The application's runtime, like a dispatch: its platform's FiberRefs apply, and nothing flows back (NEXUS I44).
      pending.push(Nexus.Runtime.runFork(running.nexus.runtime, running.invoke(options.navigate, [{ value: options.stateOf(new URL(win.location.href)) }]).pipe(
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
