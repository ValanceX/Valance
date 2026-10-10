import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A MESH checkout beside this repository, or MESH_DIR.
const mesh = process.env["MESH_DIR"] ?? join(__dirname, "../../../../Mesh");

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

describe("diagnostics from `vlx check`", () => {
  it("places a line-only diagnostic on the whole line, and a located one on its column", () => {
    expect(place({ file: "content/a.md", line: 12, column: 0, code: "link-broken", message: "x" })).toMatchObject({ startLine: 11, startColumn: 0, endColumn: -1 });
    expect(place({ file: "valance.json", line: 0, column: 0, code: "config-missing", message: "x" })).toMatchObject({ startLine: 0 });
    expect(place({ file: "src/main.ts", line: 3, column: 5, code: "entry-load", message: "x" })).toMatchObject({ startLine: 2, startColumn: 4, endColumn: 5 });
  });

  it("leaves a template's diagnostics to the language server when it knows the template, and speaks for it when it does not", () => {
    const all = [{ file: "src/layout.mprx", line: 1, column: 1, code: "a", message: "" }, { file: "src/new.mprx", line: 1, column: 1, code: "template-unused", message: "" }, { file: "content/a.md", line: 1, column: 0, code: "b", message: "" }];

    expect(forTheCheck(all, new Set(["src/layout.mprx"])).map((each) => each.file)).toEqual(["src/new.mprx", "content/a.md"]);
    expect(forTheCheck(all).map((each) => each.file)).toEqual(["src/layout.mprx", "src/new.mprx", "content/a.md"]);
  });

  it("tells an author what a template the server does not know costs, and how to fix it", async () => {
    const { unmappedMessage } = await import("../src/diagnostics");

    expect(unmappedMessage("src/new.mprx")).toMatch(/src\/new\.mprx.*hover.*completion.*vlx check/s);
  });

  it("refuses output that is not the documented list", () => {
    expect(parse("[]")).toEqual([]);
    expect(() => parse('{ "a": 1 }')).toThrow(/did not print a list/);
  });
});

describe("shipped schemas", () => {
  it("are the ones @valancex/cli owns", () => {
    for (const name of ["valance.schema.json", "valance.web.schema.json"]) {
      expect(readFileSync(join(__dirname, "..", "schemas", name), "utf8")).toBe(readFileSync(join(__dirname, "../../../packages/cli/schemas", name), "utf8"));
    }
  });
});

describe("the grammar copy", () => {
  it.skipIf(!existsSync(join(mesh, "editors/vscode/syntaxes/mprx.tmLanguage.json")))("is MESH's grammar, byte for byte (run `pnpm sync-grammar` to update)", () => {
    for (const [from, to] of [["editors/vscode/syntaxes/mprx.tmLanguage.json", "syntaxes/mprx.tmLanguage.json"], ["editors/vscode/language-configuration.json", "language-configuration.json"]] as const) {
      expect(readFileSync(join(__dirname, "..", to), "utf8")).toBe(readFileSync(join(mesh, from), "utf8"));
    }
  });
});

describe("finding the project, and writing paths from the workspace", () => {
  it("finds the project when the window is on it, on a folder above it, and on a parent of several; never inside node_modules", async () => {
    const { findProjects } = await import("../src/project");
    const root = dir({ "a/valance.json": "{}", "group/b/valance.json": "{}", "group/c/valance.json": "{}", "node_modules/x/valance.json": "{}", ".hidden/y/valance.json": "{}", "deep/1/2/3/4/valance.json": "{}" });

    expect(findProjects(join(root, "a"))).toEqual([join(root, "a")]);
    expect(findProjects(root)).toEqual([join(root, "a"), join(root, "group/b"), join(root, "group/c")]);
    expect(findProjects(join(root, "group"))).toEqual([join(root, "group/b"), join(root, "group/c")]);
    expect(findProjects(dir({}))).toEqual([]);
  });

  it("prefixes the server's paths with the project's place inside the workspace, and leaves them when they are the same folder", async () => {
    const { forWorkspace } = await import("../src/project");
    const settings = { model: ".valance/manifest.json", components: { "src/layout.mprx": "layout" } };

    expect(forWorkspace("/w", "/w", settings)).toEqual(settings);
    expect(forWorkspace("/w", "/w/examples/app", settings)).toEqual({ model: "examples/app/.valance/manifest.json", components: { "examples/app/src/layout.mprx": "layout" } });
  });

  it("says something useful for each way the server cannot start", async () => {
    const { explain } = await import("../src/project");

    for (const readiness of [{ kind: "not-a-project" }, { kind: "not-generated" }, { kind: "no-server", path: "/x/mesh-lsp" }] as const) { expect(explain(readiness).length).toBeGreaterThan(40); }

    expect(explain({ kind: "not-generated" })).toMatch(/vlx check/);
    expect(explain({ kind: "no-server", path: "/x/mesh-lsp" })).toMatch(/\/x\/mesh-lsp.*mesh-lsp@0\.10\.0/);
  });
});
