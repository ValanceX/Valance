// The VS Code side: thin. It finds the project, starts the MESH language server with the settings the project generated, shows `vlx check` diagnostics for the files that server does not read, and
// sends a tag to the template that defines it. Everything else (the language, the diagnostics, hover, completion) is the server's.
//
// It never fails silently: the state is in the status bar ("VALANCE: ready" or what is wrong and how to fix it), a warning says it once, and the "VALANCE" output channel has the detail. It
// does not need a reload to recover: it watches `.valance/editor.json`, so running `vlx check` or `vlx dev` is enough.
import * as vscode from "vscode";
import type { LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { LanguageClient } from "vscode-languageclient/node";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { forTheCheck, place, run, UNMAPPED, unmappedMessage } from "./diagnostics";
import { explain, findProjects, forWorkspace, readProject, templateOf } from "./project";
import type { LspSettings } from "./project";

export type Status = "starting" | "ready" | "not-a-project" | "not-generated" | "no-server" | "failed";

/** What the extension exposes (to tests, and to anyone who asks `extensions.getExtension(...).exports`). */
export interface Api {
  readonly status: () => Status;
  /** The templates the project compiled (what the language server is told are components), relative to the project. */
  readonly known: () => ReadonlyArray<string>;
  readonly project: () => string | undefined;
}

const binary = (root: string, name: string): string => join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

export const activate = async (context: vscode.ExtensionContext): Promise<Api> => {
  const output = vscode.window.createOutputChannel("VALANCE");
  const collection = vscode.languages.createDiagnosticCollection("valance");
  const notes = vscode.languages.createDiagnosticCollection("valance-editor");
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

  let client: LanguageClient | undefined;
  let status: Status = "starting";
  let root: string | undefined;
  let workspace: string | undefined;
  let served: LspSettings | undefined;                       // what the running server was last told, written from the workspace
  let known = new Set<string>();                             // the templates the project compiled, from the project (not the workspace)
  let told = new Set<Status>();

  bar.command = "valance.showOutput";
  context.subscriptions.push(output, collection, notes, bar);

  const show = (next: Status, detail: string): void => {
    status = next;
    output.appendLine(`[${next}] ${detail}`);
    bar.text = next === "ready" ? "$(check) VALANCE" : next === "starting" ? "$(sync~spin) VALANCE" : "$(warning) VALANCE";
    bar.tooltip = detail;
    bar.show();

    // Said once per kind: a warning on every refresh would be noise; a problem that is only in an output channel is not seen at all.
    if (next !== "ready" && next !== "starting" && !told.has(next)) {
      told.add(next);
      void vscode.window.showWarningMessage(`VALANCE: ${detail}`, "Show details").then((choice) => { if (choice !== undefined) { output.show(true); } });
    }
  };

  // A template the server was not told about is checked "without a model": no hover, no completion, no type errors, and nothing to say so but its log. Say it where the author looks.
  const markUnmapped = (): void => {
    notes.clear();

    if (root === undefined || status !== "ready") { return; }

    for (const document of vscode.workspace.textDocuments) {
      const path = document.uri.fsPath;

      if (document.languageId !== "mprx" || !path.startsWith(root)) { continue; }

      const file = path.slice(root.length + 1).split("\\").join("/");

      if (file.startsWith("src/") && !known.has(file)) {
        const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER), unmappedMessage(file), vscode.DiagnosticSeverity.Information);

        diagnostic.code = UNMAPPED;
        diagnostic.source = "valance";
        notes.set(document.uri, [diagnostic]);
      }
    }
  };

  // ---- which project --------------------------------------------------------------------------------------------------------------------------------------------

  const choose = (): void => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const found = folders.flatMap((folder) => findProjects(folder.uri.fsPath).map((project) => ({ folder: folder.uri.fsPath, project })));
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    const pick = found.find((each) => active?.startsWith(each.project + "/") || active?.startsWith(each.project + "\\")) ?? found[0];

    root = pick?.project;
    workspace = pick?.folder;

    if (found.length > 1) { output.appendLine(`More than one VALANCE project here: ${found.map((each) => each.project).join(", ")}. Using ${root}. (One project per window is supported.)`); }
  };

  // ---- template language server -----------------------------------------------------------------------------------------------------------------------------------

  const stop = async (): Promise<void> => {
    const old = client;

    client = undefined;
    served = undefined;
    await old?.stop().catch(() => undefined);
  };

  const refresh = async (): Promise<void> => {
    if (root === undefined || workspace === undefined) {
      await stop();
      show("not-a-project", explain({ kind: "not-a-project" }));

      return;
    }

    const project = readProject(root);

    if (project.kind !== "ready") {
      await stop();
      show(project.kind, explain(project));

      return;
    }

    known = new Set(Object.keys(project.settings.components));

    const settings = forWorkspace(workspace, root, project.settings);

    // The server is already running: tell it what changed (a new component, a renamed file) without restarting it.
    if (client !== undefined) {
      if (JSON.stringify(settings) !== JSON.stringify(served)) {
        served = settings;
        await client.sendNotification("workspace/didChangeConfiguration", { settings: { mesh: settings } });
        output.appendLine("The project changed; the language server was told.");
      }

      show("ready", explain(project));
      markUnmapped();

      return;
    }

    const configured = vscode.workspace.getConfiguration("valance").get<string>("meshLsp.path", "");
    const command = configured !== "" ? configured : binary(root, "mesh-lsp");

    if (!existsSync(command)) {
      show("no-server", explain({ kind: "no-server", path: command }));

      return;
    }

    show("starting", "Starting the template language server…");

    const server: ServerOptions = { command, args: [], options: { shell: process.platform === "win32" } };
    const options: LanguageClientOptions = {
      documentSelector: [{ language: "mprx" }, { language: "json", pattern: `${workspace}/${settings.model}` }],
      initializationOptions: settings,
      outputChannel: output,
      middleware: {
        // The server asks for its settings whenever they change; answer with the project's.
        workspace: {
          configuration: async (params, token, next) => {
            const base = (await next(params, token)) as ReadonlyArray<unknown>;

            return params.items.map((item, at) => item.section === "mesh" && served !== undefined ? served : base[at]);
          },
        },
        // The server answers a definition with the manifest (the generated JSON). An author wants the template.
        provideDefinition: async (document, position, token, next) => {
          const tag = document.getText(document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_-]*/));
          const file = served === undefined ? undefined : templateOf(served, tag);

          return file === undefined ? next(document, position, token) : new vscode.Location(vscode.Uri.file(join(workspace!, file)), new vscode.Position(0, 0));
        },
      },
    };

    served = settings;

    try {
      const started = new LanguageClient("valance-mesh", "MPRX (MESH)", server, options);

      client = started;
      await started.start();
      show("ready", explain(project));
      markUnmapped();
    } catch (error) {
      await stop();
      show("failed", `The template language server did not start: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ---- everything else the project can get wrong -------------------------------------------------------------------------------------------------------------------

  const check = async (): Promise<void> => {
    if (root === undefined) { return; }

    const command = binary(root, "vlx");

    if (!existsSync(command)) { output.appendLine(`vlx not found at ${command}: install @valancex/cli in the project to see content diagnostics.`); return; }

    try {
      const found = forTheCheck(await run(root, command), known).map(place);
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
      output.appendLine(`vlx check: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ---- wiring ---------------------------------------------------------------------------------------------------------------------------------------------------

  choose();

  const watcher = vscode.workspace.createFileSystemWatcher("**/.valance/editor.json");
  const onProject = (): void => { choose(); void refresh(); };

  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(onProject),
    watcher.onDidChange(onProject),
    watcher.onDidDelete(onProject),
    vscode.workspace.onDidChangeWorkspaceFolders(onProject),
    vscode.workspace.onDidOpenTextDocument(markUnmapped),
    vscode.workspace.onDidCloseTextDocument(markUnmapped),
    vscode.workspace.onDidSaveTextDocument((document) => { if (root !== undefined && /\.(md|mprx|ts|json)$/.test(document.fileName) && document.uri.fsPath.startsWith(root)) { void check(); } }),
    vscode.commands.registerCommand("valance.check", check),
    vscode.commands.registerCommand("valance.showOutput", () => { output.show(true); }),
    vscode.commands.registerCommand("valance.restart", async () => { await stop(); told = new Set(); choose(); await refresh(); await check(); }),
    { dispose: () => { void stop(); } },
  );

  await refresh();
  await check();

  return { status: () => status, known: () => [...known], project: () => root };
};

export const deactivate = (): void => undefined;
