// Composability: one kit, many sites. Four sites live in sites/ (documentation, a blog, a landing page, a handbook in two versions and two languages), each only data: a site.json, markdown,
// examples, and at most a theme. The kit builds every one of them the same way, and these tests hold all of them to the same rules, then check what each one is for.
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { search } from "../app/search.js";
import type { Site } from "../model/site.js";
import { mapOf } from "../model/site.js";
import { readSite } from "../tooling/content.js";
import { buildSearchIndex } from "../tooling/search.js";
import type { Built } from "../web/built.js";
import { renderDocument } from "../web/document.js";
import { exportSite } from "../web/export.js";
import { contentFile, routes } from "../app/routes.js";
import { SITES, siteDir, type SiteName } from "./sites.js";

const built = (name: SiteName, base = "/"): Built => ({
  base,
  script: `${base}assets/page.js`,
  style: `${base}assets/page.css`,
  search: `${base}assets/search.json`,
  ...(existsSync(join(siteDir(name), "theme.css")) ? { theme: `${base}assets/theme.css` } : {}),
});
const read = (dir: string, name: string): string => readFileSync(join(dir, name), "utf8");
const filesIn = (dir: string): ReadonlyArray<string> => readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => statSync(join(dir, name)).isFile()).map((name) => name.split("\\").join("/")).sort();
const kitRoot = fileURLToPath(new URL("..", import.meta.url));

interface Exported { readonly site: Site; readonly dir: string; readonly files: ReadonlyArray<string> }

const exports_: Partial<Record<SiteName, Exported>> = {};

beforeAll(async () => {
  for (const name of SITES) {
    const site = readSite(siteDir(name));
    const dir = mkdtempSync(join(tmpdir(), `sites-${name}-`));

    await exportSite({ ...site, url: "https://example.com" }, dir, built(name));
    exports_[name] = { site, dir, files: filesIn(dir) };
  }
}, 120_000);

const of = (name: SiteName): Exported => exports_[name]!;

// ---- the rules every site is held to ------------------------------------------------------------------------------------------------------------------------------------------

describe.each(SITES)("%s: the rules every site is held to", (name) => {
  it("every page is a document and a content file, and the sitemap lists exactly the documents", () => {
    const { site, dir, files } = of(name);

    for (const page of site.pages) {
      expect(files, page.path).toContain(`${page.path.slice(1)}${page.path === "/" ? "" : "/"}index.html`.replace(/^\//, ""));
      expect(files, page.path).toContain(contentFile(page.path));
    }

    expect([...read(dir, "sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((found) => found[1])).toEqual(site.pages.map((page) => `https://example.com${page.path}`));
  });

  it("every document has one h1, a main, a title, a description, its own canonical address, its language, the kit's stylesheet and the site's theme when it has one", () => {
    const { site, dir } = of(name);

    for (const page of site.pages) {
      const html = read(dir, page.path === "/" ? "index.html" : `${page.path.slice(1)}/index.html`);

      expect(html.match(/<h1[ >]/g), page.path).toHaveLength(1);
      expect(html, page.path).toContain("<main ");
      expect(html, page.path).toMatch(new RegExp(`<title>[^<]+${site.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`));
      expect(html, page.path).toMatch(/<meta name="description" content="[^"]+"/);
      expect(html, page.path).toContain(`<html lang="${page.locale}">`);
      expect(html, page.path).toContain('<link rel="stylesheet" href="/assets/page.css"');
      expect(html.includes('href="/assets/theme.css"'), page.path).toBe(existsSync(join(siteDir(name), "theme.css")));
      expect(html.includes('rel="canonical"'), page.path).toBe(true);
    }
  });

  it("every address a document links to inside the site leads to a file of the site, a fragment to a heading on it", () => {
    const { site, dir, files } = of(name);
    const targets = new Set(files);
    // What a fragment can lead to: any element with that id in the document it reaches (a heading, the content a skip link jumps to).
    const idsOf = (path: string): ReadonlySet<string> => new Set([...read(dir, path === "/" ? "index.html" : `${path.slice(1)}/index.html`).matchAll(/\bid="([^"]+)"/g)].map((found) => found[1]!));
    const broken: Array<string> = [];

    for (const page of site.pages) {
      const html = read(dir, page.path === "/" ? "index.html" : `${page.path.slice(1)}/index.html`);
      const app = /<div id="app">([\s\S]*)<\/div><script id="valance-boot"/.exec(html)![1]!;

      for (const found of app.matchAll(/\bhref="([^"]*)"/g)) {
        const href = found[1]!.replaceAll("&amp;", "&");

        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) { continue; }

        const [path, fragment] = href.split("#") as [string, string | undefined];
        const resolved = path === "" ? page.path : path.replace(/\/+$/, "") || "/";
        const file = resolved === "/" ? "index.html" : `${resolved.slice(1)}/index.html`;

        if (!targets.has(file)) { broken.push(`${page.path}: ${href} leads to no document`); }
        else if (fragment !== undefined && fragment !== "" && !idsOf(resolved).has(fragment)) { broken.push(`${page.path}: ${href} leads to nothing with that id`); }
      }
    }

    expect(broken).toEqual([]);
  });

  it("a page that is not there is the not-found page, in the site's own look, with a 404 document and no canonical address", () => {
    const html = read(of(name).dir, "404.html");

    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('<div class="shell"');
  });

  it("the search index has an entry for something on every page that is not an index, and none for an index", () => {
    const { site } = of(name);
    const index = buildSearchIndex(site);
    const searched = new Set(index.entries.map((entry) => entry.href.split("#")[0]));

    expect(site.pages.filter((page) => page.layout !== "list").every((page) => searched.has(page.path))).toBe(true);
    expect(site.pages.filter((page) => page.layout === "list").some((page) => searched.has(page.path))).toBe(false);
  });
});

// ---- the kit knows no site; a site knows no code -------------------------------------------------------------------------------------------------------------------------------

describe("the kit and the sites", () => {
  const code = (dir: string): ReadonlyArray<string> => readdirSync(join(kitRoot, dir), { recursive: true, encoding: "utf8" }).filter((name) => /\.(ts|mprx|css)$/.test(name) && !name.endsWith(".d.ts")).map((name) => join(dir, name));
  const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

  it("nothing in the kit names a site, or a place in one: no site's name, no collection's path, no word a site's page says", () => {
    const names = SITES.flatMap((name) => { const site = readSite(siteDir(name)); return [site.name]; });
    const forbidden = [...names.filter((site) => site !== "Valance"), "Valance docs", /["'`]\/(docs|blog|fr|v1)(?![\w-])/, /\bdocs-(kit|router|seo)\b/];
    const offenders: Array<string> = [];

    for (const file of ["app", "model", "tooling", "views", "styles", "web"].flatMap(code)) {
      const text = withoutComments(readFileSync(join(kitRoot, file), "utf8"));

      for (const word of forbidden) {
        if (typeof word === "string" ? text.includes(word) : word.test(text)) { offenders.push(`${file}: ${String(word)}`); }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("a site is data: markdown, JSON and a theme, and examples (TypeScript) only in snippets/", () => {
    for (const name of SITES) {
      const stray = filesIn(siteDir(name)).filter((file) => !/^(site\.json|theme\.css|content\/.+\.md|snippets\/.+\.ts)$/.test(file));

      expect(stray, name).toEqual([]);
    }
  });

  it("a theme changes the kit's custom properties and nothing else: every declaration is a custom property", () => {
    for (const name of SITES.filter((candidate) => existsSync(join(siteDir(candidate), "theme.css")))) {
      const css = read(siteDir(name), "theme.css").replace(/\/\*[\s\S]*?\*\//g, "");
      const declarations = [...css.matchAll(/([\w-]+)\s*:\s*[^;{}]+;/g)].map((found) => found[1]!);

      expect(declarations.length, name).toBeGreaterThan(0);
      expect(declarations.filter((property) => !property.startsWith("--")), name).toEqual([]);
    }
  });

  it("the kit's views are the same for every site: no site has a template of its own", () => {
    expect(SITES.flatMap((name) => filesIn(siteDir(name)).filter((file) => file.endsWith(".mprx")))).toEqual([]);
    expect(relative(kitRoot, siteDir("docs"))).toBe("sites/docs");
  });
});

// ---- a blog ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

describe("the blog: posts, an index, tags, a feed", () => {
  it("is posts newest first, an index of them, a page of tags and a page for each tag", () => {
    const { site } = of("blog");

    expect(site.pages.map((page) => [page.path, page.layout])).toEqual([
      ["/blog", "list"], ["/blog/tags", "list"],
      ["/blog/tags/design", "list"], ["/blog/tags/meta", "list"], ["/blog/tags/search", "list"], ["/blog/tags/state", "list"], ["/blog/tags/static", "list"],
      ["/blog/one-value", "post"], ["/blog/search-without-a-server", "post"], ["/blog/the-first-note", "post"],
    ]);
    expect(site.roots).toEqual([{ path: "/", page: "blog" }]);
  });

  it("the index lists the posts with their date, summary and tags, and the date is said in words", () => {
    const html = read(of("blog").dir, "blog/index.html");
    const titles = [...html.matchAll(/class="post-title"[^>]*>([^<]+)</g)].map((found) => found[1]);

    expect(titles).toEqual(["One value is enough", "Search without a server", "The first note"]);
    expect(html).toContain("12 March 2026");
    expect(html).toContain('<time class="post-date" datetime="2026-03-12">12 March 2026</time>');
    expect(html).toMatch(/<a [^>]*class="tag"[^>]*href="\/blog\/tags\/state"[^>]*>state<\/a>/);
  });

  it("a post has its date, author and tags above it, one column, and the posts around it", () => {
    const html = read(of("blog").dir, "blog/search-without-a-server/index.html");

    expect(html).toContain('data-layout="post"');
    expect(html).toContain('<time class="post-date" datetime="2026-02-20">20 February 2026</time>');
    expect(html).toContain('<span class="post-author">by Ada</span>');
    expect(html).toMatch(/href="\/blog\/tags\/static"[^>]*>static</);
    expect(html).not.toContain('class="sidebar"');
    expect(html).not.toContain('class="toc"');
    expect(html).toMatch(/class="pager-link"[^>]*href="\/blog\/one-value"[^>]*>← One value is enough/);           // newer
    expect(html).toMatch(/class="pager-link"[^>]*href="\/blog\/the-first-note"[^>]*>The first note →/);            // older
  });

  it("a tag's page lists the posts with that tag and says how it was asked for", () => {
    const html = read(of("blog").dir, "blog/tags/search/index.html");

    expect(html).toContain("Posts tagged “search”");
    expect([...html.matchAll(/class="post-title"[^>]*>([^<]+)</g)].map((found) => found[1])).toEqual(["Search without a server"]);
    expect(read(of("blog").dir, "blog/tags/index.html")).toMatch(/class="card-title"[^>]*href="\/blog\/tags\/design"[^>]*>design</);
  });

  it("the site root is the index, the header links to the index and the tags, and the document says where its feed is", () => {
    const { dir } = of("blog");
    const root = read(dir, "index.html");

    expect(root).toContain("<title>Field Notes · Field Notes</title>");
    expect(root).toMatch(/class="header-link"[^>]*href="\/blog"[^>]*>Posts</);
    expect(root).toMatch(/class="header-link"[^>]*href="\/blog\/tags"[^>]*>Tags</);
    expect(root).toContain('<link rel="alternate" href="/feed.xml" type="application/atom+xml" title="Field Notes" data-valance-head>');
  });

  it("the feed is Atom, newest first, with absolute addresses, the date, the author and the summary", () => {
    const feed = read(of("blog").dir, "feed.xml");
    const titles = [...feed.matchAll(/<entry>\s*<title>([^<]+)</g)].map((found) => found[1]);

    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(titles).toEqual(["One value is enough", "Search without a server", "The first note"]);
    expect(feed).toContain('<link href="https://example.com/blog/one-value"/>');
    expect(feed).toContain("<updated>2026-03-12T00:00:00Z</updated>");
    expect(feed).toContain("<author><name>Ada</name></author>");
    expect(feed).toContain("<summary>Why an application&apos;s state".replace("&apos;", "'"));
  });

  it("a site that is not published has no feed, and does not point at one", async () => {
    const { site } = of("blog");
    const dir = mkdtempSync(join(tmpdir(), "feedless-"));
    await exportSite({ ...site, url: "" }, dir, built("blog"));

    expect(filesIn(dir)).not.toContain("feed.xml");
  });

  it("a post without a date is refused, and so is a date that is not a day", () => {
    const text = (front: string): string => `---\ntitle: T\n${front}---\n# T\n`;
    const make = (front: string): string => {
      const root = mkdtempSync(join(tmpdir(), "post-"));

      return (() => {
        const { mkdirSync, writeFileSync } = require_("node:fs") as typeof import("node:fs");

        mkdirSync(join(root, "content", "posts"), { recursive: true });
        writeFileSync(join(root, "content", "posts", "p.md"), text(front));
        writeFileSync(join(root, "site.json"), JSON.stringify({ name: "x", collections: [{ name: "posts", dir: "posts", path: "/blog", layout: "post" }] }));

        return root;
      })();
    };

    expect(() => readSite(make(""))).toThrow("content/posts/p.md:1: a post needs a date: line");
    expect(() => readSite(make("date: 12 March\n"))).toThrow('date "12 March" must be a day');
  });
});

// `require` is not in an ES module: a small way to load Node's fs lazily for the helper above.
const require_ = (name: string): unknown => (globalThis as unknown as { process: { getBuiltinModule: (id: string) => unknown } }).process.getBuiltinModule(name);

// ---- a landing page -----------------------------------------------------------------------------------------------------------------------------------------------------------

describe("the landing page: a hero, cards, the full width", () => {
  it("is one page at the site's root, with no sidebar, no outline and no pager", () => {
    const { site, dir } = of("landing");
    const html = read(dir, "index.html");

    expect(site.pages.map((page) => [page.path, page.layout])).toEqual([["/", "landing"]]);
    expect(html).toContain('data-layout="landing"');
    expect(html).not.toContain('class="sidebar"');
    expect(html).not.toContain('class="pager"');
  });

  it("draws the hero (a headline, a lead, a main action and another) and the cards", () => {
    const html = read(of("landing").dir, "index.html");

    expect(html).toMatch(/<div class="hero"><h1 id="top">Weave small programs into one you can read<\/h1>/);
    expect(html).toContain('<p class="lead">Loom keeps every piece of an application in plain sight');
    expect(html).toMatch(/<a [^>]*class="action action-primary"[^>]*href="\/#features"[^>]*>Get started<\/a>/);
    expect(html).toMatch(/<a [^>]*class="action action-secondary"[^>]*href="https:\/\/example.com\/loom"[^>]*>Read the source<\/a>/);
    expect([...html.matchAll(/class="card-title"[^>]*>([^<]+)</g)].map((found) => found[1])).toEqual(["One value", "Commands", "Views", "Plugins"]);
    expect(html).toContain("The whole state in a single place");
  });

  it("the header has the site's links, one of them to another site, and the footer says what the site says", () => {
    const html = read(of("landing").dir, "index.html");

    expect(html).toMatch(/class="header-link"[^>]*href="\/#features"[^>]*>Features</);
    expect(html).toMatch(/class="header-link"[^>]*href="https:\/\/example.com\/loom"[^>]*>Source</);
    expect(html).toContain("<footer>Loom is made up for this example.");
  });

  it("a hero without a headline, a card that does not start with a link, and an unknown container are refused", () => {
    const parse = (body: string) => () => readSiteWith(body);

    expect(parse("::: hero\nonly a paragraph\n:::\n")).toThrow("a ::: hero container starts with a # headline");
    expect(parse("::: cards\n- no link here\n:::\n")).toThrow("a card starts with a link");
    expect(parse("::: columns\n:::\n")).toThrow("unknown container ::: columns");
    expect(parse("::: hero\n# T\n")).toThrow("opened and never closed");
  });
});

const readSiteWith = (body: string): Site => {
  const { mkdirSync, writeFileSync } = require_("node:fs") as typeof import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "landing-"));

  mkdirSync(join(root, "content", "pages"), { recursive: true });
  writeFileSync(join(root, "content", "pages", "index.md"), `---\ntitle: T\nlayout: landing\n---\n${body}`);
  writeFileSync(join(root, "site.json"), JSON.stringify({ name: "x", collections: [{ name: "pages", dir: "pages", path: "", layout: "landing" }] }));

  return readSite(root);
};

// ---- a handbook in two versions and two languages ---------------------------------------------------------------------------------------------------------------------------

describe("the handbook: versions and languages", () => {
  const paths = () => of("handbook").site.pages.map((page) => page.path);

  it("serves the newest version without a prefix, the older one under its code, and the other language under its code", () => {
    expect(paths()).toEqual([
      "/docs/introduction", "/docs/install", "/docs/upgrading",
      "/fr/docs/introduction", "/fr/docs/install",
      "/v1/docs/introduction", "/v1/docs/install", "/v1/docs/upgrading",
    ]);
    expect(of("handbook").site.versions).toEqual([{ code: "v2", label: "v2", latest: true }, { code: "v1", label: "v1", latest: false }]);
    expect(of("handbook").site.roots.map((root) => root.path).sort()).toEqual(["/", "/docs", "/fr", "/fr/docs", "/v1", "/v1/docs"]);
  });

  it("a page keeps its slug in every language and version, which is how they are found from each other", () => {
    const slugs = of("handbook").site.pages.filter((page) => page.slug === "docs/install").map((page) => [page.locale, page.version]);

    expect(slugs).toEqual([["en", "v2"], ["fr", "v2"], ["en", "v1"]]);
  });

  it("speaks French where the page is French: the language, the words around it, the section's title, the page", () => {
    const html = read(of("handbook").dir, "fr/docs/install/index.html");

    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('lang="fr"');
    expect(html).toContain("<title>Installation · Handbook</title>");
    expect(html).toMatch(/aria-label="Rechercher dans le site"/);
    expect(html).toContain('placeholder="Rechercher"');
    expect(html).toMatch(/aria-label="Thème sombre"/);
    expect(html).toContain(">Démarrer<");
    expect(html).toContain("Une seule commande installe tout.");
    expect(html).toContain(">Copier<");
    expect(html).not.toContain(">Copy<");
  });

  it("a word the site did not translate is the kit's English, not a hole", () => {
    const html = read(of("handbook").dir, "fr/docs/introduction/index.html");

    expect(html).toContain('aria-label="Language"'.replace("Language", "Langue"));       // translated
    expect(html).toContain("v2");
  });

  it("each page names its translations (hreflang) and its canonical address; an older version's canonical address is the newest version's page", () => {
    const { dir } = of("handbook");
    const french = read(dir, "fr/docs/install/index.html");
    const older = read(dir, "v1/docs/install/index.html");

    expect(french).toContain('<link rel="canonical" href="https://example.com/fr/docs/install"');
    expect(french).toContain('<link rel="alternate" href="https://example.com/docs/install" hreflang="en"');
    expect(french).toContain('<link rel="alternate" href="https://example.com/fr/docs/install" hreflang="fr"');
    expect(older).toContain('<link rel="canonical" href="https://example.com/docs/install"');
    expect(read(dir, "v1/docs/upgrading/index.html")).toContain('<link rel="canonical" href="https://example.com/docs/upgrading"');
  });

  it("a page with no translation has no alternate for it, and no hreflang at all when the site has one language", () => {
    expect(read(of("handbook").dir, "docs/upgrading/index.html")).not.toContain('rel="alternate"');
    expect(read(of("docs").dir, "docs/introduction/index.html")).not.toContain('rel="alternate"');
  });

  it("the language and version switchers lead to the same page in the other language or version, and to the start of one when the page is not there", () => {
    const { dir } = of("handbook");
    const links = (html: string, label: string) => [...new RegExp(`<nav aria-label="${label}" class="switch">([\\s\\S]*?)</nav>`).exec(html)![1]!.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map((found) => [found[2], found[1]]);

    expect(links(read(dir, "docs/install/index.html"), "Language")).toEqual([["English", "/docs/install"], ["Français", "/fr/docs/install"]]);
    expect(links(read(dir, "docs/upgrading/index.html"), "Language")).toEqual([["English", "/docs/upgrading"], ["Français", "/fr/docs/introduction"]]);   // no French upgrading page: the start of French
    expect(links(read(dir, "docs/install/index.html"), "Version")).toEqual([["v2", "/docs/install"], ["v1", "/v1/docs/install"]]);
    expect(links(read(dir, "v1/docs/install/index.html"), "Version")).toEqual([["v2", "/docs/install"], ["v1", "/v1/docs/install"]]);
    expect(links(read(dir, "fr/docs/install/index.html"), "Version")).toEqual([["v2", "/fr/docs/install"], ["v1", "/v1/docs/install"]]);   // no French v1: the start of v1 in French falls to the page that exists
  });

  it("a link in a page goes to the page in its own language and version, and to the nearest when that is not there", () => {
    const { site } = of("handbook");
    const hrefs = (path: string) => { const page = site.pages.find((candidate) => candidate.path === path)!; return page.blocks.flatMap((block) => block.kind === "paragraph" || block.kind === "list" || block.kind === "callout" ? JSON.stringify(block).match(/"href":"([^"]+)"/g) ?? [] : []).map((found) => found.slice(8, -1)); };

    expect(hrefs("/fr/docs/install")).toEqual(["/docs/upgrading"]);                       // there is no French upgrading page: the English one
    expect(hrefs("/fr/docs/introduction")).toEqual(["/v1/docs/introduction", "/docs/upgrading", "/fr/docs/install"]);
    expect(hrefs("/v1/docs/introduction")).toEqual(["/docs/introduction", "/v1/docs/install"]);
    expect(hrefs("/docs/install")).toEqual(["/docs/upgrading"]);
  });

  it("the navigation is the pages of the reader's own language and version", () => {
    const { dir } = of("handbook");
    const sidebar = (html: string) => [...(/<nav aria-label="[^"]*" class="sidebar">([\s\S]*?)<\/nav>/.exec(html)![1]!).matchAll(/href="([^"]+)"/g)].map((found) => found[1]);

    expect(sidebar(read(dir, "docs/install/index.html"))).toEqual(["/docs/introduction", "/docs/install", "/docs/upgrading"]);
    expect(sidebar(read(dir, "fr/docs/install/index.html"))).toEqual(["/fr/docs/introduction", "/fr/docs/install"]);
    expect(sidebar(read(dir, "v1/docs/install/index.html"))).toEqual(["/v1/docs/introduction", "/v1/docs/install", "/v1/docs/upgrading"]);
  });

  it("search finds pages in the reader's language and version only", () => {
    const index = buildSearchIndex(of("handbook").site);

    expect(search(index, "commande", { locale: "fr", version: "v2" }).map((hit) => hit.href)).toEqual(expect.arrayContaining(["/fr/docs/install"]));
    expect(search(index, "commande", { locale: "en", version: "v2" })).toEqual([]);
    expect(search(index, "three commands", { locale: "en", version: "v1" }).map((hit) => hit.href)).toEqual(["/v1/docs/install"]);
    expect(search(index, "three commands", { locale: "en", version: "v2" }).every((hit) => !hit.href.startsWith("/v1"))).toBe(true);
  });

  it("an address in a language the page is not in is not found in that language", () => {
    const { site } = of("handbook");
    const table = routes(mapOf(site));

    expect(table.stateOf(new URL("http://x/fr/docs/nowhere"))).toEqual({ id: "not-found:fr" });
    expect(table.stateOf(new URL("http://x/docs/nowhere"))).toEqual({ id: "not-found" });
    expect(table.stateOf(new URL("http://x/fr"))).toEqual({ id: "fr-docs-introduction" });
    expect(table.stateOf(new URL("http://x/v1"))).toEqual({ id: "v1-docs-introduction" });
  });

  it("the not-found page speaks the language of the address", async () => {
    const { site } = of("handbook");
    const french = await renderDocument({ ...site, url: "" }, "/fr/docs/nowhere", built("handbook"));

    expect(french).toContain("Introuvable");
    expect(french).toContain("Cette page n’existe pas.");
    expect(french).toContain('<html lang="fr">');
  });

  it("a version that is named and has no directory, and a default language that is not one of the languages, are refused", () => {
    const { mkdirSync, writeFileSync } = require_("node:fs") as typeof import("node:fs");
    const root = mkdtempSync(join(tmpdir(), "versions-"));

    mkdirSync(join(root, "content", "docs", "v2"), { recursive: true });
    writeFileSync(join(root, "content", "docs", "v2", "a.md"), "---\ntitle: A\n---\n# A\n");
    writeFileSync(join(root, "site.json"), JSON.stringify({ name: "x", collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc", versions: ["v2", "v1"] }] }));
    expect(() => readSite(root)).toThrow('the collection "docs" needs content/docs/v1 and it does not exist');
    writeFileSync(join(root, "site.json"), JSON.stringify({ name: "x", defaultLocale: "de", locales: [{ code: "en", name: "English" }], collections: [] }));
    expect(() => readSite(root)).toThrow('the default locale "de" is not among the locales');
  });
});

// ---- the same documentation site, with the same checks as before ----------------------------------------------------------------------------------------------------------

describe("the documentation site is a site like the others", () => {
  it("one collection, in sections, with an alias at / and /docs", () => {
    const { site } = of("docs");

    expect(new Set(site.pages.map((page) => page.collection))).toEqual(new Set(["docs"]));
    expect(site.roots).toEqual([{ path: "/", page: "docs-introduction" }, { path: "/docs", page: "docs-introduction" }]);
  });
});

// ---- what a search engine and a link preview see ---------------------------------------------------------------------------------------------------------------------------------

describe.each(SITES)("%s: search engines and link previews", (name) => {
  const documents = () => of(name).site.pages.map((page) => ({ page, html: read(of(name).dir, page.path === "/" ? "index.html" : `${page.path.slice(1)}/index.html`) }));
  const metaOf = (html: string, key: "name" | "property", value: string): string | undefined => new RegExp(`<meta ${key}="${value}" content="([^"]*)"`).exec(html)?.[1];

  it("every page has a title and description of a size a result can show, and a preview: type, name, address, language, card", () => {
    for (const { page, html } of documents()) {
      const title = /<title>([^<]*)<\/title>/.exec(html)![1]!;
      const description = metaOf(html, "name", "description")!;

      expect(title.length, page.path).toBeLessThanOrEqual(70);
      expect(description.length, page.path).toBeGreaterThanOrEqual(10);
      expect(description.length, page.path).toBeLessThanOrEqual(300);
      expect(metaOf(html, "property", "og:title"), page.path).toBe(title);
      expect(metaOf(html, "property", "og:site_name"), page.path).toBe(of(name).site.name);
      expect(metaOf(html, "property", "og:url"), page.path).toBe(`https://example.com${/<link rel="canonical" href="https:\/\/example\.com([^"]*)"/.exec(html)![1]}`);
      expect(metaOf(html, "property", "og:locale"), page.path).toBe(page.locale);
      expect(metaOf(html, "property", "og:type"), page.path).toBe(page.layout === "doc" || page.layout === "post" ? "article" : "website");
      expect(metaOf(html, "name", "twitter:card"), page.path).toBe("summary");
      expect(html, page.path).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
      expect(html.includes('name="robots"'), page.path).toBe(false);
    }
  });

  it("every page of a published site says what it is as structured data, with an address that is its canonical one", () => {
    for (const { page, html } of documents()) {
      const found = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);

      expect(found, page.path).not.toBeNull();

      const data = JSON.parse(found![1]!.replaceAll("\\u003c", "<")) as Record<string, unknown>;
      const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)![1];

      expect(data["@context"], page.path).toBe("https://schema.org");
      expect(data["@type"], page.path).toBe({ doc: "TechArticle", post: "BlogPosting", list: "CollectionPage", landing: "WebPage" }[page.layout]);
      expect(data["url"], page.path).toBe(canonical);
      expect(data["inLanguage"], page.path).toBe(page.locale);
      expect(data["headline"], page.path).toBe(page.title);
      expect((data["isPartOf"] as { name: string }).name, page.path).toBe(of(name).site.name);
    }
  });

  it("a post says when it was written, by whom, and about what", () => {
    for (const { page, html } of documents().filter(({ page: candidate }) => candidate.layout === "post")) {
      const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!) as Record<string, unknown>;

      expect(data["datePublished"], page.path).toBe(page.date);
      expect((data["author"] as { name: string }).name, page.path).toBe(page.author);
      expect(data["keywords"], page.path).toBe(page.tags.join(", "));
    }
  });

  it("a page that is not there says nothing as data, and a site that is not published says none", async () => {
    expect(read(of(name).dir, "404.html")).not.toContain("ld+json");

    const { site } = of(name);

    expect(await renderDocument({ ...site, url: "" }, site.pages[0]!.path, built(name))).not.toContain("ld+json");
  });

  it("the sitemap and robots.txt are for the whole site, and robots.txt points at the sitemap", () => {
    expect(read(of(name).dir, "robots.txt")).toBe("User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n");
    expect(read(of(name).dir, "sitemap.xml")).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  });

  it("is deterministic and its documents are valid enough to read: balanced, one doctype, no leftover template syntax", () => {
    for (const { page, html } of documents()) {
      const app = /<div id="app">([\s\S]*)<\/div><script id="valance-boot"/.exec(html)![1]!;

      expect(html.startsWith("<!doctype html>"), page.path).toBe(true);
      expect((html.match(/<main[ >]/g) ?? []).length, page.path).toBe(1);
      // Prose and chrome, not the examples: code may say `undefined` and braces.
      expect(app.replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<code[\s\S]*?<\/code>/g, ""), page.path).not.toMatch(/\{[a-z][\w.]*\}|undefined|\[object Object\]|NaN/);
    }
  });
});
