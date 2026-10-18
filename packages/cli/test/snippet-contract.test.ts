// A prop that is a piece of template (Bet 5): `snippet(…)` in a component's contract, and `children`, the content between the tags. The model carries the kind (`snippet` with ordered
// parameters); MESH checks the use. Needs a MESH that reads snippets (0.14); an older one is told at the declaration. The last describe builds a site and uses it in a browser.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { chromium } from "playwright";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { entryOf } from "../src/contract.js";
import { meshReadsEnums } from "../src/mesh-support.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const BASIC = { "content/index.md": PAGE("Home", "Text."), "content/guide/a.md": PAGE("A", "## Part\n\nText.") };
const MAIN = (extra = ""): string => `import { component, defineApp, field, snippet } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import panel from "./panel.mprx";
import itemList from "./item-list.mprx";

const Item = Schema.Struct({ id: Schema.String, name: Schema.String });

export default defineApp({
  state: {
    count: field(Schema.Number, 0),
    items: field(Schema.Array(Item), [{ id: "a", name: "Ann" }, { id: "b", name: "Bo" }]),
  },
  commands: (command) => ({
    bump: command((state) => ({ ...state, count: state.count + 1 })),
    add: command((state) => ({ ...state, items: [...state.items, { id: "c", name: "Cy" }] })),
  }),
  layout: component(layout),
  components: [
    component(panel, { props: { title: Schema.String, children: snippet() } }),
    component(itemList, { props: { items: Schema.Array(Item), label: Schema.String, row: snippet(Item, Schema.String)${extra} } }),
  ],
});
`;
const PANEL = "<section><strong>{title}</strong>{@render children()}</section>";
const LIST = '<div class="rows">{#each items as item (item.id)}{@render row(item, label)}{/each}</div>';
const LAYOUT = (inner: string): string => `<shell class="x" theme="light">${inner}</shell>`;
const USES = `<panel title="Totals"><span class="count">{count}</span> <button on.click={bump()}>Bump</button></panel>
<item-list items={items} label="row">{#snippet row(item, tag)}<span class="row">{tag}:{item.name}</span>{/snippet}</item-list>
<button on.click={add()}>Add</button>`;
const FILES = (layout: string, main = MAIN()): Record<string, string> => ({
  ...BASIC,
  "src/main.ts": main,
  "src/layout.mprx": LAYOUT(layout),
  "src/panel.mprx": PANEL,
  "src/item-list.mprx": LIST,
});
const codes = async (files: Record<string, string>): Promise<ReadonlyArray<string>> =>
  (await check(project(files))).diagnostics.map(({ file, line, code }) => `${file}:${line} ${code}`);

const reads = await meshReadsEnums();

describe("the model a contract makes", () => {
  it("writes a snippet as the kind with its parameters in order, a prop that is never absent and a name the template reads", async () => {
    const { Schema } = await import("effect");
    const { snippet } = await import("@valancex/common");
    const { entry, problems } = entryOf({ props: { children: snippet(), row: snippet(Schema.String, Schema.UndefinedOr(Schema.Number)) }, events: {} }, true);

    expect(problems).toEqual([]);
    expect(entry.props["children"]).toEqual({ type: { kind: "snippet", params: [] }, required: true });
    expect(entry.props["row"]).toEqual({ type: { kind: "snippet", params: [{ kind: "string" }, { kind: "number" }] }, required: true });
    expect(entry.scope["row"]).toEqual(entry.props["row"]!.type);
  });

  it("reserves `children`: it is a snippet without parameters", async () => {
    const { Schema } = await import("effect");
    const { snippet } = await import("@valancex/common");
    const { problems } = entryOf({ props: { children: Schema.String }, events: {} }, true);
    const withParams = entryOf({ props: { children: snippet(Schema.String) }, events: {} }, true).problems;

    expect(problems).toHaveLength(1);
    expect(problems[0]!.reason).toContain("reserved");
    expect(withParams).toHaveLength(1);
    expect(withParams[0]!.reason).toContain("takes no parameters");
  });

  it("without a snippet-reading MESH, says so at the declaration", async () => {
    const { snippet } = await import("@valancex/common");
    const { problems } = entryOf({ props: { children: snippet() }, events: {} }, false);

    expect(problems).toHaveLength(1);
    expect(problems[0]!.reason).toContain("needs MESH 0.14");
  });
});

describe.runIf(reads)("the use site is checked (vlx check)", () => {
  it("accepts a composite that renders its children and a snippet passed as the prop of its name", async () => {
    expect(await codes(FILES(USES))).toEqual([]);
  });

  it("reports a snippet rendered with the wrong number of arguments, in the composite's template", async () => {
    const files = { ...FILES(USES), "src/item-list.mprx": '<div class="rows">{#each items as item (item.id)}{@render row(item)}{/each}</div>' };

    expect(await codes(files)).toEqual(["src/item-list.mprx:1 snippet-arity-mismatch"]);
  });

  it("reports a snippet whose body reads a member its parameter does not have, at the use", async () => {
    const layout = USES.replace("{item.name}", "{item.nme}");

    expect(await codes(FILES(layout))).toEqual(["src/layout.mprx:2 unknown-member"]);
  });

  it("reports `children` written both as an attribute and as content between the tags", async () => {
    const layout = '<panel title="T" children={count}>x</panel>';

    expect((await codes(FILES(layout))).sort()).toContain("src/layout.mprx:1 children-conflict");
  });
});

describe("the TypeScript side", () => {
  it("accepts snippet() as a prop beside schemas, and refuses a default for one", () => {
    const file = join(import.meta.dirname, `.typecheck-${process.pid}.ts`);

    writeFileSync(
      file,
      'import { component, field, snippet } from "@valancex/common";\nimport { Schema } from "effect";\ndeclare const template: { readonly mprx: string };\nexport const ok = component(template, { props: { title: Schema.String, children: snippet(), row: snippet(Schema.String) } });\n// @ts-expect-error a snippet has no default\nexport const bad = field(snippet(), snippet());\n',
    );

    try {
      const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        types: ["node"],
      });

      expect(ts.getPreEmitDiagnostics(program).map((each) => ts.flattenDiagnosticMessageText(each.messageText, "\n"))).toEqual([]);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };

/** Whether a Chromium can be started here (the browser tests need one). */
const browserAvailable = await chromium
  .launch()
  .then(async (browser) => {
    await browser.close();

    return true;
  })
  .catch(() => false);

describe.runIf(reads && browserAvailable)("built and drawn in a browser", () => {
  it("draws children and the passed snippet, and keeps them right as the state changes (a node that renders a snippet is never kept on its own memo)", async () => {
    const root = project(FILES(USES));

    await build(root);

    const dist = normalize(join(root, "dist/web"));
    const server = createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url ?? "/", "http://x").pathname;
        const path = normalize(join(dist, url.endsWith("/") ? `${url}index.html` : url));

        if (!path.startsWith(dist + sep)) {
          response.writeHead(403).end();
          return;
        }

        try {
          response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(path));
        } catch {
          response.writeHead(404).end();
        }
      })();
    });

    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const browser = await chromium.launch();

    try {
      // The page as the build wrote it: the content is there before any script runs.
      const html = (await (await fetch(`${origin}/`)).text()).replace(/<!--.*?-->/g, "");

      expect(html).toContain('<span class="count">0</span>');
      expect(html).toContain('<span class="row">row:Ann</span><span class="row">row:Bo</span>');

      const page = await browser.newPage();
      const errors: Array<string> = [];

      page.on("pageerror", (error) => void errors.push(error.message));
      await page.goto(`${origin}/`);
      await page.waitForSelector('#app[data-valance="running"], #app[data-valance="failed"]');
      expect(await page.getAttribute("#app", "data-valance")).toBe("running");
      expect(await page.textContent("section strong")).toBe("Totals");

      // The children read `count` in the declaring template's scope, not the panel's: the panel's own props do not change, and what it draws must.
      await page.click('button:text-is("Bump")');
      await page.waitForFunction(() => document.querySelector(".count")?.textContent === "1");
      await page.click('button:text-is("Bump")');
      await page.waitForFunction(() => document.querySelector(".count")?.textContent === "2");

      await page.click('button:text-is("Add")');
      await page.waitForFunction(() => document.querySelectorAll(".row").length === 3);
      expect(await page.locator(".row").allTextContents()).toEqual(["row:Ann", "row:Bo", "row:Cy"]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      server.close();
    }
  }, 120_000);
});
