# Roadmap: from features verifier to a complete documentation site

Goal: a complete, styled documentation site with full routing and style loading, and enough capability that developers can compose sites **like Effect's and more** (docs, blog, landing, versioned and localized docs) from the same parts.

Decisions (from the project owner):

- **Static generation (SSG) is the primary target.** SSR is opt-in per route and is inspected and expanded later (`EXTERNALS.md` X5).
- **Routing, a content pipeline, a static generator, a dev server and a server adapter are external dependencies**, developed later as packages (`EXTERNALS.md`). VALANCE gets *seams* now so adopting one is passing it, not re-wiring. Until then the verifier hosts stand-ins that implement the same contracts.
- **VALANCE may re-export** those packages to simplify the API, as their own subpaths with optional peers, tree-shakable (`docs/V1_CONTRACT.md` §19).
- **Per-route delivery** (`"static"` default, `"server"` opt-in) is part of the route contract from the start.
- **Visual parity with effect.website is not the target; the capabilities are**: enough of them that a developer can compose a site like it, and others.

## How each package is used

| Package | Owns | What this site needs from it |
|---|---|---|
| **Mesh** | MPRX language, compiler, manifest, runtime, identity | bounded recursion for nested lists (F4) |
| **Nexus** | State, commands, capabilities, shutdown | capabilities for clipboard, storage, fetch; `sideEffects: false` |
| **Port Web** | render-v1 → DOM/HTML, patch, hydration, primitive table | `class`, `aria-*` attributes (exists: `attribute()`); event realization for scroll-spy (V0.4) |
| **Valance** | composition: `start`, `Web.run`, `history`, `renderToHtml`, `manifest` | the seams in phase A; no router, no CLI, no dev server |

Rule for every phase: **use only what exists first, log friction in `FINDINGS.md`, then fix upstream.**

## Phases

### A. Contracts first: **done** (Valance 0.8 and Nexus 0.12.2, both prepared, nothing tagged)

| Delivered | Where |
|---|---|
| `@valancex/valance/web/plugin`: `Plugin`, `RouteTable`, `HeadTags`, `Navigation`, `Delivery`; `compose`, `mergePlatforms`, `mergeHeads`, `renderHead`, `applyHead`, `deliveryOf`, `staticPaths` | `packages/valance/src/web-plugin.ts` |
| `plugins` option on `Web.run`, `renderToHtml`, `manifest`; `primitives` optional | `web.ts`, `web-server.ts`, `web-manifest.ts` |
| The document head: `HistoryOptions.head`, `renderToHtml`'s `head`, `Served.head`; a script-bearing link is refused (`invalid-head`) | same |
| `HistoryOptions.onNavigated` (scroll and focus policy lives in a plugin) | `web.ts` |
| Per-route `delivery`, `known`, `paths` on the route contract | `web-plugin.ts` |
| Error codes `plugin-conflict`, `invalid-head` | `errors.ts` |
| Tree-shaking tests (bundle the source, read the output) and the re-export policy | `test/tree-shaking.test.ts`, `V1_CONTRACT.md` §19 |
| NEXUS `"sideEffects": false` with a check | Nexus `package.json`, `tests/package-json.test.ts` |
| Docs: `V1_CONTRACT.md` §19, `stability.md`, `use/README.md`, `releases/v0.8.md`; `EXTERNALS.md` | |

Evidence: 170 tests in `packages/valance` (47 new), 553 in `examples/tracer-web` (5 new, `Web.run` with plugins in jsdom including hydration of server HTML and its head).
Not yet done in phase A: the verifier itself still runs on the **released** 0.7.0 (it does not use the seams until 0.8 is published or packed, as `scripts/with-local-packs.mjs` does); nothing is tagged or published.

### B. Verifier on the seams

- Run the verifier against the 0.8 packs. Move `app/routes.ts` into a `RouteTable`, `web/primitives.ts` and the views into a kit plugin, the head into a `head` function; `document.ts` stops hand-writing `<title>`.
- CSS pipeline: a stylesheet built by Vite with a hashed name, linked through `head` (`links: [{ rel: "stylesheet", ... }]`), replacing the `STYLE` string. `class`, `aria-*` and `data-*` through `attribute()`.
- Structured nav (`{ sections: [{ title, items: [{ href, label, active }] }] }`) replaces the baked-in `"› "` and `"Guides: "`. Tokens, light/dark theme (state + `data-theme`), responsive layout, mobile menu in state, real `ul`/`li`.
- **Exit:** the verifier has no private wiring; the stand-ins pass the contract tests; the smoke test asserts the stylesheet loads, dark mode switches, the menu works, and hydration equals the server HTML.

### C. Content model and kit

- Discriminated `Block`/`Span` union (no empty-string sentinels); `PageScope` derived from the model; not-found a union member.
- Markdown: tables, images, ordered lists, emphasis, heading ids, richer front matter, callout/code titles. Build-time highlighting into token spans. Nested lists need **Mesh bounded recursion (F4)**.
- Build-time link check; tooling errors that name the file; unclosed fences and unknown callouts are errors; doc snippets are type-checked (§13.2 of the API principles).
- Kit composites: layout, nav, callout, tabs, code group.
- **Exit:** parser and rendered-HTML tests per feature; a broken link fails the build.

### D. Capabilities and interactivity

- **X7 web platform** (clipboard, storage, fetch) as NEXUS capabilities merged through `Plugin.platform`. `copyCode` becomes a command that writes and fails visibly, so "Copied" is true.
- Search: a build-time index and `command.waiting` (as `examples/docs-site`). Table of contents from heading ids; scroll-spy needs **Port event realization** (V0.4 evidence). Theme persisted through storage.
- Scroll to `#fragment` and focus after navigation, as a router plugin on `onNavigated` (see `EXTERNALS.md`, known limits).
- **Exit:** Node tests with fake platforms, Chromium tests with real ones.

### E. SSG delivery (primary)

- X3 stand-in `tooling/export.ts`: `staticPaths(routes)` → `renderToHtml` per path → HTML with `renderHead`; per-page JSON payload instead of the whole site embedded in every document; sitemap, `robots.txt`, `404.html`, base path, hashed assets, canonical and meta through `head`.
- Client navigation fetches the page payload through the fetch capability and `command.waiting`.
- SSR-readiness kept honest: no module-level mutable state, fresh platform per render, no `node:*` under `app/`. A parity test renders a route as `static` and as `server` and compares the HTML byte for byte.
- **Exit:** deployable to any static host; payload and render budgets hold on a generated 500-page site.

### F. Composability proof

- Build three sites from the same kit and plugins: a docs site, a blog, a landing page; add versioned docs and a localized route variant.
- **Exit:** all three build with no verifier-specific code in the kit. This is the acceptance test for "like Effect's, and more" (principle 18).

### G. Quality gates and graduation

- Accessibility (axe, keyboard, landmarks, contrast), SEO tags and structured data, visual regression across viewports; the principle probes run against the site, not just the packages.
- Graduate X1, X2, X3, X6, X7 into packages in the order the sites need them; VALANCE re-exports each as its own optional subpath; stability tiers and release notes for each. X4 (dev server) and X5 (SSR adapter) follow when inspected.
- **Exit:** `PRINCIPLES.md` covers the site; open defects P1–P3 and O1 closed or accepted; the verifier hands over to a more complex application.

## Upstream changes, in order of need

1. **Valance 0.8** (phase A, done): seams.
2. **Nexus 0.12.2** (phase A, done): `sideEffects: false`.
3. **Mesh**: bounded recursion (F4), needed in C.
4. **Port Web**: event realization for scroll-spy, and V0.4 style/accessibility evidence from B and G, needed in D.
5. **Valance**: anything B–D show is missing from `onNavigated`, `head` or `routes` (known limits in `EXTERNALS.md`).

## Open questions

- Whether `urlOf` should be allowed to carry a `#fragment` (known limit in `EXTERNALS.md`) or fragments stay a router concern.
- Whether `Plugin` should grow a `views` contribution once a second kit exists; today templates are read by the compile step.
