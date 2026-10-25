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
    expect(await codes('<column><list class="l"><paragraph class="p">x</paragraph></list></column>')).toEqual(["src/layout.mprx:1:25 list-child"]);
  });

  it("accepts items, also under a condition or a repeat", async () => {
    expect(await codes('<column><list class="l"><listitem>a</listitem>{#if on}<listitem>b</listitem>{/if}</list></column>')).toEqual([]);
  });

  it("reports an item outside a list", async () => {
    expect(await codes("<column><listitem>a</listitem></column>")).toEqual(["src/layout.mprx:1:9 outside-container"]);
  });
});

// A component that takes its name from whoever uses it: the contract says which prop (`name`), the model holds every use to supplying it, and the template must read it.
const withField = (contract: string, field: string, layout: string): Record<string, string> => ({
  "content/index.md": PAGE(),
  "src/main.ts": `import { component, defineApp, field as stateField } from "@valancex/common";\nimport { Schema } from "effect";\nimport layout from "./layout.mprx";\nimport field from "./field.mprx";\n\nexport default defineApp({\n  layout: component(layout),\n  components: [component(field, ${contract})],\n  state: { on: stateField(Schema.Boolean, false) },\n});\n`,
  "src/field.mprx": field,
  "src/layout.mprx": layout,
});

const found = async (files: Record<string, string>): Promise<ReadonlyArray<string>> =>
  (await check(project(files))).diagnostics.map(({ file, line, code }) => `${file}:${line} ${code}`);

const NAMED = "{ props: { label: Schema.String, checked: Schema.Boolean }, name: 'label' }";

describe("a component that takes its name from its user (A3b)", () => {
  it("passes a control with the name it is given, and the use that gives it", async () => {
    expect(await found(withField(NAMED, "<checkbox checked={checked} label={label} />", '<column><field label="Done" checked={on} /></column>'))).toEqual([]);
  });

  it("reports the use that omits the name, where the use is written", async () => {
    expect(await found(withField(NAMED, "<checkbox checked={checked} label={label} />", "<column><field checked={on} /></column>"))).toEqual([
      "src/layout.mprx:1 missing-required-prop",
    ]);
  });

  it("does not report a control in the component that has no name of its own: the name arrives from the use", async () => {
    expect(await found(withField(NAMED, "<column><text>{label}</text><checkbox checked={checked} /></column>", '<column><field label="Done" checked={on} /></column>'))).toEqual(
      [],
    );
  });

  it("reports the same control when the component does not declare where its name comes from", async () => {
    const plain = "{ props: { label: Schema.String, checked: Schema.Boolean } }";

    expect(await found(withField(plain, "<column><text>{label}</text><checkbox checked={checked} /></column>", '<column><field label="Done" checked={on} /></column>'))).toEqual([
      "src/field.mprx:1 unnamed-control",
    ]);
  });

  it("reports a template that declares a name and never reads it", async () => {
    expect(await found(withField(NAMED, '<checkbox checked={checked} label="x" />', '<column><field label="Done" checked={on} /></column>'))).toEqual([
      "src/field.mprx:1 name-unused",
    ]);
  });

  it("reports a name that is not a prop, or not a string every use writes", async () => {
    const missing = "{ props: { checked: Schema.Boolean }, name: 'label' }";
    const optional = "{ props: { label: Schema.UndefinedOr(Schema.String), checked: Schema.Boolean }, name: 'label' }";
    const body = '<checkbox checked={checked} label="x" />';
    const layout = "<column><field checked={on} /></column>";

    expect(await found(withField(missing, body, layout))).toEqual(["src/main.ts:8 component-schema"]);
    expect(await found(withField(optional, body, layout))).toContain("src/main.ts:8 component-schema");
  });
});

describe("a tag the web renamed (P7)", () => {
  it("is refused with the new name in the message", async () => {
    const result = await check(project({ "content/index.md": PAGE(), "src/main.ts": MAIN, "src/layout.mprx": '<column><para class="p">x</para></column>' }));
    const messages = result.diagnostics.map((each) => each.message);

    expect(messages.some((message) => message.includes("`para` is now `paragraph`"))).toBe(true);
  });

  it.each([
    ["item", "listitem", '<column><list class="l"><item>x</item></list></column>'],
    ["quote", "blockquote", '<column><quote class="q">x</quote></column>'],
  ])("says what `%s` is now: `%s`", async (old, now, layout) => {
    const result = await check(project({ "content/index.md": PAGE(), "src/main.ts": MAIN, "src/layout.mprx": layout }));

    expect(result.diagnostics.some((each) => each.message.includes(`\`${old}\` is now \`${now}\``))).toBe(true);
  });

  it("a hook of the web that the specification says may be left out may be: a portable list, paragraph, link, blockquote and image need no class", async () => {
    const layout = '<column><list><listitem><link href="/a">a</link></listitem></list><paragraph>p</paragraph><blockquote>q</blockquote><image src="/x.png" alt="x" /></column>';

    expect(await codes(layout)).toEqual([]);
  });

  it("accepts the new names", async () => {
    expect(await codes('<column><paragraph class="p">x</paragraph><blockquote class="q">y</blockquote></column>')).toEqual([]);
  });
});

describe("unknown-ref: a describedby that points at nothing", () => {
  const field = (describedby: string) => `<textfield label="Name" value="" describedby="${describedby}" />`;

  it("accepts a literal that is the id of an element in the program", async () => {
    expect(await codes(`<column>${field("hint")}<text id="hint">Say who it is</text></column>`)).toEqual([]);
  });

  it("reports a literal that no element has as its id", async () => {
    expect(await codes(`<column>${field("nothing")}<text id="hint">Say who it is</text></column>`)).toEqual(["src/layout.mprx:1:9 unknown-ref"]);
  });

  it("accepts the anchor of a heading in the content, which the built-in views give an id", async () => {
    const files = { "content/index.md": PAGE("Home", "## Notes\n\nText."), "src/main.ts": MAIN, "src/layout.mprx": `<column>${field("notes")}</column>` };

    expect((await check(project(files))).diagnostics).toEqual([]);
  });

  it("says nothing when an id is computed by the author's own template: it could be any", async () => {
    expect(await codes(`<column>${field("row-1")}<text id={on ? "a" : "b"}>x</text></column>`)).toEqual([]);
  });
});
