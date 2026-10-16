// `route(...)`: the author's declaration of a route (what `defineApp({ routes })` takes). It is the one place that brings the router into an application, so a project that declares no route does
// not carry it. The engine that reads declarations is `routing-engine.ts`; the design record is `docs/application-model/ROUTES.md`.
import { createRouter, permit, redirect, route as routed, RouteDefinitionError } from "@valancex/router";

import type { DeclaredRoute, RouteConfig } from "./routing-types.js";
import { ROUTE } from "./routing-types.js";

export type { DeclaredRoute, RouteConfig } from "./routing-types.js";

const router = { createRouter, routed, RouteDefinitionError, permit, redirect };

/** Sends a navigation to another route, from a guard (`return redirect("login")`) or as a route's `redirectTo`. The target is a declared route's name, never an address, so a redirect cannot leave the application. */
export { redirect };

/**
 * Declares a route: `route("/orders/:id", { params, query, title, enter, staticParams })`. Its name is the key it has in `routes`. Declaring starts nothing; the framework reads it.
 *
 *     routes: { order: route("/orders/:id", { params: Schema.Struct({ id: Schema.String }), enter: ({ id }, state) => ({ ...state, orderId: id }) }) }
 */
export const route = <P = Record<string, string>, Q = Record<string, unknown>>(pattern: string, config: RouteConfig<P, Q> = {}): DeclaredRoute<P, Q> => ({
  [ROUTE]: true,
  pattern,
  config,
  router,
});
