# External dependencies

Things the documentation site needs that are **outside VALANCE's contract** (`docs/V1_CONTRACT.md` §11, `docs/CONSTRAINTS.md`: no router, plugin registry, CLI, dev server). They are not built into VALANCE and are not built yet as packages. Each one is a package to be developed later, and each has a **seam** in VALANCE (`docs/V1_CONTRACT.md` §19) so that adopting it means passing it, not re-wiring the application.

Until a package exists, this verifier hosts a **stand-in** that implements the same contract. Graduating an external is moving the stand-in's files into a package and passing the same contract tests; the application does not change.

Names are provisional. Stability of every external's contract is **Provisional** until it has been used by two different sites (`ROADMAP.md`, phase F).

## Status after the application-model cycle (re-checked against the code, 2026-10)

The cycle ([`docs/application-model/`](../../../docs/application-model/)) put an **application model and its commands** in a new private package, [`@valancex/app`](../../../packages/app), proved by [`examples/docs-app`](../../docs-app). It is VALANCE *tooling*, not the core: `packages/valance` is unchanged and a test pins that it does not know the package exists. The register below is the original; this table is what is true now. A capability is "implemented" here only if a public command or export uses it and a test exercises it.

| ID | Capability | Status now | Where | Public contract it needs | Depends on | Packaging decision | Smallest proof that extraction is needed |
|---|---|---|---|---|---|---|---|
| X1 | Router | **Two stand-ins.** The verifier's (languages, versions, aliases) and a generic content-derived one in `@valancex/app` (`src/routes.ts`: path ⇄ page, base, 404, fragment kept). Both are a few dozen lines over the **Valance seam**, which is implemented and independently consumable (`Plugin.routes`, `RouteTable`) | `packages/app/src/routes.ts`; `docs-verifier/src/app/routes.ts` | `RouteTable` (exists) | Valance only | **Stays inside the app tooling.** Parameterized routes are not needed by any application built so far, and a static export cannot enumerate them, so they would be `delivery: "server"` | A third consumer whose routes are not derived from content (an application with parameters) |
| X2 | Content (Markdown → typed pages) | **Partly implemented in the app tooling** (`content.ts`, `markdown.ts`): front matter, a Markdown subset, nav order, link/image/fragment checks, errors with file and line. Not independently consumable: no export, and it targets one block model. The verifier's dialect (tables, callouts, tabs, highlighting, snippets, collections, versions, locales) is richer and remains a stand-in | `packages/app/src/{content,markdown}.ts`; `docs-verifier/build/content/*` | The content model (`src/model.ts`) is the contract; today it is private | none | **Part of VALANCE tooling** (the app package), not a separate package. The verifier should *adopt* it rather than the other way round | The verifier's blocks merged into `model.ts` (callout, table, code with tokens) and the verifier building through `valance build` |
| X3 | Static generator | **Implemented** in `build.ts`: bundle, one document per `paths()`, a 404 page, `public/` copied, hashed assets, `sitemap.xml` from `url`, base path. Missing vs the verifier's: per-page content files, feeds, first-page aliases | `packages/app/src/build.ts`; `docs-verifier/build/export.ts` | `renderToHtml`, `staticPaths` (exist) | Valance, Vite | **Part of VALANCE tooling** | Content too large for one bundle (the verifier's 500-page budget test is the evidence that per-page payloads are needed) |
| X4 | Dev server and watch | **Implemented** in `dev.ts` on Vite: SSR per request with the build's own code, watch, reload on content/template change, style updates without reload, overlay with file and line, restart on config change | `packages/app/src/dev.ts` | none beyond X2/X3 | Vite | **Part of VALANCE tooling**. HMR beyond styles is not implemented: the compiled program is data and MESH has no hot-swap contract | A MESH program hot-swap contract |
| X5 | Server adapter (SSR) | **Stand-in only** (`serveSsr`). `createRenderer` in `@valancex/app/server` is the per-request primitive and `valance dev` already uses it per request; there is no production server command | `docs-verifier/build/serve.ts`; `packages/app/src/server.ts` | `renderToHtml`, `delivery: "server"` (exist) | X3 | **Opt-in, not built.** A `node:http` adapter around `createRenderer` is a few lines when a route is `server` | An application with a route that must be rendered per request |
| X6 | Site kit (templates, CSS, tags) | **Smaller kit implemented in the app tooling**: the tag table (`primitives.ts`) and seven built-in templates (`views/`), replaceable by file name. The verifier's 17-template kit and CSS remain a stand-in. The old open question (*do templates belong in `Plugin`?*) **did not block**: the tooling reads templates itself, so `Plugin.views` is not needed for an application, only for a *shared third-party kit* | `packages/app/{views,src/primitives.ts}`; `docs-verifier/src/{views,styles}` | none | MESH compiler | **Part of VALANCE tooling** for the base kit; a documentation kit (callouts, tabs, search box) as a library of components is the next candidate | A second application that wants the verifier's components without copying them: that needs a library mechanism (see D4) |
| X7 | Web platform capabilities (clipboard, storage, fetch) | **Not implemented in the app model.** `defineApp` has no `platform`; the tracer needs none. Verifier stand-in only | `docs-verifier/src/web/platform.ts` | `Plugin.platform` (exists) | Nexus `Capability` | Optional integration, later | An application that needs a capability (the verifier's copy button, search) |
| — | Project configuration | **Implemented** (`config.ts`, JSON Schemas): `valance.json`, `valance.web.json`, unknown keys are errors | `packages/app` | the schemas | none | VALANCE tooling | — |
| — | Static assets | **Implemented as `public/`** (served in dev, copied by build) and checked references from Markdown. Not implemented: assets imported by a layout, and a layout referencing `public/` files under a non-root `base` (MPRX has no string concatenation, finding D3) | `packages/app` | none | Vite | VALANCE tooling | — |

### Dependency and ownership map

```
 author's files ── content/ public/ src/*.mprx src/*.css src/main.ts valance*.json
        │
        ▼
 @valancex/app  (VALANCE tooling; private, provisional)
   config · content(X2) · compile · build(X3) · dev(X4) · check · built-in kit(X6) · routes(X1)
        │ uses                    │ uses                  │ uses
        ▼                         ▼                       ▼
 @valancex/valance        @valancex/mesh-compiler     Vite
 (core + ./web seams)     (MPRX → program)            (bundling, dev server)
        │ composes
        ▼
 NEXUS (state, commands)   MESH runtime (render-v1)   PORT web (DOM/HTML)
```
Ownership is unchanged: behaviour is NEXUS's, render semantics MESH's, realization PORT's, composition Valance's. The app package composes Valance and calls the MESH compiler; it imports no NEXUS or PORT package (a test pins this).

### Prioritized plan

1. **Done, no action:** the workflow for a small content application (this cycle).
2. **Next:** make the verifier build through `valance build`. Needs: the verifier's block kinds in the content model; a way to ship a *library* of components and tags (D4); `platform` in `defineApp` (X7); per-page payloads (X3). This is the real test of "docs-verifier is a canonical example".
3. **Then:** `valance preview` (serve `dist/` as a host does) and the opt-in server adapter (X5).
4. **Upstream contract requests** (smallest changes), recorded in [`docs/application-model/FINDINGS.md`](../../../docs/application-model/FINDINGS.md): optional props on primitives (D1), `mesh-if`/`mesh-switch` directly inside `mesh-case` (D2), string concatenation in MPRX (D3), a library mechanism for templates (D4), a URL that can carry a fragment (D5).

## Register (original, before the cycle)

| ID | Provisional package | Responsibility | Seam in VALANCE | Stand-in (here) | Status |
|---|---|---|---|---|---|
| X1 | Router | Route table (pattern ⇄ state), `known`, `paths()`, redirects and canonical URLs, base path, per-route `delivery`, scroll and focus policy through `onNavigated` | `Plugin.routes` → `RouteTable`; `HistoryOptions.onNavigated` | `src/app/routes.ts`, `src/app/variants.ts` | Deferred as a package. The stand-in covers a base, aliases, languages, versions, canonical and `hreflang` addresses, and switchers. Seam in VALANCE 0.8 (unreleased). |
| X2 | Content | Markdown/MDX → typed pages, heading ids, table of contents, build-time highlighting, link check, front matter | None needed in VALANCE: it produces data the application's `model/` types | `tooling/` (markdown, highlighting, collections, links, search index, feed data) | Deferred as a package; the stand-in builds four sites. |
| X3 | Site generator (SSG) | Enumerate `staticPaths(routes)`, render each with `renderToHtml`, write HTML (`renderHead` for the head), per-page payload, sitemap, `404.html`, hashed asset manifest, base path | `renderToHtml` (`head`, `plugins`), `Served.head`, `renderHead`, `staticPaths`, `deliveryOf` | `build/export.ts`, `build/cli/site.ts` (done, phase E) | Deferred as a package; the stand-in is complete and tested (`tests/unit/export.test.ts`, `budget/`). The primary delivery target. |
| X4 | Dev server | Watch, incremental content rebuild, hot swap of the (data-only) MESH program | None in VALANCE; uses X2 and X3 | none | Deferred (after phase E). |
| X5 | Server adapter (SSR) | `node:http` / edge adapter that calls `renderToHtml` per request and answers 404 from `known` | `renderToHtml`, `RouteTable.delivery` (`"server"`), a fresh `platform` per request | `build/serve.ts` (`serveSsr`; `serveStatic` is the static host's stand-in) | Deferred as a package, **opt-in**. The stand-in renders the same bytes as the export at every address. Inspect and expand later. |
| X6 | Site kit | The documentation composites (`layout`, `callout`, `code-block`, tabs, TOC, search box) as `.mprx`, with the primitive table they need | `Plugin.primitives`; the templates are read by the compile step (not by VALANCE, which compiles nothing) | `views/`, `styles/`, `src/web/primitives.ts`, `src/web/plugins/kit.ts` | Deferred as a package. Four layouts and eleven block kinds; the same kit builds four different sites (phase F). |
| X7 | Web platform | Capabilities the site needs from the browser: clipboard, storage, fetch | `Plugin.platform` (merged in order, `mergePlatforms`) and NEXUS `Capability` | none | Deferred (phase D). |

What it would take to turn each stand-in into a package, in what order, and what is not decided: `GRADUATION.md`.

## Rules for every external

1. **A plugin is a value.** Nothing registers on import; a plugin does nothing until it is passed in `plugins`. It has no view, state, command or lifecycle.
2. **A fact is declared once.** A tag and the URL policy conflict with any second declaration (`plugin-conflict`); platforms and heads merge in a documented order.
3. **Tree-shakable.** `sideEffects: false`, ESM, named exports, no module-level state. A re-export from VALANCE is its own `@valancex/valance/web/<name>` subpath with the package an *optional* peer; never from the root entry. VALANCE owns the contract types and the package does not import VALANCE at run time, so there is no cycle.
4. **Static first, server opt-in.** An external must work when its output is produced once at build time. Anything that needs a request is marked `delivery: "server"` and is left to X5.
5. **No SSR assumptions leaked into the application.** No module-level mutable state, a fresh `platform` per render, no `node:*` import under `app/`, serializable state. `renderToHtml` is the only render primitive.

## Seams VALANCE provides today (0.8, unreleased; `docs/V1_CONTRACT.md` §19)

| Seam | Provided by | Tests |
|---|---|---|
| Plugin value and composition rules | `@valancex/valance/web/plugin` (`Plugin`, `compose`) | `packages/valance/test/plugin.test.ts` |
| Tags | `Plugin.primitives`; `manifest({ plugins })` | `plugin.test.ts` |
| Capabilities | `Plugin.platform`, `mergePlatforms` | `plugin.test.ts` |
| URL policy, route enumeration, delivery | `Plugin.routes` (`RouteTable`), `deliveryOf`, `staticPaths` | `plugin.test.ts`, `examples/tracer-web/test/plugins-host.test.ts` |
| Document head | `HistoryOptions.head`, `renderToHtml`'s `head` and `Served.head`, `renderHead`, `applyHead` | `plugin.test.ts`, `history-seams.test.ts`, `plugins-host.test.ts` |
| Navigation hook (scroll, focus) | `HistoryOptions.onNavigated`, `RouteTable.onNavigated` | `history-seams.test.ts`, `plugins-host.test.ts` |
| Weight | `sideEffects: false`, one entry per concern | `packages/valance/test/tree-shaking.test.ts` |

## Known limits of the seams (to settle with the first real external)

- **A fragment is not part of the application's state**, so `urlOf` does not write it: after a link click to `/docs/x#install` the address bar holds `/docs/x`. A router that wants the fragment kept does it in `onNavigated` (`history.replaceState`). If that proves awkward, a `urlOf` that may return a fragment is a change to `HistoryOptions`, not to the plugin contract.
- **The first state's head is applied by the follower**, a moment after `run` resolves, like the first title always was. With server-rendered HTML this is invisible (the server wrote it); a client-only mount shows no head for that moment.
- **`onNavigated` runs when the navigate command has finished, not when the new page is drawn.** Scroll-to-fragment must wait for the presentation (`mounted.settled`) in the router; whether that is enough is for X1 to show.
- **Templates are not part of the plugin contract.** VALANCE compiles no MPRX, so X6 ships `.mprx` sources that the verifier's compile step reads; there is no `Plugin.views`.
- **NEXUS did not declare `sideEffects: false`** (MESH and PORT Web do), so an entry that imports NEXUS keeps it in a consumer's bundle even when unused. Fixed in NEXUS 0.12.2 (prepared); `packages/valance/test/tree-shaking.test.ts` has an `it.fails` marker that goes red once the installed NEXUS declares it.
