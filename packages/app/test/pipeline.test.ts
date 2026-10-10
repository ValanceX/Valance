import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const BASIC = { "content/index.md": PAGE("Home", "See [the guide](/guide/a)."), "content/guide/a.md": PAGE("A", "## Part\n\nText.") };

const codes = async (files: Record<string, string>): Promise<ReadonlyArray<string>> => (await check(project(files))).diagnostics.map(({ file, line, code }) => `${file}:${line} ${code}`);

describe("valance check", () => {
  it("finds no problem in a project with only content, using the built-in layout", async () => {
    const result = await check(project(BASIC));

    expect(result.diagnostics).toEqual([]);
    expect(result.pages).toBe(2);
    expect(result.components).toContain("layout");
  });

  it("reports content and template problems together, in one shape", async () => {
    const found = await codes({ ...BASIC, "content/bad.md": "---\ntitle: Bad\n---\n\n<b>x</b>\n", "src/layout.mprx": "<shell class=\"x\" theme=\"light\"><nothing /></shell>" });

    expect(found).toContain("content/bad.md:5 md-html");
    expect(found.some((entry) => entry.startsWith("src/layout.mprx:1 "))).toBe(true);
  });

  it("points a template error at the line and column of the template", async () => {
    const result = await check(project({ ...BASIC, "src/layout.mprx": '<shell class="x" theme="light">\n  <para class="y">{missingName}</para>\n</shell>\n' }));
    const found = result.diagnostics.find((each) => each.file === "src/layout.mprx");

    expect(found).toMatchObject({ line: 2 });
    expect(found!.message).toMatch(/missingName/);
  });

  it("refuses a component nothing uses, and a name that is already a tag", async () => {
    expect(await codes({ ...BASIC, "src/orphan.mprx": '<para class="x">x</para>' })).toEqual(["src/orphan.mprx:1 template-unused"]);
    expect(await codes({ ...BASIC, "src/link.mprx": "<para />" })).toEqual(["src/link.mprx:0 template-primitive"]);
  });

  it("reads src/main.ts: state fields become names a layout may read, and a clash is an error", async () => {
    const main = (fields: string): string => `import { defineApp, Schema } from "@valancex/app";\nexport default defineApp({ state: { schema: Schema.Struct({ ${fields} }), initial: { ${fields.replace(/: Schema\.\w+/g, ": 0")} } } });\n`;

    expect((await check(project({ ...BASIC, "src/main.ts": main("count: Schema.Number"), "src/layout.mprx": '<shell class="x" theme="light"><para class="y">{count}</para></shell>' }))).diagnostics).toEqual([]);
    expect(await codes({ ...BASIC, "src/main.ts": main("title: Schema.Number") })).toEqual(["src/main.ts:1 entry-definition"]);
    expect(await codes({ ...BASIC, "src/main.ts": "export default 1;\n" })).toEqual(["src/main.ts:1 entry-export"]);
    expect(await codes({ ...BASIC, "src/main.ts": 'import { defineApp } from "@valancex/app";\nexport default defineApp({ commands: (command) => ({ go: command((state) => state) }) });\n' })).toEqual(["src/main.ts:1 entry-definition"]);
  });

  it("does not need a build or a browser, and does not write outside .valance/", async () => {
    const root = project(BASIC);

    await check(root);

    expect(readdirSync(root).sort()).toEqual([".valance", "content", "node_modules", "valance.json"]);
  });
});

describe("valance build", () => {
  it("writes one document per page, a 404 page, the bundle and public files, and nothing else into the project", async () => {
    const root = project({ ...BASIC, "public/logo.svg": "<svg/>" });
    const built = await build(root);

    expect(built.pages).toEqual(["/", "/guide/a"]);
    expect(existsSync(join(root, "dist/index.html"))).toBe(true);
    expect(existsSync(join(root, "dist/guide/a/index.html"))).toBe(true);
    expect(existsSync(join(root, "dist/404.html"))).toBe(true);
    expect(existsSync(join(root, "dist/logo.svg"))).toBe(true);
    expect(existsSync(join(root, "dist/.vite"))).toBe(false);
    expect(readdirSync(join(root, "dist/assets")).some((file) => file.endsWith(".wasm"))).toBe(true);
    expect(readdirSync(root).sort()).toEqual([".valance", "content", "dist", "node_modules", "public", "valance.json"]);
    expect(readdirSync(join(root, ".valance")).filter((name) => name !== "cache").sort()).toEqual([".gitignore", "client.ts", "content.json", "manifest.json", "program.json", "server.ts"]);
    expect(readFileSync(join(root, ".valance/.gitignore"), "utf8")).toContain("*");
  });

  it("renders each page with its title, description, links and a state for the browser", async () => {
    const root = project({ "content/index.md": "---\ntitle: Home\ndescription: The start.\n---\n\n# Home\n\n[Go](/guide/a)\n", "content/guide/a.md": PAGE("A") });

    await build(root);

    const home = readFileSync(join(root, "dist/index.html"), "utf8");

    expect(home).toContain("<title>Home · Test</title>");
    expect(home).toContain('<meta name="description" content="The start."');
    expect(home).toContain('href="/guide/a"');
    expect(home).toContain('"state":{"page":"/"}');
    expect(readFileSync(join(root, "dist/guide/a/index.html"), "utf8")).toContain("<title>A · Test</title>");
    expect(readFileSync(join(root, "dist/404.html"), "utf8")).toContain("Page not found");
  });

  it("serves under a base path, with canonical links and a sitemap when the site has an address", async () => {
    const root = project({ ...BASIC, "valance.web.json": '{ "base": "/docs/", "url": "https://example.com" }', "public/logo.svg": "<svg/>" });

    await build(root);

    const home = readFileSync(join(root, "dist/index.html"), "utf8");

    expect(home).toContain('href="/docs/guide/a"');
    expect(home).toContain('<link rel="canonical" href="https://example.com/docs/"');
    expect(home).toMatch(/src="\/docs\/assets\/client-[\w-]+\.js"/);
    expect(readFileSync(join(root, "dist/sitemap.xml"), "utf8")).toContain("<loc>https://example.com/docs/guide/a</loc>");
  });

  it("fails with the diagnostics, writing no site, when the content is wrong", async () => {
    const root = project({ ...BASIC, "content/index.md": PAGE("Home", "[x](/nowhere)") });

    await expect(build(root)).rejects.toThrow("content/index.md:7 link-broken");
    expect(existsSync(join(root, "dist"))).toBe(false);
  });

  it("lets a template replace a built-in by name", async () => {
    const root = project({ ...BASIC, "src/runs.mprx": '<mesh-fragment><mesh-each items={spans} as="s" key={s.id}><em>{s.text}</em></mesh-each></mesh-fragment>' });

    writeFileSync(join(root, "unused"), "");
    await build(root);

    expect(readFileSync(join(root, "dist/index.html"), "utf8")).toContain("<em>See </em>");
  });
});

describe("a mistake in src/main.ts itself", () => {
  it("is a diagnostic about the file, not a crash", async () => {
    const found = await codes({ "content/index.md": PAGE(), "src/main.ts": "export default (\n" });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/main\.ts:\d+ entry-load$/);
  });
});
