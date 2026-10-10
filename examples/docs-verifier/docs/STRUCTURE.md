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

(The tracer bullet, the changes, and the validation follow in the sections below as they are done.)
