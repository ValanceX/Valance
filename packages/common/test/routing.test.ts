// The declared-route engine on its own (docs/application-model/ROUTES.md): matching, the canonical address, entering, titles, the pages a build writes, and the scope a layout reads.
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { route } from "../src/routing.js";
import { conflicts, routeProblems, routingOf } from "../src/routing-engine.js";
import { frame } from "../src/scope.js";
import type { Content } from "../src/model.js";

const order = route("/orders/:id", {
  params: Schema.Struct({ id: Schema.String }),
  query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "open")) }),
  title: ({ id }) => `Order ${id}`,
  enter: ({ id, tab }, state) => ({ ...state, orderId: id, tab: tab ?? "all" }),
  staticParams: () => [{ id: "1" }, { id: "b c" }],
});

describe("routingOf", () => {
  const routing = routingOf({ order, settings: route("/settings", { title: "Settings" }) });

  it("matches an address to a route and writes the canonical address (R-6)", () => {
    expect(routing.match("/orders/42?tab=open")).toEqual({ name: "order", input: { tab: "open", id: "42" }, address: "/orders/42?tab=open", delivery: "static" });
    expect(routing.match("/orders/42/")?.address).toBe("/orders/42");
    expect(routing.match("/orders/a%20b")?.input).toEqual({ id: "a b" });
    expect(routing.match("/orders/42?tab=nope")).toBeUndefined(); // fails its Schema: not this route (R-8)
    expect(routing.match("/nowhere")).toBeUndefined();
  });

  it("enters: sets `route`, runs `enter`, and leaves `page` and the trail alone (R-8)", () => {
    expect(routing.arrive({ page: "/orders/7?tab=open", trail: ["/"], cursor: 0 })).toMatchObject({
      route: "order",
      orderId: "7",
      tab: "open",
      page: "/orders/7?tab=open",
      trail: ["/"],
    });
    expect(routing.arrive({ page: "/guide/a" })).toEqual({ page: "/guide/a", route: "" });
  });

  it("titles from a string or a function of the input (R-12)", () => {
    expect(routing.titleOf("/orders/9")).toBe("Order 9");
    expect(routing.titleOf("/settings")).toBe("Settings");
    expect(routing.titleOf("/guide/a")).toBeUndefined();
  });

  it("a client route has no pages and is not missing staticParams; one with staticParams is refused (R-33, R-36)", () => {
    const client = routingOf({ order: route("/orders/:id", { delivery: "client" }), home: route("/home") });

    expect(client.pages()).toEqual({ addresses: ["/home"], missing: [] });
    expect(client.match("/orders/9")?.delivery).toBe("client");
    expect(client.match("/home")?.delivery).toBe("static");
    expect(client.list.map((each) => each.delivery)).toEqual(["client", "static"]);
    expect(() => routingOf({ order: route("/orders/:id", { delivery: "client", staticParams: () => [{ id: "1" }] }) })).toThrow("has `staticParams`");
    expect(() => routingOf({ order: route("/orders/:id", { delivery: "server" as never }) })).toThrow('"static" or "client"');
  });

  it("lists the pages a build writes: one for a route without parameters, one per staticParams entry, encoded (R-14)", () => {
    expect(routing.pages()).toEqual({ addresses: ["/orders/1", "/orders/b%20c", "/settings"], missing: [] });
    expect(routingOf({ order: route("/orders/:id") }).pages()).toEqual({ addresses: [], missing: ["order"] });
  });

  it("refuses an address that is also a content page (R-4)", () => {
    expect(conflicts(routing, ["/", "/guide/a"])).toEqual([]);
    expect(conflicts(routing, ["/settings"])[0]).toContain('the route "settings" matches /settings, which is a content page (content/settings.md)');
    expect(routeProblems({ routes: { order: route("/orders/:id") } }, []).map((each) => each.code)).toEqual(["route-static-params"]);
  });

  it("declares nothing when there are no routes, and says so", () => {
    expect(routingOf(undefined).any).toBe(false);
    expect(routingOf({}).match("/settings")).toBeUndefined();
  });
});

const content: Content = {
  site: { name: "Site", base: "/", url: "", title: "{page} · {site}", api: "", announce: true, trailingSlash: "never" },
  pages: [
    {
      path: "/",
      file: "content/index.md",
      title: "Home",
      description: "d",
      order: 1,
      section: "",
      blocks: [{ id: "b0", kind: "paragraph", level: 0, anchor: "", spans: [], items: [], ordered: false, lang: "", text: "", src: "", alt: "" }],
      outline: [{ id: "h", label: "H", anchor: "h", level: 2 }],
    },
    { path: "/a", file: "content/a.md", title: "A", description: "", order: 2, section: "", blocks: [], outline: [] },
  ],
};

describe("what a layout reads on a declared route (R-7, R-11)", () => {
  it("is found, titled by the route, with no blocks, no outline, no neighbours, and the content's navigation unmarked", () => {
    const scope = frame(content, "/orders/1", "expanded", "light", undefined, { name: "order", title: "Order 1" });

    expect(scope).toMatchObject({ route: "order", found: true, title: "Order 1", description: "", blocks: [], hasToc: false, toc: [], prev: { href: "" }, next: { href: "" } });
    expect(scope.sections[0]!.items.map((item) => item.current)).toEqual(["false", "false"]);
  });

  it("is unchanged for a content page and for the not-found page, with `route` empty", () => {
    expect(frame(content, "/")).toMatchObject({ route: "", found: true, title: "Home", hasToc: true });
    expect(frame(content, "/nowhere")).toMatchObject({ route: "", found: false });
  });
});

describe("route is typed by its Schemas (R-3)", () => {
  it("gives enter, title and staticParams the decoded parameters and query", () => {
    const typed = route("/orders/:id", {
      params: Schema.Struct({ id: Schema.NumberFromString }),
      query: Schema.Struct({ page: Schema.optional(Schema.NumberFromString) }),
      title: ({ id, page }) => `Order ${id.toFixed(0)} ${page === undefined ? "" : page.toFixed(0)}`,
      enter: ({ id }, state) => ({ ...state, n: id + 1 }),
      staticParams: () => [{ id: 1 }],
    });

    // @ts-expect-error `id` decodes to a number, not a string
    route("/orders/:id", { params: Schema.Struct({ id: Schema.NumberFromString }), enter: ({ id }, state) => ({ ...state, n: id.toUpperCase() }) });
    // @ts-expect-error a staticParams entry is what `params` decodes to
    route("/orders/:id", { params: Schema.Struct({ id: Schema.NumberFromString }), staticParams: () => [{ id: "1" }] });

    expect(routingOf({ typed }).match("/orders/7?page=2")?.input).toEqual({ id: 7, page: 2 });
    expect(routingOf({ typed }).pages().addresses).toEqual(["/orders/1"]);
  });
});

describe("how a page's address is written (trailingSlash)", () => {
  it("names one form per page: never strips the slash, always adds it, the root and files are left alone, the query and fragment stay", async () => {
    const { pageUrl, shaped } = await import("../src/url.js");

    expect(shaped("/guide/a/", "never")).toBe("/guide/a");
    expect(shaped("/guide/a", "always")).toBe("/guide/a/");
    expect(shaped("/orders/42?tab=open", "always")).toBe("/orders/42/?tab=open");
    expect(shaped("/orders/42/?tab=open#x", "never")).toBe("/orders/42?tab=open#x");
    expect(shaped("/", "always")).toBe("/");
    expect(shaped("//", "never")).toBe("/");
    expect(shaped("/files/a.txt", "always")).toBe("/files/a.txt"); // a file is not a page
    expect(pageUrl("/docs/", "/guide/a", "always")).toBe("/docs/guide/a/");
    expect(pageUrl("/docs/", "/", "always")).toBe("/docs/");
    expect(pageUrl("/", "/guide/a", "never")).toBe("/guide/a");
  });
});

describe("nested routes (R-39 to R-45)", () => {
  const calls: Array<string> = [];
  const shell = { template: { mprx: "src/a.mprx" }, props: {}, events: {}, [Symbol.for("valancex.common.component")]: true } as never;
  const tree = () => ({
    shop: route("/shop/:shop", {
      params: Schema.Struct({ shop: Schema.String }),
      title: ({ shop }) => `Shop ${shop}`,
      enter: ({ shop }, state) => (calls.push("shop"), { ...state, shopId: shop }),
      children: {
        orders: route("/orders", {
          enter: (_, state) => (calls.push("orders"), { ...state, area: "orders" }),
          children: {
            one: route("/:id", {
              params: Schema.Struct({ id: Schema.NumberFromString }),
              query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "open")) }),
              title: ({ id }) => `Order ${id}`,
              enter: ({ id, tab }, state) => (calls.push("one"), { ...state, orderId: id, tab: tab ?? "all" }),
              staticParams: () => [{ shop: "a", id: 1 }],
            }),
          },
        }),
        settings: route("/settings", { staticParams: undefined as never }),
      },
    }),
    home: route("/"),
  });

  it("names the leaf with dots, appends the patterns, and gives every level's parameters and query to enter as one input (R-39)", () => {
    const routing = routingOf(tree());
    const entered = routing.match("/shop/a/orders/7?tab=open");

    expect(entered).toMatchObject({ name: "shop.orders.one", input: { shop: "a", id: 7, tab: "open" }, address: "/shop/a/orders/7?tab=open" });
    expect(routing.list.map((each) => `${each.name} ${each.pattern}${each.parent === undefined ? "" : ` < ${each.parent}`}`)).toEqual(
      [
        "shop /shop/:shop",
        "shop.orders /shop/:shop/orders < shop",
        "shop.orders.one /shop/:shop/orders/:id < shop.orders",
        "shop.settings /shop/:shop/settings < shop",
        "home / ",
      ].map((line) => line.trimEnd()),
    );
    expect(routing.match("/shop/a/orders/x")).toBeUndefined(); // a level's Schema still refuses
  });

  it("enters the levels outermost first, on the same state, and the deepest title wins (R-42)", () => {
    const routing = routingOf(tree());

    calls.length = 0;

    const state = routing.arrive({ page: "/shop/a/orders/7", route: "" } as never) as Record<string, unknown>;

    expect(calls).toEqual(["shop", "orders", "one"]);
    expect(state).toMatchObject({ route: "shop.orders.one", shopId: "a", area: "orders", orderId: 7, tab: "all" });
    expect(routing.titleOf("/shop/a/orders/7")).toBe("Order 7");
    expect(routing.titleOf("/shop/a/orders")).toBe("Shop a"); // no title of its own: the nearest above
    expect(routing.titleOf("/shop/a/settings")).toBe("Shop a");
  });

  it("says which child is shown at each level in `at`, one field per level, and not at all when no route nests (R-44)", () => {
    const routing = routingOf(tree());
    const at = (page: string) => (routing.arrive({ page, route: "" } as never) as { at: unknown }).at;

    expect(routing.levels).toBe(3);
    expect(at("/shop/a/orders/7")).toEqual({ l0: "shop", l1: "orders", l2: "one" });
    expect(at("/shop/a/orders")).toEqual({ l0: "shop", l1: "orders", l2: "" });
    expect(at("/shop/a/settings")).toEqual({ l0: "shop", l1: "settings", l2: "" });
    expect(at("/")).toEqual({ l0: "home", l1: "", l2: "" });
    expect(at("/nowhere")).toEqual({ l0: "", l1: "", l2: "" });
    expect(routingOf({ order }).levels).toBe(0);
    expect(routingOf({ order }).arrive({ page: "/orders/1", route: "" } as never)).not.toHaveProperty("at");
  });

  it("the leaves have pages; a parent has one only with an index; staticParams is the leaf's whole set (R-43)", () => {
    const routing = routingOf({
      shop: route("/shop", { children: { all: route("/all"), one: route("/:id", { staticParams: () => [{ id: "1" }] }) } }),
      help: route("/help", { index: shell, children: { faq: route("/faq") } }),
    });

    expect(routing.pages()).toEqual({ addresses: ["/shop/all", "/shop/1", "/help", "/help/faq"], missing: [] });
    expect(routing.indexes.map((each) => each.route)).toEqual(["help"]);
  });

  it("refuses what cannot work: a clash of inputs across levels, staticParams on a parent, an index without children, a rest segment above a child (R-39, R-43)", () => {
    const clash = () => routingOf({ a: route("/a/:id", { children: { b: route("/b/:id") } }) });
    const query = () => routingOf({ a: route("/a", { query: Schema.Struct({ id: Schema.String }), children: { b: route("/b/:id") } }) });
    const parent = () => routingOf({ a: route("/a", { staticParams: () => [{}], children: { b: route("/b") } }) });
    const index = () => routingOf({ a: route("/a", { index: shell }) });
    const rest = () => routingOf({ a: route("/a/*path", { children: { b: route("/b") } }) });
    const dotted = () => routingOf({ a: route("/a", { children: { "b.c": route("/b") } }) });
    const slash = () => routingOf({ a: route("/a", { children: { b: route("b" as never) } }) });

    expect(clash).toThrow('"a" and "a.b" both use "id"');
    expect(query).toThrow('"a" and "a.b" both use "id"');
    expect(parent).toThrow("has children and `staticParams`");
    expect(index).toThrow("has an `index` and no `children`");
    expect(rest).toThrow("ends in a rest segment");
    expect(dotted).toThrow('the route name "b.c"');
    expect(slash).toThrow('must start with "/"');
  });

  it("reads the tree once: entering, matching and titling touch no `children` again, and run each level's enter once (R-45)", () => {
    let reads = 0;
    const deep = (level: number): Record<string, ReturnType<typeof route>> =>
      level === 0
        ? {}
        : Object.fromEntries(
            ["a", "b", "c", "d"].map((key) => {
              const config = { enter: (_: unknown, state: unknown) => (calls.push(`${key}${level}`), state) } as Record<string, unknown>;

              Object.defineProperty(config, "children", { enumerable: true, get: () => (reads++, deep(level - 1)) });

              return [key, route(`/${key}`, config as never)];
            }),
          );

    const routing = routingOf({ root: route("/r", { children: deep(3) }) });
    const found = reads;

    expect(found).toBeGreaterThan(0); // the tree was read, once, to flatten it
    calls.length = 0;

    for (let n = 0; n < 50; n++) {
      routing.arrive({ page: "/r/a/a/a", route: "" } as never);
      routing.match("/r/a/a/a");
      routing.titleOf("/r/a/a/a");
    }

    expect(reads).toBe(found); // not read again
    expect(calls.length).toBe(50 * 3); // each of the three levels' enter, once per entry, not once per route in the tree
  });
});
