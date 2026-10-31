# Investigation: platforms, backends and titles

Three questions, answered from this checkout and the sibling repositories (Mesh, Nexus, Port), 2026-10-14. Where a claim was **run**, it says so and the probe is described. Where it comes from general platform knowledge and not from this code, it is marked **verify** and should be checked before anything is built on it. Nothing was changed except this file. Recommendations are marked **Proposal**; the decisions they need are at the end.

## Where things stand

| Fact | Evidence |
|---|---|
| **One target exists: the web.** `vlx init` has one target (`web`); PORT has one package (`@valancex/port-web`). | `packages/cli/src/targets.ts`; `Port/README.md` ("deliberately no shared `@valancex/port` package") |
| **The seam for others is stated and never used.** `Target`/`TargetFactory` is "the stated seam for any PORT, but no other PORT (native, canvas, terminal) has used it." | `docs/explanation/findings.md:91` |
| **PORT refuses to design ahead of evidence.** "The roadmap deliberately generalizes from evidence gathered from the Web implementation rather than speculative abstractions for native, Canvas, GPU, or other targets", and "no universal renderer interface". | `Port/docs/explanation/roadmap.md` §2.8 |
| **The language is portable, the vocabulary is not.** MESH's render tree is `{ component name, props (plain values), events (opaque handler ids), keys }`; "MESH has no Valance-wide primitive set: each application's manifest declares its own". The tag table in `@valancex/common` (`div`, `nav`, `para`, `link`, `button`…) is the web's, and says so. | `Mesh/schemas/render-v1.schema.json`; `packages/common/src/primitives.ts`; `Port/packages/port-web/src/primitives.ts` |
| **Application behavior never names a platform.** NEXUS forbids `isMobile`-style branching; it may only branch on whether a *capability* resolved. | `Nexus/docs/reference/primitives/capability.md` |

## 1. Template manipulation across web, mobile and desktop

### What "manipulation" has to cover

Template manipulation is five different jobs. Which platform needs which differs a lot:

| Job | Web | Desktop | Mobile | Today |
|---|---|---|---|---|
| **A. Vocabulary**: which tags exist and what each becomes | HTML elements | HTML in a webview, or native widgets | native widgets (or HTML in a webview) | one table, web only (`primitives.ts`) |
| **B. Styling hooks**: how a part says how it looks | `class`, `data-theme`, a global CSS file | same (webview) or toolkit styles | toolkit style props / tokens; no CSS | `class`/`theme` attributes in the tag table; every `src/**/*.css` loaded |
| **C. Events**: what a user can do | `click` (only; PORT has no key event, F31 in `examples/docs-verifier/docs/FINDINGS.md`) | click, keys, menu items, shortcuts | press, long-press, gestures, back | one `click` event in the table; the payload hook is typed on the DOM `Event` |
| **D. Structure and navigation**: where a screen goes | URL, history entries | URL or windows and menus | stack and tab navigation, system back, deep links | `Web.history` (`urlOf`/`stateOf`/`navigate`); the application owns navigation, VALANCE has no router |
| **E. Adaptation**: the same app on different sizes and inputs | breakpoints, pointer vs touch | window resize, density | safe areas, orientation, text size | nothing; one root `layout` |

Jobs A and C are PORT's by the architecture; B and D are the open ones; E is the one an application author will meet first, on the web already.

### What the code already gives

- **Slots, blocks, props, events and typed contracts are portable.** They are MESH and Effect Schema, with no web in them. A component written against a target's own vocabulary composes the same way on any target (verified through the CLI this cycle: default and named slots, `mesh-fill`, `{#if}`/`{#each}`).
- **A per-target manifest comes for free.** `manifest({ primitives, scopes, commands })` derives what a template may use from the target's tag table, so a template that uses a tag the target does not have is already a compile error that names it ("a tag that is not here is a compile error that names it", `primitives.ts`). Checking a template against a second target is a second manifest, not new machinery.
- **Adaptive views exist at the VALANCE level.** `Valance.define({ views, view: (state) => name })` already chooses a view from state. The CLI application model hides that behind a single `layout`; a `layouts` choice by state value (`compact`, `wide`) is the same mechanism, driven by a viewport or form-factor value, with no platform name anywhere.
- **`override`** replaces a built-in component by file name. That is the only per-target-shaped mechanism today, and it is per application, not per target.

### What would break first

1. **The built-in views and the scaffold are web-flavored.** `views/*.mprx` and the scaffolded `layout.mprx` use `shell`, `h1`, `pre`, `code`, `aside`, `main id tabindex`, `class`, `theme`. A second target with a different vocabulary rejects them at compile time (good, the failure is loud), but every one of them would need a counterpart.
2. **`@valancex/cli` compiles exactly one program** (`compile.ts` takes one tag table, one root). Two targets means N programs, N manifests and N client bundles, and the generated entries (`.valance/client.ts`) are web entries.
3. **A web-shaped `Web.history`.** URL and history entries are the only navigation model with code behind them. Mobile stack navigation and system back are not URLs; deep links are, which is the one overlap.
4. **No second target has ever run**, so nothing says which parts of `@valancex/common` (content model, scope, state, commands) are target-neutral and which are not. They look neutral; that is a claim, not a measurement.

### Options

| Option | Idea | For | Against |
|---|---|---|---|
| **1. A semantic vocabulary in `@valancex/common`** | A small cross-platform tag set (page, section, heading level, text, link, button, list, image, input); each target maps it | One template for all targets; the existing table is already mostly semantic (`para`, `quote`, `list`, `item`, `link`, `button`) | PORT's invariant 2.8 (no premature universal interface); web leaks in (`pre`, `aside`, `tabindex`, `class`); a lowest common denominator is a known failure; designed without a second target |
| **2. Per-target templates** | `layout.web.mprx`, `layout.native.mprx`; the build picks by target | Honest; no lowest common denominator; uses `override`-style resolution | Duplicates structure; two files drift; content-heavy apps pay most |
| **3. Semantic core plus per-target escape** | Option 1's small core, and a `*.<target>.mprx` file replaces a component for one target | The common case is one file; the exception is explicit and checked per target | Two mechanisms; the core still has to be designed |
| **4. Branch on the platform in the template** | `{#if platform == "ios"}` | Trivial | Rejected: NEXUS forbids platform branching; MESH has no platform value; it re-creates `isMobile` |
| **5. Webview shells first** | Desktop and mobile run PORT Web in a webview (Electron/Tauri/Capacitor-style); only the platform layer and window chrome differ | Reuses all of PORT Web, hydration and the tag table; the fastest honest route to two more platforms | It is a web app in a frame: no native widgets, and the app-store/review story is the shell's |

### Proposal

Do **not** design the universal vocabulary now; it would be designed from one data point. Build the evidence cheaply, in this order:

1. **Name the web parts as web.** In `@valancex/common`, make the tag table a *vocabulary owned by a target* (`targets.ts` gains a `vocabulary`), keep the content model, state, scope, commands and slots target-neutral, and keep `class`/`theme` as web style hooks. No behavior change; it makes the boundary visible and testable.
2. **Parameterize the build by vocabulary.** `compile.ts` takes the tag table and manifest it compiles against instead of importing one. One program per target.
3. **Prove the seam with a throwaway second target**: a plain-text or terminal PORT written in the test suite (a renderer of a few primitives to a string). It costs a day and answers the question this document cannot: which parts of the application model are not neutral. Findings go in `FINDINGS.md`, like F1–F31.
4. **Then decide between options 1/3 and 2 with that evidence**, and treat option 5 as the likely first real second and third platform (desktop, mobile), since it needs no new PORT.
5. **Adaptive layouts (job E) can ship independently**: a `layouts` choice by a state value, driven by an optional viewport capability. It is useful on the web alone, platform-free, and the part of the platform story an author meets first.

**Template tooling** (what manipulation means for `vlx`): `vlx check --target <t>` (compile against that target's manifest; report web-only constructs when targeting another), `vlx generate component` writing the component for the project's target(s), and the read-only `outline` already in `packages/cli/src/outline.ts` growing a `uses vocabulary X` report. Programmatic *rewriting* of templates (codemods for a tag rename when a vocabulary changes) stays deferred until a vocabulary actually changes.

## 2. Backend integration over HTTP, and its security

### What exists

- **No first-class HTTP anywhere, by design.** NEXUS is "no Node, DOM, filesystem, HTTP or process API in NEXUS" (`Nexus/docs/explanation/specs/2026-09-27-nexus-v0.6-outline.md` non-goals). The documented pattern is a typed **capability** the platform supplies (`QuoteService`, `docs/how-to/async-work.md`) and a command that waits (`command(state).waiting`, with `begin`/`work`/`wanted`/`settle`, cancellation by `AbortSignal`, and a stale-answer rule that is the application's state).
- **`examples/docs-site` does it by hand**: `fetch('/api/search?q=' + encodeURIComponent(query), { signal })` inside a function the platform provides; a Node server answers JSON (`serve.ts`: sets `content-type` only).
- **The CLI application model cannot inject a platform.** `client.ts` and `server.ts` run `Web.run(application(...), { container, present, state, plugins, shutdown })`: no `platform`. A `vlx` app's commands can call a global `fetch` inside `work`, but there is no declared place for a base URL, credentials, error mapping or a fake for tests. `defineApp({ commands })` documents only pure state transitions.
- **Delivery is static.** `vlx build` writes a site; there is no `vlx` server command, so server rendering and a BFF are out of the model ("No server rendering command, no `preview` command", CLI README).

### Security measures present, and what was run

| Measure | Where | Run |
|---|---|---|
| A URL attribute never holds `javascript:`/`vbscript:` or a navigable `data:` | PORT Web `realize.ts` (P1 fix, 0.4.1) | covered by PORT's tests |
| Head links with script URLs are refused (`invalid-head`), on server and browser | VALANCE §19 | covered by tests |
| Markup in a value is text; titles and metas are escaped by `renderHead` | PRINCIPLES §11 | **run**: a front-matter title `<img src=x onerror=alert(1)>` is written as `&lt;img src=x onerror=alert(1)&gt;` |
| Content links are `http`, `https`, `mailto` or internal; raw HTML and images with script URLs are build errors | `vlx check` (`content.ts`, `markdown.ts`) | **run**: `javascript:`, `JaVaScRiPt:` and `data:` links each give `link-scheme`; `<script>` gives `md-html`; `//host/x` gives `link-broken` |
| Boot JSON is escaped for `<`, U+2028, U+2029 | `server.ts` `safe()` | read |

### What is missing

1. **Content Security Policy is unusable out of the box, and nothing says why.** **Run**, in Chromium against a built `docs-app` served with each policy:

   | Policy | Result |
   |---|---|
   | none | hydrates (`data-valance="running"`) |
   | `default-src 'self'; script-src 'self'; style-src 'self'; …` | **fails** (`data-valance="failed"`; the server HTML stays, nothing is interactive) |
   | the same with `script-src 'self' 'wasm-unsafe-eval'` | hydrates |
   | the same, plus `style-src-attr 'none'` | hydrates (no inline style attributes are needed) |

   The MESH runtime is WebAssembly, so a strict policy needs `'wasm-unsafe-eval'` (no `'unsafe-inline'`, no `'unsafe-eval'`). Nothing in the README or the contract says so; an author who adds a strict CSP gets a silent failure. The inline boot JSON (`<script type="application/json">`) is not executed and is allowed; the module script is same-origin.
2. **No security headers anywhere.** The dev server and the docs-site server set only `content-type`. Static hosting is the author's, so the build should *emit* a recommended policy (`_headers`-style file and a documented CSP), not leave it to memory.
3. **No story for auth or CSRF**: where a session or token lives, how a command sends it, how a 401 becomes state. Application code would reach for `localStorage`, which a CSP does not protect from an XSS that gets past it.
4. **No dev proxy.** `vlx dev` serves the site; calling a backend on another origin hits CORS, and the author's answer is a wildcard CORS header on the backend. (Vite, which `vlx dev` uses, has a proxy option; it is not exposed in `valance.web.json`.)
5. **Responses are cast, not decoded.** `docs-site` does `(await response.json()) as ReadonlyArray<…>`. Every state field already has an Effect Schema; the response should be decoded with the same one, so a hostile or drifted backend becomes a typed failure and not a corrupt state.
6. **Secrets.** A static build cannot hold one. Vite exposes only prefixed variables, but nothing in the model says "never put a key in the client", and a platform capability that holds a token has no OS-keychain counterpart on desktop or mobile.
7. **One open finding is already on record**: P2, a failed `start` command's whole cause is logged unredacted (a bearer token in an error lands in the logs), kept as an open `it.fails` probe because changing a Stable surface is a minor release's decision (`examples/docs-verifier/docs/PRINCIPLES.md`).
8. **Small bug found while probing**: the `link-scheme` message cuts the address at the first `)` (`"javascript:alert(1" is not an address…`), because Markdown links do not nest parentheses; the diagnostic should quote the whole href.

### Proposal

Keep NEXUS and VALANCE free of HTTP (their rule), and put the contract where the architecture says it goes: a capability.

1. **An `Http` capability contract in `@valancex/common`** (the application-facing contract, not `fetch`): `request(spec)` where `spec` carries method, path, a request Schema, a response Schema and options; the result is a typed value or a typed failure (`Offline`, `Status(code, body)`, `Decode`, `Aborted`, `Timeout`). Commands use it from `command.waiting`'s `work` (a capability-requiring Effect is already allowed, VALANCE 0.8). The **web platform** implements it with `fetch`; **desktop and mobile** implement the same contract natively (keychain-backed token, platform TLS), which is exactly the NEXUS capability model, and the first concrete reason for a platform to differ.
2. **The web implementation's defaults are the secure ones**: same-origin base, `credentials: "same-origin"`, JSON in and out, the request's `AbortSignal` tied to the application's scope, a timeout, response decoded by Schema before it reaches state, no token in a URL, a `x-requested-with`-style header for CSRF on unsafe methods, and one place to refresh an expired session so concurrent commands share it.
3. **Let `defineApp` take a platform and a base**: `valance.web.json` gets `api: { base, proxy }` (the dev proxy), and the generated entry builds the web `Http` from it. Tests and `vlx dev` can swap a fake.
4. **Emit a security baseline from `vlx build`**: a `_headers`-style file and a documented CSP, `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self' <api base>; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`, plus `nosniff` and a referrer policy. The CSP table above is the evidence for the `wasm-unsafe-eval` line.
5. **Auth guidance, not a framework**: for the web, same-origin session cookies (`HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`) beat bearer tokens in storage; for desktop and mobile, a `SecureStore` capability (OS keychain) with an OIDC authorization-code-with-PKCE flow. Documented as a recipe with the failure states modeled in application state, like the loading and failure states in `async-work.md`.
6. **Fix P2 and the `link-scheme` message** when a minor is next opened.

Out of scope here, and named: data fetched at build time (a static build can read a backend, which changes the model of `vlx build`), a `vlx` server or BFF, and realtime transports.

## 3. Titles: window, tab and the rest

### What exists (web only)

- **The title is application state projected to the document head, outside the view.** `Web.history({ titleOf(state) })` sets it for the first state and every later one, Back and Forward included; the server writes the same for the state it rendered; hydration never touches the head (`V1_CONTRACT.md` §8). A full `head(state)` (`title`, `meta`, `links`) is the richer form and **wins over `titleOf`**; heads from plugins merge in order, **first title wins**; only elements VALANCE wrote (`data-valance-head`) are replaced (§19).
- **PORT Web's server entry refuses a `<title>` element**, as it refuses every element whose content is not nodes and text. The title is deliberately not part of a template.
- **In the CLI model** the title is `documentTitle(content, page)` (`packages/common/src/scope.ts`): `<page title> · <site name>`, or the site name alone when the page's title is the site's name, and a not-found variant. Front matter gives a page its title. The layout reads `title` (a page heading), but **an application cannot set the title from its own state**: no `defineApp` hook, nothing for "(3) Inbox", a loading state, or a per-component contribution.
- **Not covered**: favicon and `theme-color` per state, the web app manifest's name, `og:title` per page beyond the head merge, the Badging API, and announcing a page change to assistive technology. VALANCE says "Focus is not managed" and leaves it to `onNavigated`; a client-side page change that neither moves focus nor updates a live region fails WCAG 2.4.2/4.1.3 in spirit even when `document.title` is right.

### Run

A page whose title contains an HTML tag is escaped correctly (above). A title containing **U+202E (right-to-left override)** is written to the document **unchanged** (`<title>… ‮ evil · demo</title>`), so an author-controlled or user-controlled title can reorder what the reader sees in the tab, history and window list. Harmless for a static site's own content; a spoofing vector as soon as a title comes from user data (an email subject, a document name).

### What a "title" is on each platform

(From general platform knowledge, not this code: **verify** each before building.)

| Surface | Web | Desktop webview shell | Native desktop | Mobile |
|---|---|---|---|---|
| Tab / window label | `document.title` | the shell's window title, which may or may not follow `document.title` (Electron's follows it unless the page-title event is prevented; Tauri's is set by its own API) | window title via the toolkit | none; a task-switcher label (the app name; Android's task description) |
| Header inside the app | the page's heading | same | title bar or toolbar | navigation-bar title (large or inline), back-button label |
| History / recents | history entry title | same | recent documents, window menu | none |
| Status | badge count (Badging API on installed PWAs), favicon | dock/taskbar badge, overlay | same | app icon badge, notifications |
| Accessibility | page title announcement | window title | window title | screen title |

The point of the table: "the title" is not one string. It is at least a **screen/page title**, an **application name**, and a **status** (badge), and each target maps those to its own surfaces.

### Proposal

1. **A platform-neutral title projection**, `title(state) → { page, app?, status? }`, in `defineApp` (and `Valance`'s `titleOf` generalizing to it). The web target formats it (`"(3) Page · App"`: badge prefix, page, app, a separator from `valance.json`), a desktop shell sets the window title and badge, a mobile target sets the navigation title and app label. It stays a **projection of state, outside the template**, which is what PORT's refusal of `<title>` already says.
2. **Site-level format in `valance.json`** (`title: "{page} · {site}"`), with per-page front matter overriding the page part; the built-in `documentTitle` becomes the default of this.
3. **Plain text, bounded, de-spoofed.** Strip control characters and bidirectional override/isolate characters (U+202A–202E, U+2066–2069) from every title and meta at the head boundary (`renderHead`/`applyHead` and the title setter), collapse whitespace, cap the length. Do it once, in `@valancex/valance`, so the server and the browser agree (they already share `renderHead`). It is a behavior change to a Stable surface and a minor release's decision.
4. **Title changes are throttled**: no update on every keystroke; an unchanged title writes nothing.
5. **Announce navigation**: after an in-place page change, update a polite live region with the new title and move focus to the main content's heading, in the `onNavigated` hook the CLI's client entry already can use. This is the accessibility half of the same feature, and the missing one.
6. **Desktop and mobile**: the title is the first place a platform layer differs from the browser. Implement it as a small **window capability** (`setTitle`, `setBadge`) in the NEXUS platform layer, not in PORT or in a template, so the same `title(state)` works with a webview shell's own API.

## Cross-cutting

- **Capabilities are the one portable seam in all three.** HTTP, secure storage, window title and badge, viewport are all "something the application needs from where it runs", with the application stating the contract and the platform supplying it, which NEXUS already does. Templates stay free of platform names; the only per-target thing in the template layer is the *vocabulary* (§1).
- **A second target changes the answers.** Every recommendation above that touches more than the web is a hypothesis until the throwaway second target in §1 has run; do that first.
- **Security and titles meet at the head**: `renderHead` and `applyHead` are the single choke point for every document string the application writes, which makes them the right place for the de-spoofing step and the place a CSP nonce, if one is ever needed, would be added.

## Suggested order

| # | Work | Size | Depends on |
|---|---|---|---|
| 1 | Document CSP (`'wasm-unsafe-eval'`) in the README and contract; emit a headers file from `vlx build` | small | none |
| 2 | Title boundary: strip control/bidi characters, cap length; fix the `link-scheme` message | small | a minor release |
| 3 | Announce page changes and manage focus in the client entry | small | none |
| 4 | `title(state)` projection in `defineApp`; `title` format in `valance.json` | medium | 2 |
| 5 | `Http` capability contract and web implementation; `valance.web.json` `api.base`/`proxy`; Schema-decoded responses | medium | none |
| 6 | Name the web parts as web; parameterize the build by vocabulary | medium | none |
| 7 | Throwaway second target (plain text) in the test suite; write the findings | small, high value | 6 |
| 8 | Adaptive `layouts` by state value and a viewport capability | medium | none |
| 9 | Window capability (`setTitle`, `setBadge`) and a webview shell | large | 4, 7 |

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| P1 | Build the throwaway second target before designing a shared vocabulary | Yes |
| P2 | Webview shells (Option 5) as the first desktop and mobile route | Yes; native PORTs follow evidence |
| H1 | `Http` as a capability contract in `@valancex/common`, web `fetch` implementation by default | Yes |
| H2 | `vlx build` emits a security headers file and a CSP | Yes, opt-out |
| H3 | Fix P2 (redact the logged cause) in the next minor | Yes |
| T1 | A neutral `title(state) → { page, app, status }` replacing the single string | Yes |
| T2 | Strip control and bidirectional characters from titles at the head boundary | Yes (a minor-release behavior change) |
| T3 | Announce page changes and move focus by default in the CLI client | Yes, with an off switch |

## Outcome (2026-10-14)

The recommendations were followed in the order suggested above. What was built, what was measured, and what was left.

| # | Work | Result |
|---|---|---|
| 1 | CSP documented; headers file from `vlx build` | `_headers` written beside the site (CSP with `'wasm-unsafe-eval'`, `nosniff`, referrer, permissions and opener policies); `"headers": false` turns it off; the CLI guide explains it. The docs-app browser suite now runs **under the written policy**, which found a violation in this very work (the announcer's inline `style` attribute, refused by `style-src 'self'`); it now sets properties through the style object, and a test pins that. |
| 2 | Title boundary; `link-scheme` message | `cleanTitle`/`plainText`/`TITLE_LIMIT` in `@valancex/valance`; applied to title, meta content and link titles in `renderHead` and `applyHead`; a title already in place is not rewritten. Link addresses with balanced parentheses are read whole. |
| 3 | Announce page changes, manage focus | After an in-place change a polite live region says the title and focus moves to a focusable `#content`; hash links are left to the browser; `"announce": false` turns it off. Browser-tested. |
| 4 | `title(state)` projection and format | `defineApp({ title })` returning `{ page?, app?, status? }`; `valance.json` `title` format. A throwing function falls back to the default. |
| 5 | `Http` capability | `@valancex/common/http`: the contract, the web implementation and the secure defaults; `valance.web.json` `api.base` and the `vlx dev` proxy (tested against a real backend). The client passes `credentials`, abort, size, content-type and path checks that are each tested. |
| 6 | Web parts named as web; build parameterized | `Vocabulary` value in `@valancex/common`; `compileViews`, `manifestOf` and `templatesOf` take one; each target carries one. |
| 7 | Second target | `packages/cli/test/second-target.test.ts` (below). |
| 8 | Adaptive layouts | The part that was missing was the *value*, not the mechanism (a layout can already branch with `{#if}`): `viewport` (`compact`/`medium`/`expanded`) is a reserved scope name kept current by a reserved `resize` command and `matchMedia`. **Not done:** several root layouts chosen by state (it needs one compiled program per root); the `{#if}` form covers the case. |
| H3 | P2 | The start-failure log carries the failure's identity only; `StartOptions.onStartFailure` receives the cause. Tested with a secret in the error. |
| 9 | Window capability, webview shell | **Not done** (large, and the next step is a shell to run it in). |

### The second target

A correction first: the claim near the top, that no other target has ever used the `Target` seam, is out of date. `examples/tracer-web/test/non-dom-target.ts` is a text target that already exercises it with hand-written MESH views, and `docs/explanation/findings.md:91` predates it. What had not been done was to run the **application model** (the project `vlx init` makes) on one. It now has, on a text target written for the tests:

- **Portable, unchanged:** content, layout, the component with its stated contract, the state, the `toggleTheme` command and the `go` navigation. The scaffolded app draws, an activation of the theme button reaches the command, and the state and the redrawn text change. No line of the project was edited.
- **The web's, measured:** compiling the same project against the web vocabulary *minus* its styling and accessibility hooks gives 33 diagnostics, **every one `unknown-prop`**, on exactly eight props: `class`, `theme` (styling), `tabindex` (focus), `label`, `current`, `pressed`, `id` (accessibility) and `loading`. No complaint was about state, commands, slots, content or the component model. Even a layout written with none of them fails while the **built-in views** (`blocks`, `heading`, …) still use them: the built-ins are the target's side of the line.
- **A finding about the framework itself:** `manifest()` takes the web's realization table type (`WebPrimitives`), so a second target must express its vocabulary as one to get a MESH manifest. The second target needed its own table type or a neutral one.

What that says for the decision between a semantic vocabulary and per-target templates (Option 1/3 vs 2): the hooks that leak are few, named and mostly *hooks* (style, focus, accessibility) rather than structure, which favors a small semantic core with per-target realization of the hooks, with `override` as the per-target escape for the built-in views.

### Left, and why

- **Native `Http`, `SecureStore` and the window capability** need a platform to run in; the contract and the web implementation exist, the others wait for a webview shell.
- **`vlx check --target`** needs a second real vocabulary to be more than the test; the compile path is ready for it.
- **The dev server sends no security headers** (the bundler's client needs inline scripts); the built site does.
- **Server rendering of commands that wait, and build-time data**, remain outside the model.
