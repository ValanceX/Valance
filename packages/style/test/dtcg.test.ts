// The tokens are checked against the Design Tokens Community Group's own schemas and test suite (format 2025.10, vendored unchanged: test/fixtures/dtcg-2025.10/NOTICE.md). The validator must agree
// with every one of the suite's 220 tests, positive and negative; then the graph pass finds what a schema cannot.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveDocument, validateDocument } from "../src/index.js";

const suite = join(fileURLToPath(new URL("..", import.meta.url)), "test", "fixtures", "dtcg-2025.10");
const manifest = JSON.parse(readFileSync(join(suite, "manifest.json"), "utf8")) as { tests: Array<{ id: string; type: string; input: string }> };

describe("the official format test suite (2025.10)", () => {
  it("has the tests the vendored copy says", () => {
    expect(manifest.tests.length).toBe(220);
  });

  it.each(manifest.tests)("$id ($type)", ({ type, input }) => {
    const document = JSON.parse(readFileSync(join(suite, input), "utf8")) as unknown;

    // a document is valid when the schemas accept it and the graph pass finds nothing in it
    const schema = validateDocument(document);
    const graph = schema.valid ? resolveDocument(document, input) : undefined;
    // an alias or a pointer can put a value where its type is wrong, which only the resolved document shows
    const again = graph !== undefined && graph.problems.length === 0 ? validateDocument(graph.resolved) : undefined;
    const valid = schema.valid && graph!.problems.length === 0 && again!.valid;

    expect(valid, schema.error ?? graph?.problems[0]?.message ?? again?.error).toBe(type === "PositiveEvaluationTest");
  });
});

describe("the validator", () => {
  it("accepts a color in the object form and refuses the old string form (a deliberately wrong value)", () => {
    expect(validateDocument({ a: { $type: "color", $value: { colorSpace: "srgb", components: [1, 0, 0] } } }).valid).toBe(true);
    expect(validateDocument({ a: { $type: "color", $value: "#zzz" } }).valid).toBe(false);
    expect(validateDocument({ a: { $type: "dimension", $value: "0.5rem" } }).valid).toBe(false);
    expect(validateDocument({ a: { $type: "dimension", $value: { value: 0.5, unit: "em" } } }).valid).toBe(false);
  });
});

describe("the graph pass", () => {
  const red = { colorSpace: "srgb", components: [1, 0, 0] };

  it("follows an alias to its end, through a group's inherited type", () => {
    const { tokens, problems } = resolveDocument({ color: { $type: "color", base: { $value: red }, brand: { $value: "{color.base}" } } }, "t.json");

    expect(problems).toEqual([]);
    expect(tokens.get("color.brand")).toEqual({ path: "color.brand", type: "color", value: red });
  });

  it("reports a reference to nothing", () => {
    expect(resolveDocument({ a: { $type: "color", $value: "{b}" } }, "t.json").problems.map((each) => each.code)).toEqual(["token-unresolved"]);
  });

  it("reports a cycle, naming it", () => {
    const { problems } = resolveDocument({ a: { $type: "color", $value: "{b}" }, b: { $type: "color", $value: "{a}" } }, "t.json");

    expect(problems.some((each) => each.code === "token-cycle" && each.message.includes("a -> b -> a"))).toBe(true);
  });

  it("reports an alias whose target has another type", () => {
    const { problems } = resolveDocument({ s: { $type: "dimension", $value: { value: 1, unit: "px" } }, c: { $type: "color", $value: "{s}" } }, "t.json");

    expect(problems.map((each) => each.code)).toEqual(["token-type-mismatch"]);
  });

  it("follows $extends, the group's own members winning, and reports one that loops or points at nothing", () => {
    const base = { $type: "color", text: { $value: red }, surface: { $value: red } };
    const { tokens, problems } = resolveDocument({ base, dark: { $extends: "{base}", text: { $value: { colorSpace: "srgb", components: [1, 1, 1] } } } }, "t.json");

    expect(problems).toEqual([]);
    expect((tokens.get("dark.text")!.value as { components: number[] }).components).toEqual([1, 1, 1]);
    expect(tokens.get("dark.surface")!.value).toEqual(red);
    expect(resolveDocument({ a: { $extends: "{b}" }, b: { $extends: "{a}" } }, "t.json").problems.some((each) => each.code === "extends-cycle")).toBe(true);
    expect(resolveDocument({ a: { $extends: "{nothing}" } }, "t.json").problems.map((each) => each.code)).toEqual(["extends-unresolved"]);
  });

  it("follows a JSON Pointer reference inside a value, and reports one that leads nowhere", () => {
    const ok = resolveDocument(
      { a: { $type: "dimension", $value: { value: { $ref: "#/b/$value/value" }, unit: "px" } }, b: { $type: "dimension", $value: { value: 4, unit: "px" } } },
      "t.json",
    );

    expect(ok.problems).toEqual([]);
    expect(ok.tokens.get("a")!.value).toEqual({ value: 4, unit: "px" });
    expect(resolveDocument({ a: { $type: "dimension", $value: { value: { $ref: "#/nothing" }, unit: "px" } } }, "t.json").problems.map((each) => each.code)).toEqual([
      "token-unresolved",
    ]);
  });

  it("reports a token with no type anywhere", () => {
    expect(resolveDocument({ a: { $value: 1 } }, "t.json").problems.map((each) => each.code)).toEqual(["token-no-type"]);
  });
});
