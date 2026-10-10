import * as Valance from "@valancex/valance";
import { Cause, Effect } from "effect";

// A command that races the application's shutdown is turned away with a refusal, which is not a bug.
export const quietly = <A, E>(work: Effect.Effect<A, E>) =>
  work.pipe(
    Effect.catchAllDefect((defect) => Valance.isRefusal(defect) ? Effect.void : Effect.failCause(Cause.die(defect))),
  );
