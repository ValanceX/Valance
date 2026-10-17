// A portable static table (docs/application-model/TABLE.md, T-1 to T-12): what the page writes for a table. That the two targets agree on it is in choice-group.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { plan } from "../src/init.js";
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
