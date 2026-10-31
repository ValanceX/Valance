# VALANCE for VS Code

Language support for [VALANCE](https://github.com/ValanceX/Valance) projects: the `.mprx` templates a project is drawn with, the Markdown and configuration around them, and the connections between a template and the code that feeds it.

## What you get

- **MPRX templates.** Syntax highlighting, and, from the MESH language server (`mesh-lsp`), diagnostics with suggested fixes, hover (a component's contract), completion, go to definition, and formatting (indentation by the nesting of elements and `{#if}` / `{#each}` blocks). A template is checked against what the project actually declares: its components, state, commands and, for a project of several targets, the vocabulary of each target.
- **Project checks.** The project's own `vlx check` runs when the window opens and whenever a Markdown, template, TypeScript or JSON file in the project is saved, created, changed or deleted (a `git checkout` included). Its findings appear as problems on the file and line they are about: a broken link, a missing image, a mistake in `src/main.ts`, a bad setting.
- **Both ends of a connection.** A short line above each prop, event, component use, state field and command says how many places are on the other end; click it to see them. Go to definition on a name goes to where the author wrote it (not to a generated file), and Find All References finds every use.
- **Settings files.** Completion and validation for `valance.json` and `valance.web.json`.
- **More than one target.** A project built for the web and a native window has one language server per target, each given that target's own components; a template the targets share is answered once.

## What it needs

The extension does not bundle a compiler or a server: it uses the project's own, so what you see is what the build will say. In the project, installed (`npm install`):

- `@valancex/cli`, which provides `vlx`, and
- `@valancex/mesh-lsp` as a dev dependency, the language server, in the version of the project's MESH.

Nothing is run by hand. Without them the status bar says what is missing and how to fix it, and the window notices when you do. VS Code 1.90 or later.

## Settings and commands

| | |
|---|---|
| `valance.meshLsp.path` | Path to a `mesh-lsp` executable. Empty (the default): the one installed in the project. |
| `valance.codeLens` | `summary` (default), `full` (the places and what is passed, written out) or `off`. |
| **VALANCE: Check the project** | Runs `vlx check` now. |
| **VALANCE: Restart the language server** | Starts the servers again and re-reads the project. |
| **VALANCE: Show details** | Opens the output channel. |

Unsaved edits are not seen by `vlx check`, which reads files from disk; the language server does see them.

## Troubleshooting

The status bar item reads `VALANCE`; its tooltip, a warning on first occurrence and the **VALANCE** output channel say what is wrong. The usual causes are dependencies not installed, a project built by an older `vlx` (the language server then runs, but go to definition and the lenses cannot reach your files: install the current `@valancex/cli`), or no `valance.json` in the folder or the three levels below it. One project per window is supported.

## Development

This directory is its own root, with its own lockfile (it is not in the Valance workspace). It is released on its own tag, `vscode-v<version>`; see [`CHANGELOG.md`](CHANGELOG.md).

```console
$ pnpm install
$ pnpm test         # grammar with VS Code's own engine; the real mesh-lsp on examples/docs-app; the real `vlx check`
$ xvfb-run -a pnpm test:host   # a real VS Code (downloaded) running the BUNDLED extension on a copy of examples/docs-app; VSCODE_VERSION=1.90.0 for the oldest
$ pnpm typecheck
$ pnpm package      # valance-<version>.vsix
```

On Windows the same commands run in PowerShell, without `xvfb-run` (the host suite opens a window): `$env:VSCODE_VERSION = "1.90.0"; pnpm test:host`. The extension starts the project's `vlx` and `mesh-lsp` through Node (`node_modules/@valancex/cli/bin/vlx.js`, `node_modules/@valancex/mesh-lsp/dist/cli.js`), never through the `.cmd` shims in `node_modules/.bin`. Check out with LF endings (`.gitattributes`).

`src/project.ts`, `src/diagnostics.ts`, `src/wiring.ts` and `src/sync.ts` are pure and tested; `src/extension.ts` is the thin `vscode` shell, exercised by `host/suite.ts` in a real VS Code (CI, on 1.90.0 and the current stable). The MPRX grammar is MESH's (`Mesh/editors/vscode`); this extension ships an identical copy until MESH publishes its own (`pnpm sync-grammar`). The feasibility study that led here is [`docs/explanation/application-model/editor-feasibility.md`](../../docs/explanation/application-model/editor-feasibility.md).

## Publishing

Maintainers: a pushed tag `vscode-v<version>` (equal to `version` in `package.json`) runs `.github/workflows/release-vscode.yml`: the tests, the `.vsix`, a GitHub release carrying it, and, when they are set up, publication to the Visual Studio Marketplace (publisher `valancex`) with **Microsoft Entra ID** (no stored token), and to Open VSX with `OVSX_PAT` when that secret is set. The setup is described at the top of the workflow and in `docs/explanation/release-sets/2026-10-e.md`. Without a tag the workflow only builds and checks the package.
