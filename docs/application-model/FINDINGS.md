# Findings from the tracer bullet (Phases 2–3)

What the experiment showed, with the disposition of each. "Failure" = the proposed model or my first implementation was wrong. "Blocker" = an engine/contract limitation, isolated with the smallest change that would remove it.

## Design and implementation failures (found by running the tracer, all fixed)

| # | What happened | Cause | Disposition |
|---|---|---|---|
| F1 | The first `valance build` could not resolve `@valancex/mesh-runtime/mesh-runtime.wasm?url` from the generated entry | The generated browser entry imported an engine package, so every application would have had to depend on it: the exact leak the model exists to remove | The import moved inside `@valancex/app/client`. An application depends on `@valancex/app` only. This also answers `assets.d.ts`: the declaration (`*.wasm?url`) is now an internal file of the package that imports the wasm; an author never writes or sees one |
| F2 | A `.vite` directory appeared in the project root during a build | Vite's cache goes to `<root>/.vite` when there is no `package.json` | `cacheDir` pinned to `.valance/cache`. A test asserts the project root holds only authored files plus `.valance/` and `dist/` |
| F3 | A CSS edit reloaded the whole page | The dev loop sent `full-reload` after every rebuild | Style edits now produce no rebuild at all and Vite updates the style in place (11–23 ms, page state kept). Only an added or removed stylesheet rewrites the entry |
| F4 | Fixing a broken file right after breaking it did not clear the error | The file watcher drops a repeated event for the same file inside ~50 ms, so the first handler had read the stale content | Changes are applied after the files are quiet for 60 ms |
| F5 | Every page 404'd under a non-root `base`; the printed URL said `/docs/docs/` | Vite strips the base from `req.url` before a late middleware runs; `resolvedUrls` already contains the base | Use `originalUrl`; print the server's own address. A test serves a project under `/docs/` |
| F6 | `content/guide/index.md` appeared in the top-level navigation group | The section was derived from the URL path, not the file's directory | Derived from the file location. A test pins navigation order |
| F7 | A state field or command named like a framework name crashed `valance check` with a stack trace | The error was not a diagnostic | Mapped to `src/main.ts:1 entry-definition`; a mistake loading `main.ts` is `entry-load`. Tests |
| F8 | The verifier's own unit suite failed 3 tests on a fresh checkout | Tests required `snippets/` directories that are empty and so not tracked by git | The tests tolerate a site with no `snippets/`. The suite is 235/235 from a clean tree |

## Blockers: engine or contract limitations (isolated, with the smallest change)

| # | Limitation (evidence) | Effect on the model | Workaround in place | Smallest change that removes it | Owner |
|---|---|---|---|---|---|
| D1 | Every prop of a primitive is **required** wherever the tag is used, except booleans (`packages/valance/src/web-manifest.ts` header; the first `valance check` printed 27 `missing-required-prop` errors for a `<div>` with no `id`, `label`, `role`) | An author cannot write `<nav>` without an `aria-label`, or `<div>` without every attribute the tag knows | The tag table is many **narrow tags** (`shell`, `div`, `nav` with `class`+`label`, `a` vs `link`…). It works, but a developer must learn which tag carries which props | Let a primitive declare a prop optional (`attribute("id", { optional: true })`) and derive `required: false`; MESH already has optional manifest props | Valance `web-manifest` + PORT realization shape (declaration), MESH (accepts absence) |
| D2 | `mesh-case` cannot directly contain `mesh-if`, `mesh-switch` or `mesh-slot`; `mesh-switch` cannot be a root (first `valance check`: `invalid-switch`) | Rendering one block kind with a condition needs its own component | `heading`, `list-block`, `list-items` exist only because of this | Allow a conditional inside a case, or document the rule where authors will meet it | MESH language |
| D3 | MPRX has **no string concatenation** (`src={home + "logo.svg"}` → `type-mismatch: an operand of + needs number`) | A layout cannot build a base-aware address, so it cannot reference a `public/` file when `base` is not `/`. Markdown references are rewritten by the build and work | Layouts use literal addresses and a root base, or take images from Markdown | A string `+` in MPRX, or the framework supplying computed addresses | MESH language |
| D4 | No way to ship templates or tags as a reusable unit (`Plugin` has no `views`; the `primitives` table is fixed by the package) | An application cannot add a primitive; a third-party kit (the verifier's callouts, tabs, search box) cannot be a dependency | The base kit is built into `@valancex/app`; the verifier's kit stays a stand-in | A library mechanism: a package contributes templates and tags the tooling collects | Valance `Plugin` / tooling (a design decision, `GRADUATION.md`) |
| D5 | The application's state has no URL fragment, so `urlOf` cannot carry one (known limit, `EXTERNALS.md`) | A link to `/guide/x#heading` would lose the fragment | `onNavigated` restores it with `history.replaceState` and scrolls to the heading. A browser test covers it (`built.test.ts`) | Allow `urlOf` to return a fragment | Valance `HistoryOptions` |
| D6 | No hot swap of a compiled MESH program | Template edits reload the page instead of keeping its state | Reload (reliable); the browser keeps the address. Styles update in place | A MESH program replacement contract | MESH runtime |

## Design questions the experiment answered

| Question (BASELINE §6) | Answer, with evidence |
|---|---|
| Where may `valance dev|build` live? | In a separate package. The core forbids a CLI (`CONSTRAINTS.md`); a test pins that the core never mentions `@valancex/app` and that the app imports no NEXUS or PORT package |
| What is in `src/main.ts`? | Only what code can say: state and commands (`defineApp`). It is optional; the tracer's makes a theme and a command a layout uses. The browser entry is *generated* (`.valance/client.ts`), not authored |
| Can dev reuse Vite while rendering on the server? | Yes. Vite serves modules/styles/overlay; one middleware renders each page with the same function the build uses, so dev and prod HTML are the same code |
| Which changes need reload / HMR / restart? | Table in `CANDIDATES.md`, implemented in `dev.ts` and tested: content → reload; template/`main.ts` → reload; style → in place; `public` → reload; `valance*.json` → restart |
| Smallest content model that supports layout, nav, links, images? | `Page{path,title,description,order,section,blocks,outline}` + `Block` (6 kinds) + `Span`; links and images checked against pages and `public/` at build |
| Is a project config needed, and what has evidence? | `valance.json` `name` (title and navigation); `valance.web.json` `base` and `url` (the two web-only settings the verifier already kept in `site.json`). Nothing else has evidence |

## Measurements

| | docs-verifier (before) | docs-app (after) |
|---|---|---|
| Authored files an author reads to add a page, style it, change a component | `sites/*`, `src/views/*` (17), `src/app/*`, `src/web/*`, `build/*`, 4 `tsconfig`/`vite` configs: ≈3,900 lines (src+build+scripts+configs) | 150 lines in 11 files (content, layout, one component, CSS, `main.ts`, config) |
| Commands to build | `tsc` → `prepare` → `vite build` → `site` (4 stages, `pnpm build` chains them) | `valance build` (3–4 s) |
| Dev loop | none (rebuild 12 s, restart server, reload) | `valance dev`: Markdown/component edit visible in ~0.3 s, style in ~0.01 s, error overlay in ~0.09 s |
| Page script | 690 kB (121 kB gz), 15 content templates | 389 kB, 7 built-in templates, whole content model included |
| Generated files | `.valance/` (tools, program, site data) + `dist/` | `.valance/` (6 files) + `dist/` |

Timings are from this container on one run each (Playwright waits), not a benchmark.
