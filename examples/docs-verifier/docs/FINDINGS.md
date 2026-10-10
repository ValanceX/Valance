# Findings (friction log) and decisions

> The file paths in these findings are as they were when each was written. Where the directories went since is in `STRUCTURE.md` (Phase E).

Principle: the user writes the application, never system config (JSON, TS or JS) unless a custom config or plugin is genuinely needed. Resources are spent only on what changed.

| # | Finding | Verdict | Status |
|---|---------|---------|--------|
| F1 | Composites were not in Valance's derived manifest; `views/composites.json` was hand-written. | Gap | **Fixed (Mesh dev).** `compileProgram` infers each composite's contract from the templates; the verifier has no composite config. |
| F2 | `mesh-slot` had to be declared in the manifest by hand. | Gap | **Fixed (Mesh dev).** Reserved tags (`mesh-slot`, `mesh-fill`, `mesh-switch`, `mesh-case`, `mesh-default`, `mesh-if`, `mesh-each`) are declared by the toolchain when a template uses them. |
| F3 | Inline marks (strong, code, link) cost a wrapper element per run. | Gap (the principle: MESH makes no node a template did not write) | **Fixed (Mesh dev).** `mesh-fragment`: `runs` and `inline` are fragments, so a heading's text and marks are its own children, and a block is no `section`. The page holds only elements the templates name, which `test/site.test.ts` checks. |
| F4 | Lists are flattened to `item` blocks. | Partly a gap. A fixed-depth list is expressible (`mesh-each` inside `mesh-each`). Arbitrary nesting is not: composites cannot recurse. | **Worked around to depth 2 (phase C).** A list is one block whose items carry their children (`views/list-items.mprx`); the build refuses a third level, naming the line. Arbitrary depth still needs bounded recursion in MESH. |
| F5 | Valance 0.6.0 redraws the whole tree on every change. | Gap | **Fixed (Valance 0.7, released).** A later render of a view is MESH's `update` of the previous one, applied with PORT's `patch`; the smoke test compares the patched page with the server's HTML for the same URL. |
| F6 | Kind dispatch needed seven sibling `mesh-if`s. | Gap | **Fixed (Mesh dev).** `block.mprx` is one `mesh-switch`. |
| F7 | One unnamed slot per template. | Gap | **Fixed (Mesh dev).** `layout.mprx` has a `nav` slot and the default; `page.mprx` fills `nav`. |
| F8 | Copy-to-clipboard needs a platform capability. | Open | Port capability design. |
| F9 | No on-page TOC (no anchor or scroll support). | Open | Port capability design. |
| F10 | No search in the slice. | App work | Later slice. |
| F11 | Dev checkouts need sibling `link:` overrides. | Tooling | Superseded: the verifier runs against packs of the prepared packages (`scripts/build-packs.sh`, `scripts/with-local-packs.mjs`). |
| F12 | An attribute's value is text in the derived manifest, so a boolean (`menu`, `theme == "dark"`) cannot be passed to `aria-pressed` or `data-menu`: `type-mismatch ... needs string, found boolean`. The scope turns the menu into `"true"`/`"false"`, and the template writes `theme == "dark" ? "true" : "false"`. | Friction, small. | Open: a Port realization for an enumerated or boolean-as-text attribute (`aria-*`), or the compiler coercing a boolean to its text for a text slot. |
| F13 | A prop is required on every use unless it is a boolean attribute, so a styling hook (`class`) must be written on every use of a primitive that has one. Variants are better as `data-*`/`aria-*` the stylesheet reads. | Friction, small; shaped the templates (a `class` only where a part has a role). | Open: optional props in the derived manifest (already noted in `manifest`'s own docs). |
| F14 | The first state's head is applied by Valance's follower just after `run` resolves; a client-only mount shows no head for that moment. Hydrated pages do not (the server wrote it). | Known limit. | Accepted for the static path; revisit if a client-only mount matters. |
| F15 | A link to an unknown path inside the app navigates to the `not-found` state, whose `urlOf` is `/docs/`, so the address bar is rewritten. | Gap in the stand-in router (X1). | Open, phase E (routing completeness). |
| F17 | The server writes a tag's attributes in sorted order; a node the client draws or patches in gets them in the order of its props. The DOM is the same, the serialized text is not, so a text comparison of server HTML with the patched page fails. | PORT detail, harmless. | Accepted: the smoke test compares node by node (`isEqualNode`). Worth a line in PORT's hydration notes. |
| F18 | MESH refuses `mesh-if` and `mesh-each` as the direct child of a `mesh-each` (`assembly-malformed-template`), and the diagnostic names neither the template nor a place. | Friction. | Worked around: a repeated panel is a one-item list (`panels`), a repeated conditional is a composite. Open: a location on assembly diagnostics. |
| F19 | A scope cannot be a union, so each block kind is projected into one flat record (`BlockView`) with every field a template may read. The model is a closed union; the projection is the one place that knows. | By design (a scope is flat). | Accepted. |
| F20 | `command.waiting`'s `work` was a Promise function with no environment, so the search (supersession, `wanted`, loading and failure as state) could not use the index capability the platform provides; the choice was an Effect command (no `wanted`, no supersession) or a closure around the capability. | Gap in Valance. | **Fixed (Valance 0.8, unreleased).** `work` may return an Effect that requires the environment; `waiting-effect.test.ts`. |
| F21 | Scrolling is not an event any template can name, and PORT Web has no primitive for it, so "which heading am I at" cannot be a tag's event. | Gap, PORT. | Worked around: `web/scrollspy.ts` is the one adapter between the window and the application's `setActive` command (it calls `host.handle.invoke`). Open: a PORT event realization for page-level events, or keep adapters in the entry. |
| F22 | A stored theme is read after the page has taken over (before then it would not match the server's HTML), so a reader who chose dark sees the system theme for a moment on load. | Known limit. | Open (phase E): a static page cannot read a cookie; the options are a head script that sets an attribute outside the container, or accepting the flash. |
| F23 | `onNavigated` runs when the navigate command has finished, and the page is drawn a moment later, so scroll-to-fragment and focus poll for the element (60 animation frames at most). | Known limit (see `EXTERNALS.md`). | Open: a Valance signal for "the presentation of this state is drawn". |
| F24 | A document carries the site's map and draws the whole navigation, so it grows with the number of pages (about 330 B a page: 175 KB, 13 KB gzipped, at 500 pages). The content does not grow it. | By design, measured (`pnpm test:budget`). | Accepted to a few hundred pages; beyond it the navigation must be lazy (collapsed sections loaded on demand), which is an application design, not a framework gap. |
| F25 | Exporting renders each page by starting the application, rendering once and ending it: about 110 ms a page (56 s for 500), roughly 1.4x worse per page at 500 than at 50. | Cost, measured. | Accepted for now. `renderToHtml` could render several states under one running application; only worth building when a site is big enough to feel it. |
| F26 | A static host may redirect `/docs/guides/state` to `/docs/guides/state/` (a directory's index). The application's URLs have no trailing slash, and its routes accept both, so the canonical address is the one the page names. | Host behaviour. | Handled in `routes` (`test/routes.test.ts`) and by the canonical link. |
| F27 | The compiled views were embedded in every document (185 KB). | Gap in the first version of the export. | **Fixed (phase E).** They are in the page script (`generated/program.json`, imported as text), once and cached, for every page. |
| F28 | Making the kit serve a blog, a landing page and a handbook as well as documentation grew the map's entry for a page from about 140 B to 250 B (layout, collection, slug, language, version, date, tags), and with it every document (120 KB to 175 KB at 500 pages). | Cost of generality, measured (`pnpm test:budget`). | Accepted. If it matters: send the map of the reader's own language and version, and fetch another when the reader switches; the description could come from the page's content. |
| F29 | A page at the site's root (`/`) made a content address of `//index.json`, which a browser takes for another host: the page loaded, and navigating to it failed. Found by the landing site, which is the first page at `/`. | Bug in the kit. | **Fixed.** One function (`contentFile`) names the file for the export, the servers and the browser; `test/web.test.ts` and `test/sites.test.ts` check it. |
| F30 | A link from a page in French to the English version of the same page cannot be written as a path: `/docs/x` means the page in the reader's own language. Language is chosen by the language switcher, and a link to a particular version is written with its prefix (`/v1/docs/x`) or as `latest:/docs/x`. | Design choice, documented in `README.md`. | Accepted. |
| F31 | A code group is `role=tablist` / `tab` / `tabpanel`, whose keyboard pattern is arrow keys between tabs. PORT Web's primitives realize `click` and `input` and no key event, so each tab is a tab stop instead. It is operable (Tab, Enter) and axe passes, but it is not the pattern. | Gap, PORT (like F21). | Open: a key event realization in PORT, or make the group a set of toggle buttons (`aria-pressed`), which needs no keys. |
| F32 | Several of axe's findings were things the styling pass could not see: contrast of the muted and tone colours, a translucent copy button over a dark block that is not its ancestor, `aria-label` that does not contain the visible text, a callout that is an `<aside>`. | Found by the gate, fixed. | The gate stays: `smoke/a11y.test.ts` runs on all four sites. |
| F33 | JSON-LD cannot go through the head seam (it is a `<script>`, which `HeadTags` deliberately has no way to say), so `web/document.ts` writes it once in the document and the browser does not keep it in step. | By design (secure head). | Accepted: a crawler reads the document it is given. |
| F16 | `@valancex/valance` does not re-export `BoundaryValue` (the payload of `invoke`), so a test that calls `handle.invoke` types it from `@valancex/mesh-runtime`. | API surface. | Open: re-export the type, or type `invoke`'s arguments from the command table (principles O2). |

Learned while probing F3: `mesh-if` already takes a second element child as its else branch, and `mesh-if` may not be directly nested, so an else-if chain cannot be written.

## How other frameworks solve these

**Dispatch on a value (F6).** Vue: `v-if` / `v-else-if` / `v-else`. Svelte: `{#if}{:else if}{:else}`. Angular 17+: `@if` / `@else if` and `@switch` / `@case` / `@default`. Solid: `<Switch><Match when>` with a `fallback`. React/JSX: a JS `switch` or a map of components. Common shape: one construct, ordered branches, the first match wins, an optional default, and it is a single node for identity.

**Slots (F7).** Web components and Vue: named slots (`<slot name="header">`, filled by `<template #header>`). Angular: `<ng-content select="[header]">`. Svelte 5: snippets passed as props. React: any prop can be a node. Common shape: a caller fills named regions; an unnamed region is the default; content is written in the caller's scope.

**Fragments (F3).** React `<>…</>`, Vue 3 multi-root, Svelte (any number of nodes), Angular (`ng-container`). A component may return several nodes without a wrapper.

**Recursion (F4).** Every framework lets a component reference itself; the data is finite, so rendering terminates.

## What was built for these

1. **Inferred contracts (F1/F2).** The compiler reads each composite's props from the arguments its occurrences pass and its events from the handlers it forwards, callers first for props and callees first for event payloads. A manifest entry, when written, wins. Reserved tags are declared when used.
2. **`mesh-switch` (F6).** Written by the compiler as the `mesh-if`s it stands for, so the runtime, identity and updates are unchanged.
3. **Named slots (F7).** `mesh-slot name` and `mesh-fill slot`; a named slot's identity step carries its name, so no existing key changes.

4. **Valance on `update`/`patch` (F5).** `Nexus.Mesh.update` (NEXUS 0.12) and an optional `Target.patch` (VALANCE 0.7); a target without `patch` is given `update` as before.

5. **Fragments (F3).** `mesh-fragment` places content without a node, as a composite's root, a case body, a conditional alternative or a repeat item; nothing wraps content on the author's behalf.
6. **Shutdown.** `Web.run` takes `shutdown: { grace }`; NEXUS 0.12 settles the work it tracks (grace, then interrupt) before releasing resources.

7. **Plugins and the head (Valance 0.8, phase B).** The verifier's tags, URL policy and head are three plugins (`web/kit.ts`, `web/router.ts`, `web/seo.ts`, listed in `web/plugins.ts`); `document.ts` writes the head the plugins say and no title or style of its own; `page.ts` passes the same plugins to `Web.run`.

Still to build: bounded recursion (F4).

## Found by validating the set before release (the packs, in a clean project and in this repository)

| # | Finding | Status |
|---|---------|--------|
| V1 | `WebPort` gained members (`patch`, `inspect`, `[Symbol.dispose]`), so code that implements the interface stops typechecking; VALANCE's own tracer had about thirty wrappers typed `TargetFactory<WebPort>`. | Named in the PORT 0.4 and VALANCE 0.7 notes; the tracer is typed as the contract it needs. |
| V2 | Tripwires that pinned the old model (every commit renders in full; `Web.run` without `init()` rejects) failed, as they should. | Updated: they count and gate `update` as well as `render`, and the uninitialized-runtime test now expects the new message and code. |
| V3 | A stale Vite dependency cache after swapping packages made three real-page browser tests fail once. | Environment, not a defect; delete `node_modules/.vite`. |
| V4 | NEXUS's lockfile test needs the lockfile to name the installed runtime, which can only be written once MESH 0.10 is published. | Resolved: the set was published in order and the lockfile refreshed. |
| V5 | MESH's two browser test files hang here unless `MESH_CHROMIUM=/opt/pw-browsers/chromium` is set; with it they pass (1 and 5 tests). | Environment. |
| V6 | Text runs on either side of a conditional or repeat that chose nothing were two runs, not one (the tree's runs are maximal, so the server's single text node could not be matched on the client). | Fixed in MESH: runs are merged whatever made them adjacent. |
| V7 | The substrate route `Application.shutdown(running.nexus)` used to release a resource under an admitted command; the tracer pinned that as characterised behavior. | NEXUS 0.12 interrupts the command first; the two tripwires now pin that. |
| V8 | `shutdown.grace` of 0 must not wait even a turn in VALANCE (a command admitted in the step the close began is interrupted before it runs), while NEXUS waits one turn so subscription consumers end with the bus. | Both pinned by tests. |
