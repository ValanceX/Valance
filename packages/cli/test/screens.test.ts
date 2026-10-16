// Routes that name their screen (docs/application-model/ROUTES.md, slice 6d, statements R-23 to R-29): `<screen />` in the layout, the screen's use written from its contract.
import { Schema } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { route, component, defineApp, field } from "@valancex/common";
import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { info } from "../src/info.js";
import { plan } from "../src/init.js";
import { expandScreen, screenSource } from "../src/screens.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const ORDER_PAGE = `<div class="order-page"><para class="order">Order {orderId} ({tab}) saved {saved}</para><button class="save" pressed="false" on.click={save()}>Save</button></div>`;
const ORDER_TS = `import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./order-page.mprx";

export default component(template, {
  props: { orderId: Schema.String, tab: Schema.Literal("all", "open"), saved: Schema.Number },
  events: { save: Schema.Void },
});
`;
const SETTINGS_PAGE = `<para class="settings">Settings page</para>`;
const SETTINGS_TS = `import { component } from "@valancex/common";
import template from "./settings-page.mprx";

export default component(template, { props: {}, events: {} });
`;

/** The scaffold with two screens: an order (props from the state, an event that runs a command) and a settings page. */
const withScreens = (change: (files: Record<string, string>) => void = () => undefined): string => {
  const files: Record<string, string> = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  files["src/order-page.mprx"] = ORDER_PAGE;
  files["src/order-page.ts"] = ORDER_TS;
  files["src/settings-page.mprx"] = SETTINGS_PAGE;
  files["src/settings-page.ts"] = SETTINGS_TS;
  files["src/main.ts"] = `import { component, defineApp, field, route } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import orderPage from "./order-page.js";
import settingsPage from "./settings-page.js";
import themeToggle from "./theme-toggle.js";

export default defineApp({
  layout: component(layout),
  components: [themeToggle, orderPage, settingsPage],
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"),
    orderId: field(Schema.String, ""),
    tab: field(Schema.Literal("all", "open"), "all"),
    saved: field(Schema.Number, 0),
  },
  routes: {
    order: route("/orders/:id", {
      params: Schema.Struct({ id: Schema.String }),
      query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "open")) }),
      enter: ({ id, tab }, state) => ({ ...state, orderId: id, tab: tab ?? "all" }),
      staticParams: () => [{ id: "1" }],
      screen: orderPage,
    }),
    settings: route("/settings", { title: "Settings", screen: settingsPage }),
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
    save: command((state) => ({ ...state, saved: state.saved + 1 })),
  }),
});
`;
  files["src/layout.mprx"] = files["src/layout.mprx"]!.replace(
    '<link class="brand" href={home} current="false">{site}</link>',
    '<link class="brand" href={home} current="false">{site}</link><link class="nav-link" href="/orders/1" current="false">Order one</link>',
  );
  change(files);

  return project(files);
};

const codes = async (root: string): Promise<ReadonlyArray<string>> => (await check(root)).diagnostics.map((each) => `${each.file}:${each.code}`);

describe("screenSource (R-24, R-25, R-28)", () => {
  const orderPage = component({ mprx: "src/order-page.mprx" }, { props: { orderId: Schema.String, tab: Schema.String }, events: { save: Schema.Void, pick: Schema.String } });
  const author = defineApp({
    state: { orderId: field(Schema.String, ""), tab: field(Schema.String, "") },
    commands: (command) => ({ save: command((state) => state), pick: command((state) => state) }),
    routes: { order: route("/orders/:id", { screen: orderPage }) },
    components: [orderPage],
  });

  it("writes the use from the contract: props from the same-named scope name, events to the same-named command, `$event` when it carries a value", () => {
    expect(screenSource(author, new Map([["order-page", "src/order-page.mprx"]]))).toBe(
      '{#if route == "order"}<order-page orderId={orderId} tab={tab} on.save={save()} on.pick={pick($event)} />{:else}<blocks items={blocks} />{/if}',
    );
  });

  it("writes nothing for a target that does not draw the screen (R-28)", () => {
    expect(screenSource(author, new Map())).toBeUndefined();
    expect(screenSource(author, new Map([["order-page", "src/web/order-page.mprx"]]))).toBeUndefined(); // another file with that name
  });
});

describe("expandScreen (R-24, R-27)", () => {
  it("replaces <screen /> in the layout by the switch, or by the content when no route names a screen", () => {
    expect(expandScreen("<main><screen /></main>", true, undefined, "src/layout.mprx")).toBe("<main><blocks items={blocks} /></main>");
    expect(expandScreen("<main><screen></screen></main>", true, '{#if route == "a"}<a-b />{:else}<blocks items={blocks} />{/if}', "src/layout.mprx")).toContain("<a-b />");
    expect(expandScreen("<main/>", true, undefined, "src/layout.mprx")).toBe("<main/>");
  });

  it("refuses a layout without it when a route names a screen, and it anywhere but the layout, or with props", () => {
    expect(() => expandScreen("<main/>", true, "x", "src/layout.mprx")).toThrow("screen-unplaced");
    expect(() => expandScreen("<screen />", false, undefined, "src/card.mprx")).toThrow("screen-place");
    expect(() => expandScreen('<screen class="x" />', true, undefined, "src/layout.mprx")).toThrow("screen-props");
  });
});

describe("a project whose routes name their screens", () => {
  it("is sound, and vlx info says what each route shows", async () => {
    const root = withScreens();

    expect(await codes(root)).toEqual([]);
    expect((await info(root)).declared.map((each) => [each.name, each.screen])).toEqual([
      ["order", "order-page"],
      ["settings", "settings-page"],
    ]);
  }, 120_000);

  it("draws the screen for the route, the content for a page, and nothing in the layout says which (R-24)", async () => {
    const root = withScreens();

    await build(root);

    const order = readFileSync(join(root, "dist/web/orders/1/index.html"), "utf8");
    const settings = readFileSync(join(root, "dist/web/settings/index.html"), "utf8");
    const home = readFileSync(join(root, "dist/web/index.html"), "utf8");

    expect(order).toContain("Order 1 (all) saved 0"); // the props came from the state `enter` set
    expect(settings).toContain("Settings page");
    expect(order).not.toContain("<h1"); // no content blocks on a route
    expect(home).toContain("<h1"); // a content page: the layout's <screen /> drew the blocks
    expect(home).not.toContain("order-page");
  }, 240_000);

  it("refuses what cannot work, in the author's words (R-23, R-25, R-26, R-27)", async () => {
    const noField = withScreens((files) => {
      files["src/main.ts"] = files["src/main.ts"]!.replace("    saved: field(Schema.Number, 0),\n", "");
    });
    const noCommand = withScreens((files) => {
      files["src/main.ts"] = files["src/main.ts"]!.replace("    save: command((state) => ({ ...state, saved: state.saved + 1 })),\n", "");
    });
    const unlisted = withScreens((files) => {
      files["src/main.ts"] = files["src/main.ts"]!.replace("components: [themeToggle, orderPage, settingsPage],", "components: [themeToggle, settingsPage],");
    });
    const bare = withScreens((files) => {
      files["src/settings-page.ts"] = files["src/settings-page.ts"]!.replace("{ props: {}, events: {} }", "{}");
    });
    const unplaced = withScreens((files) => {
      files["src/layout.mprx"] = files["src/layout.mprx"]!.replace("<screen />", "<blocks items={blocks} />");
    });

    const messages = async (root: string): Promise<ReadonlyArray<string>> => (await check(root)).diagnostics.map((each) => `${each.code}: ${each.message}`);

    expect(await messages(noField)).toEqual([expect.stringContaining('screen-prop: the route "order" shows <order-page>, which declares the prop "saved"')]);
    expect(await messages(noCommand)).toEqual([expect.stringContaining('screen-event: the route "order" shows <order-page>, which raises the event "save"')]);
    expect(await messages(unlisted)).toEqual([expect.stringContaining('entry-definition: the route "order" shows <order-page>, which is not listed in `components`')]);
    expect(await messages(bare)).toEqual([expect.stringContaining("must declare both `props` and `events`")]);
    expect(await messages(unplaced)).toEqual([expect.stringContaining("screen-unplaced: a route names a screen, but the layout never writes <screen />")]);
  }, 300_000);
});

describe("in a browser (R-25)", () => {
  it("the screen's prop follows the state and its event runs the command of the same name", async () => {
    const root = withScreens();

    await build(root);

    const dist = join(root, "dist/web");
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
    const server = createServer((request, response) => {
      const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
      const file = [join(dist, path), join(dist, path, "index.html")].find((each) => existsSync(each) && /\.[a-z0-9]+$/.test(each));

      response.statusCode = file === undefined ? 404 : 200;
      response.setHeader("content-type", types[(file ?? "x.html").slice((file ?? "x.html").lastIndexOf("."))] ?? "application/octet-stream");
      response.end(readFileSync(file ?? join(dist, "404.html")));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.click('a[href="/orders/1"]'); // in place: a link to a declared address
      await page.waitForSelector("p.order");
      expect(await page.textContent("p.order")).toBe("Order 1 (all) saved 0");
      await page.click("button.save");
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "Order 1 (all) saved 1");
      await page.click("button.save");
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "Order 1 (all) saved 2");
    } finally {
      await browser.close();
      server.close();
    }
  }, 240_000);
});
