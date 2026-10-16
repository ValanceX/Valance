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
- **R-24 `<screen />`.** *(As first written: a built-in tag with no props; see the design correction in the status below, where it became a marker the framework expands in the layout.)* A built-in tag with no props. For the route shown it draws that route's screen; for any other address (a content page, the not-found page, a route without a screen) it draws what `<blocks items={blocks} />` draws, so replacing `<blocks … />` by `<screen />` in a layout changes nothing for a project that names no screen. The scaffold's layout and the built-in layouts write `<screen />`.
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

### Implementation status, slice 6d

Checked 2026-10-16 against the code and tests in `cli/src/screens.ts`, `cli/test/screens.test.ts` and `common/src/routing-engine.ts`.

**Design correction found while implementing.** R-24 said `<screen />` is a built-in component. It cannot be: a component reads only its props, so a component named `screen` could not see `route`, `blocks` or any state field, which the switch needs. `<screen />` is instead a **marker in the layout's source** that the framework replaces, at compile time, with the switch over the routes (`{#if route == "order"}<order-page … />{:else}<blocks items={blocks} />{/if}`) or, when no route names a screen, with `<blocks items={blocks} />`. The behavior the note stated is unchanged; what changed is what `<screen />` is. It is declared in the manifest so an editor does not call it unknown.

| Statement | Status | Evidence |
|---|---|---|
| R-23 `screen` | Matches, with a note | "refuses what cannot work" (not listed → `entry-definition`; no contract → `entry-definition`). **Note:** "listed" means listed in `components` or `override` of the definition or of any target, not only the target that draws it; a screen listed for one target and drawn on another is not caught |
| R-24 `<screen />` | **Differs in what it is** (see above); behavior matches | "draws the screen for the route, the content for a page"; `expandScreen` tests; the scaffold, the built-in layouts, docs-app and todo-multi write `<screen />` |
| R-25 Wiring by name | Matches | `screenSource` test (props by name, events to commands, `$event`); the browser test (a prop follows the state, an event runs its command, twice) |
| R-26 Errors name the route | Matches for names; **differs for types** | `screen-prop` and `screen-event` name the route, the component and the missing name. A type that does not fit is MESH's `type-mismatch` ("the prop \"count\" of component \"card-page\" needs string, found number") at the `<screen />` line of the layout; it does not name the route and there is no generated template to name |
| R-27 Placed | Matches | "refuses what cannot work" (`screen-unplaced`); `expandScreen` test |
| R-28 Targets | Matches at the generator, **not exercised in a project of two targets** | `screenSource` test (a screen not listed for the target writes nothing; a same-named file elsewhere is not it) |
| R-29 Cost | Matches | With no screens `<screen />` becomes exactly `<blocks items={blocks} />`, so the program is the one the old layout compiled (`expandScreen` test); the manifest gains one empty `screen` entry |

Also added: a route name must be letters, digits, `-` and `_` starting with a letter (it is compared in the generated switch).

## Nested routes and the outlet (investigation, 2026-10-16)

**Question.** Other frameworks put a component "at the outlet's position": a parent route's component says where its child goes. Is that what `<screen />` is, what would it take to do it for nested routes, and does it need a new concept? **Status: investigated, evidence gathered, not built.** The proposal below is not normative until it is decided; it would be slice 6g.

### What other frameworks do

| Framework | The outlet | The child | What stays mounted |
|---|---|---|---|
| React Router | `<Outlet />` in the parent's element: "the hole" where the matching child appears; an index child fills it at the parent's own path; omit it and the child never shows ([tutorial sources](https://www.luisllamas.es/en/react-router-nested-routes/); the official page was not found in the search) | A route nested under the parent in the route table | The parent, so its state survives child navigations |
| Vue Router | `<router-view>` in the parent component; named `<router-view name="…">` with a route's `components` map for several outlets; an empty-path child fills the parent's outlet at the parent's path ([nested routes](https://router.vuejs.org/guide/essentials/nested-routes)) | `children` of a route | The parent component |
| Angular | `<router-outlet>`; unnamed is the primary, named ones are auxiliary routes with their own URL segment; a route names its `outlet` ([auxiliary routes](https://angularindepth.com/article/auxiliary-routes-in-angular/), secondary source) | `children` of a route | The parent component |
| TanStack Router | `<Outlet />`, no props, anywhere in the parent's tree; renders nothing when no child matches; pathless layout routes group routes with a layout and no segment ([nested routes](https://www.mintlify.com/TanStack/router/router/guides/nested-routes), a mirror of the guide) | Routes whose path extends the parent's (file-based) | The layout |
| SvelteKit | No outlet tag: a `+layout.svelte` receives `children` and places it with `{@render children()}`; layouts nest to any depth by folder ([routing](https://svelte.dev/docs/kit/routing/llms.txt)) | The page or the next layout in the folder tree | The layouts above the change |
| Next.js (App Router) | No outlet tag: a `layout` receives `children`; a *template* is the variant that is re-created on every navigation ([LogRocket](https://blog.logrocket.com/guide-next-js-layouts-nested-layouts), secondary) | The page or the next layout | Layouts keep state; templates reset it |

What they agree on:

1. **The parent decides where the child goes.** An outlet, or a `children` placeholder, is *in the parent's template*, so the parent's author controls the frame. The router does not wrap or position.
2. **The point is persistence.** Everything that explains the outlet (React, TanStack, Next) comes back to the parent *staying mounted* while the child changes: its state, its focus, its scroll, its open menu.
3. **Nothing in the child's place is a valid state.** TanStack renders nothing, Vue and React use an index (empty-path) child for the parent's own address.
4. **Two spellings of one idea**: a named tag the router provides (`Outlet`, `router-view`, `router-outlet`) and the view library's own children/slot mechanism (Svelte, Next). The first exists where the view library has no general way to pass content in; where it has, the router uses it.
5. **More than one outlet is a feature of its own** (Vue named views, Angular auxiliary routes), added after the single outlet, with a place in the URL (Angular) or not (Vue).

### What this ecosystem already has

- **`<screen />` is an outlet at the top level.** The layout writes it where the page goes; the framework fills it with the screen of the route shown (slice 6d). It is the "root outlet".
- **A MESH slot is the general outlet.** A component places the content its caller writes inside it with `<mesh-slot />`; the content is the **caller's**, so it sees the caller's names (`who`, `route`, the state) and not the parent's. That is Svelte's `children`, not React's `<Outlet />`: it needs no router concept.

### The evidence

`packages/cli/test/outlet.test.ts` writes an account area by hand with today's features (a shell with a slot, two pages) in the two shapes a generator could produce, builds it, and drives it in Chromium:

| Shape | Result |
|---|---|
| `<account-shell who={who}>{#if route == "profile"}<profile-page />{:else}<security-page />{/if}</account-shell>` inside one `{#if}` for the whole area | The child is drawn inside the shell's slot (`<div class="shell"><p class="menu">Account of Ada</p><p class="profile">Profile</p></div>`); the shell received `who` from the layout's scope; **going from Profile to Security keeps the same shell element** (identity compared in the page) |
| One case per page, the shell written in each (`{#if route == "profile"}<account-shell>…</account-shell>{:else if route == "security"}<account-shell>…`) | Works, but **the shell is drawn again** on every change: a different branch is a different subtree, so anything the shell owns would reset |

So the outlet needs no new language feature, and the persistence that makes an outlet worth having depends entirely on **how the switch is written**: nested (a tree following the route tree) preserves the parent; flat (a case per leaf, which is what 6d writes today) does not.

### Proposal (slice 6g): nested routes whose screens nest through slots

Not built. A sketch to decide on:

```ts
routes: {
  account: route("/account", {
    screen: accountShell,                       // its template has <mesh-slot />: the outlet
    enter: (_, state) => ({ ...state, area: "account" }),
    children: {
      profile: route("/profile", { screen: profilePage }),     // /account/profile
      security: route("/security", { screen: securityPage }),  // /account/security
    },
  }),
}
```

- **The outlet is `<mesh-slot />`** in the parent screen's template. No new tag. Where the parent's author wants to see it named, a documented alias is possible, but the precedent (Svelte, Next) is that where the view language already has children, the router uses it.
- **Names are dotted**: the leaf is `account.profile` (what `route` reads), the parent alone is `account`. The route-name rule widens to allow `.`.
- **Matching**: the framework flattens the tree into full patterns (`/account`, `/account/profile`) for the router it already uses. Parameters and query of every level arrive as one input; `enter` runs parent first, then child, as transitions on the same state; `title` is the deepest one given.
- **The generated switch follows the tree** (the nested shape above): for each parent, one `{#if route == "account" || route == "account.profile" || …}` around its screen, and inside it the switch over its children. This is 6d's generator, recursive. Each level is wired by name, as in 6d.
- **The parent alone** (`/account`) draws the parent with an empty slot, or its `index` child if the route names one (`index: profilePage`, React's index route, Vue's empty path).
- **The root outlet is unchanged**: the layout's `<screen />`.
- **Static pages**: a build writes the pages of the leaves (and of a parent with no children). `staticParams` is given on the leaf, as the full parameter set, because a parent's parameters are part of the leaf's address.

Cost: about the size of 6d (the engine flattens and merges; the generator recurses; `vlx info` shows the tree; tests for three levels, an index child, parameter inheritance, the order of `enter`, and the identity of every ancestor in a browser). The risk is the generated disjunction growing with the tree, and the diagnostics: a type error inside a nested use would name the layout's `<screen />` line (as in 6d) rather than the level.

### What it does not settle

- **Named outlets** (several slots filled by one route: a sidebar and a main area). MESH has named slots (`<mesh-slot name="side" />`, `<mesh-fill slot="side">`); a route could name a screen per slot. Vue and Angular added this after the single outlet and it is a separate decision with a place in the URL to settle (Angular) or not (Vue).
- **Layouts for content pages.** A section of Markdown pages inside a shell (SvelteKit's folder layouts) is a different question: the pages are not routes. A `content/guide/` shell would be a property of a directory.
- **Pathless grouping** (TanStack's layout routes: a shared screen with no segment of its own). A parent whose own address is not a page; needs a way to say so.
- **Per-level guards and `beforeunload`** (slice 6f), which attach naturally to the levels once there are levels.

### Recommendation

**Build it as the outlet-by-slot design above (slice 6g), after 6b/6c.** The investigation shows the language needs nothing new; the work is route-tree semantics (flatten, merge, order) plus making the 6d generator recursive. Keep `<mesh-slot />` as the outlet and document it in routing terms; do not add `<outlet />` now. Decide three things first:

1. **Names**: dotted leaves (`account.profile`) as proposed, or keys that stay flat with a `parent` reference. Dotted keeps the tree visible in `route` comparisons and in `vlx info`.
2. **`staticParams` on nested routes**: on the leaf, the full set (proposed), or composed from each level.
3. **An `index` child** as a key of the parent (`index: screen`), or as a child with the empty path.

## Slices 6c, 6b and 6g: design (2026-10-16, before the implementation)

Decisions taken: leaf names are **dotted** (`account.profile`); `staticParams` is **the full set on the leaf**; an **`index`** is a key on the parent; the order is **6c, 6b, 6g**, with the click race RF-11 looked into after. One constraint from the maintainer governs 6g: **nested routes follow the same fine-grained reactivity, and nothing walks the route tree unless it has to.**

### 6c: links are checked against routes

- **R-30** A Markdown link or a template's literal `href` (on `a` and `link`) to an address that a declared route matches (the path's parameters decoded by their Schemas; any query) is not `link-broken`. It is written under the base in the form the `trailingSlash` policy names, like a link to a page. A link to an address that no content page, declared route or file of `public/` matches is `link-broken`, naming the file and line (and the column, in a template).
- **R-31** A `#fragment` on a link to a declared route is accepted unchecked: a route's headings are not known to the build.
- **R-32** `sitemap.xml` lists the declared pages a build writes (parameterless routes and `staticParams` entries), not client routes.

### 6b: client delivery

- **R-33** A route may say `delivery: "client"`. A build writes no page for it. Its addresses are answered by the **app shell**: one HTML file, `__app-shell.html`, with an empty `#app`, the script and the stylesheets. It cannot be pre-rendered because its addresses are not known at build time (`/orders/:id` for any id).
- **R-34** The shell draws; it does not hydrate. Its boot data says it is the shell, and the page's first state is derived from the address bar (path and query), the way R-22 already derives the query.
- **R-35** The build writes `_redirects` beside `_headers`: one rewrite (status 200, not a redirect) from each client route's pattern to the shell, in the syntax Netlify and Cloudflare Pages read (`/orders/:id  /__app-shell.html  200`, a rest segment as `*`); any other host takes the same lines. It is written only when a client route exists.
- **R-36** A client route has no static pages: `staticParams` on one is a definition error (it would be ignored silently), and `route-static-params` does not apply to it.
- **R-37** `rendering: "client"` in `valance.web.json` makes every address client-delivered, content pages included: the build writes the shell, `_redirects` with `/*  /__app-shell.html  200`, the assets and `404.html`, and no page. Links are still checked (R-30).
- **R-38** `vlx dev` serves the shell for a client route, as a host would, so what is seen in development is what is shipped.

### 6g: nested routes and the outlet

- **R-39 `children`.** A route may have `children`: routes whose patterns start with `/` and are appended to the parent's. A child's name is the parent's, a dot, and its key (`account.profile`); the keys follow the rule names have; the dotted leaf name is what `route` holds. Params and query of every level reach `enter` and `title` as one input; a name used at two levels is a definition error.
- **R-40 `index`.** A parent may name `index`: the screen drawn in its slot for the parent's own address. Without it the slot is empty there. The parent's own address is the route named by the parent (`account`).
- **R-41 The outlet is `<mesh-slot />`** in the parent screen's template. A parent screen that has children with screens and no slot in its template is a diagnostic naming the route (`outlet-missing`).
- **R-42 Order.** `enter` runs parent first, then child, on the same state change; `title` is the deepest one given; `delivery` is the parent's unless the child says otherwise.
- **R-43 Static pages.** A build writes the pages of the leaves, of a parent with an `index` or with no children. `staticParams` belongs on the leaf, as the full parameter set; a parent that has children may not give it.
- **R-44 Fine-grained reactivity.** The generated switch is a tree with **one condition per level, each reading its own state path**: the application's state gains `at`, a record with one field per route that has children (the root counts), holding the key of the active child there (`at.l0 == "account"`, `at.l1 == "profile"`). The framework sets `at` when it sets `route`. A navigation that changes only the active child under `account` changes `at.l1` and `route`, and nothing else: MESH re-evaluates only the sites that read a changed path, so the conditions of the levels above, and everything outside the area, are not re-evaluated, and **every ancestor is the same element** afterwards. A flat switch on `route` would re-evaluate every condition on every navigation.
- **R-45 No tree walk at run time.** The route tree is flattened once, when the definition is read: each leaf has its full pattern, its chain of levels and its `enter`s in order. Entering a route reads that chain (O(depth)); the router's matcher, which scans its candidates, is not the application's concern and is given the flat table. Nothing builds or traverses the tree to render or to navigate.

### Acceptance

| Test | Statement |
|---|---|
| A Markdown link and a template link to `/signup`, `/orders/42?tab=open` are accepted and written under base and policy; to an address that is nothing is `link-broken` with its file and line | R-30, R-31 |
| The sitemap lists `staticParams` pages and not client routes | R-32 |
| A client route writes no page, the shell, and `_redirects` with its pattern; the shell draws from the address bar in Chromium, with a query, a trailing slash and a parameter | R-33 to R-35 |
| `staticParams` on a client route is a definition error; no `route-static-params` for it | R-36 |
| `rendering: "client"` writes the shell and a catch-all and no page; links are still checked | R-37 |
| `vlx dev` serves the shell for a client route | R-38 |
| Nested: leaf names, merged params and query, `enter` order, deepest title, `index`, the parent alone | R-39 to R-42 |
| `outlet-missing` when a parent screen has no slot | R-41 |
| Static pages of leaves; `staticParams` on a parent with children is refused | R-43 |
| **Reactivity:** navigating between siblings under one parent leaves every ancestor the same element and mutates nothing outside the slot (a MutationObserver on the ancestors); only the paths `route` and the changed `at.lN` change in the state; three levels | R-44 |
| **No tree walk:** entering a route reads its precomputed chain (a counter on the structures read), and the generated switch has one equality per case at each level, none a disjunction over the subtree | R-45 |
| A project with no nested routes compiles the switch it did before, or its equivalent with the one root level | R-44 |

### Implementation status, slice 6c

Checked 2026-10-16 against `cli/src/content.ts`, `cli/src/addresses.ts`, `cli/src/emit.ts`, `cli/src/build.ts` and `cli/test/routes.test.ts` ("links to declared routes").

| Statement | Status | Evidence |
|---|---|---|
| R-30 Markdown | Matches | a link with query and fragment to `/orders/42?tab=open#top` is written `/docs/orders/42/?tab=open#top` under base and policy; `/nowhere` is `link-broken` at its line; an address a route's Schema refuses (`/orders/x` for a number) leads nowhere |
| R-30 Template | Matches, with a scope note | a literal `href` on `a`/`link` is checked against pages, routes and `public/`, with file, line and column. Built-in layouts' links are not checked (they are the framework's); `image src` is still checked for existence only by Markdown, not in templates |
| R-31 Fragments | Matches | accepted unchecked on a route link; still checked on a page link |
| R-32 Sitemap | Matches | the sitemap lists exactly the pathnames the build writes (`/orders/1`, `/orders/2`, `/settings`), not `/orders/3` |

**Differences from the note**
- The build, `check`, `dev` and `info` now load the definition *before* reading the content, because a link can lead to a route. When the definition cannot be loaded, the content is read with the routes "unknown" and a link that leads nowhere is not reported (the definition's own mistake is). `vlx dev` reads the content again when `src/main.ts` changes, for the same reason.
- A Markdown link to a page may now carry a query (`/guide/a?x=1`); it was `link-broken` before and is kept as written now.

### Implementation status, slice 6b

Checked 2026-10-16 against `common/src/{routing-engine,routing-types,server,client}.ts`, `cli/src/{build,dev,emit,config,info}.ts` and `cli/test/routes.test.ts` ("client delivery").

| Statement | Status | Evidence |
|---|---|---|
| R-33 Shell | Matches | the build writes `__app-shell.html` (an empty `#app`, boot data `{"shell":true}`, script, stylesheets) and no page for a client route; Chromium is answered with it for `/orders/77` |
| R-34 Draws | Matches | the browser test: parameter, query (`?tab=open`), a trailing slash (moved to the policy's form), title set; a link to a static page changes the page in place |
| R-35 `_redirects` | Matches | `/docs/orders/:id  /docs/__app-shell.html  200` under a base; a rest segment `*name` is written `*`; none when no client route exists; a project's own `public/_redirects` is kept |
| R-36 No static pages | Matches | `staticParams` with `delivery: "client"` is `entry-definition`; no `route-static-params`; `vlx info` says "answered by the app shell" |
| R-37 `rendering: "client"` | Matches, with two choices | `pages: []`, the shell, `/*  /__app-shell.html  200`, `404.html`, no sitemap (there is no page to list); links still checked. `404.html` is the rendered not-found page, as in static mode, not the shell |
| R-38 Dev | Matches | `vlx dev` answers a client route (or every address, under `rendering: "client"`) with the shell and a static route with its page |

**Differences from the note**
- The shell carries the site's name as `<title>` and no canonical link: it is the same bytes for every address, so anything about the page would be wrong for most. The page sets the title when it starts. (The note said only "empty `#app`".)
- A client route's `_redirects` line is written from its pattern, so a route that a content page's address also matches is caught by R-4 as before; two client routes with overlapping patterns keep the router's ranking in the page but the host's first-match order in `_redirects` (both lead to the same shell, so the order does not change the result).
- Not exercised: Cloudflare Pages' and Netlify's own reading of the file (the test's host implements the documented `:name` and `*`).

### Implementation status, slice 6g

Checked 2026-10-16 against `common/src/{routing-engine,routing-types,app}.ts`, `cli/src/{screens,compile,info}.ts`, `common/test/routing.test.ts` ("nested routes") and `cli/test/nested.test.ts`.

| Statement | Status | Evidence |
|---|---|---|
| R-39 `children` | Matches, with additions | dotted leaf (`shop.orders.one`), patterns appended, params and query of every level reach every `enter` and `title` as one input, a Schema at a level still refuses (`/orders/x`); a name shared by two levels is an error naming both routes. **Added refusals:** a dotted key, a rest segment above a child, a level whose Schema cannot be merged (give each as `Schema.Struct`) |
| R-40 `index` | Matches | `/account` draws the shell with the index in its slot (Chromium and the built page); `index` without `children` is an error |
| R-41 Outlet | Matches | `<mesh-slot />` is the outlet; a parent screen without one is `outlet-missing` naming the route and the template file. Checked only when some child or index of the route is drawn by the target |
| R-42 Order | Matches | `enter` outermost first on the same state (`shop, orders, one`); deepest title (`Keys · Test`), the nearest above when a level gives none; `delivery` inherited |
| R-43 Static pages | Matches | pages of the leaves and of a parent with an `index` (`/account`), none for a parent without (`/account/security`); `staticParams` on a parent with children is refused |
| R-44 Reactivity | **Differs in the shape of `at`; matches in effect** | see below |
| R-45 No tree walk | Matches | the unit test hides `children` behind a counting getter: the tree is read while flattening and never again by 50 entries, matches and titles, and each of the three levels' `enter` runs once per entry |

**Differences from the note**
- **`at` has a field per level, not per route that has children.** `at.l0`, `at.l1`, `at.l2` (as many as the tree is deep) hold the key shown at that level (`""` when the route is shallower). The note's own examples already read `at.l0`/`at.l1`; a field per parent would have needed a name per parent. A condition reads only its level, which is what R-44 asked. `at` exists only when some route has children, and a state field called `at` is then refused.
- **What was observed, and what was not.** Going between siblings changes `route`, `page`, `trail`, `cursor` and only the levels that differ in `at` (`l1`, `l2`; not `l0`) and no other state field (tested at the engine). In Chromium, across three levels, the shell, its menu and the root element are the same elements afterwards, with **no mutation recorded** on the menu's subtree, the shell's attributes or the root's children; the middle level (`security`) is kept while its child changes. The generated text is one equality per case, each on its own `at.lN`, with no `||` and no `route ==` (tested on the expanded layout). **Not measured:** that MESH skips re-evaluating the conditions above the change. That follows from MESH's read-set rule, which this test cannot observe from outside the runtime (an unchanged condition re-evaluated would change no DOM). If it is wanted as evidence, it needs a counter in the MESH runtime.
- **A parent with no screen** draws its children where it would be (nothing in the note); a child with no screen draws nothing in the slot.
- **A parametric parent with an `index`** cannot be built statically (R-43 forbids `staticParams` on it): it is `route-static-params`, and the answer is `delivery: "client"`. The message now says so.
- **Types.** At run time a child's `enter` and `title` receive every level's parameters and query. Their TypeScript type is the child's own `P & Q`, so a child cannot name a parent's parameter without a cast. Merging the types across `children` is possible and not done.
- **Not exercised:** a project of two targets with nested routes, and the Desktop target (a parent screen listed for one target and drawn on another is not caught, as in 6d). `vlx dev` was not driven with a nested route.

## Slices 6e and 6f: design (2026-10-16, before the implementation)

Written before the code, like the others. Statements continue as R-50 to R-69. What the router (`@valancex/router`) already does is not redone: `decide`, `redirectTo`, `mayLeave` and the `"close"` kind exist there and are tested; 6f gives them to a declared route and calls them from the application's navigation commands.

### 6e: `load`

```ts
order: route("/orders/:id", {
  params: Schema.Struct({ id: Schema.String }),
  load: {
    begin: ({ id }, state) => ({ ...state, order: { status: "loading", id } }),
    work: ({ id }, signal) => fetch(`/api/orders/${id}`, { signal }).then((r) => r.json()),
    settle: (outcome, { id }, state) => ({ ...state, order: outcome.ok ? { status: "ready", id, data: outcome.value } : { status: "failed", id } }),
  },
})
```

- **R-50 `load` is a waiting command the route owns.** `work(input, signal)` is a Promise or an Effect, `settle(outcome, input, state)` returns the state, exactly as `command.waiting` (success and failure are both state); `input` is the merged parameters and query. There is no `wanted`: the framework supplies it (R-53).
- **R-51 `begin` is pure and part of the entry.** It runs inside `arrive`, after the levels' `enter`s, so every way of entering a route, **including the first state of a request and the page a build writes**, shows the loading state. Nothing on the server waits, and no `work` runs there.
- **R-52 `work` runs where there is a running application.** After `go`, `back` or `forward` commits an entry, and once when the application starts on a route (a hydrated page, the app shell, a window). The loads of a nested route's levels run together.
- **R-53 Relevance is the address.** A result is committed only if the application is still at the address that was entered. A newer entry of the same route supersedes an older run (the rule of `waiting`).
- **R-54 A failure is state.** A rejection, a failed Effect or a throw in `work` reaches `settle` as `{ ok: false, error }`; nothing reaches the page as an exception.
- **R-55 Entering is not reloading.** A move to the address already shown is not an entry (R-9), so it does not load again; Back to a route is an entry and does.
- **R-56 Cost.** A project with no `load` has the commands it had (`go`, `back`, `forward` stay plain transitions unless a `guard` or a route guard exists).

Not in 6e: caching, invalidation, preloading on hover or the data sharing between levels. A layout reads the state `begin` and `settle` set, like any other.

### 6f: guards, redirects and leaving the page

```ts
account: route("/account", {
  canActivate: ({ state }) => (state.signedIn ? true : redirect("login")),
  canDeactivate: ({ state }) => !state.dirty,
}),
old: route("/old", { redirectTo: redirect("account") }),
```

- **R-60 The router's guards, on a declared route.** `canActivate`, `canDeactivate` and `redirectTo` are the router's: same context (`from`, `to` as `{ name, params, query }` decoded, `state`, `kind`, `data`), same answers (`true`, `false`, `redirect(route, params, query)`; plain, a Promise or an Effect; a guard that fails or throws refuses). `redirect` is exported from `@valancex/common`.
- **R-61 Where they are asked.** In `go`, `back` and `forward`, **after** the application-wide `guard` (R-18, unchanged): the route being left first (when the route or its parameters change, not for a query alone), then the route being entered; a redirect restarts the entering side at its target, at most eight times; a refusal changes nothing. An answer naming a route is turned into its address.
- **R-62 Levels.** A parent's `canActivate` is asked when the move enters the parent (from outside it or with other parameters of its own), not when it moves between its children; its `canDeactivate` when the move leaves it. Entering asks outermost first, leaving innermost first; the first refusal or redirect decides.
- **R-63 `redirectTo` makes an alias.** An address of the route is the target's: `go("/old")` lands on the target and the entry records the target's address; the first state for `/old` is the target's. A redirecting route has **no page** and is never "missing `staticParams`". The build writes `from  target  301` for it in `_redirects` (parameters of its pattern become `:name`/`*`), and `vlx dev` answers it with a 302. A target that is not a declared route is the router's error.
- **R-64 `beforeunload`.** When any route has a `canDeactivate`, the web page asks, as the router's `"close"` kind, the guards of the route shown (innermost first); an answer of `false` makes the browser ask the person before the page closes. A browser cannot wait, so **only an answer given at once counts** (a plain value, or an Effect that finishes without waiting); a Promise answer is ignored on close and said so in the guard's documentation. The Desktop asks the same through `mayClose` and may wait.
- **R-65 `vlx info`** says which routes have a `load`, guards or a redirect.
- **R-66 Cost.** A project that declares none of these has the commands and the page it had.

### Acceptance

| Test | Statement |
|---|---|
| `begin` is in the built page and the first state; `work` runs after `go`, Back and on start; `settle` commits success and failure; a result after leaving is dropped; the same address does not reload; a route with no load unchanged | R-50 to R-56 |
| Browser: a client route loads on first draw and on a link, shows loading then ready, then failed when the request fails | R-52, R-54 |
| `canActivate` false/true/redirect, `canDeactivate` stopping a move, a query-only move not asking it, the application guard first, async and failing guards | R-60, R-61 |
| Nested: a move between siblings asks neither parent; entering and leaving the parent ask it; order of asking | R-62 |
| `redirectTo`: `go` lands on the target, the first state is the target's, no page, `_redirects` 301 line, dev 302 | R-63 |
| `beforeunload` listener asks a sync `false` and stops the unload; a Promise is ignored; none registered without a `canDeactivate`; `mayClose` on the desktop | R-64 |
| `vlx info` lists them; a project without them unchanged | R-65, R-66 |
