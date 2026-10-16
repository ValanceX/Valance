import * as Nexus from "@valancex/nexus";
import { Effect } from "effect";

import type { Ambient, Outcome, Waiting } from "./index.js";

/**
 * The run of a command that waits (`command.waiting`), for a framework that starts one itself, such as a route's `load`: `begin`, the work, then the commit if this is still the newest run counted in
 * `serial` and the result is `wanted`. Returns the Effect for one input; share `serial` among the runs that supersede one another.
 */
export const waitingRun =
  <S, I, A, R extends Ambient = never>(state: Nexus.State.StateHandle<S>, spec: Waiting<S, I, A, R>, serial: { latest: number }) =>
  (decoded: I): Effect.Effect<void, never, R> =>
    Effect.gen(function* () {
      const mine = ++serial.latest;

      if (spec.begin !== undefined) {
        yield* state.update((current) => Effect.sync(() => spec.begin!(decoded, current)));
      }

      // A Promise's rejection is `unknown` and is passed to `settle` exactly as received. Interruption (the application closing, or the caller's) is not a failure: it ends the
      // run here, aborts `signal`, and `settle` never runs.
      // The work is a Promise or an Effect. A Promise is awaited here, with the signal; an Effect is only taken here and run after, so it is interrupted as any Effect is and may use the
      // application's capabilities. Whichever it is, a throw from `work` itself is a failure outcome.
      const started = yield* Effect.tryPromise({
        try: async (signal) => {
          const produced = spec.work(decoded, signal);

          return Effect.isEffect(produced) ? { effect: produced as Effect.Effect<A, unknown, R> } : { value: await produced };
        },
        catch: (error) => error,
      }).pipe(Effect.catchAll((error) => Effect.succeed({ failed: error })));
      const outcome: Outcome<A> =
        "failed" in started
          ? { ok: false, error: started.failed }
          : "value" in started
            ? { ok: true, value: started.value }
            : yield* started.effect.pipe(
                Effect.map((value): Outcome<A> => ({ ok: true, value })),
                Effect.catchAll((error) => Effect.succeed<Outcome<A>>({ ok: false, error })),
              );

      // Both questions are asked in the same atomic step as the commit: is this still the newest run of this command, and is the result still wanted by the state as it is now.
      yield* state.update((current) => Effect.sync(() => (mine === serial.latest && spec.wanted(decoded, current) ? spec.settle(outcome, decoded, current) : current)));
    }).pipe(Effect.asVoid);
