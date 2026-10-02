// API tracer, candidate B (candidate A became the real API in Stage 17; this stays as the platform-owned alternative): the platform owns the run operation. The application author supplies the definition and
// platform options; no handle is returned, and application code never sees `Running`.
//
//   author   : the application definition (../catalog/app.ts), no platform
//   platform : run(app, { container, primitives, platform?, state?, hydrate?, history? })
//   lifetime : the caller's Scope (the one thing `run` needs from outside)
//
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
import { Effect, Scope } from "effect";

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

    yield* options.hydrate === true ? Valance.hydrate(running, target) : Valance.mount(running, target);

    if (options.history !== undefined) {
      yield* Web.history(running, options.history);
    }
  });
