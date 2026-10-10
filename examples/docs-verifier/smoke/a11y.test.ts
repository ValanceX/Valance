// Accessibility, checked on the BUILT sites in real Chromium with axe-core: every page of every site, in the light and the dark theme, on a wide screen and a narrow one. A violation of
// any impact fails, so the rules are the rules of the kit and not of one page.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGeneratedSite } from "../web/document.js";
import { build } from "./build.js";
import { serveStatic } from "../web/serve.js";

// `A11Y_SITES=docs,blog` limits the run to some sites while one is being worked on.
const SITES = (process.env["A11Y_SITES"] ?? "docs,blog,landing,handbook").split(",");
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

let browser: Browser;
const served: Record<string, Awaited<ReturnType<typeof serveStatic>>> = {};

beforeAll(async () => {
  for (const site of SITES) {
    build(site);
    served[site] = await serveStatic(join(process.cwd(), "dist", site));
  }

  browser = await chromium.launch();
}, 900_000);

afterAll(async () => {
  await browser.close();
  await Promise.all(Object.values(served).map(({ server }) => new Promise<void>((resolve) => { server.close(() => { resolve(); }); })));
});

interface Violation { readonly id: string; readonly impact: string | null; readonly help: string; readonly nodes: ReadonlyArray<{ readonly target: ReadonlyArray<string>; readonly failureSummary?: string }> }

const violationsOn = async (page: Page): Promise<ReadonlyArray<string>> => {
  await page.addScriptTag({ content: axe });

  const result = await page.evaluate(async () => (await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<unknown> }> } }).axe.run(document, { resultTypes: ["violations"] })).violations);

  return (result as ReadonlyArray<Violation>).map((violation) => `${violation.id} (${violation.impact}): ${violation.help}: ${violation.nodes.slice(0, 3).map((node) => `${node.target.join(" ")} ${(node.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)}`).join(" | ")}`);
};

const open = async (site: string, path: string, scheme: "light" | "dark", viewport: { width: number; height: number }): Promise<Page> => {
  const context = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await context.newPage();

  await page.goto(`${served[site]!.origin}${path}`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");

  return page;
};

describe.each(SITES)("%s", (site) => {
  const paths = (): ReadonlyArray<string> => [...readGeneratedSite(site).pages.map((page) => page.path), "/this/is/not/a/page"];

  it.each([["light", { width: 1280, height: 800 }], ["dark", { width: 1280, height: 800 }], ["light", { width: 390, height: 780 }], ["dark", { width: 390, height: 780 }]] as const)("has no accessibility violation on any page, %s theme, %o", async (scheme, viewport) => {
    const found: Array<string> = [];

    for (const path of paths()) {
      const page = await open(site, path, scheme, viewport);

      for (const violation of await violationsOn(page)) { found.push(`${path}: ${violation}`); }

      await page.context().close();
    }

    expect(found).toEqual([]);
  });
});

// ---- the states a static check does not see: search open, the menu open, an alternative chosen, a page on its way -------------------------------------------------------------------

describe("accessibility of the page in use", () => {
  it("has no violation with search results open, with the small-screen menu open, and after choosing another alternative of a code group", async () => {
    const found: Array<string> = [];
    const wide = await open("docs", "/docs/guides/getting-started", "light", { width: 1280, height: 800 });

    await wide.getByRole("tab", { name: "pnpm", exact: true }).click();
    await wide.waitForFunction(() => document.querySelector('[role="tabpanel"]')?.textContent?.includes("pnpm add") === true);
    found.push(...(await violationsOn(wide)).map((violation) => `tabs: ${violation}`));

    await wide.getByRole("searchbox").fill("command");
    await wide.getByRole("status").filter({ hasText: /results?$/ }).waitFor();
    found.push(...(await violationsOn(wide)).map((violation) => `search: ${violation}`));
    await wide.context().close();

    const narrow = await open("docs", "/docs/guides/state", "dark", { width: 390, height: 780 });

    await narrow.getByRole("button", { name: "Menu" }).click();
    await narrow.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-menu") === "true");
    found.push(...(await violationsOn(narrow)).map((violation) => `menu: ${violation}`));
    await narrow.context().close();

    expect(found).toEqual([]);
  });

  it("can be used from the keyboard alone: a skip link first, the content it skips to, the navigation, the search, the themes, and every control has a visible focus", async () => {
    const page = await open("docs", "/docs/introduction", "light", { width: 1280, height: 800 });
    const focused = () => page.evaluate(() => { const element = document.activeElement as HTMLElement; return { tag: element.tagName, text: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40), outline: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }; });

    await page.keyboard.press("Tab");
    expect(await focused()).toMatchObject({ tag: "A", text: "Skip to content" });
    expect(await page.evaluate(() => { const rect = document.activeElement!.getBoundingClientRect(); return rect.top >= 0 && rect.left >= 0; })).toBe(true);       // it appears when it has focus

    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "content");

    // From the top of a fresh page: the skip link, the brand, the search, the three themes, then the navigation, in that order, each with an outline.
    const fresh = await open("docs", "/docs/introduction", "light", { width: 1280, height: 800 });
    const order: Array<string> = [];
    const visit = () => fresh.evaluate(() => { const element = document.activeElement as HTMLElement; return { text: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40), outline: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }; });

    for (let step = 0; step < 14; step += 1) {
      await fresh.keyboard.press("Tab");

      const now = await visit();

      order.push(now.text);
      expect(now.outline === "none" && now.width === "0px" ? `${now.text} has no focus ring` : "ok").toBe("ok");
    }

    await fresh.context().close();
    expect(order.slice(0, 6)).toEqual(["Skip to content", "Valance", "Search the site", "Auto: follow the system theme", "Light theme", "Dark theme"]);
    expect(order).toContain("Introduction");
    await page.context().close();
  });

  it("going to a page from the keyboard puts focus on its content, and Back puts it nowhere surprising", async () => {
    const page = await open("docs", "/docs/introduction", "light", { width: 1280, height: 800 });

    await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "State", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => location.pathname === "/docs/guides/state");
    await page.waitForFunction(() => document.activeElement?.id === "content");
    await page.context().close();
  });
});
