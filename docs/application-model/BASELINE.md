# Phase 0: baseline (measured 2026-10-10, on this checkout)

Evidence, not assumption. Every row says how it was established. Historical notes (`examples/docs-verifier/docs/*`) were treated as claims to check.

**Missing sources.** `PROJECT_SOURCE_OF_TRUTH.md` and `TASK_HANDOFF.md` do not exist in any of the four checkouts (searched Valance, Nexus, Mesh, Port). Their equivalents used: `docs/V1_CONTRACT.md` (user contract), `docs/CONSTRAINTS.md` (maintainer constraints), `docs/stability.md`, `examples/docs-verifier/docs/*`. This cycle's handoff is [`HANDOFF.md`](HANDOFF.md).

## 1. Current-state architecture and workflow

```
@valancex/valance 0.8.0 (packages/valance)   composition only: define / start / mount / hydrate, ./web (run, history, link),
                                              ./web/server (renderToHtml), ./web/plugin (Plugin, RouteTable, head), ./web/build (manifest)
                                              No CLI, router, content pipeline, dev server, compiler (CONSTRAINTS.md l.21; V1_CONTRACT §11, §19)
examples/docs-verifier   (own pnpm root, resolves RELEASED packages from the registry, not the workspace)
  sites/<n>/            authored: site.json, content/*.md, snippets/, theme.css
  src/                  the "kit": app/ (state, commands, routes, scope), views/*.mprx, styles/, web/ (primitives, plugins, platform), main.ts (browser entry)
  build/                Node build stages: content/ (md → model), views.ts (mprx → program), document.ts, export.ts, serve.ts, cli/{prepare,site,serve}.ts
  scripts/ vite.config.ts tsconfig*.json   build glue
```

`pnpm build` (verified, 12 s from clean, `SITE` env selects the site):

1. `tsc -p tsconfig.server.json` → `.valance/tools/` (the Node half of the kit is compiled with `tsc`)
2. `node .valance/tools/build/cli/prepare.js` → `.valance/<site>/{site,search}.json`, `.valance/program.json` (markdown → model; `src/views/**/*.mprx` + manifest derived from kit plugin, `PageScope`, command table → MESH program)
3. `vite build` (entry `src/main.ts`, named only in `vite.config.ts`) → `dist/<site>/assets`
4. `node .valance/tools/build/cli/site.js` → names assets, `renderToHtml` per `staticPaths`, writes HTML, content JSON, sitemap, 404

`pnpm start` serves `dist/` statically (or `--ssr` renders per request). **There is no watcher and no dev server.**

Content → page path: `sites/<n>/content/**.md` → typed blocks → `Site` JSON → `PageScope` (flat `BlockView` record, because a MESH scope is flat) → `layout.mprx`/`page.mprx` + 15 content templates → MESH render → PORT HTML. Routing: `src/app/routes.ts` builds a `RouteTable` consumed through `Plugin.routes` (history, `known`, `paths`).

## 2. Authored / generated / committed (verified with `git status --ignored`)

| Kind | Where | Tracked |
|---|---|---|
| Authored | `sites/`, `src/`, `build/`, `tests/`, `docs/`, configs | yes (143 files) |
| Generated intermediates | `.valance/` (tools, program, site data) | ignored |
| Final artifact | `dist/<site>/` | ignored |
| `assets.d.ts` | hand-written in three examples (`src/web/assets.d.ts` etc.): 3 lines declaring `*.wasm?url` and `*/program.json?raw` so `tsc` accepts the browser entry's bundler imports | tracked, authored |

`assets.d.ts` exists **only because the author-written browser entry imports bundler-specific modules**. If the framework owns the entry, the author has no such imports and needs no file. It is not editor tooling for `.mprx`.

## 3. External capabilities (`EXTERNALS.md`), re-classified from evidence

| ID | Capability | Seam in Valance 0.8 | Stand-in | Classification |
|---|---|---|---|---|
| X1 | Router | `Plugin.routes`/`RouteTable` exist and are tested (`plugin.test.ts`) | `src/app/routes.ts`, `variants.ts` | **Implemented only as verifier stand-in.** Generic over state is a stated blocker (`GRADUATION.md`) |
| X2 | Content (md → typed pages) | none needed | `build/content/*` (≈1000 lines), `src/model/*` | **Stand-in**, not independently consumable (coupled to the kit's block model) |
| X3 | Static generator | `renderToHtml`, `staticPaths`, `renderHead` | `build/export.ts`, `cli/site.ts` | **Stand-in**; complete for four sites; needs the whole kit |
| X4 | Dev server / watch | none | none (grep for watch: no hits) | **Not implemented** |
| X5 | Server adapter | `renderToHtml`, `delivery` | `build/serve.ts` (`serveSsr`) | **Stand-in**, opt-in |
| X6 | Site kit (templates + CSS) | `Plugin.primitives`; templates are not in the plugin contract | `src/views`, `styles`, `web/primitives.ts` | **Stand-in**; blocked on the "`Plugin.views`" decision |
| X7 | Web platform capabilities | `Plugin.platform` | `src/web/platform.ts` | **Stand-in** |
| — | Project config (`valance.json`) | none | none | **Not implemented**: `grep` over `packages/` finds no reader |
| — | Static assets (`public/`) | none | none | **Not implemented** (FINDINGS F-7 reconfirmed) |

Ownership: engine-level behavior stays NEXUS (state/commands), MESH (language/compiler/runtime), PORT (realization). All of the above are Valance-tooling-level.

## 4. Friction for an application author, by impact

1. **No owned workflow.** Four chained stages, three build entry files, two tsconfigs, a Vite config; the author runs `pnpm build` and must know it is a chain.
2. **No dev loop.** Edit → rebuild (12 s) → restart server → reload.
3. **The entry is the author's job.** `src/main.ts` hand-boots wasm, parses a boot blob, lists plugins, wires platform and hydration. This is mechanism, not decision.
4. **Concept leakage.** To add a page element a developer meets MESH manifests, `PageScope` flat records, block projection (`BlockView`), `compileProgram`, `Plugin` tables.
5. **One `site.json` mixes project and target settings** (`base`, `url`).
6. **No asset story**: a site cannot ship an image or favicon.
7. **Adding a block kind touches 9 files.** (Kit-internal; not addressed this cycle.)
8. **Stale baseline tests** (below).

## 5. Baseline validation record

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` (verifier) | ok, 2.6 s |
| `pnpm build` (verifier, `docs` site) | ok, 12 s; 7 pages, 18 files; page script 690 kB (121 kB gz) |
| `pnpm typecheck` | clean |
| `pnpm test` (unit) | **232 pass, 3 fail** — pre-existing: `markdown.test.ts` expects `sites/{blog,landing,handbook}/snippets/`, which are empty directories git does not track. The notes' "235 pass" held only in a tree where the empty directories existed. |
| `pnpm test:smoke tests/smoke/sites.test.ts` (real Chromium) | 14 pass, 43 s |
| Workspace root `pnpm install && pnpm build` | ok, 7 s |
| `git status` after builds | clean (outputs ignored) |

## 6. Questions the next phases must answer

1. Where may `valance dev|build` live, given the core may not contain a CLI? (Answered in Phase 1.)
2. What does the author write in `src/main.ts` if the framework owns boot?
3. Can the dev loop reuse Vite (CSS HMR, module graph, overlay) while the page is still server-rendered with `renderToHtml`?
4. Which changes need reload vs restart?
5. What is the smallest content model that supports layout, nav, links, images?
6. Is a project config needed at all, and what has evidence for being in it?
