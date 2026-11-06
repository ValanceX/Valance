// `effect-version` and `effect-v3-schema`: the checks that catch a project still written for effect 3, whose `Schema.Literal("a", "b")` runs and silently keeps one value.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const MAIN = (schema: string): string => `import { defineApp } from "@valancex/common";
import { Schema } from "effect";

export default defineApp({
  state: { schema: ${schema}, initial: {} },
});
`;
const withSchema = (schema: string, more: Record<string, string> = {}): string => project({ "content/index.md": PAGE(), "src/main.ts": MAIN(schema), ...more });
const found = async (root: string, code: string) => (await check(root)).diagnostics.filter((each) => each.code === code);

describe("effect-v3-schema", () => {
  it("reports Schema.Literal with several values, at its line and column", async () => {
    expect(await found(withSchema('Schema.Struct({ a: Schema.Literal("x", "y") })'), "effect-v3-schema")).toEqual([
      { file: "src/main.ts", line: 5, column: 39, code: "effect-v3-schema", message: "Schema.Literal takes one value in effect 4: write Schema.Literals([...])" },
    ]);
  });

  it("reports Schema.Union and Schema.Tuple given members instead of an array", async () => {
    const root = withSchema("Schema.Struct({ a: Schema.Union(Schema.String, Schema.Number), b: Schema.Tuple(Schema.String) })");

    expect((await found(root, "effect-v3-schema")).map((each) => each.message)).toEqual([
      "Schema.Union takes an array in effect 4: write Schema.Union([...])",
      "Schema.Tuple takes an array in effect 4: write Schema.Tuple([...])",
    ]);
  });

  it("looks in every .ts file under src/", async () => {
    const root = withSchema("Schema.Struct({})", { "src/lib/old.ts": 'import { Schema } from "effect";\nexport const old = Schema.Literal("a", "b");\n' });

    expect(await found(root, "effect-v3-schema")).toMatchObject([{ file: "src/lib/old.ts", line: 2, column: 20 }]);
  });

  it("is silent on the v4 spelling, and on a call in a comment or string", async () => {
    const root = withSchema(
      'Schema.Struct({ a: Schema.Literal("x"), b: Schema.Union([Schema.String, Schema.Number]), c: Schema.Literals(["x", "y"]), d: Schema.Tuple([Schema.String]) })',
      {
        "src/note.ts": '// Schema.Literal("a", "b")\nexport const note = "Schema.Union(a, b)";\n',
      },
    );

    expect(await found(root, "effect-v3-schema")).toEqual([]);
  });

  it("is silent on a project with no such call", async () => {
    expect((await check(withSchema("Schema.Struct({})"))).diagnostics).toEqual([]);
  });
});

describe("effect-version", () => {
  it("is silent on effect 4", async () => {
    expect(await found(withSchema("Schema.Struct({})"), "effect-version")).toEqual([]);
  });

  it("reports an installed effect that is not 4.x, once, at its package.json line", async () => {
    const root = withSchema("Schema.Struct({})", { "package.json": '{\n  "dependencies": {\n    "effect": "^3.0.0"\n  }\n}\n' });

    // the project's own effect, in place of the linked one
    rmSync(join(root, "node_modules", "effect"), { force: true });
    mkdirSync(join(root, "node_modules", "effect"));
    writeFileSync(join(root, "node_modules", "effect", "package.json"), '{ "name": "effect", "version": "3.19.0" }');

    expect(await found(root, "effect-version")).toEqual([
      { file: "package.json", line: 3, column: 0, code: "effect-version", message: "effect 3.19.0 is installed; Valance needs effect ^4.1.0" },
    ]);
  });
});
