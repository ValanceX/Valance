// The VS Code side: thin. It starts the MESH language server with the settings the project generated, shows `valance check` diagnostics for the files that server does not read, and
// sends a tag to the template that defines it. Everything else (the language, the diagnostics, hover, completion) is the server's.
import * as vscode from "vscode";
import type { LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { LanguageClient } from "vscode-languageclient/node";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { forTheCheck, place, run } from "./diagnostics";
import { readProject, templateOf } from "./project";
import type { LspSettings } from "./project";

let client: LanguageClient | undefined;

const binary = (root: string, name: string): string => join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  const folder = vscode.workspace.workspaceFolders?.[0];

  if (folder === undefined) { return; }

  const root = folder.uri.fsPath;
  const output = vscode.window.createOutputChannel("VALANCE");
  const collection = vscode.languages.createDiagnosticCollection("valance");
  let settings: LspSettings | undefined;

  context.subscriptions.push(output, collection);

  // ---- template language server -----------------------------------------------------------------------------------------------------------------------------------

  const startServer = async (): Promise<void> => {
    const project = readProject(root);

    if (project.kind !== "ready") {
      output.appendLine(project.kind === "not-generated" ? "No .valance/editor.json yet: run `valance dev`, `valance build` or `valance check` once, and reload the window." : "Not a VALANCE project.");

      return;
    }

    settings = project.settings;

    const configured = vscode.workspace.getConfiguration("valance").get<string>("meshLsp.path", "");
    const command = configured !== "" ? configured : binary(root, "mesh-lsp");

    if (!existsSync(command)) { output.appendLine(`mesh-lsp not found at ${command}. Install it in the project: npm install -D @valancex/mesh-lsp`); return; }

    const server: ServerOptions = { command, args: [] };
    const options: LanguageClientOptions = {
      documentSelector: [{ language: "mprx" }, { language: "json", pattern: `${root}/${project.settings.model}` }],
      initializationOptions: project.settings,
      outputChannel: output,
      middleware: {
        // The server answers a definition with the manifest (the generated JSON). An author wants the template.
        provideDefinition: async (document, position, token, next) => {
          const tag = document.getText(document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_-]*/));
          const file = settings === undefined ? undefined : templateOf(settings, tag);

          return file === undefined ? next(document, position, token) : new vscode.Location(vscode.Uri.file(join(root, file)), new vscode.Position(0, 0));
        },
      },
    };

    client = new LanguageClient("valance-mesh", "MPRX (MESH)", server, options);
    await client.start();
  };

  // ---- everything else the project can get wrong -------------------------------------------------------------------------------------------------------------------

  const check = async (): Promise<void> => {
    const command = binary(root, "valance");

    if (!existsSync(command)) { return; }

    try {
      const found = forTheCheck(await run(root, command)).map(place);
      const byFile = new Map<string, vscode.Diagnostic[]>();

      for (const each of found) {
        const line = each.startLine;
        const range = new vscode.Range(line, each.startColumn, line, each.endColumn < 0 ? Number.MAX_SAFE_INTEGER : each.endColumn);
        const diagnostic = new vscode.Diagnostic(range, each.message, vscode.DiagnosticSeverity.Error);

        diagnostic.code = each.code;
        diagnostic.source = "valance";
        byFile.set(each.file, [...(byFile.get(each.file) ?? []), diagnostic]);
      }

      collection.clear();

      for (const [file, list] of byFile) { collection.set(vscode.Uri.file(join(root, file)), list); }
    } catch (error) {
      output.appendLine(`valance check: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => { if (/\.(md|mprx|ts|json)$/.test(document.fileName) && document.uri.fsPath.startsWith(root)) { void check(); } }),
    vscode.commands.registerCommand("valance.check", check),
  );

  await startServer();
  await check();
};

export const deactivate = async (): Promise<void> => { await client?.stop(); };
