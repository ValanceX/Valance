# Application structure: investigation record

The structure investigation of `examples/docs-verifier`, against the *VALANCE Application Structure Specification* (P1–P7). It is written in phases; each says what was **measured** (run on this checkout, 2026-10) and what is a **hypothesis**. Nothing in Phases A–C changed the project.

## Phase A: baseline

### A1. The tree (tracked files, before)

```
docs-verifier/                      31 entries at the root
├── README.md ROADMAP.md FINDINGS.md PRINCIPLES.md GRADUATION.md EXTERNALS.md     6 documents
├── package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.server.json
│   vite.page.config.ts vitest.config.ts vitest.{smoke,principles,budget,visual}.config.ts   configuration (11)
├── app/        8 files   state, commands, capabilities, routes, search, variants, structured, scope (652 lines)
├── model/      4 files   the shapes of a site (Schemas)
├── tooling/    5 files   build time: a site's directory → data
├── web/       19 files   browser entry, plugins, platform, document, export, serve, compile, ...
├── views/     17 files   .mprx templates, flat
├── styles/     1 file    site.css (310 lines)
├── sites/<name>/         site.json, content/*.md, snippets/*.ts, theme.css   (data only)
├── scripts/    5 files   build glue
├── test/ smoke/ principles/ budget/ visual/                                    5 test directories
└── (untracked) generated/  dist/{server,<site>}  .work  .packs  node_modules
```

### A2. Responsibility map

| Concept | Where it is | Note |
|---|---|---|
| Content (pages, snippets) | `sites/<n>/content`, `snippets` | authored, data only |
| Site configuration: name, navigation sections, header, footer, locales, versions, feeds, `base`, `url` | `sites/<n>/site.json` | one file for project-wide *and* web-deploy settings (`base`) |
| Site theme | `sites/<n>/theme.css` | custom properties only |
| State and commands | `app/state.ts`, `app/application.ts`, `app/capabilities.ts` | target-free |
| URLs ↔ state | `app/routes.ts` | one file; the application's routes |
| What a view reads | `app/scope.ts` (652 lines) | schemas, block projection, navigation, header/footer, search results, outline, post meta, pager: seven responsibilities |
| Templates | `views/*.mprx` | the shell (`layout`, `page`) and fourteen content components in one flat list |
| Styling | `styles/site.css` | one file, sectioned by comments |
| Tags → elements | `web/primitives.ts` | target configuration |
| Plugins | `web/kit.ts`, `router.ts`, `seo.ts`, `plugins.ts` | |
| Browser behaviour | `web/page.ts`, `platform.ts`, `navigation.ts`, `scrollspy.ts`, `language.ts` | |
| Document, export, serve | `web/document.ts`, `export.ts`, `serve.ts`, `built.ts` | Node |
| Template compile | `web/compile.ts`, `web/build-program.ts` | Node, build stage |
| Content build | `tooling/*` | Node, build stage |
| Build glue | `scripts/*.mjs`, `vite.page.config.ts`, `tsconfig.server.json` | |

`web/` holds four unrelated roles (browser runtime, plugins, the server half of a page, the template compiler).

### A3. Entry point and execution path

There is **no single entry**. `pnpm build` runs four stages, in this order, sharing state through files:

1. `build:server`: `tsc` compiles the Node-side code to `dist/server`, and `copy-views` copies `views/` beside it.
2. `build:content`: `dist/server/tooling/build-content.js` → `generated/<site>/site.json`, `search.json`.
3. `build:program`: `dist/server/web/build-program.js` → `generated/program.json`.
4. `build:page`: `vite build` (entry `web/page.ts`, named only in `vite.page.config.ts`) → `dist/<site>/assets`, then `scripts/finish-build.mjs` names the index and theme.
5. `build:site`: `dist/server/web/export-main.js` → the documents, content files, sitemap, feed in `dist/<site>`.

`pnpm start` runs `dist/server/web/serve-main.js`. There is no development server and no watch mode. **Measured:** one site, `pnpm build`, 16 s.

### A4. Authored, generated, configuration, internal

- Authored: `sites/*`, `app/`, `model/`, `views/`, `styles/`, the browser-side `web/` files.
- Generated: `generated/` (a root directory), `dist/server` (compiled build tools, *inside* the deliverable directory), `dist/<site>` (the deliverable).
- Configuration: eleven files at the root.
- Framework-stage glue an author never wants to read: `tooling/`, `web/{compile,build-program,document,export*,serve*,built}.ts`, `scripts/*`.

### A5. Oversized or multi-responsibility files

- `app/scope.ts`, 652 lines: see A2. (Length is not the finding; the seven responsibilities are.)
- `tooling/content.ts`, 415 lines: collections, sections, versions, locales, list/tag pages, link resolution. One direction (a directory → a map) but several independent rules. Hypothesis only: no friction recorded, left alone.
- `tooling/markdown.ts`, 404 lines: one responsibility (the markdown dialect). Left alone.

### A6. Friction, measured

| # | Finding | Measured how |
|---|---|---|
| F-1 | `pnpm test` fails 3 tests in place: `test/boundaries.test.ts` looks for `content/` and `snippets/` at the root; they moved to `sites/<n>/`. A stale `.work` copy had both directories and hid it. | ran `pnpm test` |
| F-2 | Adding a template component needs the `.mprx` file **and** an edit to a hard-coded list (`COMPONENTS`) in `web/compile.ts`, a build-stage file. | read `compile.ts` |
| F-3 | Adding a block kind (e.g. `hero`) touches nine files in six directories. Three of them are the kind's *definition* (`model`, `markdown`, `scope`), two its *drawing* (`views/block`, `views/hero-block`), one its *style*, and three are incidental (`content`, `search`, `compile`). | `grep -rli hero` |
| F-4 | The browser entry is named in `vite.page.config.ts` and nowhere in `package.json` or the tree; the build entry is a compiled path (`dist/server/web/export-main.js`). | read both |
| F-5 | `smoke/build.ts` hard-codes the list of source directories that decide whether a build is stale; a moved directory silently stops invalidating it. | read `build.ts` |
| F-6 | The root has 31 entries; the six documents and five test directories are as prominent as the application. | `ls -A` |
| F-7 | There is no place for static assets. Markdown accepts `![alt](src)` but nothing copies a file: `src` has to be an external URL. | `tooling/markdown.ts`, `tooling/content.ts` |
| F-8 | Intermediate output (`generated/`) is at the root and compiled build tools sit in `dist/server`, inside the directory that holds the deliverable. | `ls` |

## Phase B: violations

| Req. | Current | Problem | Status | Proposal | Evidence |
|---|---|---|---|---|---|
| P2.1, P6.4, P6.5 | `generated/`, `dist/server` | intermediate output at the root and inside the deliverable directory | confirmed (F-8) | intermediate output → `.valance/`; `dist/<site>` holds only the deliverable | `ls` |
| P2.1 | 31 root entries | source, tests, documents and configuration are indistinguishable | confirmed (F-6) | `src/` for the kit, `tests/` for suites, `docs/` for documents | `ls -A` |
| P2.3, P6.3 | browser entry `web/page.ts` | not discoverable | confirmed (F-4) | `src/main.ts` | read |
| P3.1, P3.2 | four stages and five scripts | an author runs/reads a pipeline | confirmed; **not fully fixable here**: needs a framework build command (`EXTERNALS.md` X2/X3) | one documented command; stages named for what they do; limit documented | A3 |
| P4.3, P4.6 | `app/scope.ts` | seven responsibilities in one file | confirmed (F-3, A2) | split along the responsibilities that change independently | A2 |
| P1.1, P2.2 | `views/` flat, 17 | the shell, the page and fourteen content components are one list | confirmed | `views/blocks/` for content components | A2 |
| P1.1, P2.2 | `web/` | four roles | confirmed | by role: the web *target*, the plugins, the Node build | A2 |
| P3.3 | `COMPONENTS` in `compile.ts` | a build file the component author must edit | confirmed (F-2) | read the directory | read |
| P7 | `boundaries.test` | tests a structure that no longer exists, and passes only against a stale copy | confirmed (F-1) | rewrite for the real layout | ran |
| P6.1, P6.2 | `site.json` holds `base` | one file for project and target settings | **hypothesis**: `base` is web-deploy; splitting needs a config the framework reads | record only | read |
| P6.1 | `valance.json`, `valance.web.json` | **unsupported**: no Valance code reads any config file | confirmed blocker | do not create | `grep` in `packages/valance` |
| P1.3 | "layouts" | **not a real concept here**: there is one shell template and one page view; `layout:` in front matter switches branches and CSS inside them | confirmed | do not create `layouts/` | `views/layout.mprx` |
| P1.3 | "routes/" | routes are one function pair (`app/routes.ts`), not per-page modules | confirmed | do not create `routes/` | read |
| P2.6 | `utils.ts`/`helpers.ts` | none exist; `model/slug.ts` is two lines but is shared by build and browser | no violation | none | `ls` |
| P4.1 | tests apart from their subjects | **hypothesis**; moving 25 test files changes no behaviour | recorded | keep apart, group by kind | |

## Phase C: candidates

**Candidate A, minimal.** Keep the directories; fix what is wrong inside them: intermediate output → `.valance/`, `COMPONENTS` read from the directory, `scope.ts` split, `boundaries.test` rewritten, `smoke/build.ts` told the real directories. No public API change. Root stays at 31 entries; `web/` keeps four roles; no entry point named.

```
app/ model/ tooling/ web/ views/ styles/ sites/ scripts/ test/ smoke/ principles/ budget/ visual/  + 6 docs + 11 configs
```

**Candidate B, by concept.** Everything A does, and the root separates source, tests, documents and configuration; `web/` is divided by role; content components are grouped.

```
docs-verifier/
├── package.json  tsconfig*.json  vite.config.ts  vitest.config.ts   configuration
├── README.md
├── docs/                      ROADMAP FINDINGS PRINCIPLES GRADUATION EXTERNALS STRUCTURE
├── sites/<name>/              AUTHORED: site.json, content/, snippets/, theme.css
├── src/                       the kit
│   ├── main.ts                the browser entry
│   ├── model/                 the shapes of a site
│   ├── app/                   state, commands, capabilities, routes, search, variants
│   │   └── scope/             what the view reads: contract, blocks, navigation, page
│   ├── views/                 layout.mprx page.mprx  +  blocks/*.mprx
│   ├── styles/                site.css
│   └── web/                   the web target: primitives, platform, browser behaviour, plugins/
├── build/                     Node, build time: content/, program, document, export, serve
├── tests/                     unit/ smoke/ principles/ budget/ visual/
├── scripts/                   test and release glue only
├── .valance/                  generated, not authored: site data, compiled program, build tools
└── dist/<site>/               the deliverable
```

Not created, with the reason: `layouts/` (A: one shell), `routes/` (one function pair), `components/` (the content components are `views/blocks/`: that is what they are), `public/` (no static assets exist: blocker F-7), `valance.json` / `valance.web.json` (nothing reads them).

| Criterion | A | B |
|---|---|---|
| Entry point | still implicit | `src/main.ts` |
| Content vs behaviour vs presentation | same as today | same, plus the kit under one root |
| Root clarity | 31 entries | about 12 |
| Where `scope.ts` responsibilities live | split | split |
| Generated output | `.valance/` | `.valance/` |
| Public API change | none | none |
| Cost | small | many moves; ~140 import edits, five configs |
| Risk | low | moderate; every path is checked by typecheck, build and the suites |

**Recommendation: B**, because F-4, F-6 and A2's `web/` finding are structural and A leaves them. B's cost is mechanical and verifiable. It pins nothing new in the framework. What B does *not* solve is P3.2: the four stages remain; see the blockers below.


## Phase D: tracer bullet

The slice was built before the bulk of the move (P7.7): `.valance/` for generated output, `src/main.ts` as the entry, `src/views/content/`, templates discovered from the directory, the content and program stages as one `prepare`. Then these tasks were done on the docs site, for real, from a clean `.valance/` and `dist/`:

| # | Task | Result |
|---|---|---|
| 1 | Add a documentation page | One markdown file and one entry in `sites/docs/site.json`. `pnpm build`, 12 s: the page, its `index.json`, its sidebar link and its pager link exist. **Pass.** |
| 2 | Select or apply a layout | `layout: landing` in the page's front matter is accepted and changes the page's layout. There is no layout *file* to select: a layout is a name from a closed set, handled inside `layout.mprx`/`page.mprx` and the stylesheet. **Pass; confirms there is no `layouts/` concept to give a directory.** |
| 3 | Render a reusable component | A new `src/views/content/<name>.mprx`, used from `page.mprx`, compiled with **no list edited** (the baseline needed an edit to `web/compile.ts`). A template nothing uses is refused by the compiler (`manifest-missing-component`): correct, and worth knowing. **Pass.** |
| 4 | Navigate between pages | The new page is in the sidebar and the pager of its neighbours (built HTML). In the browser, in-place navigation and Back are covered by the smoke suite (79 pass). **Pass.** |
| 5 | Apply styling | A rule added to `src/styles/site.css` is in the built stylesheet. **Pass.** |
| 6 | Run the development workflow | **Blocker.** There is no development server and no watcher; the workflow is `pnpm build`, `pnpm start`, reload. `pnpm start` served the new page (200, with the component's markup). |
| 7 | Build for the target | `pnpm build` from clean: 12 s (16 s before). `dist/docs` holds only the site; the generated files are in `.valance/`. **Pass.** |

The probe changes were reverted.

## Phase E: changes

Every move is a `git mv`, so history follows. Imports were rewritten by a script and checked by `tsc`, not by hand.

| Before | After | Why |
|---|---|---|
| `app/ model/ views/ styles/` | `src/app, src/model, src/views, src/styles` | one root for the kit |
| `web/page.ts` | `src/main.ts` | the entry is where a reader looks (P2.3) |
| `web/{primitives,platform,navigation,scrollspy,language,built}.ts` | `src/web/` | the web target |
| `web/{kit,router,seo,plugins}.ts` | `src/web/plugins/` | the three plugins and the list of them |
| `views/*.mprx` (17 flat) | `src/views/{layout,page}.mprx` + `src/views/content/` (15) | the shell and what is drawn inside a page |
| `web/{document,export,serve}.ts`, `web/compile.ts` | `build/` (`views.ts` for compile) | Node, build time |
| `tooling/*` | `build/content/` (`content.ts` → `site.ts`) | a site's directory → data |
| `web/{build-program,export-main,serve-main}.ts`, `tooling/build-content.ts` | `build/cli/{prepare,site,serve}.ts` | the commands `package.json` runs; the content and program stages are one |
| `scripts/finish-build.mjs` | `build/assets.ts` | a module the exporter calls, not a stage |
| `scripts/copy-views.mjs`, `COMPONENTS` list | removed | templates are read from `src/views`; the compiled tools no longer need the views beside them |
| (new) | `build/paths.ts` | every generated path in one place (several files each spelled them) |
| `app/scope.ts` (652 lines) | `src/app/scope/{contract,blocks,navigation,index}.ts` | the declaration, the block projection, where the reader can go, and the assembly change independently |
| `generated/`, `dist/server` | `.valance/` (`program.json`, `<site>/site.json`, `<site>/search.json`, `tools/`) | generated, never edited (P6.5); `dist/<site>` is the deliverable only |
| `vite.page.config.ts` | `vite.config.ts` | Vite's own name, so `vite build` needs no `-c` |
| `test/ smoke/ principles/ budget/ visual/` | `tests/{unit,smoke,principles,budget,visual}/` | the root shows source, not five suites |
| `ROADMAP FINDINGS PRINCIPLES GRADUATION EXTERNALS` | `docs/` (with this file) | the root keeps `README.md` |
| `test/boundaries.test.ts` | `tests/unit/boundaries.test.ts`, rewritten | enforces the layers of the layout that exists; also checks that `src` never imports `build` |
| `package.json` scripts | `build`, `build:all`, `build:tools`, `start`, `start:ssr`, tests | the `build:*` stage scripts became one `build` that runs them (plus `build:tools` and `build:all`) |

Not done, with the reason:

- **`valance.json` / `valance.web.json`**: nothing in Valance reads them (`grep` of `packages/valance`); a project-local file read only by this project's scripts would be an invented API (P6.7).
- **`public/`**: no static asset exists and nothing copies one (F-7); an empty directory would claim a capability.
- **`layouts/`, `routes/`, `components/`**: see Phase C.
- **Splitting `styles/site.css`**: it is already sectioned and has one owner; no friction was recorded (P4.4).
- **Splitting `build/content/site.ts` or `markdown.ts`**: no friction recorded (P4.5).
- **Colocating tests with their subjects**: moving 25 test files would change no behaviour (P4.1 is SHOULD); they are grouped by kind instead.

Behaviour is unchanged where it was not meant to change. Built from the commit before this work and from this one, **every HTML, JSON, XML and text file of the docs site is identical** (only the entry's file name differs: `page-…` → `main-…`), the stylesheet is byte-identical, and the compiled MESH program is byte-identical across the `scope.ts` split. The script bundle differs by 131 bytes (module paths).

## Phase F: validation

| Suite | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm test` (unit) | 235 pass (baseline: 3 failed in place, see F-1) |
| `pnpm test:principles` | 26 pass |
| `pnpm test:smoke` (Chromium: hydration, navigation, Back, a11y, layout, four sites) | 79 pass (one assertion pinned the entry's old file name; updated) |
| `pnpm test:budget` | 9 pass |
| Old vs new site | identical (above) |
| Not run | `test:visual` (per-machine baselines, none to compare against here); `scripts/with-local-packs.mjs` (updated for the new directory names, not exercised: the packages are released) |

## Acceptance

| Criterion | Where it is met |
|---|---|
| The entry point is obvious | `src/main.ts` (browser); `build/cli/` (build commands); README "Where things are" |
| Authored content is distinguishable from behaviour | `sites/<n>/` is data; `src/` is the kit; `tests/unit/boundaries.test.ts` enforces it |
| Layouts and components have clear ownership | `src/views/layout.mprx`, `page.mprx`, `src/views/content/` |
| Routes and navigation can be located | URLs: `src/app/routes.ts`; what the reader can go to: `src/app/scope/navigation.ts`; what is in it: `site.json` |
| Styling has a predictable owner | `src/styles/site.css`; per site `theme.css` |
| Generated output is separated | `.valance/`, `dist/<site>/` |
| Normal development needs no manual stages | **Partly.** `pnpm build` is one command; the stages are still four. See below |
| No abstraction exists only for the tree | `build/paths.ts` and `build/assets.ts` each replace repeated or scripted code; no `layouts/`, `routes/`, `public/` or config file was invented |
| The site keeps its behaviour | identical output; 79 + 26 + 9 + 235 tests |
| A working tracer bullet supports it | Phase D |
| API limitations identified | below |
| Easier to navigate for common changes | the root is 19 entries without generated output (31); a page, a theme, a template, a style and an entry each have a named place (README). **Not improved:** adding a block kind still touches nine files |

## Remaining work

**Public API (Valance):**
- No build or dev command that owns the stages (`valance build`, `valance dev`), so the four stages (compile tools, prepare, `vite build`, site) remain and `pnpm build` is a chain of them. This is `docs/EXTERNALS.md` X2 and X3; it is the reason P3.2 is only partly met.
- No project configuration file that Valance reads, so `valance.json` / `valance.web.json` cannot exist yet; `site.json` carries both project and web-deploy settings (`base`, `url`).
- No static-asset convention (`public/`): a site cannot ship an image or a favicon (F-7).
- No watch mode or development server.

**Internal implementation:**
- Adding a block kind touches nine files; a block kind's model, syntax, projection, template and style are five declarations of one concept. A generated or declared per-kind table would reduce it; that is a design change, not a move.
- `BlockView` is one flat record with every field of every kind, because a MESH scope is flat.
- The page script is 690 kB (the MESH runtime and the compiled views); code-splitting is not done.

**Developer tooling:**
- `tests/smoke/build.ts` hard-codes the directories that decide whether a build is stale (updated to `src`, `build`, `sites`, `scripts`, config).
- `scripts/with-local-packs.mjs` copies the project's directories by name exclusion; it was updated, not run.

**Documentation:**
- `docs/ROADMAP.md` and `docs/FINDINGS.md` are records: their file paths are those of the time they were written. Where the old directories went is in the table above.
