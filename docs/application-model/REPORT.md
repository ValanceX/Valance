# Cycle report: the VALANCE application model

Evidence is in [`BASELINE.md`](BASELINE.md), [`CANDIDATES.md`](CANDIDATES.md), [`FINDINGS.md`](FINDINGS.md), [`EDITOR.md`](EDITOR.md), [`HANDOFF.md`](HANDOFF.md) and the matrix at the top of [`EXTERNALS.md`](../../examples/docs-verifier/docs/EXTERNALS.md). Everything below was run on a fresh clone of the pushed commit (frozen-lockfile install, build, typecheck, tests, Chromium suites).

## 1. What the cycle proved

- A small documentation application can be written as **content + a layout + a component + a stylesheet + an optional `main.ts`** (150 lines in 11 files for `examples/docs-app`) and run with **`valance dev` / `valance build`**, with no compiler step, manifest, wasm import, hydration script, document assembly, server or bundler config in sight. The same capability in the verifier is ≈3,900 lines of kit, build glue and configuration.
- The core did not have to change. The existing seams (`Plugin.routes`, `renderToHtml`, `manifest`, `Web.run` with `hydrate`) were enough; the only things missing were tooling, and the core's own rules forbid tooling in it. A separate package was required, not just convenient.
- The generated browser entry, not an authored one, is the right design: the first run showed the authored-entry alternative leaks an engine dependency into every project.
- Not proved: that the model carries the verifier's richer site (tabs, callouts, search, versions, languages). That needs the library mechanism (D4), capabilities in `defineApp` and per-page payloads. The verifier was deliberately **not** rewritten this cycle; the acceptance wish that it "become the canonical example" is met by `examples/docs-app` with the verifier pointing to it and its externals re-classified, not by migrating the verifier.

## 2. The final authored structure

```
my-docs/
  valance.json            { "version": 1, "name": "Notes" }
  valance.web.json        optional: { "base": "/docs/", "url": "https://…" }
  content/                Markdown pages; the path is the address; 404.md optional
  public/                 served as it is
  src/
    main.ts               optional: defineApp({ state, commands })
    layout.mprx           optional (a default ships)
    *.mprx                components, named by file; same name as a built-in replaces it
    *.css                 every stylesheet is loaded
  .valance/               generated, git-ignored (has its own .gitignore)
  dist/                   the site
```

Minimal example: `examples/docs-app` (and a one-file project: `valance.json` + `content/index.md`, which `check` and `build` accept; built by hand, not covered by a test).

## 3. Commands

`valance dev [--port N] [--host H]`, `valance build`, `valance check [--json]`. `pnpm dev|build|check` in the example. How to create, run and change a page: [`packages/app/README.md`](../../packages/app/README.md), top section.

## 4. Implemented, stand-in, external

- **Implemented** (in `@valancex/app`, private and unpublished): config + schemas, content pipeline (Markdown subset, checked links/images/fragments), template discovery and compile with source-mapped diagnostics, routes derived from content (through the existing `Plugin.routes`), static build (documents, 404, sitemap, public files, base path), dev server (reload, style update, overlay, restart), `check`.
- **Stand-ins that remain** (verifier): the richer Markdown dialect, 17-template documentation kit and CSS, search, versions/languages, per-page payloads, feeds, `serveSsr`, platform capabilities (clipboard, storage).
- **Still external / not built**: a library mechanism for templates and tags, `platform` in `defineApp`, a production server adapter and `preview`, template HMR, any editor server.

## 5. Public API and configuration changes

- **Core (`@valancex/valance`): none.** Constraint C45 and a test pin that it never mentions the new package.
- New, provisional (listed in `stability.md`): `@valancex/app` exports `defineApp`, `Schema`, `AppDefinition`, `PageState`; `/node` (`build`, `check`, `dev`, `loadConfig`, `findRoot`, `AppError`, `format`); `/client` and `/server` are generated-entry plumbing. Files: `valance.json` (`version`, `name`), `valance.web.json` (`version`, `base`, `url`), unknown keys are errors. Layout scope: `site, home, title, description, found, sections, hasToc, toc, blocks, prev, next` + the author's state fields. Reserved: those names and the command `go`.
- Package name, the `valance` bin and every convention are **proposals**; the owner decides names and publishing (`GRADUATION.md`).

## 6. Validation evidence

| Check | Result |
|---|---|
| Fresh clone: `pnpm install --frozen-lockfile`, `build`, `typecheck` | clean (0 type errors) |
| `packages/app` tests (config 6, markdown 4, content 9, pipeline 12, dev 3, cli 4, boundaries 4) | 42 pass |
| Core `packages/valance` / `examples/tracer-web` (unchanged) | 178 / 553 pass |
| `examples/docs-app` Chromium (built site: direct loads, hydration, in-place navigation with one document load, Back/Forward, cross-page fragment, application command and its state across pages, 404 page + status, stylesheet; dev: Markdown/component/style edits, error overlay with file:line and recovery, new page, config restart) | 14 pass |
| `examples/docs-site` smoke (existing) | 2 pass |
| `docs-verifier` unit | 235 / 235 (was 232 + 3 failing from a fresh checkout) |
| Clean tree after build and tests | only git-ignored `.valance/`, `dist/` |
| Manually: `valance dev` under `/docs/`, SIGINT stops the process | verified (then pinned by a test) |

Known limitations: single web target; whole content model in the bundle; Markdown subset; narrow, fixed tag table (D1, D4); no string concatenation in templates (D3); updates are reloads except styles (D6); content diagnostics have no column; `check` does not typecheck `main.ts`; dev default port 5173 and no `preview`; timings are single runs in one container. I did not run the full `tracer-web` Chromium suite (`test:browser`) or the verifier's smoke/visual/budget suites: none of their inputs changed.

## 7. Decisions, with reasons

1. **Separate package, not the core** — `CONSTRAINTS.md` forbids a CLI/dev server in the core.
2. **Candidate B (declared application, framework-owned boot)** over content-only (not an application) and explicit-application (exposes the mechanisms).
3. **Generated, readable entries in `.valance/`, not virtual modules** — an author can read what runs; and F1.
4. **Vite for bundling, dev serving, style updates and overlay** — solved problems; VALANCE-specific code is only the rendering middleware and the watch rules.
5. **Reload, not HMR, for content and templates** — the compiled program is data with no hot-swap contract (D6); a reload is correct and fast (~0.3 s).
6. **Config limited to evidence** — `name`; `base` and `url`. Content dir, port, plugins, themes were not invented.
7. **Strict**: unknown config/front-matter keys, unsupported Markdown, broken links and unused components are errors.
8. **A new example instead of rewriting `docs-verifier`** — see §1.
9. **Narrow tags** to live with D1 rather than patch the manifest derivation in the core.

## 8. Remaining blockers and next cycle

Blockers (smallest changes, owners in `FINDINGS.md`): D1 optional props on primitives; D2 conditionals inside `mesh-case`; D3 string concatenation in MPRX; D4 a library mechanism for templates/tags; D5 fragment in `urlOf`; D6 program hot swap.

Recommended next cycle: **move the verifier onto `valance build`.** Order: (1) D4 + `platform` in `defineApp`; (2) merge the verifier's block kinds into the content model and add per-page payloads; (3) `valance preview`; (4) decide names/publishing of `@valancex/app` with the owner; (5) D1/D2 upstream so the kit stops carrying workarounds.
