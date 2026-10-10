// The other sites of the kit, BUILT with the production command and driven in real Chromium: a blog, a landing page, a handbook in two versions and two languages. The kit is the same;
// what differs is each site's directory, and these tests check that each one is a working site, then what it is for.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveStatic } from "../web/serve.js";

let browser: Browser;
const served: Record<string, Awaited<ReturnType<typeof serveStatic>>> = {};

const build = async (site: string): Promise<void> => {
  execFileSync("pnpm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe", env: { ...process.env, SITE: site } });
  served[site] = await serveStatic(join(process.cwd(), "dist", site));
};

beforeAll(async () => {
  for (const site of ["blog", "landing", "handbook"]) { await build(site); }

  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser.close();
  await Promise.all(Object.values(served).map(({ server }) => new Promise<void>((resolve) => { server.close(() => { resolve(); }); })));
});

/** A page of `site` at `path`, taken over by the application, with whatever it did wrong collected. */
const open = async (site: string, path: string, viewport = { width: 1280, height: 800 }) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const failures: Array<string> = [];
  const documents: Array<string> = [];

  page.on("pageerror", (error) => { failures.push(error.message); });
  page.on("console", (message) => { if (message.type() === "error") { failures.push(message.text()); } });
  page.on("request", (request) => { if (request.resourceType() === "document") { documents.push(new URL(request.url()).pathname); } });
  await page.goto(`${served[site]!.origin}${path}`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");

  return { page, failures, documents, context };
};

const accent = (page: Page): Promise<string> => page.evaluate(() => getComputedStyle(document.querySelector(".shell")!).getPropertyValue("--accent").trim());
const searchFor = async (page: Page, query: string): Promise<void> => {
  await page.getByRole("searchbox").fill(query);
  await page.getByRole("status").filter({ hasText: /result|résultat|No results|Aucun/ }).waitFor();
};

describe.each(["blog", "landing", "handbook"])("%s: a site like the others", (site) => {
  it("hydrates without error, is styled by the kit and by its own theme, and its theme can be switched", async () => {
    const { page, failures, context } = await open(site, site === "blog" ? "/blog" : "/");

    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".shell")!).display)).toBe("flex");
    expect(await accent(page)).toBe({ blog: "#b4441c", landing: "#0f766e", handbook: "#5b3df5" }[site]);           // the site's theme over the kit's; the handbook has none
    await page.getByRole("button", { name: /dark theme|sombre/ }).click();
    await page.waitForFunction(() => document.querySelector(".shell")?.getAttribute("data-theme") === "dark");
    expect(await accent(page)).not.toBe({ blog: "#b4441c", landing: "#0f766e", handbook: "#5b3df5" }[site]);        // the dark palette is the site's too
    expect(failures).toEqual([]);
    await context.close();
  });

  it("a page that is not there is the site's own not-found page, with a 404", async () => {
    const response = await fetch(`${served[site]!.origin}/this/is/not/a/page`);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('<div class="shell"');
  });
});

describe("the blog", () => {
  it("lists posts newest first; a tag goes to its posts, a post to itself, and Back returns, all in place", async () => {
    const { page, failures, documents, context } = await open("blog", "/blog");

    expect(await page.locator("a.post-title").allInnerTexts()).toEqual(["One value is enough", "Search without a server", "The first note"]);

    await page.locator("a.tag", { hasText: "search" }).first().click();
    await page.getByRole("heading", { name: "Posts tagged “search”", level: 1 }).waitFor();
    expect(new URL(page.url()).pathname).toBe("/blog/tags/search");
    expect(await page.locator("a.post-title").allInnerTexts()).toEqual(["Search without a server"]);

    await page.locator("a.post-title").first().click();
    await page.getByRole("heading", { name: "Search without a server", level: 1 }).waitFor();
    expect(await page.locator(".shell").getAttribute("data-layout")).toBe("post");
    expect(await page.locator("time.post-date").innerText()).toBe("20 February 2026");
    expect(await page.locator(".sidebar").count()).toBe(0);

    await page.getByRole("link", { name: /One value is enough/ }).click();                       // the pager: the newer post
    await page.getByRole("heading", { name: "One value is enough", level: 1 }).waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: "Search without a server", level: 1 }).waitFor();
    expect(documents).toEqual(["/blog"]);                                                         // one document; the rest in place
    expect(failures).toEqual([]);
    await context.close();
  });

  it("searches its posts, and a result goes to the post", async () => {
    const { page, context } = await open("blog", "/blog");

    await searchFor(page, "index");
    await page.locator("a.hit").first().click();
    await page.getByRole("heading", { name: "Search without a server", level: 1 }).waitFor();
    await context.close();
  });

  it("serves a feed that a reader can subscribe to, and says where in every document", async () => {
    const html = await (await fetch(`${served["blog"]!.origin}/blog`)).text();

    expect(html).toContain('type="application/atom+xml"');
    expect((await fetch(`${served["blog"]!.origin}/feed.xml`)).headers.get("content-type")).toContain("application/xml");
  });
});

describe("the landing page", () => {
  it("is the width of the window, with its hero and cards, and a link to its own section scrolls to it", async () => {
    const { page, failures, context } = await open("landing", "/", { width: 1280, height: 600 });

    expect(await page.getByRole("heading", { level: 1 }).innerText()).toBe("Weave small programs into one you can read");
    expect(await page.locator("ul.cards > li").count()).toBe(4);
    expect(await page.locator(".sidebar").count()).toBe(0);
    expect(await page.evaluate(() => { const hero = document.querySelector(".hero")!.getBoundingClientRect(); return hero.width >= innerWidth - 20; })).toBe(true);

    await page.getByRole("link", { name: "Get started" }).click();
    await page.waitForFunction(() => location.hash === "#features");
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    expect(await page.getByRole("navigation", { name: "Navigation" }).getByRole("link", { name: "Source" }).getAttribute("href")).toBe("https://example.com/loom");
    expect(failures).toEqual([]);
    await context.close();
  });
});

describe("the handbook", () => {
  it("goes to the same page in French, which is in French all through, and back; the document's language follows", async () => {
    const { page, failures, documents, context } = await open("handbook", "/docs/install");

    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    await page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: "Français" }).click();
    await page.waitForFunction(() => location.pathname === "/fr/docs/install");
    await page.getByRole("heading", { name: "Installation", level: 1 }).waitFor();
    expect(await page.locator("html").getAttribute("lang")).toBe("fr");
    expect(await page.getByRole("searchbox").getAttribute("placeholder")).toBe("Rechercher");
    expect(await page.getByRole("button", { name: "Utiliser le thème sombre" }).count()).toBe(1);
    expect(await page.getByRole("navigation", { name: "Documentation" }).getByRole("link").allInnerTexts()).toEqual(["Introduction", "Installation"]);
    expect(await page.title()).toBe("Installation · Handbook");

    await page.getByRole("navigation", { name: "Langue" }).getByRole("link", { name: "English" }).click();
    await page.waitForFunction(() => location.pathname === "/docs/install");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    expect(documents).toEqual(["/docs/install"]);
    expect(failures).toEqual([]);
    await context.close();
  });

  it("goes to the page in the older version, which says it is not the current one and points to it; the version is what is searched", async () => {
    const { page, failures, context } = await open("handbook", "/docs/install");

    await page.getByRole("navigation", { name: "Version" }).getByRole("link", { name: "v1" }).click();
    await page.waitForFunction(() => location.pathname === "/v1/docs/install");
    await page.getByRole("heading", { name: "Install", level: 1 }).waitFor();
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("/docs/install");
    expect(await page.getByRole("navigation", { name: "Version" }).getByRole("link", { name: "v1" }).getAttribute("aria-current")).toBe("true");

    await searchFor(page, "three commands");
    expect(await page.locator("a.hit").first().getAttribute("href")).toBe("/v1/docs/install");
    await page.getByRole("navigation", { name: "Documentation" }).getByRole("link", { name: "Introduction" }).click();
    await page.getByRole("link", { name: "current version" }).click();
    await page.waitForFunction(() => location.pathname === "/docs/introduction");
    expect(failures).toEqual([]);
    await context.close();
  });

  it("a page missing in French leads to the start of French from the language switcher; and an unknown French address is not found, in French", async () => {
    const { page, context } = await open("handbook", "/docs/upgrading");

    await page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: "Français" }).click();
    await page.waitForFunction(() => location.pathname === "/fr/docs/introduction");
    await context.close();

    const response = await fetch(`${served["handbook"]!.origin}/fr/docs/nowhere`);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Cette page n’existe pas.");
  });

  it("searches in French what is in French", async () => {
    const { page, context } = await open("handbook", "/fr/docs/introduction");

    await searchFor(page, "commande");
    expect(await page.locator("a.hit").first().getAttribute("href")).toMatch(/^\/fr\/docs\//);
    expect(await page.getByRole("status").innerText()).toMatch(/résultat/);
    await context.close();
  });
});
