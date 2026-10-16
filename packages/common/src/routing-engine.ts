// Declared routes: the engine that reads the author's `route(...)` declarations (what `defineApp({ routes })` takes). An address inside the application (`/orders/42?tab=open`, no base)
// belongs to a content page, to a declared route, or to neither; this file answers for the declared routes and leaves content to `scope.ts`. The matching, the Schema-decoded parameters and
// query and the canonical form are `@valancex/router`'s; nothing here reimplements them. The design record is `docs/application-model/ROUTES.md` (statements R-1 to R-22).
import { Schema } from "effect";
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
  /** How the route's pages are delivered: written by the build (`static`) or drawn by the browser from the app shell (`client`). */
  readonly delivery: "static" | "client";
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
  readonly pages: () => {
    readonly addresses: ReadonlyArray<string>;
    readonly missing: ReadonlyArray<string>;
  };
  /** The routes that name a screen. */
  readonly screens: ReadonlyArray<{
    readonly route: string;
    readonly component: Component;
  }>;
  /** The routes that name an `index`: what shows in a parent's slot at the parent's own address. */
  readonly indexes: ReadonlyArray<{ readonly route: string; readonly component: Component }>;
  /** How many levels the routes nest (0 when none has children): the state then holds `at`, with a field `l0`, `l1`, … for each. */
  readonly levels: number;
  /** The routes as they nest, for the generator of the screens' switch. */
  readonly tree: ReadonlyArray<Level>;
  /** The routes' names and patterns, for tools (a nested route's pattern is the whole address). */
  readonly list: ReadonlyArray<{
    readonly name: string;
    readonly pattern: string;
    readonly parameters: ReadonlyArray<string>;
    readonly delivery: "static" | "client";
    readonly parent?: string;
  }>;
}

const NONE: Routing = {
  any: false,
  match: () => undefined,
  arrive: (state) => ({ ...state, route: "" }),
  titleOf: () => undefined,
  pages: () => ({ addresses: [], missing: [] }),
  screens: [],
  indexes: [],
  levels: 0,
  tree: [],
  list: [],
};

const fail = (message: string): never => {
  throw new RouteDeclarationError(`src/main.ts: ${message}`);
};

/** The path parameters a pattern names, in order (`/orders/:id/*rest` → `id`, `rest`). */
const namesIn = (pattern: string): ReadonlyArray<string> =>
  pattern
    .split("/")
    .filter((part) => part !== "")
    .flatMap((part) => (part.startsWith(":") ? [part.slice(1)] : part.startsWith("*") ? [part.length === 1 ? "rest" : part.slice(1)] : []));

/** A route as the engine holds it. The tree is flattened once, when the definition is read: nothing walks it to navigate or to render (ROUTES.md R-45). */
interface Node {
  /** The name `route` holds: the key, or the parent's name, a dot and the key. */
  readonly name: string;
  readonly key: string;
  readonly declared: DeclaredRoute;
  /** The whole address pattern: the parents' patterns, then this one's. */
  readonly pattern: string;
  readonly parent: Node | undefined;
  readonly children: Array<Node>;
  /** From the root to this route, itself last. */
  readonly chain: Array<Node>;
  /** The `enter` of each level that has one, in the order they run. */
  readonly enters: Array<NonNullable<DeclaredRoute["config"]["enter"]>>;
  /** The level whose `title` is used: the deepest that gives one. */
  titled: Node | undefined;
  readonly delivery: "static" | "client";
  /** Which child is active at each level when this route is shown: `{ l0: "account", l1: "profile", l2: "" }`. */
  at: Readonly<Record<string, string>>;
}

/** What a route's `children` section makes of the screens: the shape the generated switch follows. */
export interface Level {
  readonly key: string;
  readonly name: string;
  readonly screen?: Component;
  readonly index?: Component;
  readonly children: ReadonlyArray<Level>;
}

/** The engine for an application's declared routes. Throws a `RouteDeclarationError` for a declaration that cannot be read. */
export const routingOf = (declared: Readonly<Record<string, DeclaredRoute>> | undefined): Routing => {
  const roots = Object.entries(declared ?? {});

  if (roots.length === 0) {
    return NONE;
  }

  const nodes: Array<Node> = [];

  const check = (name: string, each: DeclaredRoute, key: string): void => {
    if (key === "") {
      fail("a route needs a name: the key it has in `routes`");
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
      fail(`the route name "${key}" must be letters, digits, - and _, starting with a letter: a layout compares \`route\` with it`);
    }
    if (typeof each !== "object" || each === null || each[ROUTE] !== true) {
      fail(`the route "${name}" must be made with route("/path", { … })`);
    }
    if (typeof each.pattern !== "string") {
      fail(`the route "${name}" needs a path pattern such as "/orders/:id"`);
    }

    const unknown = Object.keys(each.config).filter((known) => !(KEYS as ReadonlyArray<string>).includes(known));

    if (unknown.length > 0) {
      fail(`the route "${name}" has unknown settings ${unknown.map((known) => `"${known}"`).join(", ")} (known: ${KEYS.join(", ")})`);
    }
    for (const setting of ["enter", "staticParams"] as const) {
      if (each.config[setting] !== undefined && typeof each.config[setting] !== "function") {
        fail(`the route "${name}": \`${setting}\` must be a function`);
      }
    }
    if (each.config.title !== undefined && typeof each.config.title !== "string" && typeof each.config.title !== "function") {
      fail(`the route "${name}": \`title\` must be a string or a function`);
    }
    if (each.config.delivery !== undefined && each.config.delivery !== "static" && each.config.delivery !== "client") {
      fail(`the route "${name}": \`delivery\` is "static" or "client" (found ${JSON.stringify(each.config.delivery)})`);
    }
    if (each.config.delivery === "client" && each.config.staticParams !== undefined) {
      fail(`the route "${name}" is \`delivery: "client"\` and has \`staticParams\`: a client route has no static pages, so they would be ignored. Remove one`);
    }
    for (const [setting, component] of [
      ["screen", each.config.screen],
      ["index", each.config.index],
    ] as const) {
      if (component === undefined) {
        continue;
      }
      if (typeof component !== "object" || component === null || (component as unknown as Record<symbol, unknown>)[COMPONENT] !== true) {
        fail(`the route "${name}": \`${setting}\` must be a component made with component(template, { props, events })`);
      }
      if (component.props === undefined || component.events === undefined) {
        fail(
          `the route "${name}": its ${setting === "index" ? "index " : ""}screen <${screenName(component)}> must declare both \`props\` and \`events\` (empty if it has none): the framework writes the screen's use from them, and the names cannot be read from a template before it is compiled`,
        );
      }
    }
    if (!each.pattern.startsWith("/")) {
      fail(`the route "${name}": the path "${each.pattern}" must start with "/" (and has no base: the site's base is put in front)`);
    }
  };

  const visit = (key: string, each: DeclaredRoute, parent: Node | undefined): void => {
    const name = parent === undefined ? key : `${parent.name}.${key}`;

    check(name, each, key);

    const children = Object.entries(each.config.children ?? {});

    if (children.length > 0 && /\*[A-Za-z_]*$/.test(each.pattern)) {
      fail(`the route "${name}" has children and its path "${each.pattern}" ends in a rest segment, which takes the rest of the address: there would be nothing left for a child`);
    }
    if (children.length > 0 && each.config.staticParams !== undefined) {
      fail(
        `the route "${name}" has children and \`staticParams\`: pages are written for the leaves, so give \`staticParams\` (the whole parameter set, the parents' too) on the leaf`,
      );
    }
    if (children.length === 0 && each.config.index !== undefined) {
      fail(`the route "${name}" has an \`index\` and no \`children\`: the index is what shows in the slot of a parent's own address`);
    }

    const above = parent === undefined ? "" : parent.pattern === "/" ? "" : parent.pattern;
    const node: Node = {
      name,
      key,
      declared: each,
      pattern: `${above}${each.pattern}`,
      parent,
      children: [],
      chain: [],
      enters: [],
      titled: undefined,
      delivery: each.config.delivery ?? parent?.delivery ?? "static",
      at: {},
    };

    node.chain.push(...(parent?.chain ?? []), node);
    node.enters.push(...node.chain.flatMap((level) => (level.declared.config.enter === undefined ? [] : [level.declared.config.enter])));
    node.titled = [...node.chain].reverse().find((level) => level.declared.config.title !== undefined);
    parent?.children.push(node);
    nodes.push(node);

    for (const [childKey, child] of children) {
      visit(childKey, child, node);
    }
  };

  for (const [key, each] of roots) {
    visit(key, each, undefined);
  }

  const nested = nodes.some((node) => node.children.length > 0);
  const levels = nested ? Math.max(...nodes.map((node) => node.chain.length)) : 0;

  for (const node of nodes) {
    node.at = Object.fromEntries(Array.from({ length: levels }, (_, level) => [`l${level}`, node.chain[level]?.key ?? ""]));
  }

  // A parameter and a query key arrive as one record, so none of them may share a name, across the levels too.
  for (const node of nodes) {
    const seen = new Map<string, string>();

    for (const level of node.chain) {
      const fields = (level.declared.config.query as { readonly fields?: Readonly<Record<string, unknown>> } | undefined)?.fields;

      for (const input of [...namesIn(level.declared.pattern), ...Object.keys(fields ?? {})]) {
        const before = seen.get(input);

        if (before !== undefined) {
          fail(
            before === level.name
              ? `the route "${level.name}": "${input}" is both a path parameter and a query key; they arrive as one input, so rename one`
              : `the routes "${before}" and "${level.name}" both use "${input}" (a path parameter or a query key): the levels of one address share one input, so rename one`,
          );
        }

        seen.set(input, level.name);
      }
    }
  }

  // The router is given the flat table, one entry per route, with the parameters and query of every level merged into one Schema (a level that has none is its path's names, as strings).
  const merged = (node: Node, section: "params" | "query"): Schema.Schema<any, any> | undefined => {
    if (node.chain.length === 1) {
      return node.declared.config[section];
    }

    const parts = node.chain.flatMap((level) => {
      const own = level.declared.config[section];

      if (own !== undefined) {
        return [own];
      }

      const names = section === "params" ? namesIn(level.declared.pattern) : [];

      return names.length === 0 ? [] : [Schema.Struct(Object.fromEntries(names.map((name) => [name, Schema.String])))];
    });

    try {
      return parts.length === 0 ? undefined : (parts.reduce((all: any, part: any) => Schema.extend(all, part) as any) as Schema.Schema<any, any>);
    } catch {
      return fail(`the route "${node.name}": the \`${section}\` of its levels cannot be put together; give each as Schema.Struct({ … })`);
    }
  };

  // The router comes with the declarations (`route()` is what imports it).
  const { createRouter: make, routed, RouteDefinitionError } = roots[0]![1].router;
  let router: ReturnType<typeof createRouter>;

  try {
    router = make({
      routes: nodes.map((node) => {
        const params = merged(node, "params");
        const query = merged(node, "query");

        return routed(node.pattern, { name: node.name, ...(params === undefined ? {} : { params }), ...(query === undefined ? {} : { query }) });
      }),
    });
  } catch (error) {
    if (error instanceof RouteDefinitionError) {
      return fail(error.message);
    }

    throw error;
  }

  const byName = new Map(nodes.map((node) => [node.name, node]));
  const blank = Object.fromEntries(Array.from({ length: levels }, (_, level) => [`l${level}`, ""]));
  const match: Routing["match"] = (address) => {
    const state = router.match(address);

    return state.name === router.notFoundName
      ? undefined
      : { name: state.name, input: { ...state.query, ...state.params }, address: router.hrefOf(state), delivery: byName.get(state.name)!.delivery };
  };
  const levelOf = (node: Node): Level => ({
    key: node.key,
    name: node.name,
    ...(node.declared.config.screen === undefined ? {} : { screen: node.declared.config.screen }),
    ...(node.declared.config.index === undefined ? {} : { index: node.declared.config.index }),
    children: node.children.map(levelOf),
  });

  return {
    any: true,
    levels,
    tree: nodes.filter((node) => node.parent === undefined).map(levelOf),
    match,
    arrive: <S extends { readonly page: string }>(state: S): S & { readonly route: string } => {
      const entered = match(state.page);
      const node = entered === undefined ? undefined : byName.get(entered.name)!;
      const named = { ...state, route: node?.name ?? "", ...(nested ? { at: node?.at ?? blank } : {}) };

      if (node === undefined || entered === undefined || node.enters.length === 0) {
        return named;
      }

      // The routes of the address, outermost first, may set the application's state; which page is shown, the route, `at` and the trail are not theirs to change.
      let next: S = named;

      for (const enter of node.enters) {
        next = enter(entered.input, next) as S;
      }

      return {
        ...next,
        page: state.page,
        route: named.route,
        ...(nested ? { at: named.at } : {}),
        ...("trail" in state ? { trail: (state as any).trail, cursor: (state as any).cursor } : {}),
      };
    },
    titleOf: (address) => {
      const entered = match(address);
      const title = entered === undefined ? undefined : byName.get(entered.name)!.titled?.declared.config.title;

      return title === undefined ? undefined : typeof title === "string" ? title : title(entered!.input as never);
    },
    pages: () => {
      const addresses: Array<string> = [];
      const missing: Array<string> = [];

      for (const node of nodes) {
        const config = node.declared.config;

        // A client route has no page: the shell answers. A parent with children and no `index` has none of its own either: its leaves do (R-43).
        if (node.delivery === "client" || (node.children.length > 0 && config.index === undefined)) {
          continue;
        }

        const parametric = router.route(node.name)!.pattern.names.length > 0;

        if (!parametric) {
          addresses.push(router.href(node.name));
        } else if (config.staticParams === undefined) {
          missing.push(node.name);
        } else {
          for (const params of config.staticParams()) {
            try {
              addresses.push(router.href(node.name, params as never));
            } catch (error) {
              return fail(`the route "${node.name}": a \`staticParams\` entry does not fit its \`params\` Schema (${error instanceof Error ? error.message : String(error)})`);
            }
          }
        }
      }

      return { addresses, missing };
    },
    screens: nodes.flatMap((node) => (node.declared.config.screen === undefined ? [] : [{ route: node.name, component: node.declared.config.screen }])),
    indexes: nodes.flatMap((node) => (node.declared.config.index === undefined ? [] : [{ route: node.name, component: node.declared.config.index }])),
    list: nodes.map((node) => ({
      name: node.name,
      pattern: node.pattern,
      parameters: router.route(node.name)!.pattern.names,
      delivery: node.delivery,
      ...(node.parent === undefined ? {} : { parent: node.parent.name }),
    })),
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
    ...conflicts(routing, contentPaths).map((message) => ({
      code: "route-conflict",
      message,
    })),
    ...routing.pages().missing.map((name) => ({
      code: "route-static-params",
      message: `the route "${name}" has path parameters and no \`staticParams\`, so a build has no page to write for it (pages that only the browser renders arrive with client delivery). Add \`staticParams: () => [{ … }]\`, or run it with \`vlx dev\``,
    })),
  ];
};
