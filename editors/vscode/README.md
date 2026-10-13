# VALANCE for VS Code (feasibility spike)

> Not published and not in the pnpm workspace; it has its own CI job (`vscode`, a real VS Code under `xvfb-run`). It exists to answer *can this be done*: see [`docs/application-model/EDITOR-FEASIBILITY.md`](../../docs/application-model/EDITOR-FEASIBILITY.md).

What it contributes: the `mprx` language (the TextMate grammar and bracket rules are MESH's, `Mesh/editors/vscode`; this extension ships an identical copy until MESH publishes its own, `pnpm sync-grammar`); schema validation for `valance.json` and `valance.web.json`; the MESH language server (`mesh-lsp`) for `.mprx` files, started with the settings the project generated in `.valance/editor.json`; `vlx check --json` diagnostics for Markdown, config and `src/main.ts`; go to definition from a tag to its template.

It needs, in the project: `@valancex/cli` (for `valance`) and `@valancex/mesh-lsp` as a **dev dependency** (the server, in the version of the project's MESH), and one run of `vlx dev|build|check` so `.valance/editor.json` exists.

```console
$ pnpm install
$ pnpm test         # grammar with VS Code's own engine; the real mesh-lsp on examples/docs-app; the real `vlx check`
$ xvfb-run -a pnpm test:host   # a real VS Code (downloaded) with the extension, on a copy of examples/docs-app; VSCODE_VERSION=1.90.0 for the oldest
$ pnpm typecheck
```

On Windows the same commands run in PowerShell, without `xvfb-run` (the host suite opens a window): `$env:VSCODE_VERSION = "1.90.0"; pnpm test:host`. The extension starts the project's `vlx` and `mesh-lsp` through Node (`node_modules/@valancex/cli/bin/vlx.js`, `node_modules/@valancex/mesh-lsp/dist/cli.js`), never through the `.cmd` shims in `node_modules/.bin`. `valance.meshLsp.path` may name a native `mesh-lsp.exe`. Check out with LF endings (`.gitattributes`).

`src/project.ts` and `src/diagnostics.ts` are pure and tested; `src/extension.ts` is the thin `vscode` shell, exercised only by `host/suite.ts` in a real VS Code. That suite has not been run yet by the author (VS Code could not be downloaded in the authoring sandbox); the CI job is its first run.
