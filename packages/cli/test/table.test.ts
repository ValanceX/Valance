// A portable static table (docs/application-model/TABLE.md, T-1 to T-12): what the page writes for a table, and that the two targets agree on it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { plan } from "../src/init.js";
import { tagsOf } from "../src/tags.js";
import { TARGETS } from "../src/targets.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const withLayout = (markup: string): string => {
  const files = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  return project({ ...files, "src/layout.mprx": files["src/layout.mprx"]!.replace("<screen />", `<screen />${markup}`) });
};

const TABLE = `
  <table label="Orders" class="orders">
    <tablehead>
      <tablerow>
        <columnheader sort="ascending">Order</columnheader>
        <columnheader>Customer</columnheader>
      </tablerow>
    </tablehead>
    <tablebody>
      <tablerow class="open"><cell>1</cell><rowheader>Ada</rowheader></tablerow>
      <tablerow><cell>2</cell><rowheader>Grace</rowheader></tablerow>
    </tablebody>
  </table>`;

describe("the static table on the web", () => {
  it("is the native elements: thead and tbody around the rows, th with a scope, the label as aria-label, the sort as aria-sort", async () => {
    const root = withLayout(TABLE);

    expect((await check(root)).diagnostics).toEqual([]);
    await build(root);

    const html = readFileSync(join(root, "dist/web/index.html"), "utf8");
    const table = /<table[^>]*>[\s\S]*<\/table>/.exec(html)?.[0] ?? "";

    expect(/<table[^>]*>/.exec(table)?.[0]).toMatch(/aria-label="Orders"/);
    expect(/<table[^>]*>/.exec(table)?.[0]).toMatch(/class="orders"/);
    expect(table).toContain('<thead><tr><th aria-sort="ascending" scope="col">Order</th><th scope="col">Customer</th></tr></thead>');
    expect(table).toContain('<tbody><tr class="open"><td>1</td><th scope="row">Ada</th></tr><tr><td>2</td><th scope="row">Grace</th></tr></tbody>');
    expect(table.match(/aria-sort/g)).toHaveLength(1);
  }, 240_000);

  it("a header takes no prop of a cell and a table takes no event: a misspelt one is refused", async () => {
    const found = (await check(withLayout("<table><tablebody><tablerow><cell colspan={2}>x</cell></tablerow></tablebody></table>"))).diagnostics.map((each) => each.code);

    expect(found).toContain("unknown-prop");
  }, 120_000);
});

describe("the two targets agree on the table (T-11), checked against a Port checkout", () => {
  // The Desktop PORT is released on its own. Until a release carries the table tags, Valance cannot see them in the installed package, so a checkout of the Port repository next to this one (or PORT_REPO)
  // stands in; once the installed vocabulary has them, this joins the parity test in choice-group.test.ts and goes.
  const port = process.env["PORT_REPO"] ?? join(import.meta.dirname, "../../../../Port");
  const available = existsSync(join(port, "packages/port-desktop/vocabulary.json"));

  it.skipIf(!available)("a desktop prop or event that a table tag has is the web's, of the same type", async () => {
    const { fromManifests, webVocabulary } = await import("@valancex/common/internal");
    const read = (name: string): { readonly components: Readonly<Record<string, unknown>> } => JSON.parse(readFileSync(join(port, "packages/port-desktop", name), "utf8"));
    const desktop = tagsOf(fromManifests("desktop", read("vocabulary.json"), read("content.json")));
    const web = tagsOf(webVocabulary);

    for (const name of ["table", "tablehead", "tablebody", "tablerow", "columnheader", "rowheader", "cell"]) {
      const there = desktop.find((tag) => tag.name === name);
      const here = web.find((tag) => tag.name === name);

      expect(there, `${name} (desktop)`).toBeDefined();
      expect(here, `${name} (web)`).toBeDefined();
      for (const prop of there!.props) {
        expect(
          here!.props.map((each) => each.replace("*", "")),
          `${name}: ${prop}`,
        ).toContain(prop.replace("*", ""));
      }
      for (const event of there!.events) {
        expect(here!.events, `${name}: ${event}`).toContain(event);
      }
    }
  });

  it("the installed desktop vocabulary does not have them yet, so a desktop project that writes a table is refused", () => {
    const desktop = tagsOf(TARGETS.find((each) => each.id === "desktop")!.vocabulary);

    // This is the state until the Port release; when it fails, the release is installed: delete this test and the checkout test above, and add the seven names to choice-group.test.ts.
    expect(desktop.some((tag) => tag.name === "table")).toBe(false);
  });
});
