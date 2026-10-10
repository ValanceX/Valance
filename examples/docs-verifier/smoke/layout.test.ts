// Layout, checked on the BUILT sites in real Chromium at the widths people read at, from a phone to a wide screen: nothing makes the page scroll sideways, nothing hangs off the screen, the
// controls are big enough to touch and do not sit on one another. These are the regressions a stylesheet change causes and a screenshot would show.
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGeneratedSite } from "../web/document.js";
import { build } from "./build.js";
import { serveStatic } from "../web/serve.js";

const SITES = (process.env["LAYOUT_SITES"] ?? "docs,blog,landing,handbook").split(",");
const WIDTHS = [320, 390, 768, 1024, 1280, 1920] as const;

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

const measure = (page: Page) => page.evaluate(() => {
  const width = document.documentElement.clientWidth;
  const visible = (element: Element): DOMRect | undefined => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none" ? undefined : rect; };
  const scrolls = (element: Element | null): boolean => { for (let node = element; node !== null && node !== document.body; node = node.parentElement) { const style = getComputedStyle(node); if (style.overflowX === "auto" || style.overflowX === "scroll") { return true; } } return false; };
  const label = (element: Element): string => `${element.tagName.toLowerCase()}${element.className === "" ? "" : `.${String(element.className).split(" ")[0]}`} "${(element.textContent ?? "").trim().slice(0, 24)}"`;

  const hanging = [...document.querySelectorAll("#app *")].filter((element) => { const rect = visible(element); return rect !== undefined && rect.right > width + 1 && !scrolls(element.parentElement) && !(element instanceof HTMLElement && scrolls(element)); }).map(label);
  const small = [...document.querySelectorAll("button, input, nav a, .pager-link, .action, .tag, .hit")].filter((element) => {
    const rect = visible(element);

    // The skip link is off screen until it has focus; a target needs 24 by 24 CSS pixels (WCAG 2.2, 2.5.8) unless it is inline text.
    return rect !== undefined && !element.classList.contains("skip") && (rect.width < 24 || rect.height < 24) && !(element.closest("p, li") !== null && element.tagName === "A" && !element.classList.contains("nav-link") && !element.classList.contains("hit"));
  }).map(label);
  const bar = [...document.querySelectorAll(".bar > *")].map((element) => ({ element, rect: visible(element) })).filter((entry): entry is { element: Element; rect: DOMRect } => entry.rect !== undefined);
  const overlapping: Array<string> = [];

  for (const [index, a] of bar.entries()) {
    for (const b of bar.slice(index + 1)) {
      const across = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const down = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);

      if (across > 1 && down > 1) { overlapping.push(`${label(a.element)} over ${label(b.element)}`); }
    }
  }

  return { sideways: document.documentElement.scrollWidth - width, hanging, small, overlapping };
});

describe.each(SITES)("%s", (site) => {
  const pages = (): ReadonlyArray<string> => { const all = readGeneratedSite(site).pages.map((page) => page.path); return [all[0]!, all[Math.floor(all.length / 2)]!, "/this/is/not/a/page"]; };

  it.each(WIDTHS)("at %i px wide: nothing scrolls sideways or hangs off the screen, controls are big enough to touch, and the bar's parts do not overlap", async (width) => {
    const found: Array<string> = [];

    for (const path of pages()) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();

      await page.goto(`${served[site]!.origin}${path}`);
      await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");

      const measured = await measure(page);

      if (measured.sideways > 1) { found.push(`${path}: the page scrolls sideways by ${measured.sideways}px`); }

      for (const label of measured.hanging.slice(0, 4)) { found.push(`${path}: ${label} hangs off the screen`); }

      for (const label of measured.small.slice(0, 4)) { found.push(`${path}: ${label} is smaller than 24 by 24`); }

      for (const label of measured.overlapping.slice(0, 4)) { found.push(`${path}: ${label}`); }

      await context.close();
    }

    expect(found).toEqual([]);
  });
});
