// The BUILT site, end to end, on the development branches of MESH and PORT: `pnpm build` (content, vite, tsc), the server (web/serve.ts) over node:http, and real Chromium. The page is
// server rendered through the layout's slot, takes over without a second document load, navigates by links, keeps the title in step, Back restores, and the copy button's composite
// event travels code-block → block → page to a command, whose state the page then shows.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

import { readGeneratedSite } from "../web/document.js";
import { exportSite } from "../web/export.js";
import { builtAssets, serveSsr, serveStatic } from "../web/serve.js";

let served: Awaited<ReturnType<typeof serveStatic>>;
let browser: Browser;

beforeAll(async () => {
  execFileSync("pnpm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe", env: { ...process.env, SITE: "docs" } });
  served = await serveStatic(join(process.cwd(), "dist", "docs"));
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => { served.server.close(() => { resolve(); }); });
});

it("serves a rendered document, and a 404 with the application's own page for an unknown path", async () => {
  const html = await (await fetch(`${served.origin}/docs/guides/state`)).text();

  expect(html).toContain("<title>State · Valance</title>");
  expect(html).toContain("Commands are the only way to change it.");

  const missing = await fetch(`${served.origin}/docs/nope`);

  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain("There is no such page.");
});

it("links one hashed stylesheet in the head before the page, serves it as CSS a reader can keep, and says 404 for an asset that is not there", async () => {
  const html = await (await fetch(`${served.origin}/docs/guides/state`)).text();
  const href = /<link rel="stylesheet" href="([^"]+)"/.exec(html)?.[1];

  expect(href).toMatch(/^\/assets\/page-[\w-]+\.css$/);
  expect(html.indexOf('rel="stylesheet"')).toBeLessThan(html.indexOf('<div id="app">'));
  expect(html).not.toContain("<style>");

  const sheet = await fetch(`${served.origin}${href}`);

  expect(sheet.status).toBe(200);
  expect(sheet.headers.get("content-type")).toContain("text/css");
  expect(sheet.headers.get("cache-control")).toContain("immutable");
  expect((await fetch(`${served.origin}/assets/nothing-here.js`)).status).toBe(404);
});

/** What the server draws for `path`, parsed and written by the browser itself, to compare with what the page holds after the client has drawn it in place. */
const sameAsServer = async (page: import("playwright").Page, path: string): Promise<boolean> => {
  const document = await (await fetch(`${served.origin}${path}`)).text();
  const server = /<div id="app">([\s\S]*)<\/div><script id="valance-boot"/.exec(document)?.[1] ?? "";

  // Node by node, not text by text: the server writes a tag's attributes in sorted order and a node the client draws gets them in the order of its props, which is the same node.
  return page.evaluate((html) => {
    const parsed = window.document.createElement("div");

    parsed.innerHTML = html;

    const drawn = [...window.document.querySelector("#app")!.childNodes];
    const written = [...parsed.childNodes];

    return drawn.length === written.length && written.every((node, at) => node.isEqualNode(drawn[at]!));
  }, server);
};

const ready = async (browser: Browser, path: string, viewport?: { width: number; height: number }, clipboard = false) => {
  const context = await browser.newContext(viewport === undefined ? {} : { viewport });

  // A browser lets a page write the clipboard when the reader allowed it: a test reader allows it only when the test is about copying.
  if (clipboard) { await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: served.origin }); }

  const page = await context.newPage();
  const failures: Array<string> = [];

  page.on("pageerror", (error) => { failures.push(error.message); });
  page.on("console", (message) => { if (message.type() === "error") { failures.push(message.text()); } });
  await page.goto(`${served.origin}${path}`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");

  return { page, failures };
};

it("hydrates, navigates by links, keeps the title and the head, Back restores, and the copy button's event reaches its command", async () => {
  const { page, failures } = await ready(browser, "/docs/guides/getting-started", undefined, true);
  const documents: Array<string> = [];

  page.on("request", (request) => { if (request.resourceType() === "document") { documents.push(new URL(request.url()).pathname); } });
  expect(await page.title()).toBe("Getting Started · Valance");

  // the composite event, through real DOM events after hydration
  expect(await page.getByRole("button", { name: "Copy", exact: true }).count()).toBe(4);   // the install alternatives, and three examples
  await page.getByRole("button", { name: "Copy", exact: true }).first().click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Copied", exact: true }).count()).toBe(1);

  // a plain click on a link is navigation inside the page: no new document, the URL, the title and the head follow, and the copied mark is cleared by `go`
  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "State", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state");
  expect(await page.title()).toBe("State · Valance");
  expect(await page.getByRole("heading", { name: "State", exact: true }).count()).toBe(1);
  await page.waitForFunction(() => document.querySelector('link[rel="canonical"]')?.getAttribute("href") === "/docs/guides/state");
  expect(await page.locator('meta[name="description"]').getAttribute("content")).toContain("State is one value");
  expect(await page.locator('link[rel="stylesheet"]').count()).toBe(1);                   // the head the client keeps still links the style the server linked
  expect(await page.locator("[data-valance-head]").count()).toBe(5);                      // 3 metas, the canonical link and the stylesheet: replaced, never accumulated
  expect(await sameAsServer(page, "/docs/guides/state")).toBe(true);                      // patched in place, the page is what a fresh render of the state draws
  expect(await page.getByRole("link", { name: "State", exact: true }).first().getAttribute("aria-current")).toBe("page");

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/docs/guides/getting-started");
  expect(await page.title()).toBe("Getting Started · Valance");
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("/docs/guides/getting-started");
  expect(await page.getByRole("button", { name: "Copied", exact: true }).count()).toBe(0);   // back on the page, the mark is gone
  expect(await page.getByRole("button", { name: "Copy", exact: true }).count()).toBe(4);
  expect(await sameAsServer(page, "/docs/guides/getting-started")).toBe(true);

  expect(failures).toEqual([]);
  expect(documents).toEqual([]);                                                          // no document was loaded after the first: everything after was in place
});

it("headings link to themselves, the table of contents scrolls to them, and the address keeps the fragment", async () => {
  const { page, failures } = await ready(browser, "/docs/guides/state", { width: 1280, height: 700 });

  await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Ending" }).click();
  await page.waitForFunction(() => location.hash === "#ending");
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => { const top = document.getElementById("ending")!.getBoundingClientRect().top; return top >= 56 && top < innerHeight; })).toBe(true);   // the heading is in view, below the sticky bar
  expect(new URL(page.url()).pathname).toBe("/docs/guides/state");                                                                     // the same document: a fragment is not a navigation

  await page.getByRole("link", { name: "Link to this section" }).first().focus();
  expect(await page.getByRole("link", { name: "Link to this section" }).first().evaluate((link) => getComputedStyle(link).opacity)).toBe("1");   // a link that appears on hover appears on focus too
  expect(failures).toEqual([]);
});

it("a code group shows one alternative, the choice is remembered across pages, and the copy button follows the alternative", async () => {
  const { page, failures } = await ready(browser, "/docs/guides/getting-started", undefined, true);
  const shown = () => page.locator('[role="tabpanel"]').innerText();

  expect(await shown()).toContain("npm install");
  expect(await page.getByRole("tab", { name: "npm", exact: true }).getAttribute("aria-selected")).toBe("true");

  await page.getByRole("tab", { name: "pnpm", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="tabpanel"]')?.textContent?.includes("pnpm add") === true);
  expect(await page.getByRole("tab", { name: "pnpm", exact: true }).getAttribute("aria-selected")).toBe("true");
  expect(await page.getByRole("tab", { name: "npm", exact: true }).getAttribute("aria-selected")).toBe("false");
  expect(await page.locator('[role="tabpanel"]').count()).toBe(1);

  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "State", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state");
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/docs/guides/getting-started");
  expect(await page.getByRole("tab", { name: "pnpm", exact: true }).getAttribute("aria-selected")).toBe("true");   // the choice is state, so it survives moving on and back

  await page.locator('[role="tabpanel"]').getByRole("button", { name: "Copy" }).click();
  await page.locator('[role="tabpanel"]').getByRole("button", { name: "Copied" }).waitFor();
  await page.getByRole("tab", { name: "yarn", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="tabpanel"]')?.textContent?.includes("yarn add") === true);
  expect(await page.locator('[role="tabpanel"]').getByRole("button", { name: "Copy", exact: true }).count()).toBe(1);   // the copied mark belonged to the pnpm alternative
  expect(failures).toEqual([]);
});

it("code is highlighted by the stylesheet: tokens have their own colours, and tables and lists are drawn", async () => {
  const { page } = await ready(browser, "/docs/guides/state", { width: 1280, height: 800 });
  const colours = await page.evaluate(() => {
    const colour = (selector: string) => getComputedStyle(document.querySelector(selector)!).color;

    return { keyword: colour("pre .tok-keyword"), string: colour("pre .tok-string"), plain: colour("pre") };
  });

  expect(new Set([colours.keyword, colours.string, colours.plain]).size).toBe(3);
  expect(await page.locator("table.table thead th").count()).toBe(4);
  expect(await page.locator("ul.list > li").count()).toBeGreaterThan(2);
  expect(await page.locator("ul.sublist > li").count()).toBe(2);
});

it("is styled: the stylesheet applies, with the layout the stylesheet describes", async () => {
  const { page, failures } = await ready(browser, "/docs/introduction", { width: 1280, height: 800 });
  const style = await page.evaluate(() => {
    const css = (selector: string, property: string) => getComputedStyle(document.querySelector(selector)!).getPropertyValue(property);

    return {
      sheets: document.styleSheets.length,
      shell: css(".shell", "display"),
      bar: css(".bar", "position"),
      sidebar: css(".sidebar", "display"),
      menuButton: css(".menu-button", "display"),
      font: css(".shell", "font-family"),
      h1: css("main h1", "font-size"),
      columns: css(".frame", "grid-template-columns").split(" ").length,
      toc: css(".toc", "display"),
    };
  });

  expect(style.sheets).toBeGreaterThan(0);
  expect(style).toMatchObject({ shell: "flex", bar: "sticky", sidebar: "block", menuButton: "none", h1: "36px", columns: 3, toc: "block" });
  expect(style.font).toContain("system-ui");
  expect(failures).toEqual([]);
});

it("switches theme by its buttons: the shell says which, the colours change, and the choice survives moving to another page", async () => {
  const { page } = await ready(browser, "/docs/introduction", { width: 1280, height: 800 });
  const background = () => page.evaluate(() => getComputedStyle(document.querySelector(".shell")!).backgroundColor);

  await page.emulateMedia({ colorScheme: "light" });
  expect(await page.locator(".shell").getAttribute("data-theme")).toBe("system");
  const system = await background();

  await page.getByRole("button", { name: "Use the dark theme" }).click();
  await page.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-theme") === "dark");
  const dark = await background();

  expect(dark).not.toBe(system);
  expect(await page.getByRole("button", { name: "Use the dark theme" }).getAttribute("aria-pressed")).toBe("true");
  expect(await page.getByRole("button", { name: "Use the light theme" }).getAttribute("aria-pressed")).toBe("false");

  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "State", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state");
  expect(await background()).toBe(dark);

  await page.getByRole("button", { name: "Use the light theme" }).click();
  await page.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-theme") === "light");
  expect(await background()).toBe(system);                                                // light is what the system gave, in a light scheme

  await page.getByRole("button", { name: "Follow the system theme" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-theme") === "system");
  expect(await background()).toBe(dark);                                                  // system follows the reader's setting
});

it("on a small screen the navigation is behind the menu button, which opens it, and moving to a page closes it", async () => {
  const { page, failures } = await ready(browser, "/docs/introduction", { width: 390, height: 780 });
  const sidebar = () => page.evaluate(() => getComputedStyle(document.querySelector(".sidebar")!).display);

  expect(await sidebar()).toBe("none");
  expect(await page.getByRole("button", { name: "Navigation" }).getAttribute("aria-pressed")).toBe("false");

  await page.getByRole("button", { name: "Navigation" }).click();
  await page.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-menu") === "true");
  expect(await sidebar()).toBe("block");
  expect(await page.getByRole("button", { name: "Navigation" }).getAttribute("aria-pressed")).toBe("true");

  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Getting Started", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/getting-started");
  expect(await sidebar()).toBe("none");
  expect(failures).toEqual([]);
});

// ---- what the platform gives: the clipboard, the store, the search index; and what the reader's scrolling and links do ------------------------------------------------------

it("copies to the real clipboard, and says Copied only then", async () => {
  const context = await browser.newContext();

  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: served.origin });

  const page = await context.newPage();

  await page.goto(`${served.origin}/docs/guides/getting-started`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  await page.getByRole("tab", { name: "pnpm", exact: true }).click();
  await page.locator('[role="tabpanel"]').getByRole("button", { name: "Copy", exact: true }).click();
  await page.locator('[role="tabpanel"]').getByRole("button", { name: "Copied", exact: true }).waitFor();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("pnpm add @valancex/valance");
  await context.close();
});

it("a browser with no clipboard gets Failed, not a Copied that did not happen", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: undefined }); });
  await page.goto(`${served.origin}/docs/guides/getting-started`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  await page.getByRole("button", { name: "Copy", exact: true }).first().click();
  await page.getByRole("button", { name: "Failed", exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Copied", exact: true }).count()).toBe(0);
  await context.close();
});

it("searches the site: results as you type, a result goes to its section and clears the search, and nothing found says so", async () => {
  const { page, failures } = await ready(browser, "/docs/introduction", { width: 1280, height: 800 });
  const documents: Array<string> = [];

  page.on("request", (request) => { if (request.resourceType() === "document") { documents.push(request.url()); } });
  await page.getByRole("searchbox", { name: "Search the site" }).fill("waits");
  await page.getByRole("status").filter({ hasText: /results?$/ }).waitFor();

  const first = page.locator("a.hit").first();

  expect(await first.locator(".hit-title").innerText()).toBe("State");
  expect(await first.locator(".hit-where").innerText()).toContain("A command that waits");
  expect((await first.locator(".hit-excerpt").innerText()).length).toBeGreaterThan(10);

  await first.click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state" && location.hash === "#a-command-that-waits");
  expect(await page.getByRole("searchbox").inputValue()).toBe("");                              // moving on clears the search
  expect(await page.locator(".results").count()).toBe(0);
  expect(await page.evaluate(() => { const top = document.getElementById("a-command-that-waits")!.getBoundingClientRect().top; return top >= 56 && top < innerHeight; })).toBe(true);
  expect(documents).toEqual([]);                                                                // all in place

  await page.getByRole("searchbox").fill("zzzzzz");
  await page.getByRole("status").filter({ hasText: "No results for “zzzzzz”." }).waitFor();
  expect(failures).toEqual([]);
});

it("when the index cannot be loaded the page says search is not available, and recovers on the next query", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let blocked = true;

  await context.route(/\/assets\/search-.*\.json$/, (route) => blocked ? route.abort() : route.continue());
  await page.goto(`${served.origin}/docs/introduction`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  await page.getByRole("searchbox").fill("state");
  await page.getByRole("status").filter({ hasText: "Search is not available right now." }).waitFor();
  blocked = false;
  await page.getByRole("searchbox").fill("states");
  await page.getByRole("status").filter({ hasText: /results?$/ }).waitFor();
  await context.close();
});

it("remembers the theme and the code group's tab for the next visit, and takes them back once the page has taken over", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${served.origin}/docs/guides/getting-started`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  await page.getByRole("button", { name: "Use the dark theme" }).click();
  await page.getByRole("tab", { name: "yarn", exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem("kit.theme") === "dark" && localStorage.getItem("kit.tabs") === '{"pkg":"yarn"}');

  await page.reload();
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  await page.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-theme") === "dark");
  expect(await page.getByRole("tab", { name: "yarn", exact: true }).getAttribute("aria-selected")).toBe("true");
  await context.close();
});

it("a page whose store is blocked still works, and the choice lasts as long as the page", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const failures: Array<string> = [];

  page.on("pageerror", (error) => { failures.push(error.message); });
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("blocked", "SecurityError"); } }); });
  await page.goto(`${served.origin}/docs/introduction`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  await page.getByRole("button", { name: "Use the dark theme" }).click();
  await page.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-theme") === "dark");
  expect(failures).toEqual([]);
  await context.close();
});

it("marks the heading the reader has scrolled to in 'On this page'", async () => {
  const { page } = await ready(browser, "/docs/guides/state", { width: 1280, height: 600 });
  const current = () => page.locator('.toc a[aria-current="location"]').allInnerTexts();

  expect(await current()).toEqual([]);
  await page.evaluate(() => document.getElementById("commands")!.scrollIntoView());
  await page.waitForFunction(() => document.querySelector('.toc a[aria-current="location"]')?.textContent === "Commands");
  expect(await current()).toEqual(["Commands"]);

  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => document.querySelector('.toc a[aria-current="location"]')?.textContent === "Ending");
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelector('.toc a[aria-current="location"]') === null);
});

it("a link to a section of another page lands on the section and keeps the address; a link to a page puts focus on its content", async () => {
  const { page, failures } = await ready(browser, "/docs/introduction", { width: 1280, height: 700 });

  await page.getByRole("link", { name: "state and commands" }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state" && location.hash === "#commands");
  expect(await page.evaluate(() => { const top = document.getElementById("commands")!.getBoundingClientRect().top; return top >= 56 && top < innerHeight; })).toBe(true);

  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Views", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/views");
  await page.waitForFunction(() => document.activeElement?.tagName === "MAIN");
  expect(failures).toEqual([]);
});


// ---- a page on its way, and a page that cannot come ---------------------------------------------------------------------------------------------------------------------------

it("a page on its way: the address, the title and the navigation move at once, the page before stays marked busy, and then the page replaces it", async () => {
  const { page, failures } = await ready(browser, "/docs/introduction");
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });

  await page.route("**/docs/guides/views/index.json", async (route) => { await held; await route.continue(); });
  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Views", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/views");

  expect(await page.title()).toBe("Views · Valance");
  expect(await page.locator("main").getAttribute("aria-busy")).toBe("true");
  expect(await page.locator("main").getAttribute("data-status")).toBe("loading");
  expect(await page.getByRole("heading", { level: 1 }).innerText()).toBe("Introduction");          // the page before, until the next is there
  expect(await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Views", exact: true }).getAttribute("aria-current")).toBe("page");

  release();
  await page.waitForFunction(() => document.querySelector("main")?.getAttribute("aria-busy") === "false");
  expect(await page.getByRole("heading", { level: 1 }).innerText()).toBe("Views");
  expect(failures).toEqual([]);
});

it("a page that cannot come is said, with a way to try again; trying again brings it", async () => {
  const { page } = await ready(browser, "/docs/introduction");
  const errors: Array<string> = [];
  let blocked = true;

  page.on("pageerror", (error) => { errors.push(error.message); });
  await page.route("**/docs/guides/views/index.json", (route) => blocked ? route.abort() : route.continue());
  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Views", exact: true }).click();
  await page.getByRole("heading", { name: "This page could not be loaded" }).waitFor();
  expect(await page.locator("main").getAttribute("data-status")).toBe("failed");
  expect(await page.locator("main").getAttribute("aria-busy")).toBe("false");
  expect(new URL(page.url()).pathname).toBe("/docs/guides/views");                                  // the address is the page asked for, so reloading it or sharing it works

  blocked = false;
  await page.getByRole("link", { name: "Try again" }).click();
  await page.getByRole("heading", { name: "Views", exact: true, level: 1 }).waitFor();
  expect(await page.locator("main").getAttribute("data-status")).toBe("ready");
  expect(errors).toEqual([]);
});

it("going somewhere else while a page is on its way: the one asked for last is the one shown", async () => {
  const { page } = await ready(browser, "/docs/introduction");
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });

  await page.route("**/docs/guides/views/index.json", async (route) => { await held; await route.continue(); });
  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Views", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/views");
  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Errors", exact: true }).click();
  await page.getByRole("heading", { name: "Errors", exact: true, level: 1 }).waitFor();
  release();
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(await page.getByRole("heading", { level: 1 }).innerText()).toBe("Errors");                  // the late answer for Views changed nothing
  expect(new URL(page.url()).pathname).toBe("/docs/reference/errors");
});

// ---- delivered per request, and served from under a base --------------------------------------------------------------------------------------------------------------------

it("the same site rendered per request (opt-in) hydrates and navigates the same way, fetching its pages from the renderer", async () => {
  const rendered = await serveSsr(readGeneratedSite(), join(process.cwd(), "dist", "docs"));

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const failures: Array<string> = [];

    page.on("pageerror", (error) => { failures.push(error.message); });
    await page.goto(`${rendered.origin}/docs/introduction`);
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
    await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "State", exact: true }).click();
    await page.getByRole("heading", { name: "State", exact: true, level: 1 }).waitFor();
    expect(await page.title()).toBe("State · Valance");
    expect(failures).toEqual([]);
    await context.close();
  } finally {
    await new Promise<void>((resolve) => { rendered.server.close(() => { resolve(); }); });
  }
});

it("served from under a base, every address is under it: the document, its assets, its pages' content, its search; and what is outside it is not the site", async () => {
  const base = "/valance/";
  const dir = join(process.cwd(), "dist", "docs-base");

  execFileSync("pnpm", ["exec", "vite", "build", "-c", "vite.page.config.ts", "--base", base, "--outDir", "dist/docs-base"], { cwd: process.cwd(), stdio: "pipe" });
  execFileSync("node", ["scripts/finish-build.mjs", "dist/docs-base"], { cwd: process.cwd(), stdio: "pipe" });
  await exportSite({ ...readGeneratedSite(), base, url: "https://example.com" }, dir, await builtAssets(dir, base));

  const hosted = await serveStatic(dir, { base });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const failures: Array<string> = [];
    const requested: Array<string> = [];

    page.on("pageerror", (error) => { failures.push(error.message); });
    page.on("console", (message) => { if (message.type() === "error") { failures.push(message.text()); } });
    page.on("request", (request) => { requested.push(new URL(request.url()).pathname); });
    await page.goto(`${hosted.origin}${base}docs/guides/state`);
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");

    const hrefs = await page.locator("#app a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")!).filter((href) => href.startsWith("/")));

    expect(hrefs.length).toBeGreaterThan(10);
    expect(hrefs.filter((href) => !href.startsWith(base))).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".shell")!).display)).toBe("flex");        // the stylesheet came from under the base

    await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Views", exact: true }).click();
    await page.getByRole("heading", { name: "Views", exact: true, level: 1 }).waitFor();
    expect(new URL(page.url()).pathname).toBe(`${base}docs/guides/views`);
    expect(requested).toContain(`${base}docs/guides/views/index.json`);

    await page.getByRole("searchbox").fill("waits");
    await page.getByRole("status").filter({ hasText: /results?$/ }).waitFor();
    expect(await page.locator("a.hit").first().getAttribute("href")).toMatch(new RegExp(`^${base}docs/guides/state#`));
    await page.locator("a.hit").first().click();
    await page.waitForFunction((expected) => location.pathname === `${expected}docs/guides/state` && location.hash === "#a-command-that-waits", base);

    await page.goBack();
    await page.waitForFunction((expected) => location.pathname === `${expected}docs/guides/views`, base);
    expect(requested.filter((path) => !path.startsWith(base))).toEqual([]);                                             // nothing was asked for outside the base
    expect(failures).toEqual([]);

    const missing = await fetch(`${hosted.origin}${base}docs/nope`);

    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("There is no such page.");
    expect((await fetch(`${hosted.origin}/docs/guides/state`)).status).toBe(404);                                       // the same path, outside the base, is not a page of this site
    await context.close();
  } finally {
    await new Promise<void>((resolve) => { hosted.server.close(() => { resolve(); }); });
  }
}, 120_000);
