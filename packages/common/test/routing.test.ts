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
    expect(routing.match("/orders/42?tab=open")).toEqual({ name: "order", input: { tab: "open", id: "42" }, address: "/orders/42?tab=open" });
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
  site: { name: "Site", base: "/", url: "", title: "{page} · {site}", api: "", announce: true },
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
