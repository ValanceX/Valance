// The BUILT site, end to end, on the development branches of MESH and PORT: `pnpm build` (content, vite, tsc), the server (web/serve.ts) over node:http, and real Chromium. The page is
// server rendered through the layout's slot, takes over without a second document load, navigates by links, keeps the title in step, Back restores, and the copy button's composite
// event travels code-block → block → page to a command, whose state the page then shows.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

import { readGeneratedSite } from "../web/document.js";
import { serve } from "../web/serve.js";

let served: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  execFileSync("pnpm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe" });
  served = await serve(readGeneratedSite(), join(process.cwd(), "dist", "page"));
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

  return page.evaluate((html) => {
    const parsed = window.document.createElement("div");

    parsed.innerHTML = html;

    return parsed.innerHTML === window.document.querySelector("#app")!.innerHTML;
  }, server);
};

const ready = async (browser: Browser, path: string, viewport?: { width: number; height: number }) => {
  const context = await browser.newContext(viewport === undefined ? {} : { viewport });
  const page = await context.newPage();
  const failures: Array<string> = [];

  page.on("pageerror", (error) => { failures.push(error.message); });
  page.on("console", (message) => { if (message.type() === "error") { failures.push(message.text()); } });
  await page.goto(`${served.origin}${path}`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");

  return { page, failures };
};

it("hydrates, navigates by links, keeps the title and the head, Back restores, and the copy button's event reaches its command", async () => {
  const { page, failures } = await ready(browser, "/docs/guides/getting-started");
  const documents: Array<string> = [];

  page.on("request", (request) => { if (request.resourceType() === "document") { documents.push(new URL(request.url()).pathname); } });
  expect(await page.title()).toBe("Getting Started · Valance");

  // the composite event, through real DOM events after hydration
  expect(await page.getByRole("button", { name: "Copy" }).count()).toBe(1);
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByRole("button", { name: "Copied" }).waitFor();

  // a plain click on a link is navigation inside the page: no new document, the URL, the title and the head follow, and the copied mark is cleared by `go`
  await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "State", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state");
  expect(await page.title()).toBe("State · Valance");
  expect(await page.getByRole("heading", { name: "State", exact: true }).count()).toBe(1);
  await page.waitForFunction(() => document.querySelector('link[rel="canonical"]')?.getAttribute("href") === "/docs/guides/state");
  expect(await page.locator('meta[name="description"]').getAttribute("content")).toBe("State: Valance documentation");
  expect(await page.locator('link[rel="stylesheet"]').count()).toBe(1);                   // the head the client keeps still links the style the server linked
  expect(await page.locator("[data-valance-head]").count()).toBe(5);                      // 3 metas, the canonical link and the stylesheet: replaced, never accumulated
  expect(await sameAsServer(page, "/docs/guides/state")).toBe(true);                      // patched in place, the page is what a fresh render of the state draws
  expect(await page.getByRole("link", { name: "State", exact: true }).first().getAttribute("aria-current")).toBe("page");

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/docs/guides/getting-started");
  expect(await page.title()).toBe("Getting Started · Valance");
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("/docs/guides/getting-started");
  expect(await page.getByRole("button", { name: "Copy", exact: true }).count()).toBe(1);   // back on the page, the mark is gone
  expect(await sameAsServer(page, "/docs/guides/getting-started")).toBe(true);

  expect(failures).toEqual([]);
  expect(documents).toEqual([]);                                                          // no document was loaded after the first: everything after was in place
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
    };
  });

  expect(style.sheets).toBeGreaterThan(0);
  expect(style).toMatchObject({ shell: "flex", bar: "sticky", sidebar: "block", menuButton: "none", h1: "36px", columns: 2 });
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
