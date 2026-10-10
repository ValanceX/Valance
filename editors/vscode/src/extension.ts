// The VS Code side: thin. It finds the project, starts the MESH language server with the settings the project generated, shows `vlx check` diagnostics for the files that server does not read, and
// sends a tag to the template that defines it. Everything else (the language, the diagnostics, hover, completion) is the server's.
//
// It never fails silently: the state is in the status bar ("VALANCE: ready" or what is wrong and how to fix it), a warning says it once, and the "VALANCE" output channel has the detail. It
// does not need a reload to recover: it watches `.valance/editor.json`, so running `vlx check` or `vlx dev` is enough.
import * as vscode from "vscode";
import type { LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { LanguageClient } from "vscode-languageclient/node";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { forTheCheck, place, run, UNMAPPED, unmappedMessage } from "./diagnostics";
import { explain, findProjects, forWorkspace, readProject, templateOf } from "./project";
import type { LspSettings } from "./project";
import { authoredPlace, lensesFor, readWiring, referencesOf } from "./wiring";

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
  let wiringFile: string | undefined;                        // `.valance/wiring.json`, relative to the project
  const lensesChanged = new vscode.EventEmitter<void>();
  let told = new Set<Status>();

  bar.command = "valance.showOutput";
  context.subscriptions.push(output, collection, notes, bar, lensesChanged);

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

  const manifestFile = (): string => join(root!, ".valance", "manifest.json");

  /** The lines of manifest.json that a definition answer points into. */
  const manifestLines = (answer: unknown): ReadonlyArray<number> => {
    if (root === undefined || !existsSync(manifestFile())) { return []; }

    return ([] as Array<{ uri?: vscode.Uri; range?: vscode.Range; targetUri?: vscode.Uri; targetRange?: vscode.Range }>).concat((answer ?? []) as never)
      .flatMap((item) => { const uri = item.targetUri ?? item.uri; const range = item.targetRange ?? item.range; return uri?.fsPath === manifestFile() && range !== undefined ? [range.start.line] : []; });
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
    wiringFile = project.wiring;
    lensesChanged.fire();

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
        // The server answers every definition with the manifest (generated JSON), because that is all MESH knows. `vlx` knows where each name was declared: translate to that one place.
        // (The many places a name is USED are references, below: a jump cannot choose among them.)
        provideDefinition: async (document, position, token, next) => {
          const answer = await next(document, position, token);
          const wiring = readWiring(root!, wiringFile);
          const translated: Array<vscode.Location> = [];

          for (const line of manifestLines(answer)) {
            const place = authoredPlace(wiring, readFileSync(manifestFile(), "utf8"), line);

            if (place !== undefined) { translated.push(new vscode.Location(vscode.Uri.file(join(root!, place.file)), new vscode.Position(place.line - 1, place.column - 1))); }
          }

          if (translated.length > 0) { return translated; }

          // Without a record (a project built by an older `vlx`): a component's tag still goes to its template.
          const tag = document.getText(document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_-]*/));
          const file = served === undefined ? undefined : templateOf(served, tag);

          return file !== undefined ? new vscode.Location(vscode.Uri.file(join(workspace!, file)), new vscode.Position(0, 0)) : answer;
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

  // The other end of each connection, next to this one: where a component goes and what is passed, who handles an event, who reads a state field (see `lensesFor`).
  const lensProvider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: lensesChanged.event,
    provideCodeLenses: (document) => {
      if (root === undefined || !vscode.workspace.getConfiguration("valance").get<boolean>("codeLens", true)) { return []; }

      const wiring = readWiring(root, wiringFile);
      const path = document.uri.fsPath;

      if (wiring === undefined || !path.startsWith(root)) { return []; }

      return lensesFor(wiring, path.slice(root.length + 1).split("\\").join("/")).map((lens) => {
        const where = (place: { readonly file: string; readonly line: number; readonly column: number }): vscode.Location => new vscode.Location(vscode.Uri.file(join(root!, place.file)), new vscode.Position(place.line - 1, place.column - 1));
        const range = new vscode.Range(lens.line, 0, lens.line, 0);
        const command: vscode.Command = lens.targets.length === 0 ? { title: lens.title, command: "" }
          : lens.targets.length === 1 ? { title: lens.title, command: "vscode.open", arguments: [where(lens.targets[0]!).uri, { selection: where(lens.targets[0]!).range }] }
          : { title: lens.title, command: "editor.action.peekLocations", arguments: [document.uri, range.start, lens.targets.map(where), "peek"] };

        return new vscode.CodeLens(range, command);
      });
    },
  };
  // Find All References, from the name under the cursor. The server says which manifest key it is (its definition); `vlx` says everywhere that key is used.
  const referenceProvider: vscode.ReferenceProvider = {
    provideReferences: async (document, position, context) => {
      if (root === undefined || client === undefined || !existsSync(manifestFile())) { return []; }

      const answer = await client.sendRequest("textDocument/definition", { textDocument: { uri: document.uri.toString() }, position: { line: position.line, character: position.character } });
      const wiring = readWiring(root, wiringFile);
      const asked = ([] as Array<{ uri: string; range: { start: { line: number } } }>).concat((answer ?? []) as never);
      const places = asked.filter((item) => vscode.Uri.parse(item.uri).fsPath === manifestFile()).flatMap((item) => {
        const text = readFileSync(manifestFile(), "utf8");
        const declared = context.includeDeclaration ? [authoredPlace(wiring, text, item.range.start.line)] : [];

        return [...declared, ...referencesOf(wiring, text, item.range.start.line)].filter((place): place is NonNullable<typeof place> => place !== undefined);
      });

      return places.map((place) => new vscode.Location(vscode.Uri.file(join(root!, place.file)), new vscode.Position(place.line - 1, place.column - 1)));
    },
  };
  const wiringWatcher = vscode.workspace.createFileSystemWatcher("**/.valance/wiring.json");

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider([{ language: "mprx" }, { pattern: "**/src/main.ts" }], lensProvider),
    vscode.languages.registerReferenceProvider({ language: "mprx" }, referenceProvider),
    wiringWatcher,
    wiringWatcher.onDidChange(() => { lensesChanged.fire(); }),
    wiringWatcher.onDidCreate(() => { lensesChanged.fire(); }),
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
