// A prop is a closed set when its schema is a string-literal union (T7), and it has a default when it is declared `field(schema, default)` (T6, T12). The model carries both; MESH checks every
// literal written for the prop at the use site. Needs a MESH compiler that reads the `enum` kind and a prop's `default` (0.14); with an older one the closed set is widened to `string` and a
// default is refused at the declaration (the last describe).
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { entryOf } from "../src/contract.js";
import { meshReadsEnums } from "../src/mesh-support.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const BASIC = { "content/index.md": PAGE("Home", "Text."), "content/guide/a.md": PAGE("A", "## Part\n\nText.") };
const LAYOUT = (inner: string): string => `<shell class="x" theme="light">${inner}</shell>`;
const BADGE = '<span class="b">{tone}</span>';
const main = (props: string): string =>
  `import { component, defineApp, field } from "@valancex/common";\nimport { Schema } from "effect";\nimport layout from "./layout.mprx";\nimport badge from "./badge.mprx";\n\nconst Tone = Schema.Literal("info", "danger");\n\nexport default defineApp({\n  layout: component(layout),\n  components: [component(badge, { props: ${props} })],\n});\n`;
const codes = async (files: Record<string, string>): Promise<ReadonlyArray<string>> =>
  (await check(project({ ...BASIC, "src/badge.mprx": BADGE, ...files }))).diagnostics.map(({ file, line, code }) => `${file}:${line} ${code}`);

const reads = await meshReadsEnums();

describe("the model a contract makes", () => {
  it("writes a string-literal union as an enum, keeps a prop that admits undefined optional, and gives a default only to a `field`", async () => {
    const { Schema } = await import("effect");
    const { field } = await import("@valancex/common");
    const { entry, problems } = entryOf(
      {
        props: {
          tone: field(Schema.Literal("info", "danger"), "info"),
          shade: Schema.UndefinedOr(Schema.Literal("light", "dark")),
          title: Schema.String,
          size: field(Schema.UndefinedOr(Schema.Number), 3),
        },
        events: {},
      },
      true,
    );

    expect(problems).toEqual([]);
    expect(entry.props).toEqual({
      tone: { type: { kind: "enum", values: ["info", "danger"] }, required: false, default: "info" },
      shade: { type: { kind: "enum", values: ["light", "dark"] }, required: false },
      title: { type: { kind: "string" }, required: true },
      size: { type: { kind: "number" }, required: false, default: 3 },
    });
    // The prop is read as the type it has: with a default it is never absent; without one it may be.
    expect(entry.scope).toEqual({
      tone: { kind: "enum", values: ["info", "danger"] },
      shade: { kind: "optional", type: { kind: "enum", values: ["light", "dark"] } },
      title: { kind: "string" },
      size: { kind: "optional", type: { kind: "number" } },
    });
  });

  it("refuses a default that is not a value of the prop's type, at the declaration", async () => {
    const { Schema } = await import("effect");
    const { field } = await import("@valancex/common");
    const { problems } = entryOf({ props: { tone: field(Schema.Literal("info", "danger"), "loud" as never) }, events: {} }, true);

    expect(problems).toEqual([{ kind: "props", name: "tone", reason: "its default is not a value of its type" }]);
  });

  it("without an enum-reading MESH, widens the closed set to string and refuses a default, saying why", async () => {
    const { Schema } = await import("effect");
    const { field } = await import("@valancex/common");
    const { entry, problems } = entryOf({ props: { tone: Schema.Literal("info", "danger"), other: field(Schema.String, "x") }, events: {} }, false);

    expect(entry.props["tone"]).toEqual({ type: { kind: "string" }, required: true });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.reason).toContain("needs MESH 0.14");
  });
});

describe.runIf(reads)("the use site is checked against the closed set (vlx check)", () => {
  const props = "{ tone: field(Tone, 'info'), shade: Schema.UndefinedOr(Schema.Literal('light', 'dark')) }";

  it("accepts a member, and the omitted prop that has a default", async () => {
    expect(await codes({ "src/main.ts": main(props), "src/layout.mprx": LAYOUT('<badge tone="danger" /><badge />') })).toEqual([]);
  });

  it("reports a literal that is not a member as unknown-variant, at the use", async () => {
    const found = (await check(project({ ...BASIC, "src/badge.mprx": BADGE, "src/main.ts": main(props), "src/layout.mprx": LAYOUT('<badge tone="dagner" />') }))).diagnostics;

    expect(found.map(({ file, line, code }) => `${file}:${line} ${code}`)).toEqual(["src/layout.mprx:1 unknown-variant"]);
    expect(found[0]!.message).toContain('did you mean "danger"?');
  });

  it("a prop without a default is still required, and an optional one may be left out", async () => {
    const without = "{ tone: Tone, shade: Schema.UndefinedOr(Schema.Literal('light', 'dark')) }";

    expect(await codes({ "src/main.ts": main(without), "src/layout.mprx": LAYOUT("<badge />") })).toEqual(["src/layout.mprx:1 missing-required-prop"]);
    expect(await codes({ "src/main.ts": main(without), "src/layout.mprx": LAYOUT('<badge tone="info" />') })).toEqual([]);
  });

  it("an enum prop is accepted where a string is wanted", async () => {
    expect(await codes({ "src/main.ts": main("{ tone: Tone, shade: Schema.String }"), "src/layout.mprx": LAYOUT('<badge tone="info" shade="x" />') })).toEqual([]);
  });

  it("reports a declaration with a default of the wrong type at the declaration, not as a crash", async () => {
    const found = (
      await check(project({ ...BASIC, "src/badge.mprx": BADGE, "src/main.ts": main("{ tone: field(Tone, 'loud' as never) }"), "src/layout.mprx": LAYOUT("<badge />") }))
    ).diagnostics;

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "src/main.ts", code: "component-schema" });
    expect(found[0]!.message).toContain("its default is not a value of its type");
  });
});

describe("the TypeScript side", () => {
  const diagnosticsOf = (source: string): ReadonlyArray<string> => {
    // Inside the package, so that `effect` and `@valancex/common` resolve as they do for a project.
    const file = join(import.meta.dirname, `.typecheck-${process.pid}.ts`);

    writeFileSync(file, source);

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

      return ts.getPreEmitDiagnostics(program).map((each) => ts.flattenDiagnosticMessageText(each.messageText, "\n"));
    } finally {
      rmSync(file, { force: true });
    }
  };
  const header = 'import { field } from "@valancex/common";\nimport { Schema } from "effect";\n';

  it("accepts a default that is a member and refuses one that is not", () => {
    expect(diagnosticsOf(`${header}export const ok = field(Schema.Literal("info", "danger"), "info");\n`)).toEqual([]);

    const bad = diagnosticsOf(`${header}export const bad = field(Schema.Literal("info", "danger"), "loud");\n`);

    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('"loud"');
  });
});
