# Declared routes: `defineApp({ routes })`

Design note for finding WA-4 and work package WP-6 ([gap analysis](../findings/2026-10-16-gap-analysis-and-proposed-work.md)). Written 2026-10-16, **before** the implementation, so the implementation can be checked against it. Each normative statement has an id (`R-n`); the section "Implementation status" at the end is filled in after the check.

It narrows decision R1 of [`ROUTING-AND-INTERCEPTORS.md`](./ROUTING-AND-INTERCEPTORS.md) ("declare routes in `defineApp`, Schema'd params and query, content pages remain one route kind") to a first slice, **6a**, and says what the later slices add. Where this note departs from R1, the departure is in "Deviations from R1".

## The problem, in one example

A project that needs `/orders/42?tab=open` cannot have it: a route is a Markdown file. The workaround is a stub `content/orders.md` and an `{#if page == "/orders"}` in the one layout, with the id held in a state field set by hand. That makes the page a nav entry, a previous/next neighbour and a sitemap entry, and cannot carry a parameter or a query at all.

## What is written

```ts
// src/main.ts
import { defineApp, field, route } from "@valancex/common";
import { Schema } from "effect";

export default defineApp({
  state: {
    orderId: field(Schema.String, ""),
    tab: field(Schema.Literal("all", "open"), "all"),
  },
  routes: {
    order: route("/orders/:id", {
      params: Schema.Struct({ id: Schema.String }),
      query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "open")) }),
      title: ({ id }) => `Order ${id}`,
      enter: ({ id, tab }, state) => ({ ...state, orderId: id, tab: tab ?? "all" }),
      staticParams: () => [{ id: "1" }, { id: "2" }],
    }),
    settings: route("/settings", { title: "Settings" }),
  },
});
```

```
{#if route == "order"}
  <order-page />
{:else if route == "settings"}
  <settings-page />
{:else}
  <blocks items={blocks} />
{/if}
```

## Normative statements

### Declaration

- **R-1 Names.** A route's name is its key in `routes`. A name is a non-empty string; it is what a layout reads as `route`. The empty string is not a route name (it means "a content page, or not found").
- **R-2 Shape.** `route(pattern, config)` takes a pattern as `@valancex/router` reads it (`/orders/:id`, `/files/*path`) and a config of `params?`, `query?`, `title?`, `enter?`, `staticParams?`. The pattern starts with `/` and has no base: the site's base is put in front when an address is written. Unknown config keys are a definition error. The pattern syntax, its limits and the "two patterns that cannot be told apart" rule are the router's, not restated here.
- **R-3 Types.** `params` and `query` are Effect Schemas whose encoded side is strings (what an address holds). Without a `params` schema the parameters are the strings in the address. `route` is generic in both, so `enter`, `title` and `staticParams` are typed by them. A parameter name and a query key may not be the same name (the two are delivered as one input, R-8).
- **R-4 No overlap with content.** A declared pattern that matches the address of a content page is a definition error (`route-conflict`), naming both. There is therefore no precedence rule: an address belongs to at most one of content and a declared route.

### Addresses and state

- **R-5 The page is an address.** The framework state `page` holds the address inside the application: for a content page its path (`/guide/a`), as today; for a declared route its path and canonical query (`/orders/42?tab=open`). The browser URL is the base followed by `page` (`urlOf`), and the state for a URL is read the same way (`stateOf`). Nothing about content pages changes.
- **R-6 Canonical form.** The canonical address of a declared route is the router's (`hrefOf`): parameters encoded by their Schema, query keys sorted, no trailing slash. An address written another way (`/orders/42/`, `?b=1&a=2`) is moved to the canonical form by the existing canonicalization before start; it is not a different page.
- **R-7 `route`.** A reserved state name `route` holds the name of the declared route that `page` matches, and `""` for a content page or an address that is not a page. It is part of the application's state (serialized with it, so a server-rendered page and its hydration agree) and is readable in a layout like `site` or `title`. An application cannot use it as a state field.
- **R-8 `enter`.** `enter(input, state) => state` is a **pure** transition. `input` is the decoded parameters and the decoded query merged into one record. It runs in the same state change that changes `page` (R-9), so no render ever shows `page` without the state `enter` sets. A route without `enter` only sets `page` and `route`. An input that does not decode (a parameter or query value that fails its Schema) means the route does not match (the router's rule): the address is not found.
- **R-9 When a route is entered.** On every way `page` can change to a declared route: `go`, `back`, `forward`, the browser's Back and Forward (which call `go`), the first state of a request (server and browser), and a restored `navigation` list. A move to the address already shown is not an entry and does not run `enter` again.
- **R-10 Not found.** An address that is neither a content page nor a declared route is the not-found page as today, with `route` `""`.

### What the layout and the document see

- **R-11 Scope.** For a declared route, `found` is true; `title` is the route's title (R-12) or `""`; `description` is `""`; `blocks` is empty; `hasToc` is false; `sections` (the navigation) is still the content's; `prev` and `next` are empty. The layout decides what to draw from `route` (and from the state `enter` set).
- **R-12 Title.** `title` is a string or a function of the same input as `enter`. It is the page part of the document's title (so the project's `{page} · {site}` format applies). The author's `title(state, page)` function still wins for the parts it returns. A throwing function falls back as it does for the author's.
- **R-13 Head.** A declared route is `200` when it matches. With `valance.web.json` `url` set it gets a canonical link, the path only (no query).

### Delivery (6a is static only)

- **R-14 What a build writes.** A route without parameters is one page at its pattern. A route with parameters writes one page per entry of `staticParams()`, each entry encoded through `params`. A route with parameters and no `staticParams` is a **diagnostic** from `vlx check` and `vlx build` (`route-static-params`) that says client delivery arrives with slice 6b; it is never silently skipped.
- **R-15 What `vlx dev` does.** Development renders on demand, so any matching address renders there, `staticParams` or not. The difference from the build is documented, and `route-static-params` is what tells an author before the build does.
- **R-16 Sitemap.** Declared static pages are not added to `sitemap.xml` in 6a (slice 6c).

### Navigation

- **R-17 `go`.** `go("/orders/42?tab=open")` goes to a declared route's address, normalized by the router (R-6) as content addresses are by `tidy`. An address that matches nothing goes to not-found, as it does for content today.
- **R-22 The first state reads the address bar** *(added during implementation)*. A static page cannot see its query, so the server's state for `/orders/42` has none. In the browser the first state for a declared route is derived from the address the person is at (path and query), not only from the server's: `/orders/42?tab=open` keeps `tab=open` and runs `enter` with it. A content page has no query and is unchanged.
- **R-18 Guards.** The application-wide `guard` is unchanged: it is asked about `page` strings. Per-route guards (`canActivate`, `canDeactivate`, redirects) are not part of 6a (slice 6f).

### Tooling

- **R-19 Definition errors** are reported at the definition's place as `entry-definition` diagnostics by `vlx check`: duplicate or empty names, a bad pattern, a param/query name clash, an unknown key, `enter` or `title` that is not a function, a route that overlaps content.
- **R-20 `vlx info`** lists each declared route: name, pattern, delivery, and the pages `staticParams` gives, beside the content routes.
- **R-21 Portable.** The declaration, `route` and `enter` are state, not web. Only the browser URL is the web's. The desktop target receives the same `route`, `go` and `enter`; this slice does not exercise it there.

## Where it sits

- `@valancex/router` already provides the matcher, the Schema-decoded parameters and query, `href` and canonical form. 6a **uses its `createRouter`** with the base `/` (addresses are application-relative) and does not reimplement matching.
- `@valancex/common` owns `route()`, `defineApp({ routes })`, the `route` state and the integration in `app.ts`, `routes.ts`, `scope.ts`, `web-app.ts` and `server.ts`. The router's own `Plugin`/`commands` (which assume the application holds a `RouteState`) are **not** used: the application's `page` is a string and stays one.
- `@valancex/cli` owns the definition check, the build diagnostic, `vlx info` and the scaffold's comment.

## Deviations from R1

R1 said `enter` is "an ordinary command: the route's params and query arrive as its input… and it sets state". 6a makes it a **pure transition inside the navigation**, not a command, because:

1. A page rendered on the server must have its state complete in the first state, without running effects; a command is admitted and runs after.
2. A command run after the move would let a render show `page` with the previous page's state for a moment (a flash of the wrong order).
3. A pure function is testable without a runtime, and the same on every target.

What a command-based `enter` was for, **loading data when a route is entered**, is not lost: a layout reads the state `enter` set and an ordinary command (`command.waiting`) fetches. A declarative `load` on the route is slice 6e, and it will be a command precisely because it waits.

## The later slices

| Slice | Adds | Needs |
|---|---|---|
| 6b | `delivery: "client"` per route; the build writes the host rewrite beside `_headers`; `rendering: "client"` becomes accepted | R-14 |
| 6c | `vlx check` verifies internal links (content and templates) against declared routes, with params; the query-link build error goes away; declared routes in the sitemap | R-5 |
| 6d | `screen`: a route names the component it shows, so a custom page needs no `{#if route == …}` in the layout and no Markdown stub | R-7 |
| 6e | `load`: a command run on entry that waits, with loading and failure as state | R-8, 6d |
| 6f | Per-route `canActivate` / `canDeactivate` / `redirectTo`; `beforeunload` on the web; nested routes | R-18 |

## Slice 6d: a route names its screen

Written 2026-10-16, before its implementation, like the rest of this note. Statements continue the numbering; "Implementation status 6d" at the end of the note is filled in after the check.

**The problem.** With 6a a custom page needs an `{#if route == "order"}<order-page … />{:else if …}` chain in the layout, written by hand and kept in step with `routes`. Every router in the precedent below puts the component in the route table; here a component receives data only through props, so naming the component is not enough: the screen also has to be wired to the state.

```ts
routes: { order: route("/orders/:id", { params, enter, screen: orderPage }) },
components: [orderPage],
```

```
<!-- src/layout.mprx: <screen /> where <blocks items={blocks} /> was -->
<main id="content" tabindex="-1"><screen /></main>
```

- **R-23 `screen`.** A route may name `screen`: a component made by `component(template, { props, events })`. It must be listed in `components` (of the same definition, or of the target that draws it); otherwise a definition error names the route and the component. A route without `screen` is as in 6a.
- **R-24 `<screen />`.** A built-in tag with no props. For the route shown it draws that route's screen; for any other address (a content page, the not-found page, a route without a screen) it draws what `<blocks items={blocks} />` draws, so replacing `<blocks … />` by `<screen />` in a layout changes nothing for a project that names no screen. The scaffold's layout and the built-in layouts write `<screen />`.
- **R-25 Wiring by name.** The framework writes the screen's use itself: each prop the screen declares is filled from the scope name of the same name (a state field, a derived value, or a framework name such as `title`), and each event it declares runs the command of the same name (`on.save={save()}`, or `save($event)` when the event has a payload). The screen's contract is therefore its interface to the application, and it is the one place the names are written. A screen must declare its contract (`props` and `events`, empty if it has none): the names cannot be read from a template before it is compiled.
- **R-26 Errors name the route.** A declared prop with no scope name of that name, and an event with no command of that name, are diagnostics at the route's declaration that say which name is missing and where names come from. A type that does not fit (a `Number` state field for a `String` prop) is MESH's own diagnostic, in the generated template, which is called "the screen of route `order`" so it can be found.
- **R-27 Placed.** If any route names a screen and the layout never writes `<screen />`, that is a diagnostic (`screen-unplaced`): the screen could never be shown.
- **R-28 Targets.** The switch is written per target from the screens listed for that target. A route whose screen is not listed for a target draws what `blocks` draws there (empty for a route). Nothing is generated for a target whose layout does not write `<screen />` and whose routes name none.
- **R-29 Cost.** A project that names no screen compiles the same program as before apart from the one-line built-in `screen`.

## Acceptance tests (what the implementation is checked by)

| Test | Statement |
|---|---|
| A route with params and query: `go` to its address sets `page` (canonical), `route`, and `enter`'s state in one commit | R-5, R-6, R-7, R-8, R-9, R-17 |
| `back`/`forward` across content and declared pages restore `route` and the entered state | R-9 |
| A request for a declared address renders it: status 200, `route` and `enter`'s state in the boot state, the layout's branch in the HTML, the route's title in `<title>` | R-7, R-8, R-11, R-12, R-13 |
| An address with a value that fails its Schema, or no route, is the not-found page with `route` `""` | R-8, R-10 |
| A declared pattern equal to a content path is `route-conflict`; duplicate names, empty names, bad patterns, param/query clash, unknown keys are definition errors | R-1 to R-4, R-19 |
| `vlx build` writes the pages of a parameterless route and of each `staticParams` entry; a parametric route without them is `route-static-params` in `check` and `build` | R-14 |
| `vlx dev` renders a parametric address that `staticParams` does not list | R-15 |
| `vlx info` lists declared routes beside content | R-20 |
| A project with no `routes` builds the same files as before | R-5, R-10 |
| In a real browser: a link to a declared address changes the page in place, the address bar shows the canonical form, Back returns | R-5, R-9 |

## Implementation status

Checked 2026-10-16 against commit `b51ad0d` and the fixes after it, statement by statement. **Evidence** is a test (file and name in `packages/*/test/`) or code. Status: **Matches**, **Matches, with a note**, **Differs**, **Not exercised**.

| Statement | Status | Evidence |
|---|---|---|
| R-1 Names | Matches | `routes.test.ts` "reports a declaration that cannot be read" (empty name → `needs a name`); the key is the name (`routing-engine.ts`) |
| R-2 Shape | Matches | Same test (no leading `/`, unknown settings, a pattern the router refuses); `routing.test.ts` (rest segments through `routes.test.ts` "without a params Schema…"); base put in front: "under a base" |
| R-3 Types | Matches, with a note | `routing.test.ts` "route is typed by its Schemas" (two `@ts-expect-error` lines are checked by `tsc`). **Note:** the param/query name clash is detected only when `query` is an `Effect.Struct` (its `.fields` are read); for another schema shape the clash is not seen and a parameter wins over a query key at run time |
| R-4 No overlap with content | Matches | "refuses a route whose address is a content page" (`route-conflict`, also for `/`) |
| R-5 The page is an address | Matches | "go sets the canonical address…"; "under a base"; "a link to a declared address changes the page in place" |
| R-6 Canonical form | ~~Differs~~ **Matches since the D-1 change** | The *state* is canonical (`/orders/42?tab=open`; trailing slash trimmed; query sorted): "go sets the canonical address", `routing.test.ts` "matches an address…". The **address bar is not rewritten**: `/orders/2/?tab=open` stays as written. The note said the existing canonicalization would do it; it does not, for declared routes **or for content pages** (probed: `/guide/getting-started/` stays). See D-1 |
| R-7 `route` | Matches | Scope: `routing.test.ts` "what a layout reads"; serialized in the boot state: `pipeline.test.ts` boot JSON; reserved name: "…a state field called `route`" |
| R-8 `enter` | Matches | "go sets…" (state in the same change); "`enter` cannot change which page is shown"; "an address… whose value fails its Schema is the not-found page" |
| R-9 When entered | Matches, with a note | `go`, `back`, `forward`: "go sets…"; first state of a request: dev and build tests; restored list: "a restored navigation list comes back on its declared route"; same address is not an entry: "going to the address already shown…". **Note:** the browser's own Back/Forward were exercised only from a route to a content page ("a link to a declared address…"), not between two routes |
| R-10 Not found | Matches | "an address that is no route…"; dev test 404 |
| R-11 Scope | Matches | `routing.test.ts` "what a layout reads on a declared route" (found, title, description, blocks, hasToc, prev/next, navigation unmarked) |
| R-12 Title | Matches | "titled and drawn by the layout"; "the author's `title` function still wins for the parts it returns" (`Order 1 · Order 1!`). A throwing route `title` function falls back as the author's does: **not tested** |
| R-13 Head | Matches | Built page: `<title>`, canonical `https://example.com/orders/1`; under a base `/docs/orders/1` |
| R-14 What a build writes | Matches, with a note | Pages per `staticParams` and the parameterless route; `route-static-params` from check and build; a `staticParams` entry that does not fit its Schema is a diagnostic. **Note:** that last case was a *crash* in `vlx check` and `vlx info` when first implemented; found by this check and fixed (D-4) |
| R-15 What `vlx dev` does | Matches, with a note | "renders an address that staticParams does not list, with its query". **Note:** `vlx dev` does not itself warn about a missing `staticParams`; `vlx check` and `vlx build` do |
| R-16 Sitemap | Matches | Built with `url` set: no `/orders/` in `sitemap.xml` |
| R-17 `go` | Matches | "go sets…" (`orders/42/?tab=open` written loosely); unknown address → not found |
| R-18 Guards | Matches | "the application-wide guard is asked about declared addresses… and can stop a move" |
| R-19 Definition errors | Matches, with a note | Seven declaration cases in one test, each one `entry-definition` at `src/main.ts`. **Note:** a `title` that is neither string nor function is checked in code, not tested |
| R-20 `vlx info` | Matches | "lists declared routes beside the content, with the pages a build writes"; under a base |
| R-21 Portable | **Not exercised** | `desktop.ts` takes the same routing and typechecks; the desktop suites pass unchanged. No desktop test declares a route |
| R-22 First state reads the address bar | Matches | "a link to a declared address…" (opens `/orders/2?tab=open` on a static page; the query is kept and `enter` applied) |

### Differences found, and what they mean

- **D-1 (R-6): the address bar is not canonicalized. Resolved 2026-10-16 as recommended below:** a `trailingSlash` setting (`never`/`always`) and the page moves the address bar to the canonical form at start with `replaceState`; tested in Chromium for both policies, the query order, the fragment, no new history entry, and an address that is not a page. What follows is the original finding. The note assumed the history layer rewrites a non-canonical address before start. It does not, for any page. The state is right; the bar shows what was written. Not changed in 6a, because rewriting the address is a behavior of the history layer that content pages would also get. **Decision for you:** accept (hosts redirect, and the canonical link names the right address), or add a `replaceState` at start for every page.
- **D-2 (R-22 added).** Not in the first draft. Without it a query on a static page is dropped, which would make `query` useless on a static site. Costs: when the address bar has a query the first state differs from the server's, so the first draw is a hydration mismatch redraw (visible only as a repaint; tested in Chromium).
- **D-3 (boundary). Resolved 2026-10-16: accepted as built** (precedent below). What follows is the original finding. `@valancex/common`'s author entry used to load nothing but a types-only file, and a test pinned it. `route` brings the router with it, so that test now allows `routing.ts`, `routing-types.ts` and `@valancex/router`. To keep the cost to those who use it, the router is imported only by `route()` and handed to the engine inside the declaration: a project that declares no route does not ship it (the built bundle is tested for this; the router is about 9 kB minified). **Decision for you:** accept the relaxed boundary, or move `route` to its own entry (`@valancex/common/routes`) and keep the old test as it was.
- **D-4 (R-14, found by the check).** A `staticParams` entry that does not fit `params` crashed `vlx check` and `vlx info` with a stack trace instead of a diagnostic. Fixed; tested for check, build and info.
- **D-5 (R-3).** The param/query clash check only sees an `Effect.Struct` query (see the table).
- **D-6 (R-21).** Desktop is not exercised.

### Not in 6a, as the note said

Per-route guards and redirects, nested routes (6f); `client` delivery (6b); link checking and sitemap (6c); a route that names its screen (6d); loading on entry (6e).

## Precedent for D-1 and D-3

Researched 2026-10-16 from the routers' own documentation (through search; where a page was not read in full or a claim rests on a secondary source, it says so). The question was how other routers reason about the two open decisions, and which reasoning fits this ecosystem's direction.

### D-1: should the address bar be moved to the canonical form?

| Router | What it does | Where the rule lives |
|---|---|---|
| SvelteKit | `trailingSlash` is a page option, `'never'` by default: `/foo/` is **redirected** to `/foo`. `'always'` keeps the slash; `'ignore'` accepts both and is described as not recommended, because search engines treat the two as separate pages. The option also decides how prerendered pages are saved: `always/index.html` against `never.html` ([tutorial](https://svelte.dev/tutorial/kit/trailingslash)) | A declared policy, enforced by the server, and tied to the **build output layout** |
| Next.js | `trailingSlash` in config; by default each request is **redirected (308)** to the configured form; `skipTrailingSlashRedirect` turns that off so both forms return 200 ([docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/skipTrailingSlashRedirect)) | A declared policy, enforced by the server, with an opt-out |
| TanStack Router | `trailingSlash: 'always' \| 'never' \| 'preserve'`, default `'never'`, set on the router ([API](https://www.mintlify.com/TanStack/router/api/router/router); a secondary source reports it did not hold for splat routes) | A declared policy, in a **client** router |
| Vue Router | Matches `/users` and `/users/` (and any case) by default; `strict` rejects the trailing slash, `sensitive` makes case matter. It does not rewrite the address ([matching syntax](https://router.vuejs.org/guide/essentials/route-matching-syntax)) | An opt-in strictness; no canonicalization |
| Astro | `trailingSlash` (`always`, `never`, `ignore`) governs the dev server; for prerendered pages in production the hosting platform decides, and may not respect the setting ([configuration reference](https://docs.astro.build/en/reference/configuration-reference)) | A declared policy, honestly limited by the host |
| Angular | Not confirmed: the pages found describe `replaceUrl` and when the URL is written, not canonicalization at start ([Router API](https://v19.angular.dev/api/router/Router)) | – |

What they agree on:

1. **A stated policy, not an accident.** Everyone but Vue has a named option with a default (`never` in SvelteKit and TanStack). Vue's tolerance is the exception, and the one that leaves the choice to the author.
2. **Two forms of one page is a defect, not a feature**: SvelteKit says why (duplicate pages for search engines). Those that tolerate both (`ignore`, `skipTrailingSlashRedirect`, Vue's default) do so as an explicit opt-out.
3. **Who enforces depends on who can.** A server redirects; a static host cannot be told to, so Astro says the host decides; a client router (TanStack) can only normalize after it starts.
4. **The policy touches the build output**, not only the URL (SvelteKit's file layout).

What fits here: a static site has no server to redirect (Valance writes `dir/index.html` and `_headers`, and a static host may itself redirect `/guide/a` to `/guide/a/`, verifier finding F26), so the only enforcer this project controls is the page once it starts. The state and the canonical link are already one form. That points to:

- **A named policy**: `trailingSlash` in `valance.web.json`, `"never"` (today's behavior and the default) or `"always"`. No `"ignore"` or `"preserve"`: SvelteKit's own docs advise against ignoring, and a static site cannot honor both without duplicates.
- **The client enforces it**: at start, when the address bar differs from the canonical form of the state, `history.replaceState` to it (no new entry, no reload), for content pages and declared routes alike. This is TanStack's position on the same constraint.
- **Not decided here**: the build's file layout under each policy (SvelteKit's `never.html`; Astro's `build.format`), which belongs with delivery slice 6b.

**Recommendation: do this**, rather than accept D-1 as it is. Cost: small (the start-up code in `client.ts` and one setting). It also closes the difference with R-6 as written. What would change the recommendation: if you would rather leave the address as the person typed it (Vue's position), D-1 is accepted and R-6 is reworded.

### D-3: should `route` live in the authoring entry, with the router behind it?

| Router | Where its declaration API lives | What it does about unused code |
|---|---|---|
| Vue Router, Solid Router, React Router (declarative), Angular | In the **router's own package** (`vue-router`, `@angular/router`, …), apart from the view library | Not imported, not shipped |
| Angular | `provideRouter(routes, withXyz())`: the router moved from a module that kept unused features in every bundle to **feature functions** a bundler can drop ([post](https://blog.angular.io/advancements-in-the-angular-router-5d69ec4c032), the 11% figure is secondary) | Features tree-shake because each carries its own code |
| TanStack Router | `createFileRoute` and friends in the router package; its plugin splits a route into **critical** configuration (matching, params, loaders) and **non-critical** (the component, loaded on demand) ([guide](https://tanstack.com/router/latest/docs/guide/code-splitting)) | The route definition itself is split by what is needed to match |
| React Router v7 framework mode | The route config helpers (`route`, `index`, `layout`) come from `@react-router/dev/routes`; the runtime from `react-router` ([routes config](https://mintlify.com/remix-run/react-router/routing/route-configuration), secondary source) | The config is read at build time and costs the page nothing |
| SvelteKit, Next, Astro | Routing is file-based and built in | SvelteKit lets a page opt out of the client router and of hydration (`csr = false`), so a page pays only for what it uses ([page options](https://svelte.dev/docs/kit/page-options/llms.txt)) |

What they agree on:

1. **A route declaration ships with its engine.** Nobody puts the declaration in the view library and the engine somewhere unrelated. Where there is a separate package, the declaration is *in* it.
2. **The cost is arranged to fall on those who use routing**: separate packages (Vue, Solid), feature functions (Angular), build-time config (React Router), page-level opt-out (SvelteKit).
3. **No one hides this from the author with a second import path for its own sake**; the separate import is the consequence of a separate package, not a design goal.

What fits here: `route()` carrying its engine is Angular's answer (feature functions that bring their own code) and is already implemented and tested (an application with no route does not ship the router). `@valancex/common` is the authoring package and already depends on `@valancex/router`; `defineApp` and `route` are used together in the same file, so one import is the fewest concepts for the common task. A second entry (`@valancex/common/routes`) would be the Vue/Angular shape, but there the separation exists because the router is a different product from the view library; here the author's one package is the model, and `@valancex/router` stays available for those who build on Valance directly.

**Recommendation: accept D-3 as built.** Keep `route` in `@valancex/common`, keep the relaxed boundary test (it now says exactly what the entry loads: two files that hold types, and `routing.ts`, which is `route` and the router it carries), and keep the bundle test that a project with no route ships no router. Revisit only if a tool that loads the authoring entry (the language server, an editor) shows a cost from the router being in its closure; the move to a subpath is then a re-export and costs a day.

### Sources

[SvelteKit trailingSlash](https://svelte.dev/tutorial/kit/trailingslash) · [SvelteKit page options](https://svelte.dev/docs/kit/page-options/llms.txt) · [Next.js skipTrailingSlashRedirect](https://nextjs.org/docs/app/api-reference/config/next-config-js/skipTrailingSlashRedirect) · [TanStack Router API](https://www.mintlify.com/TanStack/router/api/router/router) · [TanStack code splitting](https://tanstack.com/router/latest/docs/guide/code-splitting) · [Vue Router route matching](https://router.vuejs.org/guide/essentials/route-matching-syntax) · [Astro configuration](https://docs.astro.build/en/reference/configuration-reference) · [Angular Router](https://v19.angular.dev/api/router/Router) · [Angular router advancements](https://blog.angular.io/advancements-in-the-angular-router-5d69ec4c032) · [React Router route configuration](https://mintlify.com/remix-run/react-router/routing/route-configuration). React Router's own handling of trailing slashes was not researched.

### Decisions taken (2026-10-16)

- **D-1: done as recommended.** `trailingSlash: "never" | "always"` in `valance.web.json` (default `never`, written by `vlx init`); `"ignore"` and `"preserve"` are refused with the reason. Every page address the build writes follows it (navigation, Markdown and template links, canonical link, sitemap, declared routes' pages); the page replaces the address bar with the canonical form when it starts. `packages/common/src/url.ts`, `client.ts`; tests in `cli/test/routes.test.ts` ("moves the address bar…", "a site whose pages end in a slash") and `common/test/routing.test.ts`.
- **D-3: accepted as built.** `route` stays in `@valancex/common`; the boundary test says exactly what the authoring entry loads; the bundle test keeps the router out of a project that declares no route.
