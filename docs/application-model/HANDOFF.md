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
- Decision: Candidate B; tooling lives in new package `packages/app` (`@valancex/app`, private, bin `valance`), because the core forbids a CLI.
- Rejected: A (not an application), C (leaves mechanisms exposed), putting the CLI in `@valancex/valance` (contradicts CONSTRAINTS), rewriting docs-verifier in place (its kit is four sites of i18n/versions/search — out of scope; see Phase 2 notes).
- Code changed: none.

## Phase 2 — tracer bullet (done)
- Evidence: [`FINDINGS.md`](FINDINGS.md) (failures F1–F8, blockers D1–D6, measurements). Browser evidence: `examples/docs-app/test/{built,dev}.test.ts` (Chromium, 14 checks).
- Decision: the tracer is a **new example**, `examples/docs-app`, not a rewrite of `docs-verifier`. The verifier is four sites with versions, languages, search, tabs and callouts; moving it onto the new workflow needs the library mechanism (D4), capabilities in `defineApp` and per-page payloads. Rejected: rewriting it in place (would have made the cycle about the verifier's features, not the model); forking its kit into the new package (duplication).
- Model revisions forced by the experiment: the entry is *generated* and the wasm import moved into the package (F1); narrow tag table (D1); `public/` is a convention checked from Markdown (D3); style edits bypass the rebuild (F3).
- Code: `packages/app` (new), `examples/docs-app` (new).

## Phase 3 — substrate (done, minimal)
- 3A config: `valance.json`, `valance.web.json`, schemas, `.valance/` with its own `.gitignore`, `dist/` separate. Proof: `test/config.test.ts`, `pipeline.test.ts` (project root holds only authored files, `.valance/`, `dist/`).
- 3B commands: `valance dev|build|check`. Proof: `cli.test.ts`, `pipeline.test.ts`, example smoke.
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
- Code: `packages/app` (enriched `manifest.json`, new `editor.json`, one test); `editors/vscode` (new, 15 tests).
- Not done / unproven: VS Code host never run (download host unreachable from the sandbox).
