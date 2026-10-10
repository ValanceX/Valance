import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { forTheCheck, parse, place } from "../src/diagnostics";
import { readProject, templateOf } from "../src/project";

const dir = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "valance-vscode-"));

  for (const [name, text] of Object.entries(files)) { mkdirSync(join(root, name, ".."), { recursive: true }); writeFileSync(join(root, name), text); }

  return root;
};

describe("reading a project", () => {
  it("is not a project without valance.json, and not generated before the first run", () => {
    expect(readProject(dir({}))).toEqual({ kind: "not-a-project" });
    expect(readProject(dir({ "valance.json": "{}" }))).toEqual({ kind: "not-generated" });
    expect(readProject(dir({ "valance.json": "{}", ".valance/editor.json": '{ "version": 9 }' }))).toEqual({ kind: "not-generated" });
  });

  it("hands the server exactly what the project generated, and finds the template of a tag", () => {
    const components = { "src/layout.mprx": "layout", "src/theme-toggle.mprx": "theme-toggle" };
    const project = readProject(dir({ "valance.json": "{}", ".valance/editor.json": JSON.stringify({ version: 1, model: ".valance/manifest.json", components }) }));

    expect(project).toEqual({ kind: "ready", settings: { model: ".valance/manifest.json", components } });

    if (project.kind === "ready") {
      expect(templateOf(project.settings, "theme-toggle")).toBe("src/theme-toggle.mprx");
      expect(templateOf(project.settings, "div")).toBeUndefined();
    }
  });
});

describe("diagnostics from `valance check`", () => {
  it("places a line-only diagnostic on the whole line, and a located one on its column", () => {
    expect(place({ file: "content/a.md", line: 12, column: 0, code: "link-broken", message: "x" })).toMatchObject({ startLine: 11, startColumn: 0, endColumn: -1 });
    expect(place({ file: "valance.json", line: 0, column: 0, code: "config-missing", message: "x" })).toMatchObject({ startLine: 0 });
    expect(place({ file: "src/main.ts", line: 3, column: 5, code: "entry-load", message: "x" })).toMatchObject({ startLine: 2, startColumn: 4, endColumn: 5 });
  });

  it("leaves template diagnostics to the language server, which shows them with hover and fixes", () => {
    const all = [{ file: "src/layout.mprx", line: 1, column: 1, code: "a", message: "" }, { file: "content/a.md", line: 1, column: 0, code: "b", message: "" }];

    expect(forTheCheck(all).map((each) => each.file)).toEqual(["content/a.md"]);
  });

  it("refuses output that is not the documented list", () => {
    expect(parse("[]")).toEqual([]);
    expect(() => parse('{ "a": 1 }')).toThrow(/did not print a list/);
  });
});

describe("shipped schemas", () => {
  it("are the ones @valancex/app owns", () => {
    for (const name of ["valance.schema.json", "valance.web.schema.json"]) {
      expect(readFileSync(join(__dirname, "..", "schemas", name), "utf8")).toBe(readFileSync(join(__dirname, "../../../packages/app/schemas", name), "utf8"));
    }
  });
});
