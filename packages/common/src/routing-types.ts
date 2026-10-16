// The shapes of a route declaration. Kept apart from `route()` (which brings in the router) so the parts of the framework that only read declarations need not.
import type { Schema } from "effect";

import type { Component, NavigationGuard } from "./index.js";
import type { Outcome } from "@valancex/valance";

/** What a route may declare. `P` is what its parameters decode to, `Q` its query. */
export interface RouteConfig<P, Q> {
  /** The path parameters. The encoded side is strings (what an address holds). Without it they are the strings in the address. */
  readonly params?: Schema.Schema<P, any>;
  /** The query parameters, the same way. */
  readonly query?: Schema.Schema<Q, any>;
  /** The page part of the document's title: a string, or a function of the parameters and query together. */
  readonly title?: string | ((input: P & Q) => string);
  /**
   * A pure transition run in the same state change that makes this route the page shown (a link, `go`, Back and Forward, the first state of a request). It receives the decoded parameters and query
   * as one record and the state, and returns the state: `({ id }, state) => ({ ...state, orderId: id })`. It cannot change which page is shown.
   */
  readonly enter?: (input: P & Q, state: any) => any;
  /**
   * The component this route shows. The layout places it with `<screen />`; the framework writes its use, filling each prop it declares from the state, derived value or framework name of the same
   * name and running the command named like each event it declares. It must be listed in `components` and declare its `props` and `events`.
   */
  readonly screen?: Component;
  /** The parameter sets a build writes a page for. A route with parameters and no `staticParams` cannot be built unless it is `delivery: "client"`. */
  readonly staticParams?: () => ReadonlyArray<P>;
  /**
   * How the route's pages reach the browser. `"static"` (the default): the build writes a page for each address, and the browser takes it over. `"client"`: the build writes no page; the host answers
   * the route's addresses with the app shell and the browser draws the page from the address bar. Use it for a route whose addresses are not known at build time (`/orders/:id` for any id).
   */
  readonly delivery?: "static" | "client";
  /**
   * Routes inside this one. Their paths start with "/" and follow this route's (`/account` + `/profile` is `/account/profile`); the child named `profile` of `account` is `account.profile` in `route`.
   * The parent's screen draws them where it writes `<mesh-slot />`.
   */
  readonly children?: Readonly<Record<string, DeclaredRoute>>;
  /** For a route with `children`: the screen drawn in its slot at the parent's own address (`/account`). Without it the slot is empty there. */
  readonly index?: Component;
  /**
   * Data the route needs, fetched when it is entered. `begin` is pure and part of the entry (so the page a build writes, and the first state of a request, show the loading state); `work` runs
   * in the running application after the entry (a Promise, or an Effect that needs a capability), and `settle` puts its success or failure into the state. A result is dropped if the application
   * has left the address by then. See ROUTES.md R-50.
   */
  readonly load?: {
    readonly begin?: (input: P & Q, state: any) => any;
    readonly work: (input: P & Q, signal: AbortSignal, state: any) => Promise<any> | import("effect").Effect.Effect<any, unknown, any>;
    readonly settle: (outcome: Outcome<any>, input: P & Q, state: any) => any;
  };
  /** Asked before the route is entered (the router's guard: `true`, `false`, or `redirect(route)`; plain, a Promise or an Effect). */
  readonly canActivate?: NavigationGuard;
  /** Asked before the route is left for another route or other parameters (not for a query alone), and when the page closes. Only an answer given at once can stop a page closing. */
  readonly canDeactivate?: NavigationGuard;
  /** An address of this route is the target's: `redirectTo: redirect("account")`. A redirecting route has no page of its own. */
  readonly redirectTo?: { readonly _tag: "Redirect"; readonly name: string; readonly params: Readonly<Record<string, unknown>>; readonly query: Readonly<Record<string, unknown>> };
}

export const ROUTE = Symbol.for("valancex.common.route");

/** The router a declared route carries, so that only an application that declares a route has the router in it. */
export interface RouterApi {
  readonly createRouter: typeof import("@valancex/router").createRouter;
  readonly routed: typeof import("@valancex/router").route;
  readonly RouteDefinitionError: typeof import("@valancex/router").RouteDefinitionError;
  readonly permit: typeof import("@valancex/router").permit;
  readonly redirect: typeof import("@valancex/router").redirect;
}

/** A declared route: the value `route(...)` makes and `defineApp({ routes })` takes by name. */
export interface DeclaredRoute<P = any, Q = any> {
  readonly [ROUTE]: true;
  readonly pattern: string;
  readonly config: RouteConfig<P, Q>;
  readonly router: RouterApi;
}

export const KEYS = ["params", "query", "title", "enter", "screen", "staticParams", "delivery", "children", "index", "load", "canActivate", "canDeactivate", "redirectTo"] as const;
