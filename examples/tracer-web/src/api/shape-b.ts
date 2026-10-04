// API tracer, candidate B (candidate A became the real API in Stage 17; this stays as the platform-owned alternative): the platform owns the run operation. The application author supplies the definition and
// platform options; no handle is returned, and application code never sees `Running`.
//
//   author   : the application definition (../catalog/app.ts), no platform
//   platform : run(app, { container, primitives, platform?, state?, hydrate?, history? })
//   lifetime : the caller's Scope (the one thing `run` needs from outside)
//
// (Stage 44: this is the repository's web host, and it consumes the public `Mounted` result: see `followed` below.)
// What had to be invented: nothing structural: `run` is today's `start` + `mount | hydrate` + `history`, in that order,
// in one function. It still creates, holds and passes a `Running`; the handle is hidden, not removed. Decisions that were
// the caller's sequencing in A become options or stay the caller's: `hydrate` is an explicit flag (detecting server HTML
// would be new behavior), and the application's canonicalization (what the URL means, before start) is computed by the
// caller and passed as `state` (a hook would be new API).
import type { Ambient, StartError } from "@valancex/valance";
import type { Application, Mesh } from "@valancex/nexus";
import type { WebPrimitives } from "@valancex/valance/web";

import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Scope } from "effect";

/**
 * The host's one duty toward a mount (Stage 44/45), as policy: when the mount stops following (the application ended, a render failed), say so once, then
 * what the mount's events had done. A normal end (the Scope closing) is `Interrupted` and silent. It reads only what the core already gives
 * (`followed`, `settled`, `dispatched`), at the one moment the host has; it decides nothing about a failed event command beyond reporting it.
 */
export const reportMountEnd = (mounted: Valance.Mounted<unknown>): Effect.Effect<void> => {
  const report = (exit: Exit.Exit<void, unknown>) => Effect.gen(function* () {
    if (Exit.isSuccess(exit)) {
      yield* Effect.logWarning("the application ended; the page is inert");
    } else if (Cause.isInterruptedOnly(exit.cause)) {
      return;
    } else {
      yield* Effect.logError("the page stopped following the application", Cause.pretty(exit.cause));
    }

    yield* mounted.settled;
    const outcomes = mounted.dispatched;
    const failed = outcomes.filter((outcome) => Exit.isFailure(outcome) && !Cause.isInterruptedOnly(outcome.cause));

    yield* Effect.logInfo(`event commands in this mount: ${outcomes.filter(Exit.isSuccess).length} succeeded, ${failed.length} failed, ${outcomes.length - outcomes.filter(Exit.isSuccess).length - failed.length} interrupted`);

    for (const outcome of failed) {
      yield* Effect.logError("event command failed", Exit.isFailure(outcome) ? Cause.pretty(outcome.cause) : "");
    }
  });

  return Effect.flatMap(mounted.followed, report);
};

/** The same report, for a page that runs through `Web.run`: it starts watching the mount and returns. */
export const watchMount = (mounted: Valance.Mounted<unknown>): void => { Effect.runFork(reportMountEnd(mounted)); };

/** What the page says when the application could not start (Stage 47): the existing failure itself (typed, or a defect), once. */
export const reportStartFailure = (error: unknown): void => {
  Effect.runSync(Effect.logError("the page could not start", error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error)));
};

export interface RunOptions<S> {
  readonly container: Element;
  readonly primitives: WebPrimitives;
  readonly platform?: Application.Platform;
  /** The state the application starts in: the default, or what the server embedded, or what the URL meant. */
  readonly state?: S;
  /** Adopt server HTML in the container instead of drawing. */
  readonly hydrate?: boolean;
  /** Keep the browser's history in step with the application. The application's own functions; the platform's writes. */
  readonly history?: Web.HistoryOptions<S>;
}

export const run = <S, E, R extends Ambient, V extends string>(app: Valance.ApplicationDefinition<S, E, R, V>, options: RunOptions<S>): Effect.Effect<void, StartError | Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.gen(function* () {
    const running = yield* Valance.start(app, { ...(options.platform === undefined ? {} : { platform: options.platform }), ...(options.state === undefined ? {} : { state: options.state }) });
    const target = Web.target({ container: options.container, primitives: options.primitives });

    const mounted = yield* options.hydrate === true ? Valance.hydrate(running, target) : Valance.mount(running, target);

    // The host's one duty toward the mount (Stage 44): the page can stop following the application (a render fails after the first draw, or the
    // application ends under an open mount) and nothing else says so. `Mounted.followed` is the only public observation of that; the host reports it,
    // the way `catalog/host.ts` reports a failed entry. A normal end (the Scope closing) is `Interrupted` and silent. The mount stays the Scope's.
    // Stage 45: when the page went inert abnormally, the operator also needs what the page's events had done: the host waits for the dispatches the still-open
    // mount holds (`settled`), then reads what they produced (`dispatched`) and reports the failed ones. No polling and no notification: it runs once, at the one
    // moment the host has (the mount's abnormal end).
    yield* Effect.forkIn(reportMountEnd(mounted), yield* Effect.scope);

    if (options.history !== undefined) {
      yield* Web.history(running, options.history);
    }
  });
