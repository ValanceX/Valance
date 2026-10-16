// The shapes of a route declaration. Kept apart from `route()` (which brings in the router) so the parts of the framework that only read declarations need not.
import type { Schema } from "effect";

import type { Component } from "./index.js";

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
  /** The parameter sets a build writes a page for. A route with parameters and no `staticParams` cannot be built until client delivery exists. */
  readonly staticParams?: () => ReadonlyArray<P>;
}

export const ROUTE = Symbol.for("valancex.common.route");

/** The router a declared route carries, so that only an application that declares a route has the router in it. */
export interface RouterApi {
  readonly createRouter: typeof import("@valancex/router").createRouter;
  readonly routed: typeof import("@valancex/router").route;
  readonly RouteDefinitionError: typeof import("@valancex/router").RouteDefinitionError;
}

/** A declared route: the value `route(...)` makes and `defineApp({ routes })` takes by name. */
export interface DeclaredRoute<P = any, Q = any> {
  readonly [ROUTE]: true;
  readonly pattern: string;
  readonly config: RouteConfig<P, Q>;
  readonly router: RouterApi;
}

export const KEYS = ["params", "query", "title", "enter", "screen", "staticParams"] as const;
