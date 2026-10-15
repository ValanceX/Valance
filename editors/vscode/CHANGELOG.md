# Changelog

All notable changes to the VALANCE extension. It is versioned on its own (not with the `@valancex/*` packages) and released on the tag `vscode-v<version>`.

## [0.1.0] - unreleased

The first release, after a feasibility spike (`docs/application-model/EDITOR-FEASIBILITY.md`).

### Added

- The `mprx` language: the MESH TextMate grammar and bracket rules, and indentation settings.
- The MESH language server (`mesh-lsp`), started with the settings the project generated (`.valance/editor.json`): diagnostics with quick fixes, hover, completion, go to definition and formatting. **One server per target** for a project of several, each with that target's manifest; a template two targets share is answered by the first.
- `vlx check` as the project's diagnostics for Markdown, templates the server does not know, `src/main.ts` and configuration, run on open and on every relevant change, one run at a time.
- Go to definition from a name to where the author wrote it, Find All References, and connection lenses (`valance.codeLens`: `summary`, `full`, `off`) above each prop, event, component use, state field and command.
- Document links from `import x from "./x.mprx"` to the template.
- JSON validation for `valance.json` and `valance.web.json`.
- Commands: **VALANCE: Check the project**, **Restart the language server**, **Show details**; the setting `valance.meshLsp.path`.
- Shipped as one bundled file (`dist/extension.js`); the host tests run the bundle, so what is tested is what is shipped.

### Requirements

VS Code 1.90 or later; in the project, `@valancex/cli` and `@valancex/mesh-lsp` installed.
