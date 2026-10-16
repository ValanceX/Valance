// The declared-route engine on its own (docs/application-model/ROUTES.md): matching, the canonical address, entering, titles, the pages a build writes, and the scope a layout reads.
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { redirect, route } from "../src/routing.js";
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

describe("load (R-50 to R-55)", () => {
  const load = {
    begin: (input: { id: string }, state: any) => ({ ...state, order: `loading ${input.id}` }),
    work: async () => "x",
    settle: (_outcome: unknown, _input: unknown, state: any) => state,
  };
  const withLoad = () =>
    routingOf({
      order: route("/orders/:id", { params: Schema.Struct({ id: Schema.String }), enter: ({ id }, state) => ({ ...state, order: `entered ${id}` }), load }),
      home: route("/"),
    });

  it("`begin` is part of the entry, after `enter`, so every way of entering shows the loading state (R-51)", () => {
    const state = withLoad().arrive({ page: "/orders/7", route: "" } as never) as Record<string, unknown>;

    expect(state["order"]).toBe("loading 7");
    expect((withLoad().arrive({ page: "/", route: "" } as never) as Record<string, unknown>)["order"]).toBeUndefined();
  });

  it("names the loads of an address, outermost level first, with the merged input (R-52)", () => {
    const routing = routingOf({
      shop: route("/shop/:shop", {
        load: { work: async () => 1, settle: (_o, _i, s) => s },
        children: { item: route("/:id", { load: { work: async () => 2, settle: (_o, _i, s) => s } }) },
      }),
    });

    expect(routing.loads("/shop/a/b").map((each) => [each.route, each.input])).toEqual([
      ["shop", { shop: "a", id: "b" }],
      ["shop.item", { shop: "a", id: "b" }],
    ]);
    expect(routing.loads("/nowhere")).toEqual([]);
    expect(withLoad().hasLoad).toBe(true);
    expect(routingOf({ home: route("/") }).hasLoad).toBe(false);
  });

  it("refuses a load that is not { work, settle }", () => {
    expect(() => routingOf({ a: route("/a", { load: { work: 1 } as never }) })).toThrow("`load` is { work, settle }");
  });
});

describe("guards, redirects and leaving (R-60 to R-64)", () => {
  const run = <A>(effect: import("effect").Effect.Effect<A>): Promise<A> => import("effect").then(({ Effect }) => Effect.runPromise(effect));
  const guarded = (extra: Record<string, unknown> = {}) =>
    routingOf({
      home: route("/"),
      login: route("/login"),
      account: route("/account", {
        canActivate: ({ state }: any) => (state.signedIn ? true : redirect("login")),
        canDeactivate: ({ state }: any) => !state.dirty,
        children: { profile: route("/profile", extra), security: route("/security") },
      }),
      old: route("/old", { redirectTo: redirect("account") }),
    });

  it("canActivate lets through, refuses or redirects to a route's address (R-60, R-61)", async () => {
    const routing = guarded();

    expect(await run(routing.decide("/", "/account", { signedIn: true }, "programmatic"))).toBe("/account");
    expect(await run(routing.decide("/", "/account", { signedIn: false }, "programmatic"))).toBe("/login");
    expect(await run(routing.decide("/", "/login", { signedIn: false }, "programmatic"))).toBe("/login");
  });

  it("canDeactivate stops leaving, for another route and not for a move inside (R-61, R-62)", async () => {
    const routing = guarded();
    const dirty = { signedIn: true, dirty: true };

    expect(await run(routing.decide("/account/profile", "/", dirty, "history"))).toBeUndefined();
    expect(await run(routing.decide("/account/profile", "/", { signedIn: true, dirty: false }, "history"))).toBe("/");
    expect(await run(routing.decide("/account/profile", "/account/security", dirty, "programmatic"))).toBe("/account/security"); // the parent is not left
    expect(await run(routing.decide("/account/profile", "/account/profile", dirty, "programmatic"))).toBe("/account/profile");
  });

  it("a parent's canActivate is asked when entering the parent, not when moving between its children (R-62)", async () => {
    const asked: Array<string> = [];
    const routing = routingOf({
      home: route("/"),
      area: route("/area", {
        canActivate: () => (asked.push("area"), true),
        children: { a: route("/a", { canActivate: () => (asked.push("a"), true) }), b: route("/b", { canActivate: () => (asked.push("b"), true) }) },
      }),
    });

    await run(routing.decide("/", "/area/a", {}, "programmatic"));
    expect(asked).toEqual(["area", "a"]); // outermost first
    asked.length = 0;
    await run(routing.decide("/area/a", "/area/b", {}, "programmatic"));
    expect(asked).toEqual(["b"]);
  });

  it("a guard that fails or throws refuses, and one may answer later (R-60)", async () => {
    const routing = routingOf({
      home: route("/"),
      slow: route("/slow", { canActivate: async () => true }),
      bad: route("/bad", {
        canActivate: () => {
          throw new Error("no");
        },
      }),
    });

    expect(await run(routing.decide("/", "/slow", {}, "programmatic"))).toBe("/slow");
    expect(await run(routing.decide("/", "/bad", {}, "programmatic"))).toBeUndefined();
  });

  it("an alias leads to its target, has no page, and is written for a host (R-63)", () => {
    const routing = guarded();

    expect(routing.match("/old")).toMatchObject({ name: "account", address: "/account" });
    expect(routing.alias("/old")).toBe("/account");
    expect(routing.alias("/account")).toBeUndefined();
    expect(routing.pages().addresses).not.toContain("/old");
    expect(routing.redirects).toEqual([{ from: "/old", to: "/account" }]);
    expect(routing.list.find((each) => each.name === "old")!.has).toEqual(["redirectTo"]);
  });

  it("an alias shows nothing of its own, and its target must be a route", () => {
    expect(() => routingOf({ a: route("/a", { redirectTo: redirect("b"), load: { work: async () => 1, settle: (_o, _i, s) => s } }), b: route("/b") })).toThrow(
      "redirects, so it shows nothing",
    );
    expect(() => routingOf({ a: route("/a", { redirectTo: redirect("nowhere") }) })).toThrow("not a route");
  });

  it("leaving a closing page: a guard that answers false at once blocks, one that waits cannot (R-64)", async () => {
    const routing = routingOf({
      form: route("/form", { canDeactivate: ({ state }: any) => !state.dirty }),
      later: route("/later", { canDeactivate: async () => false }),
      eff: route("/eff", { canDeactivate: () => import("effect").then(() => false) as never }),
    });

    expect(routing.leaveBlocked({ page: "/form", dirty: true } as never)).toBe(true);
    expect(routing.leaveBlocked({ page: "/form", dirty: false } as never)).toBe(false);
    expect(routing.leaveBlocked({ page: "/later" } as never)).toBe(false); // a Promise cannot hold a closing page
    expect(await run(routing.mayLeave({ page: "/later" }))).toBe(false); // a window can wait
    expect(await run(routing.mayLeave({ page: "/" }))).toBe(true);
  });
});

describe("a move inside a level is not an entry to it (R-52 amended)", () => {
  const make = () =>
    routingOf({
      orders: route("/orders", {
        query: Schema.Struct({ status: Schema.optional(Schema.String) }),
        load: { begin: (_i, s: any) => ({ ...s, list: "loading" }), work: async () => 1, settle: (_o, _i, s) => s },
        children: {
          detail: route("/:id", {
            params: Schema.Struct({ id: Schema.String }),
            load: { begin: (_i, s: any) => ({ ...s, one: "loading" }), work: async () => 2, settle: (_o, _i, s) => s },
          }),
        },
      }),
      home: route("/"),
    });

  it("a move between children starts only the child's load, and does not reset the parent's state to loading", () => {
    const routing = make();
    const state = { page: "/orders/2", route: "", list: "ready", one: "ready" } as never;
    const after = routing.arrive(state, "/orders/1") as unknown as Record<string, unknown>;

    expect(after["one"]).toBe("loading");
    expect(after["list"]).toBe("ready");
    expect(routing.loads("/orders/2", "/orders/1").map((each) => each.route)).toEqual(["orders.detail"]);
  });

  it("entering from outside, a change of the parent's own query, and a first state start every level", () => {
    const routing = make();

    expect(routing.loads("/orders/2", "/").map((each) => each.route)).toEqual(["orders", "orders.detail"]);
    expect(routing.loads("/orders/2").map((each) => each.route)).toEqual(["orders", "orders.detail"]);
    expect(routing.loads("/orders?status=paid", "/orders").map((each) => each.route)).toEqual(["orders"]);
    expect(routing.loads("/orders/2?status=paid", "/orders/2").map((each) => each.route)).toEqual(["orders"]); // the child's own input is the same
  });

  it("a result is still wanted while the level is shown with the same input, and not after it is left", () => {
    const [list] = make().loads("/orders", "/");

    expect(list!.stillAt("/orders/2")).toBe(true); // the list was asked for, and an order was opened beside it
    expect(list!.stillAt("/orders?status=paid")).toBe(false);
    expect(list!.stillAt("/")).toBe(false);
  });
});
