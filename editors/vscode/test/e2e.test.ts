// The pieces the extension connects, run for real and together: the project's own `valance` writes what the editor reads, the real `mesh-lsp` is started with exactly those settings,
// and `vlx check --json` is run through the extension's own `run`. What is not run here is VS Code itself (see docs/application-model/EDITOR.md).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { forTheCheck, place, run } from "../src/diagnostics";
import { forWorkspace, readProject } from "../src/project";
import type { Client } from "./lsp-client";
import { connect } from "./lsp-client";

const valance = resolve(__dirname, "../../../packages/cli/bin/vlx.js");
const app = resolve(__dirname, "../../../examples/docs-app");
// The project's own server, as the extension finds it: a dev dependency of the application (examples/docs-app), not of the extension.
const server = resolve(app, "node_modules/@valancex/mesh-lsp/dist/cli.js");

let client: Client;
let layout: string;

beforeAll(async () => {
  execFileSync(process.execPath, [valance, "check"], { cwd: app });

  const project = readProject(app);

  if (project.kind !== "ready") { throw new Error(`the example is not ready: ${project.kind}`); }

  layout = readFileSync(join(app, "src/layout.mprx"), "utf8");
  client = await connect(process.execPath, app, project.settings, [server]);
});

afterAll(async () => { await client?.stop(); });

const lineOf = (text: string, needle: string): { line: number; character: number } => {
  const lines = text.split("\n");
  const line = lines.findIndex((each) => each.includes(needle));

  return { line, character: lines[line]!.indexOf(needle) + 1 };
};

describe("the real language server on a real project", () => {
  it("offers diagnostics, quick fixes, hover, definition and completion; it does not offer semantic tokens (so highlighting is the grammar's)", () => {
    const names = Object.keys(client.capabilities());

    expect(names).toEqual(expect.arrayContaining(["codeActionProvider", "completionProvider", "definitionProvider", "hoverProvider"]));
    expect(names).not.toContain("semanticTokensProvider");
  });

  it("finds nothing wrong with the example's own templates, including its own component", async () => {
    client.open("src/layout.mprx", "mprx", layout);
    client.open("src/theme-toggle.mprx", "mprx", readFileSync(join(app, "src/theme-toggle.mprx"), "utf8"));
    await client.until(() => client.diagnostics.has(client.uri("src/layout.mprx")) && client.diagnostics.has(client.uri("src/theme-toggle.mprx")));

    expect(client.diagnostics.get(client.uri("src/layout.mprx"))).toEqual([]);
    expect(client.diagnostics.get(client.uri("src/theme-toggle.mprx"))).toEqual([]);
  });

  it("reports a misspelt name and a missing prop at their place, offers the fix, and hovers a component with its contract", async () => {
    const broken = layout.replace("{site}", "{sitee}").replace("<theme-toggle theme={theme} on.toggle={toggleTheme()} />", "<theme-toggle on.toggle={toggleTheme()} />");
    const uri = client.uri("src/layout.mprx");

    client.change("src/layout.mprx", 2, broken);
    await client.until(() => (client.diagnostics.get(uri)?.length ?? 0) === 2);

    const found = client.diagnostics.get(uri)!;

    expect(found.map((each) => each.code).sort()).toEqual(["missing-required-prop", "unknown-reference"]);
    expect(found.find((each) => each.code === "unknown-reference")!.range.start).toEqual({ line: lineOf(broken, "sitee").line, character: lineOf(broken, "sitee").character - 1 });

    const actions = await client.request("textDocument/codeAction", { textDocument: { uri }, range: found.find((each) => each.code === "unknown-reference")!.range, context: { diagnostics: [found.find((each) => each.code === "unknown-reference")] } });

    expect((actions.result as Array<{ title: string }>).map((each) => each.title)).toEqual(['Replace with "site"']);

    const hover = await client.request("textDocument/hover", { textDocument: { uri }, position: lineOf(broken, "theme-toggle") });

    expect(hover.result.contents.value).toContain("component theme-toggle");
    expect(hover.result.contents.value).toContain("theme: string");

    const names = await client.request("textDocument/completion", { textDocument: { uri }, position: lineOf(broken, "sitee") });

    expect(JSON.stringify(names.result)).toContain("sections");
  });
});

describe("what the server cannot see", () => {
  it("is found by `vlx check --json` through the extension's own run, and placed on the right line", async () => {
    const root = mkdtempSync(join(tmpdir(), "valance-vscode-e2e-"));

    mkdirSync(join(root, "node_modules/@valancex"), { recursive: true });
    mkdirSync(join(root, "content"));
    symlinkSync(resolve(__dirname, "../../../packages/cli"), join(root, "node_modules/@valancex/cli"), "dir");
    writeFileSync(join(root, "valance.json"), '{ "name": "T" }');
    writeFileSync(join(root, "content/index.md"), "---\ntitle: Home\n---\n\n# Home\n\n[gone](/nowhere)\n");

    const found = forTheCheck(await run(root, valance)).map(place);

    expect(found).toEqual([expect.objectContaining({ file: "content/index.md", startLine: 6, code: "link-broken", endColumn: -1 })]);
  });
});

describe("a project inside a larger workspace (the window opened on a folder above it)", () => {
  it("is understood by the real server only when the paths are written from the workspace", async () => {
    const parent = mkdtempSync(join(tmpdir(), "valance-vscode-parent-"));

    mkdirSync(join(parent, "apps"), { recursive: true });
    symlinkSync(app, join(parent, "apps", "docs"), "dir");

    const project = readProject(app);

    if (project.kind !== "ready") { throw new Error("the example is not ready"); }

    const broken = layout.replace("{site}", "{sitee}");
    const ask = async (settings: unknown, file: string): Promise<ReadonlyArray<string>> => {
      const inner = await connect(process.execPath, parent, settings, [server]);

      inner.open(file, "mprx", broken);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const codes = (inner.diagnostics.get(inner.uri(file)) ?? []).map((each) => each.code);

      await inner.stop();

      return codes;
    };

    // Written as the project sees them: the server cannot find the file, so it checks without a model and says nothing about the misspelt name.
    expect(await ask(project.settings, "apps/docs/src/layout.mprx")).toEqual([]);
    // Written from the workspace: the same file now gets the project's diagnostics.
    expect(await ask(forWorkspace(parent, join(parent, "apps", "docs"), project.settings), "apps/docs/src/layout.mprx")).toEqual(["unknown-reference"]);
  });
});

describe("a project that changes while the server runs", () => {
  it("is picked up through didChangeConfiguration: a file the server did not know becomes one it checks", async () => {
    const project = readProject(app);

    if (project.kind !== "ready") { throw new Error("the example is not ready"); }

    const inner = await connect(process.execPath, app, { model: project.settings.model, components: {} }, [server]);
    const broken = layout.replace("{site}", "{sitee}");

    inner.open("src/layout.mprx", "mprx", broken);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(inner.diagnostics.get(inner.uri("src/layout.mprx"))).toEqual([]);                  // not mapped to a component: checked without a model, so nothing to say

    inner.configure(project.settings);
    await inner.until(() => (inner.diagnostics.get(inner.uri("src/layout.mprx"))?.length ?? 0) > 0);
    expect(inner.diagnostics.get(inner.uri("src/layout.mprx"))!.map((each) => each.code)).toEqual(["unknown-reference"]);
    await inner.stop();
  });
});
