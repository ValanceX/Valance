# Handoff and decision record: application model cycle

Branch `claude/fervent-ptolemy-gbtc8u`. Newest entries at the bottom of each phase block.

## Phase 0 — baseline (done)
- Evidence: [`BASELINE.md`](BASELINE.md).
- Decision: `PROJECT_SOURCE_OF_TRUTH.md`/`TASK_HANDOFF.md` are absent; use V1_CONTRACT/CONSTRAINTS/docs-verifier docs; this file is the handoff.
- Code changed: none.
- Validation: verifier build, typecheck, unit (3 pre-existing failures), Chromium smoke (14 pass), workspace build.
- Uncertainty: none material.

## Phase 1 — model (done)
- Evidence: [`CANDIDATES.md`](CANDIDATES.md).
- Decision: Candidate B; tooling lives in new package `packages/cli` (`@valancex/cli`, private, bin `valance`), because the core forbids a CLI.
- Rejected: A (not an application), C (leaves mechanisms exposed), putting the CLI in `@valancex/valance` (contradicts CONSTRAINTS), rewriting docs-verifier in place (its kit is four sites of i18n/versions/search — out of scope; see Phase 2 notes).
- Code changed: none.

## Phase 2 — tracer bullet (done)
- Evidence: [`FINDINGS.md`](FINDINGS.md) (failures F1–F8, blockers D1–D6, measurements). Browser evidence: `examples/docs-app/test/{built,dev}.test.ts` (Chromium, 14 checks).
- Decision: the tracer is a **new example**, `examples/docs-app`, not a rewrite of `docs-verifier`. The verifier is four sites with versions, languages, search, tabs and callouts; moving it onto the new workflow needs the library mechanism (D4), capabilities in `defineApp` and per-page payloads. Rejected: rewriting it in place (would have made the cycle about the verifier's features, not the model); forking its kit into the new package (duplication).
- Model revisions forced by the experiment: the entry is *generated* and the wasm import moved into the package (F1); narrow tag table (D1); `public/` is a convention checked from Markdown (D3); style edits bypass the rebuild (F3).
- Code: `packages/cli` (new), `examples/docs-app` (new).

## Phase 3 — substrate (done, minimal)
- 3A config: `valance.json`, `valance.web.json`, schemas, `.valance/` with its own `.gitignore`, `dist/` separate. Proof: `test/config.test.ts`, `pipeline.test.ts` (project root holds only authored files, `.valance/`, `dist/`).
- 3B commands: `vlx dev|build|check`. Proof: `cli.test.ts`, `pipeline.test.ts`, example smoke.
- 3C content/assets: `content.ts`, `markdown.ts`, `public/`. Proof: 13 tests (4 Markdown, 9 content: nav order, links, fragments, images, errors with lines).
- 3D routing: content-derived `RouteTable` through the existing `Plugin.routes`; hydration/history are Valance's. Proof: browser tests (direct load, in-place navigation, Back/Forward, fragment, 404 page and status).
- 3E components/styles: templates discovered by file name; built-ins replaceable; every stylesheet loaded. No registry. Proof: pipeline test "replace a built-in by name", dev test (component and style edits).
- 3F dev updates: watch, 60 ms quiet period, reload/style/overlay/restart. Proof: `dev.test.ts` (8 browser checks), `test/dev.test.ts` (base path, error at startup).
- Not done on purpose: HMR for templates (D6), per-page payloads, server adapter, `preview`, new primitives (D4).
- Rejected alternatives: virtual modules instead of generated entries (an author could not read what runs); a hand-rolled bundler/dev server instead of Vite (reimplements solved problems, adds nothing VALANCE-specific); putting the commands in `@valancex/valance` (forbidden by CONSTRAINTS); a content directory setting (no evidence).

## Phase 4 — external boundaries (done)
- [`EXTERNALS.md`](../../examples/docs-verifier/docs/EXTERNALS.md) now opens with the re-checked matrix, ownership map and plan. Result: X3 and X4 are implemented in the app tooling; X1, X2 and X6 are partly implemented there; X5 and X7 remain stand-ins.

## Phase 5 — editor foundation (done)
- [`EDITOR.md`](EDITOR.md). Implemented: one diagnostic shape, `check --json`, schemas, derived manifest. Not built: any server or extension.

## Phase 6 — regression, documentation, decision (done)
- [`REPORT.md`](REPORT.md): final report (what the cycle proved, structure, commands, status, API changes, validation, decisions, blockers). Run from a fresh clone of the pushed commit.

## Editor integration feasibility (follow-up cycle)
- Evidence: [`EDITOR-FEASIBILITY.md`](EDITOR-FEASIBILITY.md). Verdict: feasible; the template language server and a Tree-sitter grammar already exist upstream, so the new work is a TextMate grammar and a thin extension.
- Decision: the extension is a spike in `editors/vscode`, its own pnpm root (like `docs-verifier`), outside the workspace and CI. It reads only `.valance/editor.json`, so Valance's conventions are not copied into the editor. Rejected: re-implementing diagnostics in the extension (the server is the compiler's own); a Valance-specific language server now (the gap is columns/unsaved buffers for Markdown, not worth a server yet); bundling native binaries in the VSIX (the project's `@valancex/mesh-lsp` keeps server and compiler versions together).
- Code: `packages/cli` (enriched `manifest.json`, new `editor.json`, one test); `editors/vscode` (new, 15 tests).
- Not done / unproven: VS Code host never run (download host unreachable from the sandbox).

## Editor integration: decisions and CI (second follow-up)
- Decisions (rationale and precedent table in `EDITOR-FEASIBILITY.md`): the MPRX grammar lives in **MESH** (`editors/vscode`, with a corpus test and its own CI job), by the Svelte/Vue/Astro/Angular pattern of keeping the grammar with the language's tooling and tests; `@valancex/mesh-lsp` is a **project dev dependency** (Angular pattern); the marketplace publisher is **deferred**.
- Added: `vscode` CI job in `.github/workflows/ci.yml` (VS Code 1.90.0 and stable, `xvfb-run`), `editors/vscode/host/{run,suite}.ts` (8 cases in a real host), `sync-grammar` plus a drift test, `@valancex/mesh-lsp` in `examples/docs-app`.
- Verified here: the editor's unit/e2e tests (16), the host code compiles, the launcher's setup runs against a scratch workspace, the real server starts through the pnpm shim.
- **Host suite, first CI run (38065379029):** 7 of 8 cases passed in a real VS Code on both 1.90.0 and stable. The hover case failed on a test bug (`JSON.stringify` of a `MarkdownString` prints `{}`), fixed in the following commit.

## Rename: `@valancex/app` -> `@valancex/cli`, `valance` -> `vlx`
- The package directory is `packages/cli`, the npm name `@valancex/cli`, the command `vlx` (after `npx`, `bunx`). `valance.json`, `valance.web.json`, `.valance/` and the product name are unchanged. The core is untouched.
- Names inside the tooling follow: log prefixes are `vlx:`, the extension runs `node_modules/.bin/vlx`, the author-definition brand is `Symbol.for("valancex.cli")`. Historical entries above keep their words but the replaced names were updated mechanically.
- Verified: build, typecheck 0 errors, `packages/cli` 43 tests, docs-app 14 browser checks, extension 16 tests and host compile, and the walkthrough in [`TRY-IT.md`](TRY-IT.md) executed from a fresh clone.
