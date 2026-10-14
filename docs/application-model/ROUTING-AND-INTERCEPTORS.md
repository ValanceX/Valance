# Investigation: route titles, interceptors, programmatic navigation and route parameters

Four questions, answered from the code and from probes run in a real browser against a built application (2026-10-14). The probes are listed with what they showed. Where a statement is general knowledge about other frameworks and not about this code it is marked **(general)**. The only changes are this file and one test file that records the interceptor evidence (`packages/common/test/http-interceptors.test.ts`). Recommendations are marked **Proposal**; decisions are at the end.

## The short answers

| Question | At the engine (`@valancex/valance`) | In the `vlx` application model | Verdict |
|---|---|---|---|
| **Title strategies by route** | Yes, by construction: `titleOf(state)` and `head(state)` are functions of any state, so any route-to-title rule is expressible | Partly: a page's front-matter title, the project's format, and `defineApp({ title })` from state. No per-route rule, because there are no routes beyond content pages | Supportable today for content; needs a route concept for the rest |
| **Interceptors** | None; the engine has no HTTP | `Http` has no hook, and `defineApp` cannot install one (it cannot install any platform). But the web client already sends through a swappable `fetch`, and interceptors compose over it today (tested) | Small to add; the work is the shape, the install point and the origin guard |
| **Programmatic navigation** | Yes: any state change that changes `urlOf` is a navigation; Back works. **No replace, no `back()`, no guard** | Yes from a template (`go("/x")`) and from a command (set `page`). **Bug found:** `go` does not normalize, so `go("/guide/a/")` shows "Not found" for a page that exists | Works; four gaps, one of them a bug |
| **Path and query params** | Supported: `urlOf` returns "path and query" and `stateOf` receives the whole `URL` | **Not supported.** Routes are the content files; the query is invisible to the application and is dropped on the first navigation; an internal link with a query is a build error | The largest gap, and the one the other three depend on |

The common thread: the engine lets an application own its URL space completely; the `vlx` model fixed that space to "one route per Markdown file". Titles per route, parameters and richer navigation all become one decision: **should the model have application-declared routes?** The rest follows from that.

## What was run

An application built by `vlx build`, with probe buttons `on.click={go("…")}` in its layout, in Chromium:

| # | Probe | Result |
|---|---|---|
| 1 | Load `/guide/getting-started?x=1&y=two#run-it` | Page and title right; the URL keeps its query and hash |
| 1b | Then click an in-app link | URL becomes `/guide/writing-pages`: **the query is gone** |
| 1c | Then Back | Returns to `/guide/getting-started?x=1&y=two#run-it`: **the browser restores it; the application never knew it** |
| 2 | Button `go("/guide/writing-pages")` | Navigates, title follows, **one history entry added**; Back returns |
| 2c | `go` to the page already shown | Nothing added |
| 3 | `go("/nowhere")` | URL `/nowhere`, the author's not-found page, title "Not found · demo". A reload gets the host's 404 |
| 3b | `go("/guide/writing-pages/")` (trailing slash) | **"Not found"** though the page exists, and the address bar looks right |
| 3c | `go("guide/writing-pages")` (no leading slash) | **"Not found"** the same way |
| 4 | Markdown link `[x](/guide/getting-started?x=1)` | **Build error** `link-broken: leads to no page` |
| 5 | Markdown link `[x](/guide/getting-started#run-it)` | Works; the fragment survives and is checked against the target's headings |

Also read, not run: `valance/src` has no `replaceState` (every application navigation is a `pushState`), and `packages/valance/test/history.test.ts` pins the opposite of what an application with parameters wants: "a query is ignored by stateOf, so `?x=1` is noncanonical" (a URL the application did not write is left alone, never reconciled).

## 1. Title strategies by route

### What exists

- **Any route-to-title rule is already expressible at the engine**: `titleOf(state)` and `head(state)` run for the first state and every later one (Back and Forward included), on the server for the state it renders. A title strategy is a function of state, and the route is part of the state.
- **In the model**: the layers today are (1) the page's front-matter `title` (else its first heading); (2) the project's `title` format in `valance.json` (`{page} · {site}`); (3) `defineApp({ title: (state, page) => { page?, app?, status? } })`; (4) cleaning (plain text, no direction overrides, 200 characters). Layer 3 is a strategy over *state*, with the page's own title passed in.

### What is missing

- **Routes with data.** With only content pages, "the title for this route" is the page's. For `/inbox/42` the title depends on the message loaded for `42`: a route needs a title *rule* that sees its parameters and, when the title waits on data, a way to say "not yet". Today that is `status: "Loading…"` plus the state's own fields, and it works only because everything is state.
- **Inheritance and defaults** (a section prefix, "Settings · {page}") are expressible with the format and the function but not declaratively per route.
- **(general)** Angular's `TitleStrategy` takes the matched route snapshot and decides the title, with the default strategy using the route's `title`; the point of the abstraction is that a *route* declares its title and one *strategy* composes it. The same split fits here.

### Proposal

1. Keep the three layers and add a fourth that wins over the page title: a route's own `title` (a string, or `(match) => string | TitleParts`), once routes can be declared (§4).
2. Keep the project format as the one *strategy*; allow `defineApp({ titleStrategy: (parts, match) => string })` to replace the composition, not the parts, for the rare site that needs it.
3. The title is always a projection of state, resolved after the route's data is in state; until then the route supplies `status`. No route-specific title API at the engine.

Size: small once §4 exists; nothing to build before it.

## 2. Interceptors

### What exists

- **No HTTP in the engine, by design**; `@valancex/common/http` is the contract and the web client (this cycle). It builds the request from the spec, checks the path, sends through `fetch`, and checks status, content type, size and the Schema.
- **`fetch` is already a parameter** of the web client (`webHttp({ fetch })`). An interceptor is a function over the transport, `(next) => (input, init) => …`, and these compose today. `http-interceptors.test.ts` shows four: a **bearer token added only to the API's origin**; a **401 refresh that runs once** when three requests fail together and retries each once; a **retry of GET on 5xx** that never retries an unsafe method; and the client's own path check running **before** any interceptor, so a path cannot send a request elsewhere.
- **There is nowhere for an application to put one.** `defineApp` takes no platform; the generated client builds `webPlatform({ base })` and nothing else. So an interceptor cannot be installed, and neither can a test double.

### What interception must be careful about

| Concern | Why | Rule |
|---|---|---|
| **A credential following a request** | An interceptor that adds `Authorization` to every request sends it to whatever origin a request names | The credential helper checks the request's origin against the API's before adding; the client re-checks the final origin after the chain and fails the request (`Unsafe`) if it left the allowed set |
| **Secrets in logs and errors** | An interceptor sees headers and bodies | A failure from an interceptor is normalized to the same `HttpError` kinds, which carry no header, address or body; a logging interceptor gets a redacting helper |
| **Retry safety** | A retried POST is a second order | Retry helpers are GET-only by default; anything else must opt in and be idempotent (an idempotency key) |
| **Refresh storms** | Several requests see 401 together | Single-flight refresh, tested above |
| **Order** | Request side runs outer to inner, response side inner to outer | Documented; `[auth, retry]` is not `[retry, auth]` (retry the authorized request) |
| **Cancellation** | The application ending must stop a request mid-chain | The chain is in the Effect, so interruption reaches it |
| **SSR and build** | No page, no cookies, no `window` | The server gets no `Http` capability today; an interceptor that needs `window` must not be loaded there |

### Proposal

1. **A typed shape over the raw transport**, not over `fetch`'s overloads: `Transport = (request: { method, url, headers, body }) => Effect<{ status, headers, text }, HttpError>` and `Interceptor = (next: Transport) => Transport`. Interceptors then see the request after the client built and validated it, and the response before the client decodes it, which is exactly where auth, retry, tracing and error mapping belong, and nothing can skip the Schema.
2. **An install point**: `defineApp({ http: { interceptors: [bearer(...), refreshOn401(...), retryGet(2)] } })` for the web page (the key is ignored on the server), and, separately, `defineApp({ platform })` so tests and other targets can supply their own `Http` (desktop and mobile implement the same capability natively; an interceptor chain is a web-client concern).
3. **Ship the four helpers above** in `@valancex/common/http` with the origin guard built in, since a hand-written interceptor is where a credential leaks.
4. **Navigation interceptors are the same idea at a different seam**; they are §3's guard.

Size: medium. The mechanism exists; the work is the shape, the install point, the guard and the helpers.

## 3. Programmatic navigation

### What works

- **From a template**: `on.click={go("/guide/writing-pages")}` (probe 2). `go` is the framework's command and is in every layout's manifest.
- **From a command**: `page` is part of the typed state (`PageState`), so a transition may set it; the same state change is a navigation. A command that waits can do it when its work settles (after a login), because the navigation is only "the state's URL changed".
- **The browser's history behaves**: one entry per distinct URL, none for the page already shown, Back and Forward re-enter through the same command, the title follows.

### Gaps

1. **`go` does not normalize** (probes 3b, 3c): it stores the string it is given, while a URL read from the address bar is normalized. `go("/guide/a/")` and `go("guide/a")` show "Not found" for a page that exists. This is a bug; the fix is one line (normalize in `go`).
2. **No replace.** Every application navigation is a `pushState`. The cases that need `replaceState`: a redirect (the entry being left must not stay in Back), a canonicalization, and, most of all, **query-driven state such as a search box**, where pushing an entry per keystroke ruins Back. This is the gap that makes query parameters usable or not.
3. **No `back()`, `forward()` or history length.** A "Back" button or "close this dialog and return" has no way to ask. On the web it is `history.back()`; on a mobile stack it is a pop, so it belongs behind a capability the platform supplies (the same shape as `Http` and the window capability).
4. **No guard.** Nothing can refuse or redirect a navigation (unsaved changes, a signed-out user). Today the only interception point is the command `go` itself, which the application cannot replace (it is a reserved name).
5. **Not found is a page, not a status.** Client-side `go("/nowhere")` shows the not-found content with a 200; only a reload of that URL gets the host's 404. Acceptable for an app, wrong for content; the table of `known()` already exists to decide.
6. **Scroll and focus after a programmatic change**: link clicks reset the scroll and, since this cycle, announce and focus; a navigation from a command does the same only through `onNavigated`, which is called for link clicks and Back/Forward, not for it.

### Proposal

1. Fix `go` now (normalize). Reject a destination that is not a declared route in development with the not-found page *and* a console warning naming it.
2. **Replace as a property of the transition, not of the state.** `HistoryOptions.modeOf?: (previous, next) => "push" | "replace"` (default `push`), so an application says "only the query changed: replace". Declared routes (§4) can set it per route (`replaceQuery: true`).
3. **A `Navigation` capability**: `back()`, `forward()`, `canGoBack`, with the web implementation on `history` and room for a native stack; commands use it from `command.waiting` like `Http`.
4. **A `beforeNavigate(state, destination) → destination | "cancel" | redirect` hook** in `defineApp`, run in the follower before the URL is written (the same place `modeOf` sits), so a guard cannot be bypassed by a link, a command or Back.
5. Call `onNavigated` for every navigation and give it the cause, so scroll and focus are one policy.

Size: small for 1, medium for 2 to 5 together; 2 is the one to do first because §4 needs it.

## 4. Path and query parameters

### What exists, and the exact limit

- **The engine supports them.** `urlOf(state)` returns "path and query", `stateOf(url)` receives the whole `URL`, and the application owns the mapping. An application written directly on `Valance.define` and `Web.run` can have `/inbox/42?tab=unread`.
- **The `vlx` model does not.** Its route table is derived from the content (`routes.ts`): `stateOf` returns `{ id: normalize(url.pathname) }` and nothing else; `urlOf` returns the page's path. So: no path params (every route is a file), no query (probes 1b and 1c: it is dropped on the first navigation and restored by Back without the application's knowledge), and an internal link with a query is a build error (probe 4). Nothing in `examples/` maps a query to state.
- **A static site cannot answer a path it did not write.** `/inbox/42` has no file. Hosts have two answers: a rewrite to the app shell (`/* /index.html 200`) or the 404 page, and the second keeps a 404 status that is wrong for an application. `vlx build` writes `404.html` as the author's not-found page and `_headers`; it writes no rewrite rule.
- **Query is client-only at build time**: static export cannot know it, so the server renders the default and the browser must apply the query after it starts (the same shape as `viewport`).

### Design questions

| Question | Options | Lean |
|---|---|---|
| Where are routes declared? | (a) Markdown files only (today). (b) File names with params: `content/inbox/[id].md`. (c) Declared in `defineApp`: `routes: { inbox: route("/inbox/:id", …) }` | (c). A parameter is not content; (b) puts the application's structure in file names and cannot say what the parameter is |
| How are parameters typed? | Strings by hand; or Effect Schema on `params` and `query`, decoded from the URL and *encoded back*, so `urlOf` and `stateOf` are one declaration | Schema, symmetric. Same tool as state and props |
| How do they reach a template? | A union of per-route types (MESH has none); or the route's `enter` command copies decoded values into ordinary state fields the layout already reads | The command. MESH scope stays flat and typed; a route is "these params become this state" |
| Static or client? | Enumerate (`staticParams: () => ids`) and render each, or client-only with a shell rewrite | Both, per route: `delivery: "static"` with an enumerator, or `"client"` (the build writes the rewrite rule beside `_headers`) |
| Query and history | Push per change, or replace | Replace for query-only changes, by default (§3) |
| Canonical URL and sharing | The query in the canonical link or not | Not, unless the route says; `Referrer-Policy` already trims it |

### Security of parameters

They are untrusted input in every position:

- **Decode with the Schema**; reject, do not coerce, what does not decode, and bound lengths. Never merge a query into an object by key (prototype pollution): read it with `URLSearchParams` into a fixed Schema.
- **Text is text**: a parameter shown on the page is escaped like any value; one used in a title is cleaned like any title (this cycle's boundary); one used as an `href` is refused by PORT when it carries a script scheme.
- **A parameter in an API path must be encoded**: a template helper (`path\`/items/${id}\``) that percent-encodes each hole, so `../` or `%2f` cannot climb the API; `Http` already refuses `..`, but encoding is the right place.
- **Open redirects**: a `?next=/somewhere` used by `go` must be a same-origin path the application declares; anything else is dropped. `beforeNavigate` is where it is checked.
- **Privacy**: a query ends up in history, logs and the `Referer` of an outgoing request; keep identifiers and tokens out of it (a token in a URL is the worst place for one), and the default `Referrer-Policy` already stops it leaving the origin.

### Proposal

1. A **`route(pattern, { params?, query?, title?, enter?, delivery?, replaceQuery? })`** in `@valancex/common`, collected by `defineApp({ routes })`, each declaration giving `urlOf` and `stateOf` for that route from its Schemas. Content pages remain a route kind of their own, so a project with none declared behaves exactly as today.
2. `enter` is an ordinary command: the route's params and query arrive as its input, validated by the Schema, and it sets state (including `page`, so a layout chooses the screen with `{#if page == "inbox"}` or by `routeName`).
3. A reserved scope name for the matched route's name, and the title and replace rules from §1 and §3 read from the declaration.
4. `vlx build` writes a rewrite rule beside `_headers` for `client` routes, and `vlx check` verifies that every internal link names a declared route (with its params) instead of failing on a query.
5. The `go` command takes a route name and params: `go("inbox", { id: 42 })` builds the URL from the declaration, so no application builds a URL by string concatenation.

Size: large. It is the one feature in this document that is a new concept, and §1's route titles, §3's replace and guards, and the template's `go("…")` all attach to it.

## Order

| # | Work | Size | Depends on |
|---|---|---|---|
| 1 | Normalize in `go` (the bug); warn on an unknown destination in development | small | none |
| 2 | `modeOf` (push or replace) at the engine; `onNavigated` for every navigation | small | none |
| 3 | `beforeNavigate` guard | small | 2 |
| 4 | `Navigation` capability (`back`, `forward`, `canGoBack`) | small | none |
| 5 | `defineApp({ platform })`; `Transport` and `Interceptor` types; `http.interceptors`; bearer, refresh, retry helpers with the origin guard | medium | none |
| 6 | `route(...)`, `defineApp({ routes })`, Schema'd params and query, `enter`, the reserved route name | large | 1 to 3 |
| 7 | Route titles and `titleStrategy` | small | 6 |
| 8 | Client-route rewrite rule from `vlx build`; link checking against declared routes | medium | 6 |
| 9 | Encoded path helper for `Http` | small | none |

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| R1 | Declare routes in `defineApp` (Schema'd params and query), keeping content pages as they are | Yes |
| R2 | Replace is chosen by the transition (`modeOf`, or `replaceQuery` per route), default push, replace for query-only changes | Yes |
| R3 | Add a `beforeNavigate` guard and a `Navigation` capability | Yes |
| R4 | Fix `go` normalization now, as a bug, outside the release's feature scope | Yes |
| I1 | Interceptors over a typed `Transport` (after the request is validated, before the response is decoded), installed by `defineApp({ http })` | Yes |
| I2 | Let `defineApp` take a `platform` (tests, other targets) | Yes |
| T1 | Route titles via the route declaration plus one `titleStrategy` | Yes, after R1 |

## Outcome: router (0.12.0)

Built: `@valancex/router` (route definitions, Schema'd params and query, `canMatch`/`canActivate`/`canDeactivate`/`beforeEach`, redirects by route name, `safeNext`, per-route titles, `go`/`replace`/`navigate`), plus the engine seams `RouteTable.modeOf` and `RouteTable.guard` with position tracking and undo via `history.go`.

Deferred: CLI `defineApp({ routes })` integration; the `go` normalization bug in the CLI framework `go`; a `Navigation` capability for back/forward; typed `Transport` interceptors and `defineApp({ platform })`; a `beforeunload` guard; nested routes.

## Outcome: interceptors (0.12.0)

Built in `@valancex/common/http` (decision I1, shape as proposed):

- **One shape.** `Transport = (TransportRequest) => Effect<TransportResponse, HttpError>` and `Interceptor = (next: Transport) => Transport`. Every interceptor has the same input and output, so they chain by composition (`chain(a, b)`, first outermost) and differ only in what they do. `only(applies, interceptor)` narrows one by anything the request says.
- **Where they sit.** After the client has checked the request (path, method, body) and before it judges and decodes the answer (status, content type, Schema); so none can skip those. The final address is checked again as the wire gets it: an interceptor that moves a request outside the API's origin gets `Unsafe`.
- **Three scopes**, outermost first: the application (`defineApp({ http: { interceptors } })`), a piece of work (`withInterceptors(effect, ...)`, a fiber-scoped addition that nests and ends with the effect), and one request (`RequestSpec.interceptors`).
- **Helpers with the origin guard built in:** `bearer`, `refreshOn401` (one refresh for any number of simultaneous 401s), `retryGet` (never an unsafe method).

Still deferred: `defineApp({ platform })` (tests and other targets supplying their own `Http`), and interceptors for non-web transports.
