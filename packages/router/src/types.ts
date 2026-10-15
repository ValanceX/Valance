import type { Effect } from "effect";
import { Schema } from "effect";

/**
 * Where the application is: the route's name and its decoded parameters and query. Plain data (it lives in the application's state, and the server embeds it for the browser), so what a
 * route's Schemas decode to must be JSON: strings, numbers, booleans, null, arrays and records, never a Date or a class.
 */
export interface RouteState {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
  /** Set by programmatic navigation that asked to replace the current entry; read by the router's `modeOf`. Not part of the address. */
  readonly replace?: boolean;
}

export const RouteState: Schema.Schema<RouteState> = Schema.Struct({
  name: Schema.String,
  params: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  query: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  replace: Schema.optional(Schema.Boolean),
}) as unknown as Schema.Schema<RouteState>;

/**
 * Where a navigation came from. `popstate`: the browser moved through its history on its own. `history`: the application moves along a list it keeps itself (Back and Forward on a target that
 * has no browser). `close`: the window or page is going away.
 */
export type NavigationKind = "link" | "popstate" | "programmatic" | "history" | "initial" | "close";

/** What a guard is told. `state` is the application's state now, before the navigation. */
export interface GuardContext<S> {
  /** The route being left; `undefined` for the first navigation. */
  readonly from: RouteState | undefined;
  /** The route being entered. */
  readonly to: RouteState;
  readonly state: S;
  readonly kind: NavigationKind;
  /** The `data` of the route the guard belongs to. */
  readonly data: Readonly<Record<string, unknown>>;
}

/** Send the navigation to another route instead. Make one with `redirect`. */
export interface Redirect {
  readonly _tag: "Redirect";
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
}

/** `true` lets it through, `false` stops it, a `Redirect` sends it elsewhere. */
export type GuardResult = boolean | Redirect;

/** A guard may answer now, later (a Promise) or as an Effect that needs nothing. A throw or a failure counts as `false`. */
export type Guard<S> = (context: GuardContext<S>) => GuardResult | Promise<GuardResult> | Effect.Effect<GuardResult, unknown>;

/** What the router decided about one navigation. */
export type Decision =
  | { readonly _tag: "Allow"; readonly to: RouteState }
  | { readonly _tag: "Redirect"; readonly to: RouteState }
  | { readonly _tag: "Refuse"; readonly by: "canDeactivate" | "canActivate" | "beforeEach" | "redirects"; readonly route: string };

/** The data a route's title function sees. */
export interface TitleContext<P, Q> {
  readonly params: P;
  readonly query: Q;
  readonly data: Readonly<Record<string, unknown>>;
}
