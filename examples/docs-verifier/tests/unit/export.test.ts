// The static export: which files a site is, that each document carries its own page and the site's map and nothing else, that the exported site and the rendered-per-request site
// are the same bytes at every address, and that a site served under a base has every address under it.
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { routes } from "../../src/app/routes.js";
import { Page, mapOf } from "../../src/model/site.js";
import type { Site } from "../../src/model/site.js";
import { siteDir } from "./sites.js";
import { readSite } from "../../build/content/site.js";
import type { Built } from "../../src/web/built.js";
import { renderDocument } from "../../build/document.js";
import { exportSite } from "../../build/export.js";
import { serveSsr, serveStatic } from "../../build/serve.js";

const content = siteDir("docs");
const files = (dir: string): ReadonlyArray<string> => readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => statSync(join(dir, name)).isFile()).sort();
const read = (dir: string, name: string): string => readFileSync(join(dir, name), "utf8");
const built = (base: string): Built => ({ base, script: `${base}assets/page.js`, style: `${base}assets/page.css`, search: `${base}assets/search.json` });

let site: Site;

beforeAll(() => { site = readSite(content); });

describe("the files a site is", () => {
  const out = mkdtempSync(join(tmpdir(), "export-"));

  beforeAll(async () => { await exportSite({ ...site, url: "https://example.com" }, out, built("/")); });

  it("a document and a content file for each page, the aliases of the first page, a not-found page, robots.txt and a sitemap", () => {
    expect(files(out)).toEqual([
      "404.html", "docs/guides/getting-started/index.html", "docs/guides/getting-started/index.json", "docs/guides/plugins/index.html", "docs/guides/plugins/index.json",
      "docs/guides/state/index.html", "docs/guides/state/index.json", "docs/guides/views/index.html", "docs/guides/views/index.json", "docs/index.html",
      "docs/introduction/index.html", "docs/introduction/index.json", "docs/reference/api/index.html", "docs/reference/api/index.json", "docs/reference/errors/index.html",
      "docs/reference/errors/index.json", "index.html", "robots.txt", "sitemap.xml",
    ]);
  });

  it("each content file is that page, and is a page when read back as data from outside", () => {
    for (const page of site.pages) {
      const found = JSON.parse(read(out, `${page.path.slice(1)}/index.json`)) as unknown;

      expect(found, page.path).toEqual(page);
      expect(() => Schema.decodeUnknownSync(Page)(found)).not.toThrow();
    }
  });

  it("a document carries its own page and the map of the site, and no other page's content, and not the compiled views", () => {
    const html = read(out, "docs/guides/state/index.html");
    const boot = JSON.parse(/<script id="valance-boot" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]!.replaceAll("\\u003c", "<")) as { map: unknown; state: { page: string; content: { id: string } }; built: unknown; program?: unknown };

    expect(boot.state.page).toBe("docs-guides-state");
    expect(boot.state.content.id).toBe("docs-guides-state");
    expect(boot.map).toEqual(mapOf({ ...site, url: "https://example.com" }));
    expect(boot.program).toBeUndefined();
    expect(html).not.toContain("is turned away with a refusal");                           // another page's words (the errors page) are in no document but theirs
    expect(read(out, "docs/guides/plugins/index.html")).not.toContain("A newer call supersedes an older one");
  });

  it("the first page is also the site's root and /docs, and says its own address is the canonical one", () => {
    for (const name of ["index.html", "docs/index.html"]) {
      expect(read(out, name)).toContain('<link rel="canonical" href="https://example.com/docs/introduction" data-valance-head>');
    }
  });

  it("the not-found page is for a search engine to leave out, and names no canonical address", () => {
    const html = read(out, "404.html");

    expect(html).toContain("There is no such page.");
    expect(html).toContain('<meta name="robots" content="noindex" data-valance-head>');
    expect(html).not.toContain('rel="canonical"');
  });

  it("the sitemap lists the pages by their canonical address, once each, and robots.txt points at it", () => {
    const sitemap = read(out, "sitemap.xml");

    expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])).toEqual(site.pages.map((page) => `https://example.com${page.path}`));
    expect(read(out, "robots.txt")).toBe("User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n");
  });

  it("a site that is not published anywhere has no sitemap and a robots.txt that points at none", async () => {
    const unpublished = mkdtempSync(join(tmpdir(), "export-"));

    await exportSite(site, unpublished, built("/"));
    expect(files(unpublished)).not.toContain("sitemap.xml");
    expect(read(unpublished, "robots.txt")).toBe("User-agent: *\nAllow: /\n");
  });
});

describe("under a base", () => {
  const base = "/docs-site/";
  const out = mkdtempSync(join(tmpdir(), "export-"));

  beforeAll(async () => { await exportSite({ ...site, base, url: "https://example.com" }, out, built(base)); });

  it("every address a document writes is under the base: links, the stylesheet, the script, the canonical address, the pages' navigation", () => {
    const html = read(out, "docs/guides/state/index.html");
    const app = /<div id="app">([\s\S]*)<\/div><script id="valance-boot"/.exec(html)![1]!;
    const addresses = [...app.matchAll(/\b(?:href|src)="([^"#][^"]*)"/g)].map((match) => match[1]!).filter((address) => address.startsWith("/"));

    expect(addresses.length).toBeGreaterThan(10);
    expect(addresses.filter((address) => !address.startsWith(base))).toEqual([]);
    expect(html).toContain(`<link rel="stylesheet" href="${base}assets/page.css" data-valance-head>`);
    expect(html).toContain(`<script type="module" src="${base}assets/page.js"></script>`);
    expect(html).toContain(`<link rel="canonical" href="https://example.com${base}docs/guides/state" data-valance-head>`);
  });

  it("content that links to a page of the site is under the base too, and a link elsewhere is as written", () => {
    const intro = read(out, "docs/introduction/index.html");

    expect(intro).toMatch(new RegExp(`href="${base}docs/guides/getting-started"[^>]*>getting-started guide`));
    expect(intro).not.toMatch(/href="\/docs\//);
  });

  it("the documents are files under the site's directory, as a host serves them from the base", () => {
    expect(files(out)).toContain("docs/guides/state/index.html");
    expect(read(out, "sitemap.xml")).toContain(`<loc>https://example.com${base}docs/guides/state</loc>`);
    expect(read(out, "robots.txt")).toContain(`Sitemap: https://example.com${base}sitemap.xml`);
  });
});

describe("delivered statically or rendered per request, the site is the same bytes", () => {
  const out = mkdtempSync(join(tmpdir(), "export-"));
  const servers: Array<{ readonly server: { close: (callback: () => void) => void } }> = [];
  let staticOrigin = "";
  let ssrOrigin = "";

  beforeAll(async () => {
    await exportSite(site, out, built("/"));
    // The SSR server reads the built assets from a directory; the exported one is a directory with none, so give it the manifest it needs.
    const assets = mkdtempSync(join(tmpdir(), "assets-"));
    const { mkdirSync, writeFileSync } = await import("node:fs");

    mkdirSync(join(assets, ".vite"), { recursive: true });
    writeFileSync(join(assets, ".vite", "manifest.json"), JSON.stringify({ "src/main.ts": { file: "assets/page.js", isEntry: true, css: ["assets/page.css"] } }));
    writeFileSync(join(assets, "built.json"), JSON.stringify({ search: "assets/search.json" }));

    const served = await serveStatic(out);
    const rendered = await serveSsr(site, assets);

    servers.push(served, rendered);
    staticOrigin = served.origin;
    ssrOrigin = rendered.origin;
  });

  afterAll(async () => { await Promise.all(servers.map(({ server }) => new Promise<void>((resolve) => { server.close(() => { resolve(); }); }))); });

  const addresses = ["/", "/docs", "/docs/", "/docs/introduction", "/docs/guides/state", "/docs/guides/getting-started", "/docs/reference/errors", "/docs/nowhere", "/elsewhere"];

  it.each(addresses)("%s: the same status and the same document", async (address) => {
    const [fromFile, fromRender] = await Promise.all([fetch(`${staticOrigin}${address}`), fetch(`${ssrOrigin}${address}`)]);

    expect(fromRender.status).toBe(fromFile.status);

    if (address === "/elsewhere" || address === "/docs/nowhere") {
      // Both answer an unknown address with the application's own not-found page and a 404 (a static host serves 404.html; the renderer renders the same).
      expect(fromFile.status).toBe(404);
    }

    expect(await fromRender.text()).toBe(await fromFile.text());
  });

  it("a page's content is the same file either way", async () => {
    for (const page of site.pages) {
      const [fromFile, fromRender] = await Promise.all([fetch(`${staticOrigin}${page.path}/index.json`), fetch(`${ssrOrigin}${page.path}/index.json`)]);

      expect(await fromRender.text()).toBe(await fromFile.text());
    }
  });

  it("the static server serves the files of the site and nothing outside it; the renderer serves assets only from assets/", async () => {
    expect((await fetch(`${staticOrigin}/../package.json`)).status).toBe(404);
    expect((await fetch(`${staticOrigin}/docs/guides/state/index.json`)).headers.get("content-type")).toBe("application/json");
    expect((await fetch(`${staticOrigin}/robots.txt`)).headers.get("content-type")).toContain("text/plain");
    expect((await fetch(`${ssrOrigin}/assets/../.vite/manifest.json`)).status).toBeGreaterThanOrEqual(403);
    expect((await fetch(`${staticOrigin}/`, { method: "POST" })).status).toBe(405);
  });

  it("the documents are what the routes say there are: every static path is a file, and is not the not-found page", () => {
    for (const address of routes(mapOf(site)).paths()) {
      expect(read(out, `${address.slice(1)}/index.html`), address).not.toContain("There is no such page.");
    }
  });
});

describe("delivery: static unless a route says a server", () => {
  it("an address delivered by a server is not exported as a document, stays out of the sitemap, and its content is still a file", async () => {
    const out = mkdtempSync(join(tmpdir(), "export-"));
    const { pages } = await exportSite({ ...site, url: "https://example.com" }, out, built("/"), { delivery: (address) => address === "/docs/guides/plugins" ? "server" : "static" });

    expect(pages).not.toContain("/docs/guides/plugins");
    expect(pages).toHaveLength(site.pages.length - 1);
    expect(files(out)).not.toContain("docs/guides/plugins/index.html");
    expect(files(out)).toContain("docs/guides/plugins/index.json");
    expect(read(out, "sitemap.xml")).not.toContain("/docs/guides/plugins");
    expect(read(out, "sitemap.xml")).toContain("/docs/guides/state");
  });
});

describe("rendering a document", () => {
  it("is deterministic: the same address gives the same bytes", async () => {
    expect(await renderDocument(site, "/docs/guides/state", built("/"))).toBe(await renderDocument(site, "/docs/guides/state", built("/")));
  });
});
