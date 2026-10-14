import type { Schema } from "effect";

import { parsePattern } from "./pattern.js";
import type { Pattern } from "./pattern.js";
import type { Guard, Redirect, TitleContext } from "./types.js";

/** What a route is configured with. `S` is the application's state, `C` the matching context. */
export interface RouteConfig<P, Q, S, C> {
  /** The route's name: unique, and what state, redirects and `href` refer to. */
  readonly name: string;
  /** The path parameters. The encoded side is strings (what an address holds); the decoded side is what the application sees. A value that does not decode, or that decodes to something that is not JSON (a `NaN`, a Date), means the route does not match. */
  readonly params?: Schema.Schema<P, any>;
  /** The query parameters, the same way. A key that appears more than once arrives as an array of strings. A query that does not decode means the route does not match. */
  readonly query?: Schema.Schema<Q, any>;
  /** The document's title for this route: a string, or a function of its parameters. */
  readonly title?: string | ((context: TitleContext<P, Q>) => string | undefined);
  /** Static facts about the route for guards to read (`{ requires: "admin" }`). */
  readonly data?: Readonly<Record<string, unknown>>;
  /**
   * A **matching condition**: is this route available here and now at all (a feature flag, the signed-in role)? Synchronous and a function of `context` only, so matching stays a pure function
   * of the address. A route that is not available is skipped: the address falls to the next candidate, then to not found. Not for conditions that need the application's state or to wait:
   * those are guards.
   */
  readonly canMatch?: (context: C) => boolean;
  /** Asked before the route is entered. */
  readonly canActivate?: Guard<S>;
  /** Asked before the route is left for another route or other parameters (not for a change of query alone): unsaved edits, a running upload. */
  readonly canDeactivate?: Guard<S>;
  /** The address is another route's: matching it gives that route's state. */
  readonly redirectTo?: Redirect;
  /** `static` (default): the build writes a page for it, for each of `staticParams`, or once when it has none. `client`: only the browser knows these addresses, and the host must serve the app shell for them. */
  readonly delivery?: "static" | "client";
  /** The parameter sets to write pages for (a `static` route with parameters). */
  readonly staticParams?: () => ReadonlyArray<P>;
  /** A change of the query alone, on the same route and parameters, replaces the history entry instead of adding one (a search box). */
  readonly replaceQuery?: boolean;
}

/** A route: its pattern and its configuration. The type parameters remember what its Schemas decode to, so `href` can be checked. */
export interface Route<P = Record<string, never>, Q = Record<string, never>, S = any, C = any> {
  readonly _tag: "Route";
  readonly pattern: Pattern;
  readonly config: RouteConfig<P, Q, S, C>;
  readonly name: string;
  /** Not present at run time: carries `P` and `Q` for the checker. */
  readonly types?: { readonly params: P; readonly query: Q };
}

/**
 * Defines a route.
 *
 *     const message = route("/inbox/:id", {
 *       name: "message",
 *       params: Schema.Struct({ id: Schema.NumberFromString }),
 *       query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "unread")) }),
 *       title: ({ params }) => `Message ${params.id}`,
 *       canDeactivate: ({ state }) => !state.draft.dirty,
 *     });
 */
export const route = <P = Record<string, never>, Q = Record<string, never>, S = any, C = any>(path: string, config: RouteConfig<P, Q, S, C>): Route<P, Q, S, C> => ({
  _tag: "Route",
  pattern: parsePattern(path),
  config,
  name: config.name,
});
