// The site without a browser: the document the server renders (the head the plugins say, the layout's slots, the callout, the code block with its composite event), the application's
// commands, the stylesheet's coverage of what the templates write, and the not-found page.
import type { BoundaryValue } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

import { application } from "../app/application.js";
import { routes } from "../app/routes.js";
import type { AppState } from "../app/state.js";
import { initial } from "../app/state.js";
import { compilePage } from "../web/compile.js";
import type { Built } from "../web/built.js";
import { readGeneratedSite, renderDocument } from "../web/document.js";
import { plugins } from "../web/plugins.js";
import { readSite } from "../tooling/content.js";
import { fileURLToPath } from "node:url";
import type { Site } from "../model/site.js";
import { TokenKind } from "../model/site.js";

let site: Site;

const built: Built = { script: "/assets/page.js", style: "/assets/page.css" };
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

beforeAll(() => { site = readSite(here("../content")); });

it("a page is rendered on the server through the layout's slots: navigation, headings, a callout and a code block", async () => {
  const html = await renderDocument(site, "/docs/guides/getting-started", built);

  expect(html).toMatch(/<a [^>]*href="\/docs\/guides\/state"/);
  expect(html).toMatch(/<h1[^>]*>Getting Started<\/h1>/);                              // the text is the heading's own: runs are fragments, which make no node
  expect(html).toMatch(/<aside[^>]*data-tone="tip"[^>]*><strong[^>]*>TIP<\/strong>/);   // the callout composite, with its title placed by its own and its text by its slot
  expect(html).toMatch(/<figure[^>]*>(<div class="code-title">[^<]*<\/div>)?<pre><code>[\s\S]*?<span class="tok-keyword">import<\/span>/);   // the code-block composite, highlighted
  expect(html).toMatch(/<button[^>]*>Copy<\/button>/);
  expect(html).toContain("The features verifier");                                      // the layout's own footer, around the slots
  expect(html).toMatch(/id="valance-boot"/);
});

it("the head is the plugins': a title, a description, a canonical URL and the stylesheet, before the body; no inline style, no hand-written title", async () => {
  const html = await renderDocument(site, "/docs/guides/state", built);
  const head = /<head>([\s\S]*)<\/head>/.exec(html)![1]!;

  expect(head).toContain("<title>State · Valance</title>");
  expect(head).toContain('<meta name="description" content="State is one value, and commands are the only way to change it. A command can be pure, or it can wait." data-valance-head>');
  expect(head).toContain('<meta property="og:title" content="State · Valance" data-valance-head>');
  expect(head).toContain('<link rel="canonical" href="/docs/guides/state" data-valance-head>');
  expect(head).toContain('<link rel="stylesheet" href="/assets/page.css" data-valance-head>');
  expect(html).not.toContain("<style>");
  expect(html.indexOf('rel="stylesheet"')).toBeLessThan(html.indexOf('<div id="app">'));   // the style is requested before the page is drawn
});

it("the first page is also served at `/`, and says its own URL is the canonical one", async () => {
  const html = await renderDocument(site, "/", built);

  expect(html).toContain("<title>Introduction · Valance</title>");
  expect(html).toContain('<link rel="canonical" href="/docs/introduction" data-valance-head>');
});

it("without a stylesheet the site is still a page: no link, no failure", async () => {
  const html = await renderDocument(site, "/docs/guides/state", { script: "/assets/page.js" });

  expect(html).not.toContain('rel="stylesheet"');
  expect(html).toContain("<title>State · Valance</title>");
});

it("an unknown page is the application's own Not found, not an error, and it names no canonical URL", async () => {
  const html = await renderDocument(site, "/docs/nowhere", built);

  expect(html).toContain("<title>Valance</title>");
  expect(html).toContain("There is no such page.");
  expect(html).not.toContain('rel="canonical"');
  expect(routes(site).known("/docs/nowhere")).toBe(false);
});

it("the URL and the title are the application's functions of its state", () => {
  const { urlOf, stateOf, titleOf, stateFor } = routes(site);

  expect(urlOf({ ...initial, page: "guides-state" })).toBe("/docs/guides/state");
  expect(stateOf(new URL("http://x/docs/reference/api"))).toEqual({ id: "reference-api" });
  expect(titleOf({ ...initial, page: "reference-api" })).toBe("API · Valance");
  expect(stateFor("/").page).toBe("introduction");
});

it("the route table says what a build and a server need: the navigate command, every page's path, and what is known", () => {
  const table = routes(site);

  expect(table.navigate).toBe("go");
  expect(table.paths()).toEqual(["/docs/introduction", "/docs/guides/getting-started", "/docs/guides/state", "/docs/guides/views", "/docs/guides/plugins", "/docs/reference/api", "/docs/reference/errors"]);
  expect(table.paths().every((path) => table.known(path))).toBe(true);
  expect(table.known("/")).toBe(true);                                                  // an alias of the first page
});

it("the site's plugins are the kit, the router and the head, each a value with its own name, composing without conflict", async () => {
  const { compose } = await import("@valancex/valance/web/plugin");
  const list = plugins(site, built);
  const composed = compose<AppState>({}, list);

  expect(list.map((plugin) => plugin.name)).toEqual(["docs-kit", "docs-router", "docs-seo"]);
  expect(composed.routes?.navigate).toBe("go");
  expect(Object.keys(composed.primitives)).toContain("navLink");
  expect(composed.head?.({ ...initial, page: "guides-state" }).links).toEqual([{ rel: "stylesheet", href: "/assets/page.css" }, { rel: "canonical", href: "/docs/guides/state" }]);
});

const withApplication = async <A>(body: (handle: Valance.ApplicationHandle<AppState, never>, state: () => AppState) => Promise<A>): Promise<A> => {
  const program = await compilePage();
  const scope = Effect.runSync(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application(program, site)).pipe(Scope.extend(scope))) as unknown as Valance.ApplicationHandle<AppState, never>;

  try {
    return await body(handle, () => Effect.runSync(handle.state as never) as AppState);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
};
const invoke = (handle: Valance.ApplicationHandle<AppState, never>, key: string, value?: BoundaryValue) => Effect.runPromise(handle.invoke(key, value === undefined ? [] : [{ value }]) as never);

it("the copy button's composite event travels code-block → block → page to the copyCode command, and the page then says Copied", async () => {
  await withApplication(async (handle, state) => {
    await invoke(handle, "app/go", "guides-getting-started");
    expect(state().page).toBe("guides-getting-started");

    const code = site.pages.find((page) => page.id === "guides-getting-started")!.blocks.find((block) => block.kind === "code")!;

    await invoke(handle, "app/copyCode", code.id);
    expect(state().copied).toBe(code.id);
    await invoke(handle, "app/go", "guides-state");
    expect(state().copied).toBe("");                                                    // moving on clears it
  });
});

it("the menu opens and closes by its command, and moving to a page closes it", async () => {
  await withApplication(async (handle, state) => {
    expect(state().menu).toBe(false);
    await invoke(handle, "app/toggleMenu");
    expect(state().menu).toBe(true);
    await invoke(handle, "app/toggleMenu");
    expect(state().menu).toBe(false);
    await invoke(handle, "app/toggleMenu");
    await invoke(handle, "app/go", "guides-state");
    expect(state().menu).toBe(false);
  });
});

it("the theme is chosen by its command; a name that is not a theme is refused and changes nothing", async () => {
  await withApplication(async (handle, state) => {
    expect(state().theme).toBe("system");
    await invoke(handle, "app/setTheme", "dark");
    expect(state().theme).toBe("dark");

    const refused = await Effect.runPromise(Effect.exit(handle.invoke("app/setTheme", [{ value: "sepia" }]) as never));

    expect(Exit.isFailure(refused)).toBe(true);
    expect(state().theme).toBe("dark");
  });
});

it("the page shows Copied for the copied block", async () => {
  const { renderToHtml } = await import("@valancex/valance/web/server");
  const program = await compilePage();
  const code = site.pages.find((page) => page.id === "guides-getting-started")!.blocks.find((block) => block.kind === "code")!;
  const { html } = await Effect.runPromise(renderToHtml(application(program, site), { plugins: plugins(site), state: { ...initial, page: "guides-getting-started", copied: code.id } }));
  const labels = [...html.matchAll(/<button[^>]*class="copy"[^>]*>([^<]*)<\/button>/g)].map((match) => match[1]);

  expect(labels.filter((label) => label === "Copied")).toHaveLength(1);                  // only the block that was copied says so
  expect(labels.filter((label) => label === "Copy").length).toBeGreaterThan(0);
});

it("the navigation is grouped as the content groups it, and marks the current page, and only it, with aria-current", async () => {
  const html = await renderDocument(site, "/docs/guides/state", built);
  const sidebar = /<nav[^>]*class="sidebar"[^>]*>([\s\S]*?)<\/nav>/.exec(html)![1]!;
  const links = [...sidebar.matchAll(/<a [^>]*>/g)].map((match) => match[0]);

  expect(sidebar.match(/<section>/g)).toHaveLength(3);
  expect(sidebar).toMatch(/class="nav-title"[^>]*>Guides</);
  expect(sidebar).toMatch(/class="nav-title"[^>]*>Reference</);
  expect(links).toHaveLength(7);
  expect(links.filter((link) => link.includes('aria-current="page"'))).toHaveLength(1);
  expect(links.find((link) => link.includes('aria-current="page"'))).toContain('href="/docs/guides/state"');
});

it("the theme and the menu are attributes of the shell, for the stylesheet to read, and the theme buttons say which is pressed", async () => {
  const { renderToHtml } = await import("@valancex/valance/web/server");
  const program = await compilePage();
  const { html } = await Effect.runPromise(renderToHtml(application(program, site), { plugins: plugins(site), state: { ...initial, theme: "dark", menu: true } }));

  expect(html).toMatch(/<div[^>]*class="shell"[^>]*data-theme="dark"[^>]*data-menu="true"|<div[^>]*data-menu="true"[^>]*data-theme="dark"[^>]*class="shell"|<div(?=[^>]*class="shell")(?=[^>]*data-theme="dark")(?=[^>]*data-menu="true")[^>]*>/);
  expect(html).toMatch(/aria-label="Use the dark theme"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Use the dark theme"/);
  expect(html).toMatch(/aria-label="Use the light theme"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Use the light theme"/);
});

it("the generated site is the content's site (pnpm build:content ran)", () => {
  expect(readGeneratedSite()).toEqual(site);
});

it("inline marks (strong, emphasis, code, link) are runs the views draw", async () => {
  const intro = await renderDocument(site, "/docs/introduction", built);
  const views = await renderDocument(site, "/docs/guides/views", built);

  expect(intro).toMatch(/<strong[^>]*>one value<\/strong>/);
  expect(intro).toMatch(/<em[^>]*>plugins<\/em>/);
  expect(intro).toMatch(/<a [^>]*href="\/docs\/guides\/getting-started"[^>]*>getting-started guide<\/a>/);
  expect(views).toMatch(/<code[^>]*>increment\(\)<\/code>/);
});

it("headings carry their anchor and a link to it; the page's outline is the table of contents", async () => {
  const html = await renderDocument(site, "/docs/guides/state", built);

  expect(html).toMatch(/<h2 id="commands">Commands<a [^>]*aria-label="Link to this section"[^>]*href="#commands"[^>]*>#<\/a><\/h2>/);
  expect(html).toMatch(/<h1 id="state">State<\/h1>/);

  const toc = /<nav[^>]*class="toc"[^>]*>([\s\S]*?)<\/nav>/.exec(html)![1]!;

  expect([...toc.matchAll(/href="#([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[1], match[2]])).toEqual([["rules", "Rules"], ["commands", "Commands"], ["a-command-that-waits", "A command that waits"], ["ending", "Ending"]]);
  expect(await renderDocument(site, "/docs/nowhere", built)).not.toContain('class="toc"');            // a page with no headings has no "On this page"
});

it("lists, tables and code groups are drawn as the elements they are", async () => {
  const state = await renderDocument(site, "/docs/guides/state", built);
  const start = await renderDocument(site, "/docs/guides/getting-started", built);

  expect(state).toMatch(/<ul class="list"><li>A <strong>pure<\/strong> command returns the next state\.<\/li>/);
  expect(state).toMatch(/<li>Nothing else writes state\.<ul class="sublist"><li>A view only reads it\.<\/li><li>A mount only draws it\.<\/li><\/ul><\/li>/);
  expect(state).toMatch(/<div class="table-wrap"><table class="table"><thead><tr><th data-align="left" scope="col">Kind<\/th>/);
  expect(state).toMatch(/<td data-align="right">Loading, then an answer or a failure<\/td>/);
  expect(start).toMatch(/<div [^>]*role="tablist"/);
  expect(start.match(/role="tab"/g)).toHaveLength(3);
  expect(start.match(/aria-selected="true"/g)).toHaveLength(1);
  expect(start.match(/role="tabpanel"/g)).toHaveLength(1);                                              // only the chosen alternative is drawn
  const drawn = /<div id="app">([\s\S]*)<\/div><script id="valance-boot"/.exec(start)![1]!;   // the page, not the payload that carries every page

  const text = drawn.replace(/<[^>]+>/g, "");                                                         // code is tokens: its text is what remains without them

  expect(text).toContain("npm install @valancex/valance");
  expect(text).not.toContain("yarn add @valancex/valance");
});

it("makes no node that a template did not write: no wrapper elements around runs, blocks or text", async () => {
  const html = await renderDocument(site, "/docs/guides/getting-started", built);
  const app = /<div id="app">([\s\S]*)<\/div><script id="valance-boot"/.exec(html)![1]!;
  const tags = new Set([...app.matchAll(/<([a-z0-9]+)[\s>]/g)].map((match) => match[1]));

  // Every element is one a template names (the primitives table), and nothing the framework added.
  const written = new Set(["a", "aside", "button", "code", "div", "em", "figure", "footer", "h1", "h2", "h3", "header", "li", "main", "nav", "ol", "p", "pre", "section", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul"]);

  expect([...tags].filter((tag) => !written.has(tag!))).toEqual([]);
  // A `span` is a token of code and nothing else: text and marks are never wrapped.
  expect([...app.matchAll(/<span([^>]*)>/g)].filter((match) => !/class="tok-[a-z]+"/.test(match[1]!))).toEqual([]);
  // A paragraph holds its text and marks directly: `<p>` is followed by text or a mark, never by another container.
  expect(app).not.toMatch(/<p[^>]*><(span|div|p)/);
});

// ---- the stylesheet covers what the templates write ------------------------------------------------------------------------------------------------------------------------------

const views = readdirSync(here("../views")).filter((name) => name.endsWith(".mprx")).map((name) => name.replace(".mprx", "")).map((name) => readFileSync(here(`../views/${name}.mprx`), "utf8")).join("\n");
const css = readFileSync(here("../styles/site.css"), "utf8");

it("every class a template writes has a rule in the stylesheet, and no rule is for a class nothing writes", () => {
  // The classes the templates write, and those the scope puts in `cls` (the token kinds and the outline's levels).
  const written = new Set([
    ...views.matchAll(/class="([^"]+)"/g),
  ].flatMap((match) => match[1]!.split(/\s+/)).concat([...TokenKind.literals.filter((kind) => kind !== "plain").map((kind) => `tok-${kind}`), "toc-link", "toc-level-2", "toc-level-3"]));
  const styled = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1]!));

  expect([...written].filter((name) => !styled.has(name))).toEqual([]);
  // `shell` and the themes are written by the template; `copy` is the code block's. A class the stylesheet names and no template writes is dead weight.
  expect([...styled].filter((name) => !written.has(name))).toEqual([]);
});

it("every variant a template can write is styled: the tones, the themes and the open menu", () => {
  for (const tone of ["tip", "warning"]) { expect(css).toContain(`data-tone="${tone}"`); }
  for (const theme of ["light", "dark", "system"]) { expect(css).toContain(`data-theme="${theme}"`); }

  expect(css).toContain('data-menu="true"');
  expect(css).toContain('aria-current="page"');
  expect(css).toContain('aria-pressed="true"');
  expect(css).toContain("prefers-color-scheme: dark");
});
