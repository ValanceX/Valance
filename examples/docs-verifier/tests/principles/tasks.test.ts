// §18.1 representative consumer tasks, done against the SITE KIT as a site author and an application author would do them, from outside it: the common task with defaults, ordinary
// customization, composition with another capability, a realistic failure and its diagnosis, a lifecycle boundary, and a compatibility scenario. Each probe records what it saw
// (`principles/evidence/tasks.json`), and the report (../PRINCIPLES.md) cites it.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { compose, renderHead, type Plugin } from "@valancex/valance/web/plugin";
import { renderToHtml } from "@valancex/valance/web/server";
import { Deferred, Effect, Exit, Scope } from "effect";
import { JSDOM } from "jsdom";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";

import { application } from "../../src/app/application.js";
import { Pages } from "../../src/app/capabilities.js";
import { initial } from "../../src/app/state.js";
import { mapOf } from "../../src/model/site.js";
import type { Site } from "../../src/model/site.js";
import { readSite } from "../../build/content/site.js";
import { compilePage } from "../../build/views.js";
import { exportSite } from "../../build/export.js";
import { primitives } from "../../src/web/primitives.js";
import { plugins } from "../../src/web/plugins/index.js";
import { evidence } from "./evidence.js";
import * as Nexus from "@valancex/nexus";

const seen = evidence("tasks");

afterAll(() => { seen.write(); });

/** A site made from nothing but the files an author writes. */
const write = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "task-"));

  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }

  return root;
};
const filesIn = (dir: string): ReadonlyArray<string> => readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => statSync(join(dir, name)).isFile()).sort();
const built = { base: "/", script: "/assets/page.js", style: "/assets/page.css" };

it("common task, defaults: a site from a site.json of five lines and one markdown file is a complete static site", async () => {
  const dir = write({
    "site.json": JSON.stringify({ name: "Mine", collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc" }] }),
    "content/docs/index.md": "---\ntitle: Hello\n---\n\n# Hello\n\nA first page.\n",
  });
  const out = mkdtempSync(join(tmpdir(), "task-out-"));
  const { files } = await exportSite(readSite(dir), out, built);
  const html = readFileSync(join(out, "docs/index.html"), "utf8");

  seen.record("defaults.configLines", JSON.stringify({ name: "Mine", collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc" }] }).length);
  seen.record("defaults.files", files);
  expect(files).toEqual(expect.arrayContaining(["docs/index.html", "docs/index.json", "404.html", "index.html", "robots.txt"]));
  expect(html).toContain("<title>Hello · Mine</title>");
  expect(html).toContain("A first page.");
  expect(html).toContain('<link rel="stylesheet" href="/assets/page.css"');          // styled with no setting
  expect(html).toContain('<meta name="description" content="A first page."');         // described with no setting
});

it("ordinary customization: a header, a footer, a base, a published address and a theme change the site and nothing else", async () => {
  const dir = write({
    "site.json": JSON.stringify({ name: "Mine", base: "/mine/", url: "https://mine.example", footer: "Made by me.", header: [{ label: "Home", href: "/docs" }], collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc" }] }),
    "content/docs/index.md": "---\ntitle: Hello\n---\n\n# Hello\n\n[Itself](/docs)\n",
    "theme.css": ":root { --accent: #ff00aa; }",
  });
  const out = mkdtempSync(join(tmpdir(), "task-out-"));

  await exportSite(readSite(dir), out, { ...built, base: "/mine/", style: "/mine/assets/page.css", theme: "/mine/assets/theme.css" });

  const html = readFileSync(join(out, "docs/index.html"), "utf8");

  expect(html).toContain("<footer>Made by me.</footer>");
  expect(html).toMatch(/class="header-link"[^>]*href="\/mine\/docs"/);                // the header's address is under the base without being written so
  expect(html).toContain('<link rel="canonical" href="https://mine.example/mine/docs"');
  expect(html).toContain('<link rel="stylesheet" href="/mine/assets/theme.css"');
  expect(html.indexOf("page.css")).toBeLessThan(html.indexOf("theme.css"));         // the theme comes after the kit, so it wins
  expect(readFileSync(join(out, "sitemap.xml"), "utf8")).toContain("https://mine.example/mine/docs");
});

it("composition with another capability: a plugin of the author's own joins the kit's, once, and a clash says who clashed", async () => {
  const site: Site = readSite(write({
    "site.json": JSON.stringify({ name: "Mine", collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc" }] }),
    "content/docs/index.md": "---\ntitle: Hello\n---\n\n# Hello\n",
  }));
  const map = mapOf(site);
  const analytics: Plugin<typeof initial> = { name: "analytics", head: () => ({ links: [{ rel: "preconnect", href: "https://stats.example" }], meta: [{ name: "generator", content: "mine" }] }) };
  const served = await Effect.runPromise(renderToHtml(application(await compilePage(), map), { plugins: [...plugins(map, built), analytics], state: { ...initial, page: "docs-index", content: site.pages[0]! } }));
  const head = renderHead(served.head);

  seen.record("composition.head", head);
  expect(head).toContain('<link rel="preconnect" href="https://stats.example"');
  expect(head).toContain('<meta name="generator" content="mine"');
  expect(head).toContain('<link rel="stylesheet" href="/assets/page.css"');           // the kit's is still there

  const clash = (): unknown => compose<typeof initial>({}, [...plugins(map, built), { name: "mine", primitives: { navLink: { element: "a" } } }]);

  expect(clash).toThrow(/the tag "navLink" is declared by the plugin "site-kit" and by the plugin "mine"/);
  try { clash(); } catch (error) { seen.record("composition.clash", { code: Valance.isValanceError(error) ? error.code : null, message: (error as Error).message }); }
});

it("realistic failures are diagnosed where they are: the file, the line, what is wrong and what to do", () => {
  const diagnose = (files: Record<string, string>): string => {
    try { readSite(write({ "site.json": JSON.stringify({ name: "x", collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc" }] }), ...files })); } catch (error) { return (error as Error).message; }

    return "no error";
  };
  const page = (body: string, front = "title: A\n"): string => `---\n${front}---\n${body}`;
  const found = {
    brokenLink: diagnose({ "content/docs/a.md": page("# A\n\n[gone](/docs/nowhere)\n") }),
    deepHeading: diagnose({ "content/docs/a.md": page("# A\n\n#### Too deep\n") }),
    uncheckedExample: diagnose({ "content/docs/a.md": page("# A\n\n```ts\nconst x = 1;\n```\n") }),
    missingExample: diagnose({ "content/docs/a.md": page("# A\n\n```ts file=snippets/none.ts\n```\n") }),
    noTitle: diagnose({ "content/docs/a.md": "# A\n" }),
    badDate: diagnose({ "content/docs/a.md": page("# A\n", "title: A\ndate: yesterday\n") }),
    unclosed: diagnose({ "content/docs/a.md": page("# A\n\n```bash\nnever closed\n") }),
  };

  seen.record("failures", found);
  expect(found.brokenLink).toMatch(/1 broken link:\n {2}content\/docs\/a\.md: \[gone\]\(\/docs\/nowhere\) leads to no page/);
  expect(found.deepHeading).toMatch(/^content\/docs\/a\.md:\d+: a heading goes down to ###/);
  expect(found.uncheckedExample).toMatch(/^content\/docs\/a\.md:\d+: an inline ts example is not checked by anything; put it in snippets\/ .* and include it with/);
  expect(found.missingExample).toMatch(/^content\/docs\/a\.md:\d+: file=snippets\/none\.ts: there is no such example$/);
  expect(found.noTitle).toBe("content/docs/a.md:1: a page starts with a --- block that has a title");
  expect(found.badDate).toBe('content/docs/a.md:1: date "yesterday" must be a day, such as 2026-03-12');
  expect(found.unclosed).toMatch(/^content\/docs\/a\.md:\d+: a code fence is opened and never closed$/);

  for (const message of Object.values(found)) { expect(message, "every diagnosis says where").toMatch(/content\/docs\/a\.md/); }
});

it("lifecycle: closing the application while a page is on its way interrupts the fetch and commits nothing afterwards", async () => {
  const site: Site = readSite(write({
    "site.json": JSON.stringify({ name: "Mine", collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc", sections: [{ title: "", pages: ["a", "b"] }] }] }),
    "content/docs/a.md": "---\ntitle: A\n---\n# A\n",
    "content/docs/b.md": "---\ntitle: B\n---\n# B\n",
  }));
  const map = mapOf(site);
  const gate = await Effect.runPromise(Deferred.make<void>());
  const calls: Array<string> = [];
  const platform = Nexus.Capability.EnvironmentLive(new Map([[Pages.id, { _tag: "Available", implementation: { load: async (path: string) => { calls.push(path); await Effect.runPromise(Deferred.await(gate)); return site.pages.find((candidate) => candidate.path === path)!; } } }]]));
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application(await compilePage(), map), { platform, state: { ...initial, page: "docs-a", content: site.pages[0]! }, shutdown: { grace: 0 } }).pipe(Scope.extend(scope)));

  void Effect.runPromise(Effect.exit(handle.invoke("app/go", [{ value: "docs-b" }])));
  await new Promise((resolve) => setTimeout(resolve, 30));

  const during = await Effect.runPromise(handle.state);

  expect(during).toMatchObject({ page: "docs-b", status: "loading" });
  await Effect.runPromise(Scope.close(scope, Exit.void));
  await Effect.runPromise(Deferred.succeed(gate, undefined));
  await new Promise((resolve) => setTimeout(resolve, 30));

  const after = await Effect.runPromise(Effect.exit(handle.state));

  seen.record("lifecycle", { calls, during: { page: (during as { page: string }).page, status: (during as { status: string }).status }, afterClose: Exit.isFailure(after) ? "state ended with the application" : "state still readable" });
  expect(calls).toEqual(["/docs/b"]);
  expect(Exit.isFailure(after) || (Exit.isSuccess(after) && (after.value as { status: string }).status === "loading")).toBe(true);     // never "ready": the late answer was not committed
});

it("compatibility: the same content under another base and address is a rebuild, not an edit; and the 0.7-style entry points still work with no plugins", async () => {
  const dir = write({
    "site.json": JSON.stringify({ name: "Mine", collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc", sections: [{ title: "", pages: ["a", "b"] }] }] }),
    "content/docs/a.md": "---\ntitle: A\n---\n# A\n\n[B](/docs/b)\n",
    "content/docs/b.md": "---\ntitle: B\n---\n# B\n",
  });
  const site = readSite(dir);
  const root = mkdtempSync(join(tmpdir(), "task-out-"));
  const moved = mkdtempSync(join(tmpdir(), "task-out-"));

  await exportSite(site, root, built);
  await exportSite({ ...site, base: "/new/", url: "https://new.example" }, moved, { ...built, base: "/new/" });
  expect(readFileSync(join(root, "docs/a/index.html"), "utf8")).toContain('href="/docs/b"');
  expect(readFileSync(join(moved, "docs/a/index.html"), "utf8")).toContain('href="/new/docs/b"');
  expect(JSON.stringify(site.pages.map((page) => page.blocks))).toBe(JSON.stringify(readSite(dir).pages.map((page) => page.blocks)));       // the content did not change

  // The entry points as they were in 0.7: no plugins, primitives and history given by the application.
  const map = mapOf(site);
  const program = await compilePage();
  const old = await Effect.runPromise(renderToHtml(application(program, map), { primitives, state: { ...initial, page: "docs-a", content: site.pages[0]! } }));
  const dom = new JSDOM('<!doctype html><main id="m"></main>', { url: "http://localhost/docs/a" });
  const platform = Nexus.Capability.EnvironmentLive(new Map());
  const host = await Web.run(application(program, map), { container: dom.window.document.getElementById("m")!, primitives, present: "mount", state: { ...initial, page: "docs-a", content: site.pages[0]! }, platform, history: { window: dom.window as unknown as Window, urlOf: (state) => `/docs/${state.page.replace("docs-", "")}`, stateOf: () => ({ id: "docs-a" }), navigate: "go" } });

  seen.record("compatibility.oldEntryPoints", { renderedBytes: old.html.length, mounted: dom.window.document.getElementById("m")!.querySelector("h1")?.textContent });
  expect(old.html).toContain("<h1");
  expect(dom.window.document.getElementById("m")!.querySelector("h1")?.textContent).toContain("A");
  await host.stop();
});
