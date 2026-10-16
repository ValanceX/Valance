# Findings: authoring a web application with `vlx` (styles, rendering mode, routes, dynamic pages)

Written 2026-10-16. Register: [`README.md`](README.md). Method: reading the code of this checkout (`packages/cli`, `packages/common`, `packages/router`) and the existing design records. **Nothing was run**: no `node_modules` were installed, so every statement below is a reading of the code, and WA-6's timing is an inference, not a measurement. Nothing in the code was changed.

The question behind all of it: after `vlx init my-app --web`, can a developer see and change *where styles live, how pages are delivered, which routes exist, and how to build a page that is more than content*, using only the concepts the scaffold shows them? Rated on the cognitive-load scale of [`COGNITIVE_LOAD.md`](../../examples/tracer-web/src/docs-benchmark/COGNITIVE_LOAD.md): severity **0** natural, **1** minor friction, **2** framework knowledge, **3** abstraction failure; layer **App** / **FW** (Valance's own model) / **Eng** (NEXUS, MESH, PORT, Effect). Ratings are the author's judgement of the code, not a user study.

## Summary

| ID | Finding | Layer | Sev | Status | Already recorded in |
|---|---|---|---|---|---|
| WA-1 | Styles are global; a component cannot own or scope its CSS | FW | 2 | Open | [`NEXT-CYCLE.md`](../application-model/NEXT-CYCLE.md) §3 (anatomy table and proposal 4); not decided |
| WA-2 | Rendering mode (static / client / server) is hardcoded and nowhere visible; dev and build behave differently | FW | 2 | Open | `routes.ts` comment only; [`ROUTING-AND-INTERCEPTORS.md`](../application-model/ROUTING-AND-INTERCEPTORS.md) decision for `delivery` (not exposed) |
| WA-3 | Routes are implicit (one per Markdown file) and nothing in the scaffold says so or lists them | FW | 2 | Open | `ROUTING-AND-INTERCEPTORS.md` ("the `vlx` model fixed that space to one route per Markdown file") |
| WA-4 | Only Markdown files can create a route: no custom pages, params, query or per-route guard/delivery | FW | 3 | Open (decided, deferred) | `ROUTING-AND-INTERCEPTORS.md` R1, work item 6; v0.12 outcome "Deferred: CLI `defineApp({ routes })` integration" |
| WA-5 | Form building blocks are thin and under-documented (`textfield` and `checkbox` only; no `form`, `select`, `textarea`, `label`) | FW | 2 | Open | New |
| WA-6 | `vlx dev` serves server-rendered HTML with no stylesheet link, so the first paint is unstyled and shifts when the script runs | FW | 2 | Open (cause read, not measured) | New |
| WA-7 | A Markdown page cannot embed a component; raw HTML is an error | FW | 2 | Open | New (the error text itself says "a component in your layout") |

Reading order: WA-4 is the root of WA-3, WA-5 and WA-7 (they all appear once you want a page that is not plain content); WA-2 and WA-6 are about delivery; WA-1 stands alone.

---

## WA-1. Styles are global; a component cannot own its CSS

**Observed.** `vlx init --web` writes one `src/styles.css` (28 lines) that styles the layout, navigation, theme toggle, code blocks and pager together. `emit.ts:49` collects every `src/**/*.css` (outside `src/desktop/`) and `emit.ts:66` writes an `import "../src/…css"` line for each into the generated browser entry. There is no per-component loading, no `<style>` in a template, no CSS-module or `styles` field on `component(template, { props, events })`.

**Why it matters.** A component is a template plus a typed contract, but its look lives elsewhere under a global class name (`.nav-link`, `.theme-toggle`). Nothing ties a rule to the component that needs it, so deleting or renaming a component leaves its CSS behind, and two components can collide on a class name. `NEXT-CYCLE.md` §3 already lists "Style: any `src/**/*.css`; global, not tied to the component" in the component's anatomy and, in proposal 4, a component folder as the way to make "CSS scoping" true; that proposal conflicts with an earlier decision and was never decided.

**Today's workaround.** Name a stylesheet after its component (`src/theme-toggle.css`) and prefix its classes by the component name. Convention only; nothing checks it.

**Options.**
1. Co-locate: `src/theme-toggle.css` next to `theme-toggle.mprx`, picked up by name, as the `.mprx` already is.
2. Declare it: `component(template, { props, events, styles })`.
3. Scope it: the build wraps a component's CSS in `@scope (<tag>)` or `@layer`, so a rule cannot leak. Needs a decision on what the tag's root element is (`mesh-fragment` components have none).

**Gap to close.** Decide NEXT-CYCLE §3 proposal 4 and give the answer a place in the CLI README's "components" section.

## WA-2. The rendering mode is hardcoded and not visible

**Observed.** The build is **static site generation plus hydration**: `buildWeb` renders every page in `content` to an HTML file (`build.ts:131-143`), the browser bundle then hydrates it. `vlx dev` is different: it renders each request on demand with the same function (`dev.ts:130`), so it looks like server rendering. The route table says `delivery: () => "static"` (`routes.ts:30`) with the comment "Static first: every page is rendered once at build time."

**The capability exists, the setting does not.** `@valancex/router` routes take `delivery: "static" | "client"` and `staticParams`; `web-plugin.ts` also knows `server`. None of it is reachable from the project: `vlx init` writes no `valance.web.json` unless a base or URL was given (`init.ts:162`), and the web settings schema has no rendering field. The README's "Limits" section says only that the site is "delivered as a static site, with no server rendering command". A developer who expects the Markdown content to be server-rendered and the rest client-rendered (a reasonable expectation) gets that split by accident of the hydration design and cannot see or change it.

**Gap to close.**
- A visible setting: `valance.web.json` `"rendering"` (default `"static"`), written into the scaffold, with a per-route override once WA-4 exists.
- The build summary names the mode per page (`/guide/x  static`).
- A README section "How pages are delivered", stating the dev/build difference.
- Decide whether `server` is a goal at all; today there is no server command (README "Limits").

## WA-3. Routes are implicit and undiscoverable

**Observed.** "A file's path is its address" (`content/guide/a.md` → `/guide/a`). `routes.ts` begins "The application never writes a route." The only pointers are one bullet in the scaffold README and a row in the CLI guide. `src/main.ts` and `src/layout.mprx`, the files the scaffold tells a reader to start from, say nothing about routes. The not-found page is `content/404.md`. Navigation order is `order` front matter, then path.

**Why it matters.** This is a deliberate model (one decision fewer for a docs site) but the developer's question, "where are the routes configured?", has no answer inside the project: there is nothing to open, and nothing to run that lists them.

**Gap to close.** A `vlx routes` command (address, file, section, order, delivery, title) and a comment at the top of the scaffolded `main.ts` stating that routes come from `content/`. When WA-4 lands, the same command lists declared routes beside content routes.

## WA-4. Only Markdown can create a route

**Observed.**
- `defineApp` accepts `layout`, `components`, `state`, `derived`, `commands`, `persist`, `appearance`, `guard`, `title`. No `routes`.
- The route table is derived from `content.pages` (`routes.ts`): `stateOf` returns `{ id }` only, `known` is true only for a content page, `paths` is the content's pages.
- The router package is complete (`route("/lists/:id", { params, query, canActivate, canDeactivate, redirectTo, delivery, staticParams, replaceQuery })`, `examples/todo/src/routes.ts`) but is only reachable by building the application by hand on `@valancex/valance`, without the CLI.
- The decision was made: `ROUTING-AND-INTERCEPTORS.md` R1 "Declare routes in `defineApp` (Schema'd params and query), keeping content pages as they are: Yes"; recommendation (c) `defineApp({ routes })`. The v0.12 outcome lists the integration as "Deferred".

**Consequences, for a page that is more than content:**

| Need | Today with `vlx` | Workaround |
|---|---|---|
| A non-Markdown page | Not possible | Stub `content/x.md` so the address exists, then `{#if page == "/x"}…{/if}` in the single layout |
| Path params (`/orders/:id`) | Not possible (every route is a file) | A state field plus a command |
| Query string as state | Dropped at the first navigation; an internal link with a query is a build error (`ROUTING-AND-INTERCEPTORS.md` probes 1b, 1c, 4) | None |
| Per-route guard | One global `guard` | Branch on the route name inside it |
| Per-route title | Front matter or the global `title` function | Compute it from state |
| Per-route delivery (WA-2) | None | None |

The workaround makes the stub's title, navigation entry, previous/next links and sitemap treat the custom page as content, and the layout becomes a switch over every special page.

**Gap to close.** Implement R1 (work item 6, size "large"), then the build rule for `client` routes (item 8, "a rewrite rule beside `_headers`") and link checking against declared routes. Add a way to bind a route to a component or screen so a custom page needs neither a Markdown stub nor a layout `{#if}`. Until then, document the stub-plus-switch pattern in the scaffold.

## WA-5. Form building blocks are thin and under-documented

**Observed.**
- The web tag table has `textfield` (events `change`, `submit` on Enter, `cancel` on Escape; `value` controlled and server-rendered) and `checkbox` (`checked`, `change`) in `packages/common/src/primitives.ts`. The CLI guide's list of tags you may use (README "Layout and components") omits both, so a reader looking for form support sees none.
- Missing: `form`, `label` as an element, `select`, `textarea`, radio, `type` variants of `input` (password, email, number), a submit event on a form, `required`/`pattern`/`aria-invalid`/`aria-describedby` hooks.
- Validation is available but assembled by hand: a command's input is checked by its Effect Schema where it enters, `derived` values can compute error messages from state, `command.waiting` plus `request` handle an async submit with typed failures. There is no form abstraction tying fields, schema, errors and submit state together, and a typed result of a failed validation is not something a template can bind to without a hand-written state field for each message.
- Tag props are required wherever a tag is used (`D1` in the older [`FINDINGS.md`](../application-model/FINDINGS.md)), which makes accessibility attributes on inputs costly; `webVocabulary.optional` now makes some optional (`textfield: ["label", "placeholder"]`) but not as a general mechanism.

**Gap to close.** (1) Document `textfield` and `checkbox`. (2) Add the missing input tags and the accessibility hooks. (3) Write the form recipe once: fields in state, a Schema for the submit command, errors in `derived`, submit state through `command.waiting`; then decide whether a `form` helper is justified or the recipe is enough.

## WA-6. `vlx dev` paints unstyled HTML first

**Observed (code).** In development every request is rendered with `styles: []` (`dev.ts:133`), so the document has no `<link rel="stylesheet">`. The CSS is attached by the browser entry (`client.ts` imports each stylesheet), so it arrives after the module graph is fetched and executed. The server-rendered HTML shows unstyled until then, and the layout shifts when the style is injected. In a production build the stylesheet filenames come from the bundler manifest (`entry.css`, `build.ts:132`) and `web-app.ts:26` writes them as `<link rel="stylesheet">` in `<head>`, which blocks rendering: no flash is expected there.

**Not verified.** The report was ">100 ms to load the styles" and a shift on load. This reading predicts it for `vlx dev`, not for `vlx build` output; whether it also happens on a built site was not tested. If it does, it is a different defect (a single large CSS file, a missing preload, or the theme applied after load, compare verifier F22).

**Gap to close.** In dev, emit `<link rel="stylesheet">` for the project's CSS in the server-rendered head, or inline critical CSS; keep the in-place style update. Add a test that the dev HTML contains a stylesheet link. Confirm with a trace on both modes before and after.

## WA-7. A Markdown page cannot embed a component

**Observed.** `markdown.ts:211`: `md-html: raw HTML is not supported: use Markdown, or a component in your layout`. The Markdown dialect is `#`–`###`, paragraphs, one-level lists, code, quotes, images, strong/em/code/links (README "Content"). There is no syntax for placing a registered component (a signup form, a live example, a callout) inside a page.

**Why it matters.** It forecloses the middle path between plain content and a fully custom page (WA-4): content with one interactive island. The `docs-verifier` example has the same need and handles it with its own kit (callouts, tabs, search), recorded as the library-mechanism blocker D4 in the older `FINDINGS.md`.

**Gap to close.** Decide whether islands are a goal. If yes, a Markdown directive (for example a fenced component block) resolved against registered `components`, checked at build time like links are. If no, say so in the README and point to WA-4's custom page.

---

## Relationship to existing records

| This finding | Overlaps with | Relationship |
|---|---|---|
| WA-1 | `NEXT-CYCLE.md` §3 proposal 4 (component folder, "CSS scoping") | Same gap, never decided; this adds the concrete options |
| WA-2, WA-4 | `ROUTING-AND-INTERCEPTORS.md` R1, work items 6 and 8 | Same gap; adds that nothing is visible today and the dev/build difference |
| WA-3 | `ROUTING-AND-INTERCEPTORS.md` ("one route per Markdown file") | The model is documented as a decision; discoverability is new |
| WA-5 | `application-model/FINDINGS.md` D1 (required props) | D1 is partly addressed by `webVocabulary.optional`; the form-specific part is new |
| WA-6 | verifier `FINDINGS.md` F22 (stored theme flash) | Different cause, same symptom class |
| WA-7 | `application-model/FINDINGS.md` D4 (no reusable kit) | Related; islands need a registration path D4 lacks |

## Not covered

- Behavior of a built site in a browser (no run).
- Desktop and multi-target consequences of any proposal (a custom route must mean something on the desktop target; see `MULTI-TARGET-PLAN.md`).
- Security of a form submit path beyond what the CLI guide already states for `request`.
