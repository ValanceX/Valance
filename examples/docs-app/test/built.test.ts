import { build } from "@valancex/cli/node";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveStatic } from "./serve.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let browser: Browser;
let server: Server;
let origin: string;

beforeAll(async () => {
  await build(root);
  ({ origin, server } = await serveStatic(join(root, "dist/web")));
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.close();
});

const open = async (path: string): Promise<{ readonly page: Page; readonly errors: Array<string>; readonly loads: () => number }> => {
  const page = await browser.newPage();
  const errors: Array<string> = [];
  let loads = 0;

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 404/.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("load", () => {
    loads += 1;
  });
  await page.goto(`${origin}${path}`);
  await page.waitForSelector('#app[data-valance="running"], #app[data-valance="failed"]');

  return { page, errors, loads: () => loads };
};

describe("the built site, in a browser", () => {
  it("loads every page directly, hydrated, with its own title, and draws the logo from public/", async () => {
    for (const [path, title, heading] of [
      ["/", "Notes", "Notes"],
      ["/guide/getting-started", "Getting started · Notes", "Getting started"],
      ["/guide/writing-pages/", "Writing pages · Notes", "Writing pages"],
    ] as const) {
      const { page, errors } = await open(path);

      expect(await page.getAttribute("#app", "data-valance")).toBe("running");
      expect(await page.title()).toBe(title);
      expect(await page.textContent("h1")).toBe(heading);
      expect(errors).toEqual([]);
      await page.close();
    }

    const { page } = await open("/");

    expect(await page.$eval("img.picture", (image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.close();
  });

  it("navigates in place (one document load), keeps the address and title in step, and Back and Forward work", async () => {
    const { page, errors, loads } = await open("/");

    await page.click('a.nav-link[href="/guide/getting-started"]');
    await page.waitForFunction(() => location.pathname === "/guide/getting-started");
    expect(await page.textContent("h1")).toBe("Getting started");
    expect(await page.title()).toBe("Getting started · Notes");
    expect(await page.getAttribute('a.nav-link[href="/guide/getting-started"]', "aria-current")).toBe("page");

    await page.click("a.pager-link >> text=Writing pages");
    await page.waitForFunction(() => location.pathname === "/guide/writing-pages");
    expect(await page.textContent("h1")).toBe("Writing pages");

    await page.goBack();
    await page.waitForFunction(() => location.pathname === "/guide/getting-started");
    expect(await page.textContent("h1")).toBe("Getting started");

    await page.goForward();
    await page.waitForFunction(() => location.pathname === "/guide/writing-pages");
    expect(await page.textContent("h1")).toBe("Writing pages");
    expect(loads()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  });

  it("follows a link to a heading on another page and keeps the fragment", async () => {
    const { page } = await open("/");

    await page.click('main a[href="/guide/writing-pages#front-matter"]');
    await page.waitForFunction(() => location.pathname === "/guide/writing-pages");
    expect(await page.evaluate(() => location.hash)).toBe("#front-matter");
    expect(await page.evaluate(() => document.getElementById("front-matter")!.getBoundingClientRect().top < window.innerHeight)).toBe(true);
    await page.close();
  });

  it("runs the application's own command: the layout's button changes the application's state", async () => {
    const { page } = await open("/");

    expect(await page.getAttribute(".layout", "data-theme")).toBe("light");
    await page.click("button.theme-toggle");
    expect(await page.getAttribute(".layout", "data-theme")).toBe("dark");

    // The state survives going to another page.
    await page.click('a.nav-link[href="/guide/getting-started"]');
    await page.waitForFunction(() => location.pathname === "/guide/getting-started");
    expect(await page.getAttribute(".layout", "data-theme")).toBe("dark");
    await page.close();
  });

  it("answers an address that is not a page with the author's 404 page and a 404 status", async () => {
    const response = await fetch(`${origin}/nope/nothing`);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("There is no page at this address.");

    const { page } = await open("/nope/nothing");

    expect(await page.textContent("h1")).toBe("Not found");
    expect(await page.title()).toBe("Not found · Notes");
    await page.close();
  });

  it("applies the author's stylesheet", async () => {
    const { page } = await open("/");

    expect(await page.$eval(".nav-link[aria-current='page']", (link) => getComputedStyle(link).fontWeight)).toBe("600");
    await page.close();
  });

  it("applies a component's own stylesheet inside that component, and only there", async () => {
    const { page } = await open("/");
    const toggle = await page.$eval("button.theme-toggle", (button) => ({ radius: getComputedStyle(button).borderRadius, padding: getComputedStyle(button).paddingLeft }));

    expect(toggle).toEqual({ radius: "999px", padding: "12px" }); // theme-toggle.css, written as `:scope { … }`

    // The rules are inside the element with class "theme-toggle": a button that is not one is not styled by them.
    const other = await page.evaluate(() => {
      const plain = document.createElement("button");

      document.body.append(plain);

      return getComputedStyle(plain).borderRadius;
    });

    expect(other).not.toBe("999px");
    await page.close();
  });

  it("runs under the strict policy the build wrote, with no violation: the site hydrates and the browser reports none", async () => {
    const response = await fetch(`${origin}/`);
    const policy = response.headers.get("content-security-policy") ?? "";

    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).not.toMatch(/unsafe-inline|'unsafe-eval'/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const { page, errors } = await open("/");

    expect(await page.getAttribute("#app", "data-valance")).toBe("running");
    expect(errors.filter((message) => /Content Security Policy|Refused/i.test(message))).toEqual([]);
    await page.close();
  });

  it("tells the application how much room it has, now and when the window changes", async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    await page.goto(`${origin}/`);
    await page.waitForSelector('#app[data-valance="running"]');
    await page.waitForFunction(() => document.getElementById("app")!.dataset["viewport"] === "expanded");
    await page.setViewportSize({ width: 700, height: 800 });
    await page.waitForFunction(() => document.getElementById("app")!.dataset["viewport"] === "medium");
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForFunction(() => document.getElementById("app")!.dataset["viewport"] === "compact");

    const phone = await browser.newPage({ viewport: { width: 390, height: 800 } });

    await phone.goto(`${origin}/`);
    await phone.waitForSelector('#app[data-valance="running"]');
    await phone.waitForFunction(() => document.getElementById("app")!.dataset["viewport"] === "compact");
    await page.close();
    await phone.close();
  });

  it("announces a page change made in place: the new title in a live region, and focus at the content", async () => {
    const { page } = await open("/");

    expect(await page.$("#valance-announcer")).toBeNull();
    await page.click('a.nav-link[href="/guide/getting-started"]');
    await page.waitForFunction(() => location.pathname === "/guide/getting-started");
    await page.waitForFunction(() => document.getElementById("valance-announcer")?.textContent === document.title);
    expect(await page.getAttribute("#valance-announcer", "aria-live")).toBe("polite");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("content");

    await page.goBack();
    await page.waitForFunction(() => document.getElementById("valance-announcer")?.textContent === "Notes");
    await page.close();
  });
});
