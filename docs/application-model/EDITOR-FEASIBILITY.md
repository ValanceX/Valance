# Editor integration: feasibility (VS Code first)

**Verdict: feasible, and most of it already exists.** Diagnostics, quick fixes, hover, go-to-definition and completion for templates are provided by MESH's published language server and were driven end to end against `examples/docs-app` with the real server. Syntax highlighting needs one new artifact, a TextMate grammar, which was written and checked with VS Code's own engine. The one thing **not** run is VS Code itself: its download host is not reachable from this sandbox (only the npm registry is), so activation, the diagnostics collection and the language-client wiring are type-checked but unexecuted.

The spike is [`editors/vscode`](../../editors/vscode) (private, outside the workspace and CI). Nothing is published.

## What already exists upstream (MESH, checked in `/Mesh`)

| Piece | State |
|---|---|
| `mesh-lsp` language server (Rust), npm-installable as `@valancex/mesh-lsp@0.10.0` with native binaries for linux x64/arm64, macOS x64/arm64, Windows x64 | Published. Diagnostics (identical to `mesh check`), quick fixes from suggestions, hover, go to definition, completion, all from a manifest. **No semantic tokens.** One workspace root. |
| Tree-sitter grammar + `queries/highlights.scm` for MPRX | Exists, tested; used by Neovim (`editors/neovim`, verified headless) and Helix (unverified). **VS Code does not use Tree-sitter**: it needs a TextMate grammar. |
| Editor guide | `docs/guides/editor-setup.md`: "Zed and VS Code add languages through extensions, and MESH doesn't ship one yet. A future extension will only start `mesh-lsp` and pass these settings." This spike is that extension. |
| JSON Schemas for diagnostics and manifest | In `Mesh/schemas`. Valance's config schemas are in `packages/app/schemas`. |

## What was tried, and the result

| # | Question | Experiment | Result |
|---|---|---|---|
| E1 | Does the server work on a Valance project at all? | Scripted LSP session against `examples/docs-app` with the manifest `valance` wrote | It ran, but reported **false errors**: `unknown component "theme-toggle"` and `"blocks"`. The manifest declared only tags and the layout; the compiler infers the author's components later. |
| E2 | Is that fixable on our side? | Gave the server the program's own model (the manifest *with* inferred contracts) | **Zero false errors.** Fixed in `@valancex/app`: `.valance/manifest.json` is now that enriched model, and a new `.valance/editor.json` says where it is and which file is which component. A test pins both. |
| E3 | Do the real features work on real files? | Real server, project-derived settings, broken `layout.mprx` | Misspelt name → `unknown-reference` at the right line and column and quick fix `Replace with "site"`; missing prop → `missing-required-prop`; hover on `<theme-toggle>` → `component theme-toggle { theme: string, on.toggle }`; completion lists the 41 components and scope names. All in `editors/vscode/test/e2e.test.ts`. |
| E4 | Can the extension need no knowledge of Valance's conventions? | Extension reads only `.valance/editor.json` | Yes: it passes `{ model, components }` straight to the server. The convention (what is a component, where the manifest is) stays in `@valancex/app`. |
| E5 | Highlighting in VS Code | Hand-written `mprx.tmLanguage.json` (tags, attributes, `on.event`, strings, expressions, operators, commands, `$event`, nested objects), tested with `vscode-textmate` + `vscode-oniguruma`, the engine VS Code runs | Scopes asserted token by token; every template of the example and the built-in kit returns to the top level. On MESH's own **96** sample files: **94 close cleanly**; the other 2 are the intentionally unclosed-tag fixtures. Mutating the grammar makes the tests fail (checked). |
| E6 | Everything the template server cannot see (Markdown, front matter, links, `valance.json`, `main.ts`) | `valance check --json` through the extension's own `run`, mapped to editor ranges | Works; ~0.75 s per run in this container, so on save, not per keystroke. Template diagnostics are filtered out to avoid showing them twice. |
| E7 | Config files in the editor | `contributes.jsonValidation` with the schemas | Declarative, no code; a test pins that the shipped copies equal `@valancex/app`'s. Not run in VS Code. |
| E8 | Go to definition of a component | The server answers with the *manifest* (generated JSON), not the template | Unwanted. The extension has a definition middleware that sends a tag to `src/<tag>.mprx` through `editor.json`. Pure parts tested; the middleware itself is unexecuted. |

## Gaps and risks

| # | Gap | Severity | Resolution |
|---|---|---|---|
| G1 | **Extension host never run** (VS Code can't be fetched here) | Medium: the code is small and type-checked against `@types/vscode` and `vscode-languageclient`, but activation, `DiagnosticCollection` and the middleware are unproven | Add `@vscode/test-electron` to CI (a GitHub runner can download VS Code); run a launch-and-assert test |
| G2 | No semantic tokens from `mesh-lsp` | Low: highlighting is lexical (TextMate), so an unknown tag looks like a known one; the diagnostic still marks it | Upstream request to MESH if wanted |
| G3 | Two highlighters to keep in step (Tree-sitter queries and this TextMate grammar) | Low-medium: MPRX is tiny, and the grammar test uses MESH's own samples | Move the grammar to `Mesh/editors/vscode`-style upstream and share its corpus test; Valance's extension then consumes it |
| G4 | Content diagnostics: line but no column, only for saved files, ~0.75 s | Low | Acceptable for a first release. As-you-type needs `check` to accept unsaved buffers (an in-process API), later |
| G5 | The server supports **one** workspace root; the extension uses the first folder | Medium for monorepos (e.g. opening this repository's root instead of `examples/docs-app`) | Document; later, one client per `valance.json` folder |
| G6 | Built-in templates (`views/*.mprx` in the package) are not mapped, so opening one gets no diagnostics | Low | Intended: they are not the author's. A copy in `src/` is mapped normally |
| G7 | A brand-new component is "unknown" until the next successful compile updates the manifest | Low, transient | `valance dev` recompiles on save; the server reloads the manifest when it changes. **Not measured** here |
| G8 | Distributing the native server: project devDependency (`@valancex/mesh-lsp`, versions with the project's MESH) vs bundling per-platform in the VSIX | Decision | Recommended: project-installed with `valance.meshLsp.path` as an override; consider making it an optional peer of `@valancex/app` so `pnpm add` brings it |
| G9 | Publishing: Marketplace publisher, Open VSX, `vsce`, icon, versioning | Owner | Not started |
| G10 | Other editors | Info | Neovim/Helix can read the same `.valance/editor.json` for their `model`/`components` settings; **not tested** |

## Changes to Valance made for this (all tested)

- `.valance/manifest.json` is now the compiler's enriched model (author components included), not the pre-compile manifest.
- New `.valance/editor.json` `{ version: 1, model, components }`.
- `packages/app/test/pipeline.test.ts`: "what an editor reads". Core untouched.

## Recommended path to a shippable first version

1. Run the extension in a real host: `@vscode/test-electron` job; fix whatever it finds (G1).
2. Decide where the grammar lives and who publishes (G3, G9) and how `mesh-lsp` is obtained (G8).
3. Package with `vsce`; ship highlighting + diagnostics + hover + completion + definition + config validation.
4. Then: unsaved-buffer `check` (G4), multi-root (G5), and ask MESH for semantic tokens (G2).

Estimate for 1–3, given what exists: small (days, not weeks); almost all the risk is in step 1.

## How to reproduce

```console
$ cd editors/vscode && pnpm install && pnpm test      # 15 tests: grammar (VS Code's engine), project reading, schemas, real mesh-lsp, real `valance check`
$ pnpm typecheck                                      # extension code against @types/vscode and vscode-languageclient
```
`e2e.test.ts` runs `valance check` in `examples/docs-app` first, so build the workspace (`pnpm build` at the root) before running it.
