# Phase 5: editor foundation and diagnostics contract

> Followed by [`EDITOR-FEASIBILITY.md`](EDITOR-FEASIBILITY.md): the language server and a VS Code spike were built on this foundation. The 'Direction (not built)' items below 1 and 2 are now answered there.

Scope: make the public model *analyzable* by future editor tooling. No language server, extension or highlighter was built.

## What exists now (implemented and tested)

| Need | Contract | Where |
|---|---|---|
| Source-aware diagnostics | One shape `{ file, line, column, code, message }` (1-based; `0` = unknown) for config, front matter, Markdown, links, images, templates, `src/main.ts`. `vlx check --json` prints the array; exit code 1 when non-empty. Codes are stable strings. | `src/diagnostics.ts`, `src/check.ts`; `test/cli.test.ts` |
| Template diagnostics | The MESH compiler's own `{code, path, span}` mapped to the authored file (`src/layout.mprx:2:20 unknown-reference …`), suggestions appended ("did you mean …?") | `src/compile.ts`; `test/pipeline.test.ts` |
| Configuration validation | JSON Schemas for `valance.json` and `valance.web.json` in `schemas/`, referenced through `$schema`; the tools' validator accepts the same keys (a test pins the schemas' property lists) | `schemas/*.json`, `src/config.ts` |
| What a template may use | `.valance/manifest.json`: every tag with its props, every event, every command with parameters, the layout's scope names and types, **and the contracts the compiler inferred for the author's own components** (the program's model). Regenerated on each change. `.valance/editor.json` says where it is and which file is which component. The real `mesh-lsp` was driven with exactly these (see `EDITOR-FEASIBILITY.md`) | `src/generate.ts` |
| Content and route validation | Pages, addresses, navigation order, outline anchors are in `.valance/content.json`; links/images/fragments are validated at build and in `check` | `src/content.ts` |
| Live feedback | `vlx dev` shows the same diagnostics in the terminal and as an overlay; the last good build keeps serving | `src/dev.ts` |

## Direction (not built)

1. **Template language server**: the manifest is the semantic model; the MESH compiler already reports spans. A server needs only (a) a document sync that calls `compileProgram` with the unsaved text and (b) the manifest for completion/hover. The missing piece is MESH exposing *symbols* (a template's declared props/slots) as data; today they are inferred inside the compiler.
2. **Syntax highlighting**: `.mprx` grammar belongs to MESH (`Mesh/grammar`, `Mesh/editors` exist upstream); this repository should only point editors at it and at the two schemas. Not touched.
3. **Navigation** (go to the component for `<callout>`; go to the page for `[x](/guide/a)`): templates are found by file name (`src/<tag>.mprx`) and pages by path (`content/<path>.md`), so both are pure functions of the project tree and need no index. `content.json` records each page's `file`.
4. **Content completion** (front matter keys, link targets, headings): the key list is `FRONT_KEYS` in `content.ts`; targets are the page paths and `public/` files in `content.json`.
5. **Type information for `main.ts`**: plain TypeScript; `defineApp`'s state/command types are exported and checked by `tsc` (`examples/docs-app` typechecks).

## Known gaps

- Diagnostic columns are 0 for content (the Markdown parser tracks lines only).
- A runtime error in the browser is not mapped back to an authored file; MESH render errors carry no source span today.
- `check` does not typecheck `src/main.ts` (use `tsc`); it loads it, which catches syntax and definition errors.
