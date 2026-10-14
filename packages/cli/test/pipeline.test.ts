import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const BASIC = { "content/index.md": PAGE("Home", "See [the guide](/guide/a)."), "content/guide/a.md": PAGE("A", "## Part\n\nText.") };

/**
 * A src/main.ts that declares the layout, and under it the given components, plus anything else the definition holds. `uses` maps a component's name to the source of its contract (`""` for none:
 * the contract is inferred); each is defined where it is imported, as `const <name>Component = component(<name>, <contract>)`, and the layout lists it by name.
 */
const entry = (uses: Record<string, string> = {}, rest = ""): string => {
  const names = Object.keys(uses);

  return `import { component, defineApp, field } from "@valancex/common";\nimport { Schema } from "effect";\nimport layout from "./layout.mprx";\n${names.map((name) => `import ${name} from "./${name}.mprx";\n`).join("")}\n${names.map((name) => `const ${name}Component = component(${name}${uses[name] === "" ? "" : `, ${uses[name]}`});\n`).join("")}\nexport default defineApp({\n  layout: component(layout),\n  components: [${names.map((name) => `${name}Component`).join(", ")}],\n${rest}});\n`;
};

const codes = async (files: Record<string, string>): Promise<ReadonlyArray<string>> =>
  (await check(project(files))).diagnostics.map(({ file, line, code }) => `${file}:${line} ${code}`);

describe("vlx check", () => {
  it("finds no problem in a project with only content, using the built-in layout", async () => {
    const result = await check(project(BASIC));

    expect(result.diagnostics).toEqual([]);
    expect(result.pages).toBe(2);
    expect(result.components).toContain("layout");
  });

  it("reports content and template problems together, in one shape", async () => {
    const found = await codes({
      ...BASIC,
      "content/bad.md": "---\ntitle: Bad\n---\n\n<b>x</b>\n",
      "src/main.ts": entry(),
      "src/layout.mprx": '<shell class="x" theme="light"><nothing /></shell>',
    });

    expect(found).toContain("content/bad.md:5 md-html");
    expect(found.some((entry) => entry.startsWith("src/layout.mprx:1 "))).toBe(true);
  });

  it("points a template error at the line and column of the template", async () => {
    const result = await check(
      project({ ...BASIC, "src/main.ts": entry(), "src/layout.mprx": '<shell class="x" theme="light">\n  <para class="y">{missingName}</para>\n</shell>\n' }),
    );
    const found = result.diagnostics.find((each) => each.file === "src/layout.mprx");

    expect(found).toMatchObject({ line: 2 });
    expect(found!.message).toMatch(/missingName/);
  });

  it("refuses a template that is not in the tree, and a name that is already a tag", async () => {
    expect(await codes({ ...BASIC, "src/orphan.mprx": '<para class="x">x</para>' })).toEqual(["src/orphan.mprx:0 template-unused"]);
    expect(
      await codes({
        ...BASIC,
        "src/main.ts": 'import { component, defineApp } from "@valancex/common";\nimport link from "./link.mprx";\nexport default defineApp({ override: [component(link)] });\n',
        "src/link.mprx": "<para />",
      }),
    ).toContain("src/main.ts:3 template-primitive");
  });

  it("reads src/main.ts: state fields become names a layout may read, and a clash is an error", async () => {
    const main = (fields: string, layout = false): string =>
      layout
        ? entry({}, `  state: { ${fields} },\n`)
        : `import { defineApp, field } from "@valancex/common";\nimport { Schema } from "effect";\nexport default defineApp({ state: { ${fields} } });\n`;

    expect(
      (
        await check(
          project({
            ...BASIC,
            "src/main.ts": main("count: field(Schema.Number, 0)", true),
            "src/layout.mprx": '<shell class="x" theme="light"><para class="y">{count}</para></shell>',
          }),
        )
      ).diagnostics,
    ).toEqual([]);
    expect(await codes({ ...BASIC, "src/main.ts": main("title: field(Schema.Number, 0)") })).toEqual(["src/main.ts:1 entry-definition"]);
    expect(await codes({ ...BASIC, "src/main.ts": "export default 1;\n" })).toEqual(["src/main.ts:1 entry-export"]);
    expect(
      await codes({
        ...BASIC,
        "src/main.ts": 'import { defineApp } from "@valancex/common";\nexport default defineApp({ commands: (command) => ({ go: command((state) => state) }) });\n',
      }),
    ).toEqual(["src/main.ts:1 entry-definition"]);
  });

  it("does not need a build or a browser, and does not write outside .valance/", async () => {
    const root = project(BASIC);

    await check(root);

    expect(readdirSync(root).sort()).toEqual([".valance", "content", "node_modules", "valance.json"]);
  });
});

describe("vlx build", () => {
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
    expect(
      readdirSync(join(root, ".valance"))
        .filter((name) => name !== "cache")
        .sort(),
    ).toEqual([".gitignore", "client.ts", "content.json", "core.css", "editor.json", "manifest.json", "program.json", "server.ts", "wiring.json"]);
    expect(readFileSync(join(root, ".valance/.gitignore"), "utf8")).toContain("*");
  });

  it("renders each page with its title, description, links and a state for the browser", async () => {
    const root = project({ "content/index.md": "---\ntitle: Home\ndescription: The start.\n---\n\n# Home\n\n[Go](/guide/a)\n", "content/guide/a.md": PAGE("A") });

    await build(root);

    const home = readFileSync(join(root, "dist/index.html"), "utf8");

    expect(home).toContain("<title>Home · Test</title>");
    expect(home).toContain('<meta name="description" content="The start."');
    expect(home).toContain('href="/guide/a"');
    expect(home).toContain('"state":{"page":"/","viewport":"expanded"}');
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
    const root = project({
      ...BASIC,
      "src/main.ts": 'import { component, defineApp } from "@valancex/common";\nimport runs from "./runs.mprx";\nexport default defineApp({ override: [component(runs)] });\n',
      "src/runs.mprx": "<mesh-fragment>{#each spans as s (s.id)}<em>{s.text}</em>{/each}</mesh-fragment>",
    });

    writeFileSync(join(root, "unused"), "");
    await build(root);

    expect(readFileSync(join(root, "dist/index.html"), "utf8")).toContain("<em>See </em>");
  });
});

describe("the component tree declared in src/main.ts", () => {
  const LAYOUT = (inner: string): string => `<shell class="x" theme="light">${inner}</shell>`;
  const BADGE = '<span class="b">{count}</span>';
  const NESTED = "<mesh-fragment><chip label={count} /></mesh-fragment>";
  const CHIP = '<span class="c">{label}</span>';
  const NESTED_MAIN =
    'import { component, defineApp } from "@valancex/common";\nimport layout from "./layout.mprx";\nimport badge from "./badge.mprx";\nimport chip from "./chip.mprx";\nconst chipComponent = component(chip);\nconst badgeComponent = component(badge);\nexport default defineApp({ layout: component(layout), components: [badgeComponent, chipComponent] });\n';

  it("builds a tree of any depth: which components a template uses is read from the template", async () => {
    expect(await codes({ ...BASIC, "src/main.ts": NESTED_MAIN, "src/layout.mprx": LAYOUT('<badge count="1" />'), "src/badge.mprx": NESTED, "src/chip.mprx": CHIP })).toEqual([]);
  });

  it("needs no listing of what a template uses, and refuses a component file that is not registered", async () => {
    expect(
      await codes({ ...BASIC, "src/main.ts": NESTED_MAIN, "src/layout.mprx": LAYOUT('<badge count="1" /><chip label="x" />'), "src/badge.mprx": NESTED, "src/chip.mprx": CHIP }),
    ).toEqual([]);
    expect(await codes({ ...BASIC, "src/main.ts": entry(), "src/layout.mprx": LAYOUT('<badge count="1" />'), "src/badge.mprx": BADGE })).toEqual([
      "src/badge.mprx:0 template-unused",
    ]);
  });

  it("allows a registered component that no template writes yet: it is not part of the program until one does", async () => {
    expect(await codes({ ...BASIC, "src/main.ts": entry({ badge: "" }), "src/layout.mprx": LAYOUT('<para class="y">x</para>'), "src/badge.mprx": BADGE })).toEqual([]);
  });

  it("lets a component place its caller's children, in a default slot and in named ones", async () => {
    const card = '<div class="c"><mesh-slot name="head" /><mesh-slot /></div>';
    const layout = LAYOUT('<card><mesh-fill slot="head"><para class="h">title</para></mesh-fill><para class="y">body</para></card>');

    expect(await codes({ ...BASIC, "src/main.ts": entry({ card: "" }), "src/layout.mprx": layout, "src/card.mprx": card })).toEqual([]);
  });

  it("wants the layout's template named layout, and a template that exists", async () => {
    const main = 'import { component, defineApp } from "@valancex/common";\nimport shell from "./shell.mprx";\nexport default defineApp({ layout: component(shell) });\n';

    expect(await codes({ ...BASIC, "src/main.ts": main, "src/shell.mprx": LAYOUT("") })).toContain("src/main.ts:3 layout-name");
  });

  it("defines a component where it is imported from: its contract can live in a file of its own", async () => {
    const files = {
      ...BASIC,
      "src/main.ts":
        'import { component, defineApp } from "@valancex/common";\nimport layout from "./layout.mprx";\nimport badge from "./badge.js";\nexport default defineApp({ layout: component(layout), components: [badge] });\n',
      "src/badge.ts":
        'import { component } from "@valancex/common";\nimport { Schema } from "effect";\nimport template from "./badge.mprx";\nexport default component(template, { props: { count: Schema.Number } });\n',
      "src/layout.mprx": LAYOUT("<badge count={1} />"),
      "src/badge.mprx": BADGE,
    };

    expect(await codes(files)).toEqual([]);
    expect(await codes({ ...files, "src/layout.mprx": LAYOUT('<badge count="1" />') })).toEqual(["src/layout.mprx:1 type-mismatch"]);
  });
});

describe("a component's contract: declared once, in types, where it is defined", () => {
  const LAYOUT = (inner: string): string => `<shell class="x" theme="light">${inner}</shell>`;
  const BADGE = '<button class="b" pressed="false" on.click={close()}>{label}: {count}</button>';
  const COMMANDS = "  commands: (command) => ({ shut: command((state) => state), pick: command(Schema.Struct({ n: Schema.Number }), (_input, state) => state) }),\n";
  const CONTRACT = "{ props: { label: Schema.String, count: Schema.Number }, events: { close: Schema.Void } }";
  const files = { ...BASIC, "src/layout.mprx": LAYOUT('<badge label="a" count={1} on.close={shut()} />'), "src/badge.mprx": BADGE };

  it("checks the use against the declaration, and MESH reports each mistake at the use or in the template", async () => {
    const main = (contract: string): string => entry({ badge: contract }, COMMANDS);

    expect(await codes({ ...files, "src/main.ts": main(CONTRACT) })).toEqual([]);
    // an undeclared prop passed, a required one omitted, the wrong type, an undeclared event handled
    expect(await codes({ ...files, "src/main.ts": main("{ props: { label: Schema.String, count: Schema.Number }, events: {} }") })).toEqual([
      "src/layout.mprx:1 unknown-event",
      "src/badge.mprx:1 unknown-command",
    ]);
    expect(await codes({ ...files, "src/main.ts": main("{ props: { label: Schema.String }, events: { close: Schema.Void } }") })).toContain("src/layout.mprx:1 unknown-prop");
    expect(await codes({ ...files, "src/layout.mprx": LAYOUT('<badge label="a" on.close={shut()} />'), "src/main.ts": main(CONTRACT) })).toEqual([
      "src/layout.mprx:1 missing-required-prop",
    ]);
    expect(await codes({ ...files, "src/layout.mprx": LAYOUT('<badge label="a" count="two" on.close={shut()} />'), "src/main.ts": main(CONTRACT) })).toEqual([
      "src/layout.mprx:1 type-mismatch",
    ]);
  });

  it("is exactly what is declared: an omitted side is none, and the declaration overrides inference", async () => {
    const main = entry({ badge: "{ props: { label: Schema.String } }" }, COMMANDS);

    // `count` is read by the template but the interface has none: the template cannot read it.
    expect(await codes({ ...files, "src/layout.mprx": LAYOUT('<badge label="a" />'), "src/main.ts": main })).toEqual([
      "src/badge.mprx:1 unknown-command",
      "src/badge.mprx:1 unknown-reference",
    ]);
  });

  it("keeps the inferred contract for a component that declares neither props nor events", async () => {
    expect(await codes({ ...files, "src/main.ts": entry({ badge: "" }, COMMANDS) })).toEqual([]);
    // Two uses that disagree about a prop's type: the first is kept and the second is reported.
    expect(
      await codes({
        ...files,
        "src/layout.mprx": LAYOUT('<badge label="a" count={1} on.close={shut()} /><badge label="a" count="two" on.close={shut()} />'),
        "src/main.ts": entry({ badge: "" }, COMMANDS),
      }),
    ).toEqual(["src/layout.mprx:1 type-mismatch"]);
  });

  it("makes a prop optional when its schema admits undefined, and an event's schema its payload", async () => {
    const optional = {
      ...BASIC,
      "src/layout.mprx": LAYOUT("<badge label={shown} /><badge /><badge label={shown} pick={1} />"),
      "src/badge.mprx": '<span class="b">{label}</span>',
    };
    const contract = "{ props: { label: Schema.UndefinedOr(Schema.String) } }";

    // `label` is absent in the second use, which is fine; `pick` is not a prop.
    expect(await codes({ ...optional, "src/main.ts": entry({ badge: contract }, "  state: { shown: field(Schema.String, 'a') },\n") })).toEqual(["src/layout.mprx:1 unknown-prop"]);

    const payload = {
      ...BASIC,
      "src/layout.mprx": LAYOUT("<badge on.pick={pick($event)} />"),
      "src/badge.mprx": '<button class="b" pressed="false" on.click={pick(1)}>x</button>',
    };

    expect(await codes({ ...payload, "src/main.ts": entry({ badge: "{ events: { pick: Schema.Number } }" }, COMMANDS) })).toEqual([]);
    // `$event` of an event that carries nothing.
    expect(await codes({ ...payload, "src/main.ts": entry({ badge: "{ events: { pick: Schema.Void } }" }, COMMANDS) })).toEqual([
      "src/layout.mprx:1 event-has-no-payload",
      "src/badge.mprx:1 command-arity-mismatch",
    ]);
  });

  it("reports a schema with no model type at the declaration, not as a crash", async () => {
    const main = entry({ badge: "{ props: { label: Schema.String, count: Schema.Union(Schema.String, Schema.Number) }, events: { close: Schema.Void } }" }, COMMANDS);
    const found = (await check(project({ ...files, "src/main.ts": main }))).diagnostics;

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "src/main.ts", code: "component-schema" });
    expect(found[0]!.message).toContain('prop "count"');
    expect(found[0]!.message).toContain("union of different kinds");
    expect(main.split("\n")[found[0]!.line - 1]).toContain("count: Schema.Union");
  });

  it("refuses a contract on the layout: its inputs are the state and the commands", async () => {
    const main =
      'import { component, defineApp } from "@valancex/common";\nimport { Schema } from "effect";\nimport layout from "./layout.mprx";\nexport default defineApp({ layout: component(layout, { props: { x: Schema.String } }) });\n';

    expect(await codes({ ...BASIC, "src/main.ts": main, "src/layout.mprx": LAYOUT("") })).toEqual(["src/main.ts:4 layout-contract"]);
  });
});

describe("state declared field by field", () => {
  const layout = '<shell class="x" theme="light"><para class="y">{count} {theme}</para></shell>';
  const files = (main: string) => ({ ...BASIC, "src/main.ts": main, "src/layout.mprx": layout });

  it("builds the schema and the initial value from the fields, which a layout reads and a command changes", async () => {
    const main = entry(
      {},
      '  state: { count: field(Schema.Number, 0), theme: field(Schema.Literal("light", "dark"), "light") },\n  commands: (command) => ({ bump: command((state) => ({ ...state, count: state.count + 1 })) }),\n',
    );
    const root = project(files(main));

    await build(root);

    const content = readFileSync(join(root, "dist/index.html"), "utf8");

    expect(content).toContain("0light");
  });

  it("checks a default against its field's type", async () => {
    const main = entry({}, '  state: { count: field(Schema.Number, "zero" as never) },\n');

    expect(await codes(files(main))).toEqual(["src/main.ts:1 entry-definition"]);
    expect((await check(project(files(main)))).diagnostics[0]!.message).toContain('default of the state field "count"');
  });

  it("still accepts a hand-built schema with a separate initial value, for hydration and shared schemas", async () => {
    const main = entry({}, '  state: { schema: Schema.Struct({ count: Schema.Number, theme: Schema.String }), initial: { count: 0, theme: "light" } },\n');

    expect(await codes(files(main))).toEqual([]);
  });

  it("keeps a field named schema a field, and a clash with a framework name the same definition error as before", async () => {
    expect(
      await codes({
        ...BASIC,
        "src/main.ts":
          'import { defineApp, field } from "@valancex/common";\nimport { Schema } from "effect";\nexport default defineApp({ state: { schema: field(Schema.String, "") } });\n',
      }),
    ).toEqual([]);
    expect(
      await codes({
        ...BASIC,
        "src/main.ts":
          'import { defineApp, field } from "@valancex/common";\nimport { Schema } from "effect";\nexport default defineApp({ state: { title: field(Schema.String, "") } });\n',
      }),
    ).toEqual(["src/main.ts:1 entry-definition"]);
  });

  it("reports a state field the model cannot hold at the field, not as a crash", async () => {
    const main = entry({}, "  state: { when: field(Schema.DateFromSelf, new Date()) },\n");
    const found = (await check(project({ ...BASIC, "src/main.ts": main, "src/layout.mprx": '<shell class="x" theme="light"><para class="y">x</para></shell>' }))).diagnostics;

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "src/main.ts", code: "state-type" });
    expect(found[0]!.message).toContain('"when"');
    expect(main.split("\n")[found[0]!.line - 1]).toContain("when: field");
  });
});

describe("the types of the templates", () => {
  it("writes each template's props and events as a type, for the project's tsconfig to include, and removes one that is gone", async () => {
    const root = project({
      ...BASIC,
      "src/main.ts": entry({ badge: "{ props: { count: Schema.Number }, events: { close: Schema.Void } }" }, "  commands: (command) => ({ shut: command((state) => state) }),\n"),
      "src/layout.mprx": '<shell class="x" theme="light"><badge count={1} on.close={shut()} /></shell>',
      "src/badge.mprx": '<button class="b" pressed="false" on.click={close()}>{count}</button>',
    });

    await check(root);

    const type = (name: string): string => readFileSync(join(root, ".valance/types", `${name}.d.mprx.ts`), "utf8");

    expect(type("badge")).toContain('Template<"count", "close">');
    expect(type("layout")).toContain("Template<never, never>");
    expect(existsSync(join(root, ".valance/types/badge.mprx.d.ts"))).toBe(false);
  });
});

describe("a mistake in src/main.ts itself", () => {
  it("is a diagnostic about the file, not a crash", async () => {
    const found = await codes({ "content/index.md": PAGE(), "src/main.ts": "export default (\n" });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/main\.ts:\d+ entry-load$/);
  });
});

describe("what an editor reads", () => {
  it("manifest.json declares the author's own components, with the props their uses pass; editor.json maps files to components", async () => {
    const root = project({
      ...BASIC,
      "src/main.ts": entry({ badge: "{ props: { count: Schema.Number } }" }, "  state: { n: field(Schema.Number, 0) },\n"),
      "src/layout.mprx": '<shell class="x" theme="light"><badge count={n} /></shell>',
      "src/badge.mprx": '<span class="b">{count}</span>',
    });

    await build(root);

    const manifest = JSON.parse(readFileSync(join(root, ".valance/manifest.json"), "utf8")) as {
      components: Record<string, { props: Record<string, { required: boolean }>; scope: Record<string, unknown> }>;
    };

    expect(manifest.components["badge"]!.props).toMatchObject({ count: { required: true } });
    expect(Object.keys(manifest.components["layout"]!.scope)).toContain("n");
    expect(JSON.parse(readFileSync(join(root, ".valance/editor.json"), "utf8"))).toEqual({
      version: 1,
      model: ".valance/manifest.json",
      components: { "src/layout.mprx": "layout", "src/badge.mprx": "badge" },
      wiring: ".valance/wiring.json",
    });
  });
});
