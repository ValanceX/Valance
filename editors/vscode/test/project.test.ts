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

describe("wiring: both ends of each connection", () => {
  const P = (file: string, line: number, column = 1) => ({ file, line, column });
  const wiring = {
    version: 1 as const,
    definitions: { "components/layout/scope/theme": P("src/main.ts", 6, 31), "components/theme-toggle": P("src/theme-toggle.mprx", 1), "components/theme-toggle/props/theme": P("src/theme-toggle.mprx", 1, 40), "components/theme-toggle/events/toggle": P("src/theme-toggle.mprx", 1, 62) },
    bindings: { "components/theme-toggle/props/theme": [P("src/layout.mprx", 4, 16)], "components/theme-toggle/events/toggle": [P("src/layout.mprx", 4, 30)], "components/theme-toggle/commands/toggle": [P("src/layout.mprx", 4, 30)] },
    uses: [
      { at: P("src/layout.mprx", 4, 3), tag: "theme-toggle", target: P("src/theme-toggle.mprx", 1), props: [{ name: "theme", from: "{theme}", at: P("src/layout.mprx", 4, 16) }], events: [{ name: "toggle", to: "toggleTheme()", at: P("src/layout.mprx", 4, 30) }] },
      { at: P("../../packages/cli/views/block.mprx", 3), tag: "heading", target: P("../../packages/cli/views/heading.mprx", 1), props: [], events: [] },
    ],
    components: [{
      name: "theme-toggle",
      file: "src/theme-toggle.mprx",
      props: [{ name: "theme", at: P("src/theme-toggle.mprx", 1, 40), passedBy: [{ at: P("src/layout.mprx", 4, 16), from: "{theme}" }] }],
      events: [{ name: "toggle", at: P("src/theme-toggle.mprx", 1, 62), handledBy: [{ at: P("src/layout.mprx", 4, 30), to: "toggleTheme()" }] }],
    }],
    state: [{ name: "theme", source: P("src/main.ts", 6, 31), readBy: [P("src/layout.mprx", 1), P("src/layout.mprx", 4)] }],
    commands: [{ name: "toggleTheme", source: P("src/main.ts", 10, 5), runBy: [] }],
  };

  const MANIFEST = JSON.stringify({ components: { layout: { scope: { theme: { kind: "string" } }, commands: { go: { parameters: [{ name: "id", type: { kind: "string" } }] } } }, "theme-toggle": { props: { theme: { type: { kind: "string" }, required: true } }, events: { toggle: {} } } } }, null, 2);
  const lineOf = (needle: string, nth = 0): number => MANIFEST.split("\n").map((text, at) => [text, at] as const).filter(([text]) => text.includes(needle))[nth]![1];

  it("reads the path of a manifest key from its indentation, through objects and arrays", async () => {
    const { manifestPath } = await import("../src/wiring");

    expect(manifestPath(MANIFEST, lineOf('"theme": {', 0))).toEqual(["components", "layout", "scope", "theme"]);
    expect(manifestPath(MANIFEST, lineOf('"theme": {', 1))).toEqual(["components", "theme-toggle", "props", "theme"]);
    expect(manifestPath(MANIFEST, lineOf('"parameters"'))).toEqual(["components", "layout", "commands", "go", "parameters"]);
    expect(manifestPath(MANIFEST, 0)).toBeUndefined();                     // the opening brace is not a key
  });

  it("Go to Definition is one place: where the name is declared, whichever file the click is in", async () => {
    const { authoredPlace } = await import("../src/wiring");

    expect(authoredPlace(wiring, MANIFEST, lineOf('"theme": {', 1))).toEqual(P("src/theme-toggle.mprx", 1, 40));
    expect(authoredPlace(wiring, MANIFEST, lineOf('"toggle": {}'))).toEqual(P("src/theme-toggle.mprx", 1, 62));
    expect(authoredPlace(wiring, MANIFEST, lineOf('"theme": {', 0))).toEqual(P("src/main.ts", 6, 31));
    expect(authoredPlace(wiring, MANIFEST, lineOf('"go": {'))).toBeUndefined();
    expect(authoredPlace(undefined, MANIFEST, lineOf('"theme": {', 0))).toBeUndefined();
  });

  it("Find References is every place the name is used: all handlers of an event, all callers of a prop, all reads of a state field, all runs of a command, all uses of a component", async () => {
    const { referencesOf } = await import("../src/wiring");
    const many = {
      ...wiring,
      bindings: { ...wiring.bindings, "components/theme-toggle/events/toggle": [P("src/layout.mprx", 4, 30), P("src/footer.mprx", 2, 8), P("src/layout.mprx", 9, 30)] },
      commands: [{ name: "toggleTheme", source: P("src/main.ts", 10, 5), runBy: [P("src/layout.mprx", 4), P("src/footer.mprx", 2)] }],
      uses: [...wiring.uses, { at: P("src/footer.mprx", 2, 3), tag: "theme-toggle", target: P("src/theme-toggle.mprx", 1), props: [], events: [] }],
    };

    expect(referencesOf(many, MANIFEST, lineOf('"toggle": {}'))).toHaveLength(3);                       // one component, three handlers: a list, not a jump
    expect(referencesOf(many, MANIFEST, lineOf('"theme": {', 1))).toEqual([P("src/layout.mprx", 4, 16)]);
    expect(referencesOf(many, MANIFEST, lineOf('"theme": {', 0))).toEqual([P("src/layout.mprx", 1), P("src/layout.mprx", 4)]);
    expect(referencesOf(many, MANIFEST, lineOf('"theme-toggle": {'))).toEqual([P("src/layout.mprx", 4, 3), P("src/footer.mprx", 2, 3)]);
    expect(referencesOf(many, MANIFEST, lineOf('"go": {'))).toEqual([]);
    expect(referencesOf(undefined, MANIFEST, lineOf('"toggle": {}'))).toEqual([]);
  });

  it("puts the other end beside each end: above a use, above a prop and an event inside the component, above state and commands", async () => {
    const { lensesFor } = await import("../src/wiring");

    expect(lensesFor(wiring, "src/layout.mprx")).toEqual([{ line: 3, title: "→ theme-toggle.mprx  ·  theme ← {theme}  ·  on toggle ⇒ toggleTheme()", targets: [wiring.uses[0]!.target] }]);
    expect(lensesFor(wiring, "src/theme-toggle.mprx").map((lens) => [lens.line, lens.title])).toEqual([
      [0, "used in layout.mprx:4"],
      [0, "prop theme · passed from layout.mprx:4 as {theme}"],
      [0, "event toggle · handled in layout.mprx:4 ⇒ toggleTheme()"],
    ]);
    expect(lensesFor(wiring, "src/main.ts").map((lens) => [lens.line, lens.title])).toEqual([[5, "state · read in layout.mprx:1, layout.mprx:4"], [9, "command · not run by any template"]]);
    expect(lensesFor(wiring, "src/other.mprx")).toEqual([]);
  });

  it("says plainly when nothing connects to a prop or an event", async () => {
    const { lensesFor } = await import("../src/wiring");
    const lonely = { ...wiring, components: [{ ...wiring.components[0]!, props: [{ ...wiring.components[0]!.props[0]!, passedBy: [] }], events: [{ ...wiring.components[0]!.events[0]!, handledBy: [] }] }] };

    expect(lensesFor(lonely, "src/theme-toggle.mprx").map((lens) => lens.title)).toContain("prop theme · not passed by any template");
    expect(lensesFor(lonely, "src/theme-toggle.mprx").map((lens) => lens.title)).toContain("event toggle · not handled by any template");
  });

  it("reads wiring.json when it is there, and nothing when it is missing, old or broken", async () => {
    const { readWiring } = await import("../src/wiring");
    const root = dir({ ".valance/wiring.json": JSON.stringify(wiring), ".valance/old.json": '{ "version": 9 }', ".valance/broken.json": "{ nope" });

    expect(readWiring(root, ".valance/wiring.json")?.uses).toHaveLength(2);
    expect(readWiring(root, ".valance/old.json")).toBeUndefined();
    expect(readWiring(root, ".valance/broken.json")).toBeUndefined();
    expect(readWiring(root, ".valance/none.json")).toBeUndefined();
    expect(readWiring(root, undefined)).toBeUndefined();
  });
});

describe("a project built by an older vlx", () => {
  it("is explained plainly: what still works, what does not, why, and how to fix it", async () => {
    const { explain } = await import("../src/project");
    const text = explain({ kind: "partial" });

    expect(text).toMatch(/language server is running/);
    expect(text).toMatch(/wiring\.json/);
    expect(text).toMatch(/tarball is a frozen copy/);
    expect(text).toMatch(/npm install -D \/path\/to\/Valance\/packages\/cli/);
    expect(text).toMatch(/vlx check/);
  });

  it("has no wiring pointer in editor.json, which readProject reports as ready without one", () => {
    const old = readProject(dir({ "valance.json": "{}", ".valance/editor.json": JSON.stringify({ version: 1, model: ".valance/manifest.json", components: { "src/layout.mprx": "layout" } }) }));

    expect(old).toEqual({ kind: "ready", settings: { model: ".valance/manifest.json", components: { "src/layout.mprx": "layout" } } });
  });
});
