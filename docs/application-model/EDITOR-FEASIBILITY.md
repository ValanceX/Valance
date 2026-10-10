# Editor integration: feasibility (VS Code first)

> **First real-VS-Code run (CI run 38065379029, VS Code 1.90.0 and stable, identical):** 7 of 8 host cases passed: activation, `.mprx` language id, a template diagnostic at its place and clearing, go-to-definition to the template, completion, a Markdown `valance` diagnostic after save and clearing, and config-schema validation. The 8th (hover) failed on a test bug: the test serialised VS Code's `MarkdownString` with `JSON.stringify` (`{}`); the hover itself answered. Fixed to read `.value`; see the next run.
>
> **Follow-up (decisions taken):** the grammar's home is MESH; `@valancex/mesh-lsp` is a project dev dependency; a real-VS-Code CI job exists but has **not yet run** (it could not be run in the authoring sandbox); the marketplace publisher is deferred until that job passes. See "Decisions" below.

**Verdict: feasible, and most of it already exists.** Diagnostics, quick fixes, hover, go-to-definition and completion for templates are provided by MESH's published language server and were driven end to end against `examples/docs-app` with the real server. Syntax highlighting needs one new artifact, a TextMate grammar, which was written and checked with VS Code's own engine. The one thing **not** run is VS Code itself: its download host is not reachable from this sandbox (only the npm registry is), so activation, the diagnostics collection and the language-client wiring are type-checked but unexecuted.

The spike is [`editors/vscode`](../../editors/vscode) (private, outside the workspace and CI). Nothing is published.

## What already exists upstream (MESH, checked in `/Mesh`)

| Piece | State |
|---|---|
| `mesh-lsp` language server (Rust), npm-installable as `@valancex/mesh-lsp@0.10.0` with native binaries for linux x64/arm64, macOS x64/arm64, Windows x64 | Published. Diagnostics (identical to `mesh check`), quick fixes from suggestions, hover, go to definition, completion, all from a manifest. **No semantic tokens.** One workspace root. |
| Tree-sitter grammar + `queries/highlights.scm` for MPRX | Exists, tested; used by Neovim (`editors/neovim`, verified headless) and Helix (unverified). **VS Code does not use Tree-sitter**: it needs a TextMate grammar. |
| Editor guide | `docs/guides/editor-setup.md`: "Zed and VS Code add languages through extensions, and MESH doesn't ship one yet. A future extension will only start `mesh-lsp` and pass these settings." This spike is that extension. |
| JSON Schemas for diagnostics and manifest | In `Mesh/schemas`. Valance's config schemas are in `packages/cli/schemas`. |

## What was tried, and the result

| # | Question | Experiment | Result |
|---|---|---|---|
| E1 | Does the server work on a Valance project at all? | Scripted LSP session against `examples/docs-app` with the manifest `valance` wrote | It ran, but reported **false errors**: `unknown component "theme-toggle"` and `"blocks"`. The manifest declared only tags and the layout; the compiler infers the author's components later. |
| E2 | Is that fixable on our side? | Gave the server the program's own model (the manifest *with* inferred contracts) | **Zero false errors.** Fixed in `@valancex/cli`: `.valance/manifest.json` is now that enriched model, and a new `.valance/editor.json` says where it is and which file is which component. A test pins both. |
| E3 | Do the real features work on real files? | Real server, project-derived settings, broken `layout.mprx` | Misspelt name → `unknown-reference` at the right line and column and quick fix `Replace with "site"`; missing prop → `missing-required-prop`; hover on `<theme-toggle>` → `component theme-toggle { theme: string, on.toggle }`; completion lists the 41 components and scope names. All in `editors/vscode/test/e2e.test.ts`. |
| E4 | Can the extension need no knowledge of Valance's conventions? | Extension reads only `.valance/editor.json` | Yes: it passes `{ model, components }` straight to the server. The convention (what is a component, where the manifest is) stays in `@valancex/cli`. |
| E5 | Highlighting in VS Code | Hand-written `mprx.tmLanguage.json` (tags, attributes, `on.event`, strings, expressions, operators, commands, `$event`, nested objects), tested with `vscode-textmate` + `vscode-oniguruma`, the engine VS Code runs | Scopes asserted token by token; every template of the example and the built-in kit returns to the top level. On MESH's own **96** sample files: **94 close cleanly**; the other 2 are the intentionally unclosed-tag fixtures. Mutating the grammar makes the tests fail (checked). |
| E6 | Everything the template server cannot see (Markdown, front matter, links, `valance.json`, `main.ts`) | `vlx check --json` through the extension's own `run`, mapped to editor ranges | Works; ~0.75 s per run in this container, so on save, not per keystroke. Template diagnostics are filtered out to avoid showing them twice. |
| E7 | Config files in the editor | `contributes.jsonValidation` with the schemas | Declarative, no code; a test pins that the shipped copies equal `@valancex/cli`'s. Not run in VS Code. |
| E8 | Go to definition of a component | The server answers with the *manifest* (generated JSON), not the template | Unwanted. The extension has a definition middleware that sends a tag to `src/<tag>.mprx` through `editor.json`. Pure parts tested; the middleware itself is unexecuted. |

## Gaps and risks

| # | Gap | Severity | Resolution |
|---|---|---|---|
| G1 | **Extension host never run here** (VS Code can't be fetched from the authoring sandbox) | Medium. **Now addressed by a CI job** (`vscode` in `.github/workflows/ci.yml`, VS Code 1.90.0 and stable, under `xvfb-run`) that runs 8 cases in a real host: activation, language id, diagnostic at place and clearing, hover, definition to the template, completion, a Markdown diagnostic after save, config-schema validation. Everything around it was verified here (launcher setup, `vlx check` on the scratch workspace, the real server through the pnpm shim the extension spawns, the host code compiles against `@types/vscode`). **First run: 7 of 8 cases passed on both versions; the 8th was a test bug, now fixed.** Green once the rerun confirms | Run the job; fix what it finds |
| G2 | No semantic tokens from `mesh-lsp` | Low: highlighting is lexical (TextMate), so an unknown tag looks like a known one; the diagnostic still marks it | Upstream request to MESH if wanted |
| G3 | Two highlighters to keep in step (Tree-sitter queries and the TextMate grammar) | Low-medium. **Decided:** the grammar lives in MESH (`editors/vscode`), tested there against MESH's own files with VS Code's engine (32 valid files must close, 60 failing fixtures must still tokenize); CI job added in MESH | Keep both tested on the same corpus |
| G4 | Content diagnostics: line but no column, only for saved files, ~0.75 s | Low | Acceptable for a first release. As-you-type needs `check` to accept unsaved buffers (an in-process API), later |
| G5 | The server supports **one** workspace root | Medium. **Partly addressed:** the extension now finds the project in the opened folder or up to three levels below it, and writes the server's paths from the workspace (verified against the real server: written from the project, the server silently checks nothing). One project per window; several projects in one window pick one (the one holding the active file) | One client per `valance.json` folder, later |
| G6 | Built-in templates (`views/*.mprx` in the package) are not mapped, so opening one gets no diagnostics | Low | Intended: they are not the author's. A copy in `src/` is mapped normally |
| G7 | A brand-new component is "unknown" until the next successful compile updates the manifest | Low, transient | `vlx dev` recompiles on save; the server reloads the manifest when it changes. **Not measured** here |
| G8 | Distributing the native server | **Decided:** a dev dependency of the *project* (`@valancex/mesh-lsp`, as `examples/docs-app` now has), so the server and the project's MESH compiler stay in the same version; `valance.meshLsp.path` overrides. Not an optional peer of `@valancex/cli`: it would put a native binary in every install, including builds | Documented in `packages/cli/README.md` |
| G9 | Publishing: Marketplace publisher, Open VSX, `vsce`, icon, versioning | **Deferred** until the host job passes and the integration is proven | Not started |
| G10 | Other editors | Info | Neovim/Helix can read the same `.valance/editor.json` for their `model`/`components` settings; **not tested** |

## Changes to Valance made for this (all tested)

- `.valance/manifest.json` is now the compiler's enriched model (author components included), not the pre-compile manifest.
- New `.valance/editor.json` `{ version: 1, model, components }`.
- `packages/cli/test/pipeline.test.ts`: "what an editor reads". Core untouched.

## Decisions

### Where the grammar lives: MESH, next to its corpus

What the large language servers do:

| Ecosystem | Grammar lives | Server | Takeaway |
|---|---|---|---|
| Svelte (`sveltejs/language-tools`) | In the VS Code extension of the *language-tools* repo (authored as YAML, built to JSON, snapshot-tested), not the compiler repo | Editor-agnostic `svelte-language-server` in the same repo | Grammar sits with the editor tooling and is tested there |
| Vue (`vuejs/language-tools`) | The extension's `syntaxes/` | `@vue/language-server`, editor-agnostic | Thin extension over a shared server |
| Astro (`withastro/language-tools`) | The extension's `syntaxes/` | `@astrojs/language-server` | Same |
| Angular (`vscode-ng-language-service`) | The extension's `syntaxes/` (generated) | The language service ships with the *project's* `@angular/language-service` | The extension uses the **project's installed** toolchain version |
| TypeScript / JSX | A standalone TextMate-grammar repository | tsserver | Grammar as its own permanent artifact, because other tools (GitHub's highlighter) consume it |

Applied here, with what was left out:

- **Taken:** the grammar belongs to whoever owns the *language*, beside the tooling and tests of that language, not to a framework built on it. MPRX is MESH's, MESH already holds the Tree-sitter grammar, the server, the Neovim setup and the fixtures, so the TextMate grammar is at `Mesh/editors/vscode`, with a test over MESH's own 92 MPRX files. Valance's extension is the Angular-style *consumer*: thin, project-local server, Valance-specific wiring only.
- **Taken:** one editor-agnostic server for every editor (`mesh-lsp`), a grammar corpus test (Svelte/Astro), a real-host CI test (Svelte/Angular), a separate CLI check for CI (`svelte-check`/`vue-tsc`/`astro check` ↔ `vlx check`).
- **Left out:** TypeScript-server plugins and virtual files (Vue/Angular: for languages embedded in TypeScript, which MPRX is not); a YAML grammar source with a build step (Svelte: ~100 lines of JSON does not need one yet); a standalone grammar repository (TypeScript: premature for one language with one grammar).
- **Interim:** until MESH publishes its language extension, this extension ships a byte-identical copy (`pnpm sync-grammar`; a test compares it with a MESH checkout when `MESH_DIR` or a sibling `Mesh/` exists). Then it declares `extensionDependencies` on MESH's extension and drops the copy.

### Where `mesh-lsp` is installed: the project's dev dependency

`examples/docs-app` has `"@valancex/mesh-lsp": "0.10.0"` in `devDependencies`; the extension runs `node_modules/.bin/mesh-lsp` (verified through the pnpm shim) and a setting overrides the path. Reason: the Angular precedent. The server checks templates with the MESH compiler, and its answers must match the compiler the project builds with.

### Publisher: deferred

No Marketplace or Open VSX publisher until the host job has passed and the integration is shown to work.

## Recommended path to a shippable first version

1. **Run the CI job** (`vscode`); fix whatever the real host finds (G1). This is the only step blocking everything else.
2. Publish MESH's language extension and switch this one to `extensionDependencies` (decided: G3); decide the publisher (deferred: G9).
3. Package with `vsce`; ship highlighting + diagnostics + hover + completion + definition + config validation.
4. Then: unsaved-buffer `check` (G4), multi-root (G5), and ask MESH for semantic tokens (G2).

Estimate for 1–3, given what exists: small (days, not weeks); almost all the risk is in step 1.

## How to reproduce

```console
$ cd editors/vscode && pnpm install && pnpm test      # 16 tests: grammar (VS Code's engine), project reading, schemas, real mesh-lsp, real `vlx check`
$ pnpm typecheck                                      # extension code against @types/vscode and vscode-languageclient
```
The host suite needs a display and network: `xvfb-run -a pnpm test:host` (`VSCODE_VERSION` picks the version). `e2e.test.ts` runs `vlx check` in `examples/docs-app` first, so build the workspace (`pnpm build` at the root) before running it.

## Found by trying it (first human use)

The first person to run the extension saw syntax colours but no hover and no diagnostics, and nothing said why. The server was running; its log said `layout.mprx has no component in "mesh.components", so it's checked without a model`. Causes and fixes:

| Cause | Fix |
|---|---|
| The extension read `.valance/editor.json` once at start. The project had been started with the built-in layout (no components), then the author added their own `src/layout.mprx`; `vlx dev` updated `editor.json`, the running server never heard | The extension watches `.valance/editor.json` and tells the running server through `workspace/didChangeConfiguration` (proved at the protocol level against the real server; a host case covers it in VS Code) |
| Every failure went only to a hidden output channel | A status bar item and a once-per-kind warning with the reason and the fix; commands *VALANCE: Show details* and *Restart the language server* |
| A template the server does not know produces no diagnostic of its own | An editor note on the file ("not part of the compiled project…"); and `vlx check`'s own diagnostics for such a file are shown, since the server is silent on it |
| Opening a folder above the project found nothing, silently | Project discovery up to three levels, and server paths written from the workspace |
| Windows could not spawn the `.cmd` shim | The server is started with a shell on Windows (untested there) |

Lesson for the host suite: it only opened the project directly with a freshly generated `editor.json`, the one setup in which every one of these worked. It now also runs with the window opened above the project and exercises a stale mapping.
