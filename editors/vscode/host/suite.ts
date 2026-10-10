// Runs INSIDE VS Code (the extension host), against a real workspace. Each case drives the editor through its public commands, the way a user's actions would, and waits for the language
// features to answer. No test framework: a case throws, and `run` reports every failure at once.
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { join } from "node:path";

const EXTENSION = "valancex.valance-vscode";
const root = (): string => vscode.workspace.workspaceFolders![0]!.uri.fsPath;
const uri = (file: string): vscode.Uri => vscode.Uri.file(join(root(), file));

/** Polls until `probe` answers (not `undefined`/`false`), or fails saying what it was waiting for. */
const waitFor = async <T>(what: string, probe: () => T | undefined | false | Promise<T | undefined | false>, ms = 30_000): Promise<T> => {
  const end = Date.now() + ms;

  for (;;) {
    const found = await probe();

    if (found !== undefined && found !== false) { return found; }
    if (Date.now() > end) { throw new Error(`timed out after ${ms} ms waiting for ${what}`); }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const codeOf = (diagnostic: vscode.Diagnostic): string => String(typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code);

const open = async (file: string): Promise<{ readonly document: vscode.TextDocument; readonly editor: vscode.TextEditor; readonly original: string }> => {
  const document = await vscode.workspace.openTextDocument(uri(file));
  const editor = await vscode.window.showTextDocument(document);

  return { document, editor, original: document.getText() };
};

const replaceAll = async (editor: vscode.TextEditor, text: string): Promise<void> => {
  const whole = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length));

  await editor.edit((builder) => { builder.replace(whole, text); });
};

const positionOf = (document: vscode.TextDocument, needle: string, shift = 0): vscode.Position => document.positionAt(document.getText().indexOf(needle) + shift);

const text = (value: unknown): string => JSON.stringify(value);

/** The words of a hover. Its contents are `MarkdownString`s (or plain strings, or `{ language, value }`): objects whose text is `.value`, which `JSON.stringify` does not see. */
const hoverText = (hovers: ReadonlyArray<vscode.Hover>): string => hovers.flatMap((each) => each.contents).map((each) => typeof each === "string" ? each : each.value).join("\n");

const cases: ReadonlyArray<readonly [string, () => Promise<void>]> = [
  ["the extension activates", async () => {
    const extension = vscode.extensions.getExtension(EXTENSION);

    assert.ok(extension, `${EXTENSION} is not installed in the host`);
    await extension.activate();
    assert.ok(extension.isActive);
  }],

  ["a .mprx file is the mprx language", async () => {
    const { document } = await open("src/layout.mprx");

    assert.equal(document.languageId, "mprx");
  }],

  ["a template mistake is a diagnostic at its place, and it clears when fixed", async () => {
    const { document, editor, original } = await open("src/layout.mprx");

    await replaceAll(editor, original.replace("{site}", "{sitee}"));

    const found = await waitFor("an unknown-reference diagnostic", () => vscode.languages.getDiagnostics(document.uri).find((each) => codeOf(each) === "unknown-reference"));

    assert.equal(found.range.start.line, original.split("\n").findIndex((line) => line.includes("{site}")));
    assert.match(found.message, /sitee/);

    await replaceAll(editor, original);
    await waitFor("the diagnostics to clear", () => vscode.languages.getDiagnostics(document.uri).length === 0);
  }],

  ["hover on a component shows its contract", async () => {
    const { document } = await open("src/layout.mprx");
    const at = positionOf(document, "<theme-toggle", 2);
    const found = await waitFor("a hover answer", async () => {
      const result = await vscode.commands.executeCommand<ReadonlyArray<vscode.Hover>>("vscode.executeHoverProvider", document.uri, at);

      return result.length > 0 ? result : undefined;
    });

    assert.match(hoverText(found), /component theme-toggle/);
    assert.match(hoverText(found), /theme: string/);
  }],

  ["go to definition of a component opens its template, not the generated manifest", async () => {
    const { document } = await open("src/layout.mprx");
    const found = await vscode.commands.executeCommand<ReadonlyArray<vscode.Location | vscode.LocationLink>>("vscode.executeDefinitionProvider", document.uri, positionOf(document, "<theme-toggle", 2));
    const targets = found.map((each) => ("targetUri" in each ? each.targetUri : each.uri).fsPath);

    assert.ok(targets.some((target) => target.endsWith(join("src", "theme-toggle.mprx"))), `definitions: ${text(targets)}`);
    assert.ok(!targets.some((target) => target.endsWith("manifest.json")), `definitions: ${text(targets)}`);
  }],

  ["completion after < offers the project's components", async () => {
    const { document, editor, original } = await open("src/layout.mprx");
    const line = original.split("\n").findIndex((each) => each.includes("<header"));

    await editor.edit((builder) => { builder.insert(new vscode.Position(line, 0), "<\n"); });

    const items = await waitFor("completions that include theme-toggle", async () => {
      const result = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", document.uri, new vscode.Position(line, 1), "<");

      return text(result.items.map((each) => each.label)).includes("theme-toggle") ? result.items : undefined;
    });

    assert.ok(items.length > 10);
    await replaceAll(editor, original);
  }],

  ["a broken link in Markdown is a valance diagnostic on its line after saving, and clears when fixed", async () => {
    const { document, editor, original } = await open("content/index.md");

    await replaceAll(editor, `${original.trimEnd()}\n\n[gone](/nowhere)\n`);
    await document.save();

    const found = await waitFor("a link-broken diagnostic from valance", () => vscode.languages.getDiagnostics(document.uri).find((each) => each.source === "valance" && codeOf(each) === "link-broken"), 60_000);

    assert.equal(document.lineAt(found.range.start.line).text, "[gone](/nowhere)");

    await replaceAll(editor, original);
    await document.save();
    await waitFor("the valance diagnostics to clear", () => vscode.languages.getDiagnostics(document.uri).filter((each) => each.source === "valance").length === 0, 60_000);
  }],

  ["valance.json is validated against the schema the extension contributes", async () => {
    const { document, editor, original } = await open("valance.json");

    await replaceAll(editor, original.replace('"name": "Notes"', '"name": "Notes",\n  "titel": "typo"'));

    const found = await waitFor("a schema diagnostic about the unknown key", () => vscode.languages.getDiagnostics(document.uri).find((each) => /titel|not allowed/i.test(each.message)));

    assert.ok(found);
    await replaceAll(editor, original);
  }],
];

/** The entry VS Code calls: runs every case, then fails with all the failures. */
export const run = async (): Promise<void> => {
  const failures: Array<string> = [];

  for (const [name, work] of cases) {
    try {
      await work();
      console.log(`  ok   ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  FAIL ${name}\n       ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) { throw new Error(`${failures.length} of ${cases.length} host cases failed:\n${failures.join("\n")}`); }
};
