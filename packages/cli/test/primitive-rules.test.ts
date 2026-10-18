// The checks the primitives' specifications give a template (WP3): a control has a name, a list holds only items, an item is in a list. Each fails on a template that breaks the rule and passes on the
// one that keeps it.
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const MAIN = `import { component, defineApp, field } from "@valancex/common";\nimport { Schema } from "effect";\nimport layout from "./layout.mprx";\n\nexport default defineApp({\n  layout: component(layout),\n  state: { on: field(Schema.Boolean, false) },\n});\n`;

const codes = async (layout: string): Promise<ReadonlyArray<string>> =>
  (await check(project({ "content/index.md": PAGE(), "src/main.ts": MAIN, "src/layout.mprx": layout }))).diagnostics.map(
    ({ file, line, column, code }) => `${file}:${line}:${column} ${code}`,
  );

describe("unnamed-control", () => {
  it("reports a checkbox with no label and none around it", async () => {
    expect(await codes("<column><checkbox checked={on} /></column>")).toEqual(["src/layout.mprx:1:9 unnamed-control"]);
  });

  it("accepts a label prop, or a label around the control", async () => {
    expect(await codes('<column><checkbox checked={on} label="Done" /></column>')).toEqual([]);
    expect(await codes("<column><label><checkbox checked={on} /> Done</label></column>")).toEqual([]);
  });

  it("reports a textfield with no name", async () => {
    expect((await codes('<column><textfield value="" /></column>'))[0]).toContain("unnamed-control");
  });
});

describe("list children", () => {
  it("reports text and other primitives inside a list", async () => {
    expect(await codes('<column><list class="l">words</list></column>')).toEqual(["src/layout.mprx:1:9 list-child"]);
    expect(await codes('<column><list class="l"><para class="p">x</para></list></column>')).toEqual(["src/layout.mprx:1:25 list-child"]);
  });

  it("accepts items, also under a condition or a repeat", async () => {
    expect(await codes('<column><list class="l"><item>a</item>{#if on}<item>b</item>{/if}</list></column>')).toEqual([]);
  });

  it("reports an item outside a list", async () => {
    expect(await codes("<column><item>a</item></column>")).toEqual(["src/layout.mprx:1:9 outside-container"]);
  });
});
