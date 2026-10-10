# External dependencies

Things the documentation site needs that are **outside VALANCE's contract** (`docs/V1_CONTRACT.md` §11, `docs/CONSTRAINTS.md`: no router, plugin registry, CLI, dev server). They are not built into VALANCE and are not built yet as packages. Each one is a package to be developed later, and each has a **seam** in VALANCE (`docs/V1_CONTRACT.md` §19) so that adopting it means passing it, not re-wiring the application.

Until a package exists, this verifier hosts a **stand-in** that implements the same contract. Graduating an external is moving the stand-in's files into a package and passing the same contract tests; the application does not change.

Names are provisional. Stability of every external's contract is **Provisional** until it has been used by two different sites (`ROADMAP.md`, phase F).

## Register

| ID | Provisional package | Responsibility | Seam in VALANCE | Stand-in (here) | Status |
|---|---|---|---|---|---|
| X1 | Router | Route table (pattern ⇄ state), `known`, `paths()`, redirects and canonical URLs, base path, per-route `delivery`, scroll and focus policy through `onNavigated` | `Plugin.routes` → `RouteTable`; `HistoryOptions.onNavigated` | `app/routes.ts` | Deferred. Seam in VALANCE 0.8 (unreleased). |
| X2 | Content | Markdown/MDX → typed pages, heading ids, table of contents, build-time highlighting, link check, front matter | None needed in VALANCE: it produces data the application's `model/` types | `tooling/` | Deferred. |
| X3 | Site generator (SSG) | Enumerate `staticPaths(routes)`, render each with `renderToHtml`, write HTML (`renderHead` for the head), per-page payload, sitemap, `404.html`, hashed asset manifest, base path | `renderToHtml` (`head`, `plugins`), `Served.head`, `renderHead`, `staticPaths`, `deliveryOf` | `tooling/export.ts` (to write, phase E) | Deferred. The primary delivery target. |
| X4 | Dev server | Watch, incremental content rebuild, hot swap of the (data-only) MESH program | None in VALANCE; uses X2 and X3 | none | Deferred (after phase E). |
| X5 | Server adapter (SSR) | `node:http` / edge adapter that calls `renderToHtml` per request and answers 404 from `known` | `renderToHtml`, `RouteTable.delivery` (`"server"`), a fresh `platform` per request | `web/serve.ts` | Deferred, **opt-in**. Inspect and expand later. |
| X6 | Site kit | The documentation composites (`layout`, `callout`, `code-block`, tabs, TOC, search box) as `.mprx`, with the primitive table they need | `Plugin.primitives`; the templates are read by the compile step (not by VALANCE, which compiles nothing) | `views/`, `web/primitives.ts` | Deferred. |
| X7 | Web platform | Capabilities the site needs from the browser: clipboard, storage, fetch | `Plugin.platform` (merged in order, `mergePlatforms`) and NEXUS `Capability` | none | Deferred (phase D). |

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
