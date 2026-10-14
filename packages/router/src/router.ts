// The router: route definitions in, a URL policy for `Web.run` out. It matches an address to a route (path and query parameters decoded by the route's Schemas), builds an address for a route,
// decides whether a navigation may happen (matching conditions, guards for leaving and entering), titles a route, and offers the two commands that change where the application is.
import * as Nexus from "@valancex/nexus";
import type { Plugin, RouteTable } from "@valancex/valance/web/plugin";
import { Effect, Either, Schema } from "effect";

import { runGuard } from "./guards.js";
import { bySpecificity, buildPath, LIMITS, matchSegments, RouteDefinitionError, segmentsOf } from "./pattern.js";
import type { Route } from "./route.js";
import { RouteState } from "./types.js";
import type { Decision, Guard, GuardContext, NavigationKind, Redirect } from "./types.js";

export interface RouterOptions<S, C> {
  readonly routes: ReadonlyArray<Route<any, any, S, C>>;
  /** Where the application is served: `/` (default) or `/docs/`. */
  readonly base?: string;
  /** What `canMatch` is given. Read for every match, so it must be cheap and synchronous (a role from a store, a feature flag). */
  readonly context?: () => C;
  /** The key of the application's state that holds the `RouteState`. Default `route`. */
  readonly key?: string;
  /** A guard for every navigation, asked after the route being left and before the route being entered. */
  readonly beforeEach?: Guard<S>;
  /** The route state for an address no route matches. Default name `notFound`. */
  readonly notFound?: { readonly name?: string; readonly title?: string };
}

const DEFAULT_KEY = "route";
const POISON = new Set(["__proto__", "constructor", "prototype"]);
const MAX_REDIRECTS = 8;

/** Whether a decoded value can live in the application's state and be embedded in a page: null, booleans, strings, finite numbers, and arrays and plain records of those, to a bounded depth. */
const jsonSafe = (value: unknown, depth = 0): boolean => {
  if (depth > 8) {
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.length <= 1024 && value.every((each) => jsonSafe(each, depth + 1));
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as unknown;

    return (proto === Object.prototype || proto === null) && Object.values(value).every((each) => jsonSafe(each, depth + 1));
  }

  return false;
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
};

const Destination = Schema.Struct({ to: Schema.String });

export const createRouter = <S extends Record<string, any>, C = undefined>(options: RouterOptions<S, C>) => {
  const base = options.base ?? "/";
  const key = options.key ?? DEFAULT_KEY;
  const notFoundName = options.notFound?.name ?? "notFound";

  if (!/^\/([\w.~-]+\/)*$/.test(base)) {
    throw new RouteDefinitionError(`the base "${base}" must start and end with "/" ("/" or "/docs/")`);
  }

  const byName = new Map<string, Route<any, any, S, C>>();
  const shapes = new Map<string, string>();

  for (const each of options.routes) {
    if (each.name === notFoundName || byName.has(each.name)) {
      throw new RouteDefinitionError(`the route name "${each.name}" is ${each.name === notFoundName ? "the not-found name" : "used twice"}`);
    }
    if (shapes.has(each.pattern.shape)) {
      throw new RouteDefinitionError(`the paths "${shapes.get(each.pattern.shape)}" and "${each.pattern.source}" cannot be told apart`);
    }

    byName.set(each.name, each);
    shapes.set(each.pattern.shape, each.pattern.source);
  }

  for (const each of options.routes) {
    if (each.config.redirectTo !== undefined && !byName.has(each.config.redirectTo.name)) {
      throw new RouteDefinitionError(`the route "${each.name}" redirects to "${each.config.redirectTo.name}", which is not a route`);
    }
  }

  const ranked = [...options.routes]
    .map((each, at) => ({ each, at }))
    .sort((a, b) => bySpecificity(a.each.pattern, b.each.pattern) || a.at - b.at)
    .map(({ each }) => each);

  // ---- addresses ------------------------------------------------------------------------------------------------------------------------------------------

  const routeNamed = (name: string): Route<any, any, S, C> | undefined => byName.get(name);

  const withBase = (path: string): string => (base === "/" ? path : path === "/" ? base : `${base.slice(0, -1)}${path}`);

  /** The query as the address holds it: a key once is a string, repeated is an array. Too many keys or too long a value is not an address this router reads. */
  const readQuery = (search: URLSearchParams): Record<string, string | Array<string>> | undefined => {
    const found: Record<string, string | Array<string>> = {};
    let count = 0;

    for (const [name, value] of search.entries()) {
      if (POISON.has(name) || value.length > LIMITS.queryValue) {
        if (POISON.has(name)) {
          continue;
        }

        return undefined;
      }

      const existing = found[name];

      if (existing === undefined) {
        count += 1;
        found[name] = value;
      } else {
        found[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      }

      if (count > LIMITS.queryKeys) {
        return undefined;
      }
    }

    return found;
  };

  const decodeWith = <A>(schema: Schema.Schema<A, any> | undefined, raw: unknown, fallback: A): A | undefined => {
    if (schema === undefined) {
      return fallback;
    }

    const decoded = Schema.decodeUnknownEither(schema)(raw);

    return Either.isRight(decoded) && jsonSafe(decoded.right) ? decoded.right : undefined;
  };

  /** The state for a route's decoded parameters and query, following its `redirectTo`, or `undefined` when it cannot be built. */
  const settle = (start: Route<any, any, S, C>, params: Readonly<Record<string, unknown>>, query: Readonly<Record<string, unknown>>, depth = 0): RouteState | undefined => {
    const target = start.config.redirectTo;

    if (target === undefined) {
      return { name: start.name, params, query };
    }

    const next = routeNamed(target.name);

    return depth >= MAX_REDIRECTS || next === undefined ? undefined : settle(next, target.params, target.query, depth + 1);
  };

  const notFoundState = (url: URL): RouteState => {
    const path = `${url.pathname}${url.search}`;

    return { name: notFoundName, params: { path: path.length <= LIMITS.path && path.startsWith("/") && !path.startsWith("//") ? path : "/" }, query: {} };
  };

  /** The route an address belongs to, and the state that says so. `undefined` when none does. */
  const matchUrl = (url: URL): { readonly route: Route<any, any, S, C>; readonly state: RouteState } | undefined => {
    if (!url.pathname.startsWith(base) && url.pathname !== base.slice(0, -1)) {
      return undefined;
    }

    const inside = url.pathname === base.slice(0, -1) ? "/" : `/${url.pathname.slice(base.length)}`;
    const segments = segmentsOf(inside);
    const query = readQuery(url.searchParams);

    if (segments === undefined || query === undefined) {
      return undefined;
    }

    const context = options.context?.() as C;

    for (const candidate of ranked) {
      const values = matchSegments(candidate.pattern, segments);

      if (values === undefined || (candidate.config.canMatch !== undefined && !candidate.config.canMatch(context))) {
        continue;
      }

      const params = decodeWith(candidate.config.params as Schema.Schema<Record<string, unknown>, any> | undefined, values, { ...values });
      const decodedQuery = decodeWith(candidate.config.query as Schema.Schema<Record<string, unknown>, any> | undefined, query, {});

      if (params === undefined || decodedQuery === undefined) {
        continue;
      }

      const state = settle(candidate, params, decodedQuery);

      if (state !== undefined) {
        return { route: candidate, state };
      }
    }

    return undefined;
  };

  const FALLBACK_ORIGIN = "http://router.invalid";

  /** The state for an address (a path and query under the base): the route that matches, or not found. */
  const stateFor = (address: string): RouteState => {
    const url = new URL(address, FALLBACK_ORIGIN);

    return matchUrl(url)?.state ?? notFoundState(url);
  };

  const encodeWith = (schema: Schema.Schema<any, any> | undefined, value: unknown, what: string, route: string): Record<string, unknown> => {
    if (schema === undefined) {
      return { ...(value as Record<string, unknown>) };
    }

    const encoded = Schema.encodeUnknownEither(schema)(value);

    if (Either.isLeft(encoded)) {
      throw new RouteDefinitionError(`the ${what} for route "${route}" do not fit its Schema`);
    }

    return encoded.right as Record<string, unknown>;
  };

  /** The address for a route and its decoded parameters and query: `href(message, { id: 42 }, { tab: "unread" })` is `/inbox/42?tab=unread`. */
  const href = <P, Q>(to: Route<P, Q, S, C> | string, params?: P | Readonly<Record<string, unknown>>, query?: Q | Readonly<Record<string, unknown>>): string => {
    const target = typeof to === "string" ? routeNamed(to) : to;

    if (target === undefined) {
      throw new RouteDefinitionError(`there is no route named "${String(to)}"`);
    }

    const strings: Record<string, string> = {};

    for (const [name, value] of Object.entries(encodeWith(target.config.params, params ?? {}, "parameters", target.name))) {
      strings[name] = String(value);
    }

    const search = new URLSearchParams();
    const encoded = encodeWith(target.config.query, query ?? {}, "query", target.name);

    for (const name of Object.keys(encoded).sort()) {
      const value = encoded[name];

      for (const each of Array.isArray(value) ? value : [value]) {
        if (each !== undefined) {
          search.append(name, String(each));
        }
      }
    }

    const tail = search.toString();

    return `${withBase(buildPath(target.pattern, strings))}${tail === "" ? "" : `?${tail}`}`;
  };

  /** The address a state is at. */
  const hrefOf = (state: RouteState): string => {
    if (state.name === notFoundName) {
      const path = state.params["path"];

      return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : base;
    }

    return href(state.name, state.params, state.query);
  };

  /** The state for an address given as a string on this application (`/inbox/42?tab=unread`, under the base), for programmatic navigation. `undefined` for another origin or a path outside the base. */
  const resolve = (to: string): RouteState | undefined => {
    let url: URL;

    try {
      url = new URL(to, `${FALLBACK_ORIGIN}${base}`);
    } catch {
      return undefined;
    }

    if (url.origin !== FALLBACK_ORIGIN || to.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(to)) {
      return undefined;
    }

    return matchUrl(url)?.state ?? (url.pathname.startsWith(base) ? notFoundState(url) : undefined);
  };

  /** A `?next=`-style address from outside, made safe to navigate to: the address of a declared route on this application, or `undefined`. Never a route that is not declared, never another origin. */
  const safeNext = (raw: string | null | undefined): string | undefined => {
    if (raw === null || raw === undefined || raw === "" || raw.length > LIMITS.path) {
      return undefined;
    }

    const state = resolve(raw);

    return state === undefined || state.name === notFoundName ? undefined : hrefOf(state);
  };

  const redirectState = (to: Redirect): RouteState | undefined => {
    const target = routeNamed(to.name);

    if (target === undefined) {
      return undefined;
    }

    try {
      href(target, to.params, to.query);
    } catch {
      return undefined;
    }

    return settle(target, to.params, to.query);
  };

  // ---- deciding -------------------------------------------------------------------------------------------------------------------------------------------

  const sameDestination = (a: RouteState, b: RouteState): boolean => a.name === b.name && canonical(a.params) === canonical(b.params) && canonical(a.query) === canonical(b.query);

  /**
   * May the application go from `from` to `to`? In order: the route being left (`canDeactivate`, when the route or its parameters change, not for a query alone), the router's `beforeEach`,
   * then the route being entered (`canActivate`). A `Redirect` restarts the entering side at its target, at most eight times. Nothing runs when the destination is where the application already is.
   */
  const decide = (input: { readonly from: RouteState | undefined; readonly to: RouteState; readonly state: S; readonly kind: NavigationKind }): Effect.Effect<Decision> =>
    Effect.gen(function* () {
      const { from, state, kind } = input;
      let to = input.to;

      if (from !== undefined && sameDestination(from, to)) {
        return { _tag: "Allow", to } as const;
      }

      const context = (route: Route<any, any, S, C> | undefined, destination: RouteState): GuardContext<S> => ({
        from,
        to: destination,
        state,
        kind,
        data: route?.config.data ?? {},
      });
      const leaving = from === undefined ? undefined : routeNamed(from.name);

      if (from !== undefined && leaving?.config.canDeactivate !== undefined && (from.name !== to.name || canonical(from.params) !== canonical(to.params))) {
        const answer = yield* runGuard(leaving.config.canDeactivate, context(leaving, to));

        if (answer !== true) {
          return { _tag: "Refuse", by: "canDeactivate", route: from.name } as const;
        }
      }

      for (let hops = 0; ; hops += 1) {
        if (hops > MAX_REDIRECTS) {
          return { _tag: "Refuse", by: "redirects", route: to.name } as const;
        }

        const entering = routeNamed(to.name);
        const checks: ReadonlyArray<readonly [Guard<S> | undefined, "beforeEach" | "canActivate", Route<any, any, S, C> | undefined]> = [
          [options.beforeEach, "beforeEach", undefined],
          [entering?.config.canActivate, "canActivate", entering],
        ];
        let redirected: RouteState | undefined;

        for (const [guard, by, owner] of checks) {
          if (guard === undefined) {
            continue;
          }

          const answer = yield* runGuard(guard, context(owner, to));

          if (answer === false) {
            return { _tag: "Refuse", by, route: to.name } as const;
          }
          if (answer !== true) {
            redirected = redirectState(answer);

            if (redirected === undefined) {
              return { _tag: "Refuse", by, route: to.name } as const;
            }

            break;
          }
        }

        if (redirected === undefined) {
          return to === input.to ? ({ _tag: "Allow", to } as const) : ({ _tag: "Redirect", to } as const);
        }

        to = redirected;
      }
    });

  // ---- what Web.run needs ---------------------------------------------------------------------------------------------------------------------------------

  const routeOf = (state: S): RouteState | undefined => {
    const value = state[key] as RouteState | undefined;

    return value;
  };

  const strip = (state: RouteState): RouteState => ({ name: state.name, params: state.params, query: state.query });

  const titleOf = (state: RouteState): string | undefined => {
    if (state.name === notFoundName) {
      return options.notFound?.title;
    }

    const found = routeNamed(state.name);
    const title = found?.config.title;

    return typeof title === "function" ? title({ params: state.params, query: state.query, data: found?.config.data ?? {} } as never) : title;
  };

  const paths = (): ReadonlyArray<string> => {
    const out = new Set<string>();

    for (const each of options.routes) {
      if (each.config.delivery === "client" || each.config.redirectTo !== undefined) {
        continue;
      }
      if (each.pattern.names.length === 0) {
        out.add(href(each));
      } else {
        for (const params of each.config.staticParams?.() ?? []) {
          out.add(href(each, params));
        }
      }
    }

    return [...out];
  };

  const table: RouteTable<S> = {
    urlOf: (state) => {
      const current = routeOf(state);

      return current === undefined ? base : hrefOf(current);
    },
    stateOf: (url) => strip(matchUrl(url)?.state ?? notFoundState(url)) as never,
    navigate: "navigate",
    known: (pathname) => matchUrl(new URL(pathname, FALLBACK_ORIGIN)) !== undefined,
    paths,
    delivery: (pathname) => {
      const found = matchUrl(new URL(pathname, FALLBACK_ORIGIN));

      return found?.route.config.delivery === "client" ? "server" : "static";
    },
    modeOf: (previous, next) => {
      const before = routeOf(previous);
      const after = routeOf(next);

      if (after?.replace === true) {
        return "replace";
      }

      const route = before === undefined ? undefined : routeNamed(before.name);

      return before !== undefined &&
        after !== undefined &&
        route?.config.replaceQuery === true &&
        before.name === after.name &&
        canonical(before.params) === canonical(after.params)
        ? "replace"
        : "push";
    },
    guard: (navigation, state) => {
      const from = routeOf(state);
      const to = matchUrl(navigation.url)?.state ?? notFoundState(navigation.url);

      return Effect.runPromise(
        decide({ from, to, state, kind: navigation.kind }).pipe(
          Effect.map((decision) => (decision._tag === "Allow" ? true : decision._tag === "Redirect" ? { redirect: hrefOf(decision.to) } : false)),
        ),
      );
    },
  };

  const plugin: Plugin<S> = {
    name: "router",
    routes: table,
    head: (state) => {
      const current = routeOf(state);
      const title = current === undefined ? undefined : titleOf(current);

      return title === undefined ? {} : { title };
    },
  };

  /**
   * The commands the router adds to the application's table:
   *
   * - `navigate`: what `Web.run` invokes for a link or Back/Forward once the browser-side guard allowed it. It takes the route state and sets it.
   * - `go` and `replace`: programmatic navigation to an address, `go({ to: "/inbox/42?tab=unread" })`; `replace` rewrites the current history entry instead of adding one. Each decides first (the guard
   *   for leaving, then the one for entering), then sets the state; a refusal leaves it where it is. They take one argument so a template can call them: `on.click={go("/inbox")}`.
   */
  const moveTo = (state: Nexus.State.StateHandle<S>, to: string, replace: boolean): Effect.Effect<void> =>
    Effect.gen(function* () {
      const target = resolve(to);

      if (target === undefined) {
        yield* Effect.logWarning("the address is not on this application");

        return;
      }

      const current = yield* state.get;
      const decision = yield* decide({ from: routeOf(current), to: target, state: current, kind: "programmatic" });

      if (decision._tag === "Refuse") {
        return;
      }

      const next = decision._tag === "Redirect" ? { ...decision.to, replace: true } : { ...decision.to, ...(replace ? { replace: true } : {}) };

      yield* state.update((latest) => Effect.succeed({ ...latest, [key]: next } as S));
    });

  /**
   * The route an application starts on, for an address it was opened at (a deep link, a saved session, the address the server rendered): the address's route after the entering guards have had their
   * say. `match` alone does not ask them, so a link to a list that no longer exists would start the application on a screen with nothing to show. A redirect is followed; a refusal starts on the
   * not-found route. Nothing is being left, so no `canDeactivate` runs. Give it the state the application will start with (guards read it).
   */
  const enter = (address: string, state: S): Effect.Effect<RouteState> =>
    Effect.gen(function* () {
      const target = resolve(address) ?? notFoundState(new URL("/", FALLBACK_ORIGIN));
      const decision = yield* decide({ from: undefined, to: target, state, kind: "initial" });

      return decision._tag === "Refuse" ? notFoundState(new URL(address.startsWith("/") ? address : "/", FALLBACK_ORIGIN)) : strip(decision.to);
    });

  const commands = (state: Nexus.State.StateHandle<S>) => ({
    navigate: Nexus.Command.define("navigate", RouteState, (next) => state.update((current) => Effect.succeed({ ...current, [key]: strip(next) } as S)).pipe(Effect.asVoid)),
    go: Nexus.Command.define("go", Destination, ({ to }) => moveTo(state, to, false)),
    replace: Nexus.Command.define("replace", Destination, ({ to }) => moveTo(state, to, true)),
  });

  return { base, key, notFoundName, table, plugin, commands, enter, match: stateFor, href, hrefOf, resolve, safeNext, decide, titleOf, route: routeNamed, paths };
};

export type Router<S extends Record<string, any>, C = undefined> = ReturnType<typeof createRouter<S, C>>;
