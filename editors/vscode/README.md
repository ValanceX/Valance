# VALANCE for VS Code (feasibility spike)

> Not published, not in the workspace, not in CI. It exists to answer *can this be done*: see [`docs/application-model/EDITOR-FEASIBILITY.md`](../../docs/application-model/EDITOR-FEASIBILITY.md).

What it contributes: the `mprx` language (TextMate grammar, bracket and quote rules); schema validation for `valance.json` and `valance.web.json`; the MESH language server (`mesh-lsp`) for `.mprx` files, started with the settings the project generated in `.valance/editor.json`; `valance check --json` diagnostics for Markdown, config and `src/main.ts`; go to definition from a tag to its template.

It needs, in the project: `@valancex/app` (for `valance`) and `@valancex/mesh-lsp` (for the server), and one run of `valance dev|build|check` so `.valance/editor.json` exists.

```console
$ pnpm install
$ pnpm test         # grammar with VS Code's own engine; the real mesh-lsp on examples/docs-app; the real `valance check`
$ pnpm typecheck
```

`src/project.ts` and `src/diagnostics.ts` are pure and tested; `src/extension.ts` is the thin `vscode` shell and is type-checked but has not been run in a VS Code host.
