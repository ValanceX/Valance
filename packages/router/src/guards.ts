import { Effect } from "effect";

import type { Route } from "./route.js";
import type { Guard, GuardContext, GuardResult, Redirect } from "./types.js";

/** Sends a navigation to another route: `redirect(login, {}, { next: "/inbox" })`. The target is a route, never an address, so a redirect cannot leave the application. */
export const redirect = <P, Q>(to: Route<P, Q, any, any> | string, params: Readonly<Record<string, unknown>> = {}, query: Readonly<Record<string, unknown>> = {}): Redirect => ({
  _tag: "Redirect",
  name: typeof to === "string" ? to : to.name,
  params,
  query,
});

const isRedirect = (value: unknown): value is Redirect => typeof value === "object" && value !== null && (value as { _tag?: unknown })._tag === "Redirect";

/** Runs a guard whatever it returns, and says what it answered. A guard that throws, rejects or fails refuses. */
export const runGuard = <S>(guard: Guard<S>, context: GuardContext<S>): Effect.Effect<GuardResult> =>
  Effect.suspend(() => {
    const answer = guard(context);

    return Effect.isEffect(answer) ? (answer as Effect.Effect<GuardResult, unknown>) : Effect.tryPromise(async () => answer as GuardResult | Promise<GuardResult>);
  }).pipe(
    Effect.map((answer): GuardResult => (isRedirect(answer) ? answer : answer === true)),
    Effect.catchAllCause((cause) => Effect.logError("route guard failed", cause).pipe(Effect.as(false as GuardResult))),
  );
