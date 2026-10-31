// The VS Code side: thin. It finds the project, starts the MESH language server with the settings the project generated, shows `vlx check` diagnostics for the files that server does not read, and
// sends a tag to the template that defines it. Everything else (the language, the diagnostics, hover, completion) is the server's.
//
// It never fails silently: the state is in the status bar ("VALANCE: ready" or what is wrong and how to fix it), a warning says it once, and the "VALANCE" output channel has the detail. It
// does not need a reload to recover, and does not wait to be told to: it runs the project's own `vlx check` itself (which writes what the language server reads) when the window opens and whenever
// a file that can change the result is saved, created, changed or deleted, one run at a time, so the editor follows the files without the author running anything.
import * as vscode from "vscode";
import type { LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { LanguageClient } from "vscode-languageclient/node";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { forTheCheck, place, run, UNMAPPED, unmappedMessage } from "./diagnostics";
import { explain, findProjects, forWorkspace, inWorkspace, ownerOf, readProject, templateOf } from "./project";
import { affectsProject, coalesced, debounced } from "./sync";
import type { LspSettings, TargetSettings } from "./project";
import { authoredPlace, lensesFor, readWiring, referencesOf, templateImports } from "./wiring";

/** `partial`: the language server runs, but the project has no wiring data, so navigation to the author's files and the connection lenses are off. */
export type Status = "starting" | "ready" | "partial" | "not-a-project" | "not-generated" | "no-server" | "failed";

/** What the extension exposes (to tests, and to anyone who asks `extensions.getExtension(...).exports`). */
export interface Api {
  readonly status: () => Status;
  /** The templates the project compiled (what the language server is told are components), relative to the project. */
  readonly known: () => ReadonlyArray<string>;
  readonly project: () => string | undefined;
  /** The targets whose template language server is running (one per target: a target's templates are checked against its own manifest). */
  readonly servers: () => ReadonlyArray<string>;
}

/** One target's language server, and what it was last told. */
interface Seat {
  readonly target: TargetSettings;
  readonly client: LanguageClient;
  served: LspSettings; // written from the workspace
  /** The manifest (relative to the project): the one generated JSON file this server answers every definition with. */
  readonly model: string;
}

/** A tool the project installed, as the script Node runs: the package's own entry, not the `.bin` shim (a `.cmd` file on Windows, which only a shell can start). */
const script = (root: string, pkg: string, entry: string): string => join(root, "node_modules", ...pkg.split("/"), entry);

/** Node for a child process: in the extension host, VS Code's own executable running as Node. */
const NODE_ENV = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };

export const activate = async (context: vscode.ExtensionContext): Promise<Api> => {
  const output = vscode.window.createOutputChannel("VALANCE");
  const collection = vscode.languages.createDiagnosticCollection("valance");
  const notes = vscode.languages.createDiagnosticCollection("valance-editor");
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

  let seats: Array<Seat> = [];
  let status: Status = "starting";
  let root: string | undefined;
  let workspace: string | undefined;
  let targets: ReadonlyArray<TargetSettings> = []; // what the project generated, in the order of its targets
  let known = new Set<string>(); // the templates the project compiled, from the project (not the workspace)
  const lensesChanged = new vscode.EventEmitter<void>();
  let told = new Set<Status>();
  let synced = false; // `vlx check` has run at least once in this window, so a project with nothing generated is a fact and not just early
  let cliMissing: string | undefined; // where the project's own `vlx` should be, when it is not

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
      void vscode.window.showWarningMessage(`VALANCE: ${detail}`, "Show details").then((choice) => {
        if (choice !== undefined) {
          output.show(true);
        }
      });
    }
  };

  // A template the server was not told about is checked "without a model": no hover, no completion, no type errors, and nothing to say so but its log. Say it where the author looks.
  const markUnmapped = (): void => {
    notes.clear();

    if (root === undefined || (status !== "ready" && status !== "partial")) {
      return;
    }

    for (const document of vscode.workspace.textDocuments) {
      const path = document.uri.fsPath;

      if (document.languageId !== "mprx" || !path.startsWith(root)) {
        continue;
      }

      const file = path
        .slice(root.length + 1)
        .split("\\")
        .join("/");

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

    if (found.length > 1) {
      output.appendLine(`More than one VALANCE project here: ${found.map((each) => each.project).join(", ")}. Using ${root}. (One project per window is supported.)`);
    }
  };

  /** The target whose server answers for the file `path` (absolute), and so whose manifest and wiring describe it. */
  const targetFor = (path: string): TargetSettings | undefined => ownerOf(targets, root === undefined ? path : relative(root, path).split("\\").join("/"));
  const wiringOf = (target: TargetSettings | undefined): ReturnType<typeof readWiring> =>
    root === undefined || target === undefined ? undefined : readWiring(root, target.wiring);
  const manifestOf = (seat: Seat): string => join(root!, seat.model);

  /** The lines of a manifest that a definition answer points into. */
  const manifestLines = (seat: Seat, answer: unknown): ReadonlyArray<number> => {
    if (root === undefined || !existsSync(manifestOf(seat))) {
      return [];
    }

    return ([] as Array<{ uri?: vscode.Uri; range?: vscode.Range; targetUri?: vscode.Uri; targetRange?: vscode.Range }>).concat((answer ?? []) as never).flatMap((item) => {
      const uri = item.targetUri ?? item.uri;
      const range = item.targetRange ?? item.range;
      return uri?.fsPath === manifestOf(seat) && range !== undefined ? [range.start.line] : [];
    });
  };

  // ---- template language server -----------------------------------------------------------------------------------------------------------------------------------

  const stopSeat = async (seat: Seat): Promise<void> => {
    seats = seats.filter((each) => each !== seat);
    await seat.client.stop().catch(() => undefined);
  };
  const stop = async (): Promise<void> => {
    await Promise.all([...seats].map(stopSeat));
  };

  const refresh = async (force = false): Promise<void> => {
    if (root === undefined || workspace === undefined) {
      await stop();
      show("not-a-project", explain({ kind: "not-a-project" }));

      return;
    }

    const project = readProject(root);

    if (project.kind === "not-generated" && !synced) {
      // Nothing is generated yet, and the check that generates it is on its way: that is not a problem to report.
      await stop();
      show("starting", "Preparing the project (running vlx check)…");

      return;
    }

    if (project.kind !== "ready") {
      await stop();
      show(project.kind, cliMissing !== undefined ? explain({ kind: "no-cli", path: cliMissing }) : explain(project));

      return;
    }

    targets = project.targets;
    known = new Set(project.targets.flatMap((each) => Object.keys(each.settings.components)));

    // A project built by an older `vlx` has no wiring data. Everything else works; say what does not, and why.
    const working: "ready" | "partial" = project.targets.some((each) => readWiring(root!, each.wiring) === undefined) ? "partial" : "ready";
    lensesChanged.fire();

    // A target that is gone (the project dropped it) has no server any more.
    await Promise.all(seats.filter((seat) => !project.targets.some((each) => each.id === seat.target.id)).map(stopSeat));

    const configured = vscode.workspace.getConfiguration("valance").get<string>("meshLsp.path", "");
    const command = configured !== "" ? configured : script(root, "@valancex/mesh-lsp", "dist/cli.js");
    const several = project.targets.length > 1;
    const failures: Array<string> = [];

    for (const target of project.targets) {
      const settings = forWorkspace(workspace, root, target.settings);
      const seat = seats.find((each) => each.target.id === target.id);

      // The server is already running: tell it what changed (a new component, a renamed file) without restarting it.
      if (seat !== undefined) {
        // After a run the manifest may have changed on disk with the same settings: telling the server makes it read it again.
        if (force || JSON.stringify(settings) !== JSON.stringify(seat.served)) {
          seat.served = settings;
          await seat.client.sendNotification("workspace/didChangeConfiguration", { settings: { mesh: settings } });
          output.appendLine(`The project changed; the language server${several ? ` of ${target.id}` : ""} was told.`);
        }

        continue;
      }

      if (!existsSync(command)) {
        show("no-server", explain({ kind: "no-server", path: command }));

        return;
      }

      show("starting", `Starting the template language server${several ? ` for ${target.id}` : ""}…`);

      // A path the author configured is started as it is (a native binary); the project's own server is its script, run by Node.
      const server: ServerOptions =
        configured !== ""
          ? { command, args: [], options: { shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command) } }
          : { command: process.execPath, args: [command], options: { env: NODE_ENV } };
      // One target: every template. Several: each server answers for the templates it owns and its own manifest, so a template is never answered twice.
      const documentSelector: LanguageClientOptions["documentSelector"] = several
        ? [
            ...target.owns.map((file) => ({ language: "mprx", pattern: `${workspace}/${inWorkspace(workspace!, root!, file)}` })),
            { language: "json", pattern: `${workspace}/${settings.model}` },
          ]
        : [{ language: "mprx" }, { language: "json", pattern: `${workspace}/${settings.model}` }];
      const current = (): Seat | undefined => seats.find((each) => each.target.id === target.id);
      const options: LanguageClientOptions = {
        documentSelector,
        initializationOptions: settings,
        outputChannel: output,
        middleware: {
          // The server asks for its settings whenever they change; answer with the project's.
          workspace: {
            configuration: async (params, token, next) => {
              const base = (await next(params, token)) as ReadonlyArray<unknown>;

              return params.items.map((item, at) => (item.section === "mesh" && current() !== undefined ? current()!.served : base[at]));
            },
          },
          // The server answers every definition with the manifest (generated JSON), because that is all MESH knows. `vlx` knows where each name was declared: translate to that one place.
          // (The many places a name is USED are references, below: a jump cannot choose among them.)
          provideDefinition: async (document, position, token, next) => {
            const answer = await next(document, position, token);
            const here = current();
            const wiring = wiringOf(target);
            const translated: Array<vscode.Location> = [];

            for (const line of here === undefined ? [] : manifestLines(here, answer)) {
              const place = authoredPlace(wiring, readFileSync(manifestOf(here!), "utf8"), line);

              if (place !== undefined) {
                translated.push(new vscode.Location(vscode.Uri.file(join(root!, place.file)), new vscode.Position(place.line - 1, place.column - 1)));
              }
            }

            if (translated.length > 0) {
              return translated;
            }

            // Without a record (a project built by an older `vlx`): a component's tag still goes to its template.
            const tag = document.getText(document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_-]*/));
            const file = here === undefined ? undefined : templateOf(here.served, tag);

            return file !== undefined ? new vscode.Location(vscode.Uri.file(join(workspace!, file)), new vscode.Position(0, 0)) : answer;
          },
        },
      };

      try {
        const started = new LanguageClient(`valance-mesh-${target.id}`, several ? `MPRX (MESH, ${target.id})` : "MPRX (MESH)", server, options);

        seats.push({ target, client: started, served: settings, model: target.settings.model });
        await started.start();
      } catch (error) {
        const failed = seats.find((each) => each.target.id === target.id);

        if (failed !== undefined) {
          await stopSeat(failed);
        }

        failures.push(`${target.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failures.length > 0) {
      await stop();
      show("failed", `The template language server did not start: ${failures.join("; ")}`);

      return;
    }

    show(working, explain(working === "ready" ? project : { kind: "partial" as const }));
    markUnmapped();
  };

  // ---- everything else the project can get wrong -------------------------------------------------------------------------------------------------------------------

  const runCheck = async (): Promise<void> => {
    if (root === undefined) {
      return;
    }

    const command = script(root, "@valancex/cli", "bin/vlx.js");

    if (!existsSync(command)) {
      cliMissing = command;
      output.appendLine(`vlx not found at ${command}: install the project's dependencies (npm install) so @valancex/cli is there.`);
      return;
    }

    cliMissing = undefined;

    try {
      const found = forTheCheck(await run(root, command), known).map(place);
      const byFile = new Map<string, vscode.Diagnostic[]>();

      for (const each of found) {
        const line = each.startLine;
        const range = new vscode.Range(line, each.startColumn, line, each.endColumn < 0 ? Number.MAX_SAFE_INTEGER : each.endColumn);
        const diagnostic = new vscode.Diagnostic(range, each.message, each.warning ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);

        diagnostic.code = each.code;
        diagnostic.source = "valance";
        byFile.set(each.file, [...(byFile.get(each.file) ?? []), diagnostic]);
      }

      collection.clear();

      for (const [file, list] of byFile) {
        collection.set(vscode.Uri.file(join(root, file)), list);
      }
    } catch (error) {
      output.appendLine(`vlx check: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** Brings what `vlx` generated, and what the editor shows from it, in step with the files. One run at a time; asking while one runs makes it go round once more. */
  const check = coalesced(async () => {
    await runCheck();
    synced = true;
    await refresh(true);
  });
  /** A burst of saves, or a branch switch, is one run. */
  const soon = debounced(() => {
    void check();
  }, 300);
  const changed = (uri: vscode.Uri): void => {
    if (root !== undefined && affectsProject(root, uri.fsPath)) {
      soon();
    }
  };

  // ---- wiring ---------------------------------------------------------------------------------------------------------------------------------------------------

  choose();

  const watcher = vscode.workspace.createFileSystemWatcher("**/.valance/editor.json");
  const onProject = (): void => {
    choose();
    void refresh();
  };

  // The other end of each connection, next to this one: where a component goes and what is passed, who handles an event, who reads a state field (see `lensesFor`).
  const lensProvider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: lensesChanged.event,
    provideCodeLenses: (document) => {
      // `summary` (the default), `full`, or `off`; the earlier boolean setting still reads as `summary` (true) or `off` (false).
      const setting = vscode.workspace.getConfiguration("valance").get<string | boolean>("codeLens", "summary");
      const detail = setting === false || setting === "off" ? undefined : setting === "full" ? "full" : "summary";

      if (root === undefined || detail === undefined) {
        return [];
      }

      const path = document.uri.fsPath;
      const wiring = wiringOf(targetFor(path));

      if (wiring === undefined || !path.startsWith(root)) {
        return [];
      }

      return lensesFor(
        wiring,
        path
          .slice(root.length + 1)
          .split("\\")
          .join("/"),
        detail,
      ).map((lens) => {
        const where = (place: { readonly file: string; readonly line: number; readonly column: number }): vscode.Location =>
          new vscode.Location(vscode.Uri.file(join(root!, place.file)), new vscode.Position(place.line - 1, place.column - 1));
        const range = new vscode.Range(lens.line, 0, lens.line, 0);
        const command: vscode.Command =
          lens.targets.length === 0
            ? { title: lens.title, command: "" }
            : lens.targets.length === 1
              ? { title: lens.title, command: "vscode.open", arguments: [where(lens.targets[0]!).uri, { selection: where(lens.targets[0]!).range }] }
              : { title: lens.title, command: "editor.action.peekLocations", arguments: [document.uri, range.start, lens.targets.map(where), "peek"] };

        return new vscode.CodeLens(range, command);
      });
    },
  };
  // Find All References, from the name under the cursor. The server says which manifest key it is (its definition); `vlx` says everywhere that key is used.
  const referenceProvider: vscode.ReferenceProvider = {
    provideReferences: async (document, position, context) => {
      const target = targetFor(document.uri.fsPath);
      const seat = seats.find((each) => each.target.id === target?.id);

      if (root === undefined || seat === undefined || !existsSync(manifestOf(seat))) {
        return [];
      }

      const answer = await seat.client.sendRequest("textDocument/definition", {
        textDocument: { uri: document.uri.toString() },
        position: { line: position.line, character: position.character },
      });
      const wiring = wiringOf(target);
      const asked = ([] as Array<{ uri: string; range: { start: { line: number } } }>).concat((answer ?? []) as never);
      const places = asked
        .filter((item) => vscode.Uri.parse(item.uri).fsPath === manifestOf(seat))
        .flatMap((item) => {
          const text = readFileSync(manifestOf(seat), "utf8");
          const declared = context.includeDeclaration ? [authoredPlace(wiring, text, item.range.start.line)] : [];

          return [...declared, ...referencesOf(wiring, text, item.range.start.line)].filter((place): place is NonNullable<typeof place> => place !== undefined);
        });

      return places.map((place) => new vscode.Location(vscode.Uri.file(join(root!, place.file)), new vscode.Position(place.line - 1, place.column - 1)));
    },
  };
  // The files themselves, however they change: this window, another program, a `git checkout`. Not `.valance/` (`affectsProject`), which the run itself writes.
  const sources = vscode.workspace.createFileSystemWatcher("**/*.{md,mprx,ts,json}");
  const wiringWatcher = vscode.workspace.createFileSystemWatcher("**/.valance/wiring*.json");
  // `import layout from "./layout.mprx"`: TypeScript resolves the specifier to its ambient declaration, so the specifier is made a link to the template itself.
  const importLinks: vscode.DocumentLinkProvider = {
    provideDocumentLinks: (document) =>
      templateImports(document.getText()).map((each) => {
        const link = new vscode.DocumentLink(new vscode.Range(each.line, each.start, each.line, each.end), vscode.Uri.file(join(dirname(document.uri.fsPath), each.specifier)));

        link.tooltip = "Open the template";

        return link;
      }),
  };

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider([{ language: "mprx" }, { pattern: "**/src/**/*.ts" }], lensProvider),
    vscode.languages.registerReferenceProvider({ language: "mprx" }, referenceProvider),
    vscode.languages.registerDocumentLinkProvider({ pattern: "**/src/**/*.ts" }, importLinks),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("valance.codeLens")) {
        lensesChanged.fire();
      }
    }),
    wiringWatcher,
    wiringWatcher.onDidChange(() => {
      lensesChanged.fire();
    }),
    wiringWatcher.onDidCreate(() => {
      lensesChanged.fire();
      void refresh();
    }),
    wiringWatcher.onDidDelete(() => {
      lensesChanged.fire();
      void refresh();
    }),
    sources,
    sources.onDidCreate(changed),
    sources.onDidChange(changed),
    sources.onDidDelete(changed),
    watcher,
    watcher.onDidCreate(onProject),
    watcher.onDidChange(onProject),
    watcher.onDidDelete(onProject),
    vscode.workspace.onDidChangeWorkspaceFolders(onProject),
    vscode.workspace.onDidOpenTextDocument(markUnmapped),
    vscode.workspace.onDidCloseTextDocument(markUnmapped),
    vscode.workspace.onDidSaveTextDocument((document) => {
      changed(document.uri);
    }),
    vscode.commands.registerCommand("valance.check", check),
    vscode.commands.registerCommand("valance.showOutput", () => {
      output.show(true);
    }),
    vscode.commands.registerCommand("valance.restart", async () => {
      await stop();
      told = new Set();
      choose();
      await refresh();
      await check();
    }),
    {
      dispose: () => {
        void stop();
      },
    },
  );

  await refresh();
  await check();

  return { status: () => status, known: () => [...known], project: () => root, servers: () => seats.map((seat) => seat.target.id) };
};

export const deactivate = (): void => undefined;
