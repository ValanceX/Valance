// Declared routes: the engine that reads the author's `route(...)` declarations (what `defineApp({ routes })` takes). An address inside the application (`/orders/42?tab=open`, no base)
// belongs to a content page, to a declared route, or to neither; this file answers for the declared routes and leaves content to `scope.ts`. The matching, the Schema-decoded parameters and
// query and the canonical form are `@valancex/router`'s; nothing here reimplements them. The design record is `docs/application-model/ROUTES.md` (statements R-1 to R-22).
import type { createRouter } from "@valancex/router";

import type { DeclaredRoute } from "./routing-types.js";
import { KEYS, ROUTE } from "./routing-types.js";
import type { Component } from "./index.js";

const COMPONENT = Symbol.for("valancex.common.component");

/** The tag a component is written as: its template's file name. */
export const screenName = (component: Component): string => (component.template.mprx.split(/[\\/]/).pop() ?? "").replace(/\.mprx$/, "");

/** A mistake in a route declaration, reported with what to change. */
export class RouteDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteDeclarationError";
  }
}

/** The declared route an address belongs to. */
export interface Entered {
  readonly name: string;
  /** The decoded parameters and query as one record. */
  readonly input: Readonly<Record<string, unknown>>;
  /** The canonical address (path and query, no base). */
  readonly address: string;
}

export interface Routing {
  /** Whether the application declares any route. */
  readonly any: boolean;
  /** The declared route an address (path and query, no base) belongs to, or `undefined`. */
  readonly match: (address: string) => Entered | undefined;
  /** The state with `route` and the entered route's state in place. `page` is what is shown: this does not change it. */
  readonly arrive: <S extends { readonly page: string }>(state: S) => S & { readonly route: string };
  /** The page part of the title of a declared route's address, when the route has a title. */
  readonly titleOf: (address: string) => string | undefined;
  /** The addresses a build writes for declared routes (path and canonical query), and the routes that cannot be built without `staticParams`. */
  readonly pages: () => { readonly addresses: ReadonlyArray<string>; readonly missing: ReadonlyArray<string> };
  /** The routes that name a screen. */
  readonly screens: ReadonlyArray<{ readonly route: string; readonly component: Component }>;
  /** The routes' names and patterns, for tools. */
  readonly list: ReadonlyArray<{ readonly name: string; readonly pattern: string; readonly parameters: ReadonlyArray<string> }>;
}

const NONE: Routing = {
  any: false,
  match: () => undefined,
  arrive: (state) => ({ ...state, route: "" }),
  titleOf: () => undefined,
  pages: () => ({ addresses: [], missing: [] }),
  screens: [],
  list: [],
};

const fail = (message: string): never => {
  throw new RouteDeclarationError(`src/main.ts: ${message}`);
};

/** The engine for an application's declared routes. Throws a `RouteDeclarationError` for a declaration that cannot be read. */
export const routingOf = (declared: Readonly<Record<string, DeclaredRoute>> | undefined): Routing => {
  const entries = Object.entries(declared ?? {});

  if (entries.length === 0) {
    return NONE;
  }

  for (const [name, each] of entries) {
    if (name === "") {
      fail("a route needs a name: the key it has in `routes`");
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
      fail(`the route name "${name}" must be letters, digits, - and _, starting with a letter: a layout compares \`route\` with it`);
    }
    if (typeof each !== "object" || each === null || each[ROUTE] !== true) {
      fail(`the route "${name}" must be made with route("/path", { … })`);
    }
    if (typeof each.pattern !== "string") {
      fail(`the route "${name}" needs a path pattern such as "/orders/:id"`);
    }

    const unknown = Object.keys(each.config).filter((key) => !(KEYS as ReadonlyArray<string>).includes(key));

    if (unknown.length > 0) {
      fail(`the route "${name}" has unknown settings ${unknown.map((key) => `"${key}"`).join(", ")} (known: ${KEYS.join(", ")})`);
    }
    for (const key of ["enter", "staticParams"] as const) {
      if (each.config[key] !== undefined && typeof each.config[key] !== "function") {
        fail(`the route "${name}": \`${key}\` must be a function`);
      }
    }
    if (each.config.title !== undefined && typeof each.config.title !== "string" && typeof each.config.title !== "function") {
      fail(`the route "${name}": \`title\` must be a string or a function`);
    }
    const screen = each.config.screen;

    if (screen !== undefined) {
      if (typeof screen !== "object" || screen === null || (screen as unknown as Record<symbol, unknown>)[COMPONENT] !== true) {
        fail(`the route "${name}": \`screen\` must be a component made with component(template, { props, events })`);
      }
      if (screen.props === undefined || screen.events === undefined) {
        fail(
          `the route "${name}": its screen <${screenName(screen)}> must declare both \`props\` and \`events\` (empty if it has none): the framework writes the screen's use from them, and the names cannot be read from a template before it is compiled`,
        );
      }
    }
    if (!each.pattern.startsWith("/")) {
      fail(`the route "${name}": the path "${each.pattern}" must start with "/" (and has no base: the site's base is put in front)`);
    }
  }

  // The router comes with the declarations (`route()` is what imports it).
  const { createRouter: make, routed, RouteDefinitionError } = entries[0]![1].router;
  let router: ReturnType<typeof createRouter>;

  try {
    router = make({
      routes: entries.map(([name, each]) =>
        routed(each.pattern, {
          name,
          ...(each.config.params === undefined ? {} : { params: each.config.params }),
          ...(each.config.query === undefined ? {} : { query: each.config.query }),
        }),
      ),
    });
  } catch (error) {
    if (error instanceof RouteDefinitionError) {
      return fail(error.message);
    }

    throw error;
  }

  // A parameter and a query key arrive as one record, so they may not share a name.
  for (const [name, each] of entries) {
    const fields = (each.config.query as { readonly fields?: Readonly<Record<string, unknown>> } | undefined)?.fields;
    const clash = Object.keys(fields ?? {}).filter((key) => router.route(name)!.pattern.names.includes(key));

    if (clash.length > 0) {
      fail(`the route "${name}": ${clash.map((key) => `"${key}"`).join(", ")} is both a path parameter and a query key; they arrive as one input, so rename one`);
    }
  }

  const byName = new Map(entries);
  const match: Routing["match"] = (address) => {
    const state = router.match(address);

    return state.name === router.notFoundName ? undefined : { name: state.name, input: { ...state.query, ...state.params }, address: router.hrefOf(state) };
  };

  return {
    any: true,
    match,
    arrive: <S extends { readonly page: string }>(state: S): S & { readonly route: string } => {
      const entered = match(state.page);
      const named = { ...state, route: entered?.name ?? "" };
      const enter = entered === undefined ? undefined : byName.get(entered.name)!.config.enter;

      if (enter === undefined || entered === undefined) {
        return named;
      }

      // The route may set the application's state; which page is shown, and the trail, are not its to change.
      const next = enter(entered.input, named) as S;

      return { ...next, page: state.page, route: named.route, ...("trail" in state ? { trail: (state as any).trail, cursor: (state as any).cursor } : {}) };
    },
    titleOf: (address) => {
      const entered = match(address);
      const title = entered === undefined ? undefined : byName.get(entered.name)!.config.title;

      return title === undefined ? undefined : typeof title === "string" ? title : title(entered!.input as never);
    },
    pages: () => {
      const addresses: Array<string> = [];
      const missing: Array<string> = [];

      for (const [name, each] of entries) {
        const parametric = router.route(name)!.pattern.names.length > 0;

        if (!parametric) {
          addresses.push(router.href(name));
        } else if (each.config.staticParams === undefined) {
          missing.push(name);
        } else {
          for (const params of each.config.staticParams()) {
            try {
              addresses.push(router.href(name, params as never));
            } catch (error) {
              return fail(`the route "${name}": a \`staticParams\` entry does not fit its \`params\` Schema (${error instanceof Error ? error.message : String(error)})`);
            }
          }
        }
      }

      return { addresses, missing };
    },
    screens: entries.flatMap(([name, each]) => (each.config.screen === undefined ? [] : [{ route: name, component: each.config.screen }])),
    list: entries.map(([name, each]) => ({ name, pattern: each.pattern, parameters: router.route(name)!.pattern.names })),
  };
};

/** A declared route that matches the address of a content page: one address cannot belong to both. */
export const conflicts = (routing: Routing, contentPaths: ReadonlyArray<string>): ReadonlyArray<string> =>
  contentPaths.flatMap((path) => {
    const entered = routing.match(path);

    return entered === undefined
      ? []
      : [
          `the route "${entered.name}" matches ${path}, which is a content page (${path === "/" ? "content/index.md" : `content${path}.md`}); one address cannot be both. Change the pattern or the file`,
        ];
  });

const cache = new WeakMap<object, Routing>();

/** The engine for an application's declarations, made once per definition. Throws a `RouteDeclarationError` for a declaration that cannot be read. */
export const routingFor = (author: { readonly routes?: Readonly<Record<string, DeclaredRoute>> } | undefined): Routing => {
  const declared = author?.routes;

  if (declared === undefined) {
    return NONE;
  }

  let routing = cache.get(declared);

  if (routing === undefined) {
    routing = routingOf(declared);
    cache.set(declared, routing);
  }

  return routing;
};

/** What is wrong with the routes next to the content, each as a message: an address that is both, a route a build cannot write. */
export const routeProblems = (
  author: { readonly routes?: Readonly<Record<string, DeclaredRoute>> } | undefined,
  contentPaths: ReadonlyArray<string>,
): ReadonlyArray<{ readonly code: string; readonly message: string }> => {
  const routing = routingFor(author);

  return [
    ...conflicts(routing, contentPaths).map((message) => ({ code: "route-conflict", message })),
    ...routing.pages().missing.map((name) => ({
      code: "route-static-params",
      message: `the route "${name}" has path parameters and no \`staticParams\`, so a build has no page to write for it (pages that only the browser renders arrive with client delivery). Add \`staticParams: () => [{ … }]\`, or run it with \`vlx dev\``,
    })),
  ];
};
