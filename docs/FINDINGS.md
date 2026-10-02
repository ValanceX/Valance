# Tracer findings: `@valancex/valance` 0.0.1

> **How to read this file.** It is a chronological log of guarded tracers. Where an early stage describes a mechanism that a later stage replaced (the `path` option of `Web.history`, URL-equality as the push guard, `Stream.drop` as the baseline), the later stage wins. The **authoritative** statements are [Stage 7](#stage-7-the-webhistory-contract-stabilized) (the `Web.history` contract) and the [Milestone](#milestone-validated-valance-composition) at the end. Stages 3 to 6 are kept as the evidence trail.

*Evidence base: NEXUS 0.10.0 (published; tag `v0.10.0`, `a0116367`. Stages 1 to 7 ran against a packed tarball of that revision, byte-identical to the published package, sha256 `ed578f5e…`), MESH runtime/compiler 0.6.0, PORT Web 0.2.1; Node 22; Chromium 1194 via Playwright 1.56.1. No MESH or PORT source was changed. Constraints written before code: [CONSTRAINTS.md](./CONSTRAINTS.md).*

## Stage 1: the first-render observation boundary (fixed in NEXUS)

**Defect.** Tracer 1 rendered the current state and then subscribed to `renders` (future commits only). A commit in between left state `count: 1` and the DOM at `0 clicks` (100/100 runs of the probe). Valance first compensated (subscribe first, hold what arrives before the first draw): a Valance-specific workaround for a substrate gap.

**NEXUS 0.10.0 primitive: `values`** on `State`, `Selector` and `Mesh.Host`. The current value (or its render) at subscription, then every later commit, in order; one atomic step, built on the `SubscriptionRef.changes` mechanism `changes` already used (which dropped the first element). `changes` and `renders` are unchanged. Nothing was added to fibers, runtime or scope; J1/P1 are untouched.

**Tests (NEXUS `tests/observation.test.ts`, `tests/mesh.test.ts` 5b).** The two-step gap is reproduced (observer holds 0, state is 1); commits racing the subscription at 16 relative timings are always a contiguous run ending at the last commit, with the subscription provably landing at different points; a slow consumer misses nothing; a commit between subscription and first render is rendered next. Replacing `values` with read-then-subscribe fails the race and slow-consumer tests. All 483 earlier NEXUS tests pass unmodified (492 total).

**Valance.** The hold-back is deleted. The first element of `running.values` is the first draw or hydration; later ones are updates. The permanent test runs "initial render + immediate state change" 100 times at five offsets: state 1 / DOM 0 never occurs. Chromium passes.

## Stage 2: one application, several MESH programs

**Model tested.** The definition has `views` (`{ program, scope }` each) and `view(state)`. Route state is application state (`path`); `view` derives the program from it; navigation is an ordinary NEXUS command (`app.navigate`) bound from a MESH intent in each program. One `Valance.start`; one NEXUS state; one command table. No router, no navigation abstraction, no second application.

**Exact tracer behavior** (`test/multiview.test.ts`, jsdom; `browser/`, Chromium with real clicks):

```text
/  --Click,Click--> 2 clicks --About--> "About Tracer: 2 clicks" --Back--> 2 clicks --Click--> 3 clicks
PORT operations:  draw, update, update,        draw,                   draw,         update
```

| Observation | Result |
|---|---|
| Application lifetime | One start. Status `Running` at every step; the platform's scoped resource acquired once, released only when the scope closed (`{acquired: 1, released: 1}`). |
| NEXUS state lifetime | Same state throughout. The count survived `/ → /about → /`, and the about program rendered it. |
| MESH program switching | Valance renders each emitted *state* with the program `view(state)` selects. Replacing program A with B ended nothing in NEXUS. |
| PORT | A render from the same view as the drawn one is `update` (same DOM elements); one from another view is `draw` (new elements). Program continuity is "same view", known to Valance because it chose the program. No PORT change. |
| PORT, probed | An `update` across programs happened to produce correct DOM and a replaced section, because MESH keys are disjoint between these programs. PORT's contract calls that meaningless and permits overlapping keys, so it is not relied on. |
| SSR | The request path is the initial application state (`stateFor(path)`, the application's); `renderToHtml` then selects the program: `/` → counter HTML, `/about` → about HTML. |
| Hydration | Both `/` and `/about` server HTML adopt (jsdom and Chromium). The first program change then draws afresh: no adopted server node survives. In Chromium, `/about` (server count 3) → Back → Click → About carried 3 → 4 across both switches, with behavior under the platform Clock and none of it visible to the caller. |

## Architecture findings

### Confirmed (demonstrated by the tracers)
1. The composition works through SSR, hydration, interaction and update, on both programs, in Node, jsdom and Chromium.
2. **Atomic current-and-follow is a NEXUS capability, and with it the first-render race cannot occur** (Stage 1 evidence).
3. **One Valance application can own several MESH programs and keep its state across switches.** Application, state, platform resources and command bindings all outlive a program change.
4. **Route state is application state, and the active program is a function of it.** No state had to live outside the application.
5. **A program change is a PORT `draw`, not an `update`**, and Valance, as composer, is where that is known. MESH and PORT needed no change.
6. **The request URL means initial application state**, and hydration of the selected view works for both programs.
7. Dependency boundaries held: MESH and PORT Web gained no dependency on NEXUS or Valance; Valance core names nothing Web-specific.
8. The earlier "view switch = end one application and start another, state lost" probe is superseded: it described the wrong model.

### Likely (strong implications, not proven)
- `path` ↔ `view` is *application* logic. The tracer needed no router to switch, SSR or hydrate; what a router would add is URL ↔ state synchronization (history, links), which this tracer did not touch.
- The NEXUS Mesh adapter has no "render this snapshot" entry: a host renders its scope's *current* value. Valance renders each emitted state through a one-shot constant-scope host to keep the stream exact (`Valance.start`, `renderOf`). It works and is small; it suggests the adapter's render-from-a-value operation wants to be public rather than reached through a throwaway host. One data point.
- The per-view hosts Valance keeps exist only to dispatch. Rendering and dispatching are different jobs that the adapter bundles into one `Host`.
- `Running.nexus` should not be public (unchanged).

### Unresolved (another experiment needed)
- **URL synchronization:** who reflects `path` to `history`, and who turns a `popstate`/link into `app.navigate`? Not exercised: the tracer navigated only through MESH intents.
- **Links are buttons here.** MESH/PORT have no link primitive; whether navigation needs one (and where it lives) is open.
- **Unknown paths:** `view` maps anything not `/about` to the counter. Not-found is not modeled.
- **Navigation vs. in-flight events:** a click reported on program A's tree after the application switched to B dispatches against A's render and A's table entry (by construction), but this was not exercised under a race.
- **Failure policy** (render/dispatch diagnostics) as before; O15 as before.
- Not exercised: shared state shape across views that need different state, per-view state, nested/layout views, async loading, a production bundle, concurrent interactions.

## Where things belong (updated)

| | Owns |
|---|---|
| **Valance** | Definition (state, views, `view`, commands), `start`, the follower, program continuity (same view → update, other view → draw), drawn-render retention, `renderToHtml`/hydrate choice, lifetime via Scope. |
| **NEXUS** | Application lifecycle, state, commands, platform, FiberRef isolation, `Mesh.host`, and now atomic `values`. Candidate: render-from-a-value in the adapter. |
| **MESH** | Compiler, manifest, templates, render-v1, intents. Unchanged; one manifest served both programs. |
| **PORT** | Realization, `realizeHtml`, hydrate, event resolution. Unchanged. |
| **Application** | Route state in its state, `path → view`, request URL → initial state, embedding state in the page. |

## Not extracted (still unjustified)
Router package, route DSL, navigation registry/lifecycle, link primitive, URL/history sync helper, layouts/nesting, loaders, per-view state, diagnostics framework, WASM `init` helper, other targets.

---

## Stage 3: URL ↔ application state (Chromium)

> **Superseded in part:** the guard described here (push when the URL differs from the path, with URL equality as the loop breaker) and the `path` option were replaced in Stages 4 and 6 (`urlOf`/`stateOf`; push when the application URL changes). The finding that URL sync fits at the Valance Web boundary stands.

**Question.** Does `URL ↔ path state ↔ selected MESH program` already explain routing, and where does URL synchronization belong?

**Mechanism (all in Valance; ~40 lines in `./web`, two additions to `Running`).**

```text
click → MESH intent → "app/navigate" binding ─┐
popstate → running.invoke("app/navigate") ────┴─▶ ONE NEXUS command → path state ─▶ view(path)
path state commit → path ≠ location.pathname → history.pushState        (no feedback flag: equality is the guard)
```

- `Web.history(running, { window, path, navigate })`: a scope-owned follower on `running.states` (pushState when the URL differs from the path) and one `popstate` listener (removed in the scope's finalizer, before the application ends).
- `Running.states` (read-only `State.values`) and `Running.invoke(key, args)` (the binding table `dispatch` already uses, entered without a MESH render). Without these two the Web layer could neither observe `path` nor reach the navigate command: the previous API genuinely lacked them.
- The application added one table entry, `"app/navigate"` (path as its argument), bound to the same `app.navigate` command as `counter/goAbout` and `about/goHome`, and a `Navigated` event the command publishes (used here as evidence that every navigation, intent or popstate, passes through one command).

**Evidence (Chromium, real clicks, real `history.back()/forward()`; `browser/history.browser.test.ts`).**

| Sequence | Observed |
|---|---|
| Initial URL `/` | URL → state (exact path) → counter program; SSR HTML hydrated (`adopted`); starting pushed no history entry. |
| `/` → Click ×2 → About | intent → command → `pushState("/about")`; about program; count 2 shown. |
| Back, Forward, Back | `popstate` → same command each time; URL, `path` and program agree at every observation; counter, about, counter. Count 2 → 3 after a final Click. |
| Initial URL `/about` | about program SSR'd (server count 3) and hydrated; nothing pushed. Its Back button → `/`; browser Back → `/about`. |
| Application lifetime | `Application.status` `Running` at all six observations; platform resource acquired once, released only at scope close (`{1, 1}`). |
| PORT operations | `hydrate, update, update, draw, draw, draw, draw, update`: same program → update, each program change → draw, including those caused by popstate. |
| History | One entry pushed in total; Back/Forward add none. Navigated log `["/about","/","/about","/"]`: one command, four sources (one intent, three popstate). |
| Listener | Exactly one `popstate` listener while running, zero after the scope closes (counted by wrapping add/removeEventListener). |
| Back right after the push (probe) | Ends consistent (`path /`, URL `/`, counter). Operations `hydrate, draw, draw`: every commit is rendered in order, the about program is drawn even though Back already happened; nothing is coalesced. Whether that Back landed mid-render depends on timing, which the test does not control. |

**Tripwires, mutation-checked.** Removing `removeEventListener` fails the listener test. Replacing the URL-differs guard with "always push" fails the main test and the `/about` test.

### Confirmed
1. `URL ↔ path state ↔ selected MESH program` explained everything the tracer did: initial URL → state → program → SSR → hydrate; navigation → URL; Back/Forward → same command → state → program. No new routing concept was needed.
2. URL synchronization is implementable entirely at the Valance Web composition boundary, with one generic observation (`states`) and one generic entry (`invoke`) on the application handle. Neither mentions URLs or the Web.
3. One command serves MESH intents and popstate; the loop is broken by comparing the URL with the path, not by a flag.
4. The history listener has no lifecycle leak: it ends with the caller's scope, before the application.
5. The application never restarted across navigation (status, platform counts); state survived; MESH, PORT and NEXUS were unchanged.

### Likely
- Browser history synchronization belongs with the Web target composition in Valance (it needs the application handle and the browser window, and PORT Web by design touches nothing outside its container). A different target would have its own back-stack story; none was probed.
- `path` and `view` stay application code. What the tracer exercised was exact-path equality only.
- Equality-as-guard is enough while URL and path are the same string. A path ≠ URL mapping (base paths, query, hash, normalization) would make that comparison a real function the application owns.

### Unresolved
- **Query strings, hashes, base paths, trailing slashes, URL encoding:** all outside exact `pathname`.
- **Links as anchors:** buttons only; middle-click, open-in-new-tab, and hrefs are unexercised (and would need a MESH/PORT story that was out of scope).
- **Scroll and focus restoration** on Back/Forward.
- **Popstate during a switch** was only probed at one timing; commits are rendered in order with no coalescing, which means rapid navigation draws every intermediate program. Whether that is wanted is a product question, not tested here.
- **Unknown paths** still select the counter; `history` pushes whatever the application's `path` says.
- **Failure policy:** a failed popstate navigation is logged (`Effect.logError`) and ignored; a failed render still ends the follower.
- **Non-browser targets:** whether `states`/`invoke` suffice for them is unknown.
- `replaceState` was used by the harness to stand in for "the server served this URL"; a real navigation to a URL was not tested.

### Answers
1. **Entirely at the Valance Web composition boundary?** Yes, with `Running.states` and `Running.invoke`.
2. **NEXUS primitive?** No. `State.values` (Stage 1) is what `states` exposes.
3. **MESH?** No. Navigation stayed ordinary intents; popstate never needed to be one.
4. **PORT?** No. It has no history API and did not need one; program changes were `draw`s.
5. **`path → view` sufficient?** For exact paths, yes.
6. **Router justified?** No. Nothing observed required parsing, matching, registration or a route lifecycle.
7. **Where does history sync belong?** `@valancex/valance/web`, in the same layer as the Web target.
8. **Popstate during a switch?** See the probe row: consistent, every intermediate commit rendered.
9. **History-listener leaks?** None observed.
10. **Smallest next experiment:** see the report.

---

## Stage 4: the URL is not the state (base path + query)

> **Superseded in part:** the per-commit comparison of `location.pathname + location.search` with `urlOf(state)` was replaced in Stage 6. `urlOf`/`stateOf` as application functions stands.

**Question.** Can URL ↔ state stay ordinary application-owned functions when the browser URL is not the application's path?

**Model.** Browser URL `/tracer/about?tab=details`; state `{ path: "/about", tab: "details", title, count, stamp }`. The URL carries `path` and `tab` only; `count`, `stamp` and `title` are not in it. In `examples/tracer-web/src/app.ts`:

```ts
urlOf(state): string      // `${"/tracer"}${state.path}?tab=${encodeURIComponent(state.tab)}`
stateOf(url: URL): { path, tab }   // strip the base; tab from the query, default "overview"
stateFor(url): AppState   // { ...initial, ...stateOf(url) }: what a request URL means (server and client)
```

**What changed.** `Web.history` takes `urlOf` and `stateOf` instead of `path`. It compares `location.pathname + location.search` with `urlOf(state)` (push when they differ), and on popstate calls `running.invoke(navigate, [stateOf(location)])`. The `app.navigate` command now takes `{ path, tab }`; the MESH buttons and popstate still reach it through the same binding table. The about program gained a `tab` line so the URL's tab is visible. Nothing else in Valance changed.

**Chromium evidence** (`browser/history.browser.test.ts`; three consecutive runs green):

| Step | URL | State | Program | Pushes / PORT |
|---|---|---|---|---|
| initial (server HTML, count 3) | `/tracer/about?tab=details` | `/about`, details, 3 | About | 0 pushes; hydrate (adopted) |
| About page's Back button (MESH intent) | `/tracer/?tab=overview` | `/`, overview, 3 | Counter | exactly 1 push; draw |
| Click (state not in the URL) | unchanged | count 4 | Counter | no push; update |
| browser Back | `/tracer/about?tab=details` | `/about`, details, **4** | About | no push; draw |
| browser Forward | `/tracer/?tab=overview` | `/`, overview, 4 | Counter | no push; draw |

PORT operations: `hydrate, draw, update, draw, draw`. History entries added in total: 1. `Navigated` log `["/|overview", "/about|details", "/|overview"]`: one command, three sources (one intent, two popstates). The tab came back from the URL on Back, not from memory; the count, which the URL does not carry, survived.

**Lifecycle.** Application `Running` at all five observations; the counting platform resource acquired once, released only at scope close (`{1, 1}`); exactly one `popstate` listener while running, none after the scope closed.

**Tripwires, mutation-checked.** Always-push fails the main test; a pathname-only guard (the previous tracer's assumption) fails it too, which is how the query became part of the comparison; not removing the listener fails the lifetime test.

**Invalid URL, observed (`/tracer/not-a-view`, no query).** The application keeps the path as given (`path: "/not-a-view"`), `view` falls back to the counter, and because the URL is not the canonical `urlOf(state)` (no `?tab=`), the first state commit pushes `/tracer/not-a-view?tab=overview`: one history entry nobody decided to create. The model exposes two missing decisions: what a URL that maps to no view *is*, and whether a non-canonical initial URL is rewritten (replaceState) or pushed. Neither is Valance's or the router's to guess; both are visible only because the mapping is explicit.

### Confirmed
1. URL and application state differ (base path, query, three fields absent from the URL) and stay synchronized in both directions without a Router.
2. The mapping is application-owned: `urlOf`/`stateOf` are plain functions in the application; `Web.history` only reads and writes `location` and calls them.
3. `Web.history` stayed a sufficient composition boundary: one option swap (`path` → `urlOf` + `stateOf`), no new abstraction, no change to the navigate path.
4. NEXUS, MESH and PORT needed no change.
5. The initial URL becomes initial state through the same function (`stateFor`), selects the program for SSR, hydrates, and pushes nothing when it is canonical.

### Likely
- `urlOf`/`stateOf` belong in application code, next to the state schema they describe. One application is one data point; whether they should ever be shared is not established.
- `Web.history` is a synchronization mechanism (URL ↔ commands/state), not a routing mechanism. Routing, if the word applies, is the application's `path → view` plus these two functions.
- The base path behaves as an application concern here (a constant in the mapping); it could equally be a deployment concern injected into the mapping. Unresolved by this experiment: only one base, hard-coded.
- The comparison `pathname + search` is a hidden assumption of `Web.history` that the application's `urlOf` must meet (same shape, same normalization); the failing pathname-only mutation shows it is real.

### Unresolved
- **Invalid URLs:** what `stateOf` returns for a URL with no view, and whether the application rejects, rewrites or shows it (observed above: kept as given, view falls back, initial push).
- **Canonicalization of non-canonical initial URLs** (replace vs push).
- **Query encoding and normalization** beyond `encodeURIComponent` of one value; parameter order; repeated or unknown parameters.
- **Trailing slash:** `"/tracer"` and `"/tracer/"` both map to path `/`; `urlOf` writes the slash form.
- **Hash fragments:** ignored by the guard; `pushState` with a hash-less URL would drop a hash.
- **Real anchors/links**, scroll and focus restoration.
- **Server request URL → initial state in a real server** (the harness calls `stateFor` itself).
- **Popstate racing a program switch:** probed once (consistent; every commit rendered in order, none coalesced); not characterized.
- **Where a base path configured at deployment would enter.**

---

## Stage 5: who owns initial URL canonicalization?

> **Superseded in part:** the first-state rule (`Stream.drop`) and the "guard compares the URL on every commit" remarks were refined in Stage 6 (baseline from the first state's `urlOf`; push only when the application URL changes). The ownership decision (the application canonicalizes before start) stands.

**Problem (from stage 4).** `/tracer/not-a-view` → state `{path: "/not-a-view"}` → `urlOf` differs from the URL → `Web.history` pushed an entry at start, which no navigation requested.

**Changes.**
- `stateOf` is now total: a URL naming no view is the explicit state `path: "/not-found"`, and `view` shows a third MESH program (`missing`: "Not found" + a Home button) for it. Not an accidental fallback.
- `Web.history`: the first state is a baseline. `Stream.drop(running.states, 1)`: starting never writes.
- The example's `initialStateAt(window)` (`src/app.ts`, 8 lines, application code): `stateOf(location)`, and if the URL is not `urlOf(state)`, `history.replaceState` it. It runs before `Valance.start` and `Web.history`.
- Nothing in Valance gained a replace operation.

**Three initial URLs, in Chromium** (hydrate adopted in all; application `Running`; platform `{1, 1}` over the run; operations `["hydrate"]`; zero pushes):

| Case | Initial URL | Initial state | Program | History write at start | Final URL |
|---|---|---|---|---|---|
| A canonical | `/tracer/about?tab=details` | `/about`, details | About | none | unchanged |
| B valid, not canonical | `/tracer/about` | `/about`, overview | About | `replace /tracer/about?tab=overview` (by the application's entry) | `/tracer/about?tab=overview` |
| C no view | `/tracer/not-a-view` | `/not-found`, overview | Not found | `replace /tracer/not-found?tab=overview` (by the application's entry) | `/tracer/not-found?tab=overview` |

**Controls (the application does not canonicalize; same Chromium harness).**

| Variant | At start | After an unrelated commit (`count + 1`) |
|---|---|---|
| Model B, no canonicalization (Web.history baseline-only) | no write; URL left as served | `push /tracer/about?tab=overview` (B) / `push /tracer/not-found?tab=overview` (C): an unintended entry on a commit that has nothing to do with the URL |
| Model A (temporary patch, discarded): Web.history replaces on the first mismatch, application silent | `replace` to the same URLs | no further write |

So both models produce the same URLs and neither pushes an entry at start; they differ in who decided. Under A the rewrite of the visitor's URL (for C, from the one they typed to `/tracer/not-found?...`) is made by the synchronization mechanism for every application, and the application cannot decline it. Under B it is eight lines the application can change (for C it might keep the requested URL, or not rewrite B), but `Web.history`'s guard then holds the application to a precondition.

### Confirmed
1. `stateOf` can be total: an unknown URL maps to an explicit state (`/not-found`) that `view` handles on purpose.
2. Starting never needs to push: with the application canonicalizing before start, A writes nothing and B, C write exactly one `replaceState`; no push, in real Chromium, with hydration adopted in all three.
3. Initial canonicalization uses `replaceState`, not `pushState`; the first state is only a baseline for `Web.history`.
4. Both ownership models work and give identical URLs; the difference is who decides and what is left to enforce.
5. The `Web.history` guard compares the URL with `urlOf(state)` on **every** commit, so an application that leaves a noncanonical URL in place gets an unintended push on its next unrelated commit (control run). That behavior exists independent of who canonicalizes.
6. NEXUS, MESH and PORT: no change.

### Ownership decision (supported by this evidence, not a law)
**Model B: the application produces the canonical initial state (and URL) before history synchronization begins.** `Web.history` stays synchronization only: baseline at start, `pushState` for later commits, popstate → the navigate command. No canonicalization API was forced: the application used `history.replaceState` directly in its entry. Reasons from the runs: (1) A and B are behaviorally identical here, so the tie is broken by the contract: B keeps URL policy (rewrite, keep, or reject a requested URL) with the code that knows what the URL means, and keeps `Web.history`'s start rule one line; (2) A's rewrite is unconditional and cannot be vetoed by an application that wants to show the URL as requested; (3) A would also treat the first emission as "initial", which is not guaranteed if the state changed between hydration and history starting (reasoned, not tested).

### Likely
- The `Web.history` precondition ("URL equals `urlOf(state)` at start") is real and worth enforcing or documenting; the control run shows the cost of violating it. The guard may be better as "push when `urlOf` *changed*" than "push when the URL differs", but that was not tried (popstate to a noncanonical entry would interact).
- Applications that want to keep a requested URL for a not-found state need `urlOf` to reproduce it (e.g. the state holds what was asked). Not tested.

### Unresolved
- **The guard itself:** per-commit comparison with the URL versus change-based; popstate to a noncanonical history entry (Back to a URL like `/tracer/about`) would still push.
- **A state change between hydration and `Web.history` start** is taken as the baseline and not written.
- Whether a not-found state should keep the visitor's URL.
- Trailing-slash, query ordering/repeats/encoding, hash fragments, deployment base path, real anchors, scroll/focus restoration, a real server's request-URL mapping, popstate racing a program switch (unchanged from before).

---

## Stage 6: the guard: "URL differs" versus "the application's URL changed"

**Old.** On every state commit after the first: `location.pathname + location.search !== urlOf(state)` → `pushState`.
**New.** The first state's `urlOf` is the baseline (no write). Each later state: `urlOf(state) !== last` → `pushState`, then `last = urlOf(state)`. On popstate: run the navigate command with `stateOf(location)`, then `last = urlOf(<resulting state>)`; never a write. No signature change, no new public API; `last` is a local variable.

**Where popstate is handled.** In the same fiber that watches state (state commits and popstate hrefs are merged into one stream, consumed sequentially). The commit a popstate causes is therefore processed after the baseline was updated for it, so it cannot be mistaken for a navigation. (Handling popstate in its own fiber would race the state follower.)

**Chromium evidence** (`browser/history.browser.test.ts`; 12 tests, green on three consecutive runs). Tests were written first and run against the old guard: A and B failed, C (canonical navigation) passed on both.

| Case | Setup | Observed with the new guard |
|---|---|---|
| A: unrelated commit, noncanonical URL | page at `/tracer/about` (or `/tracer/not-a-view`), application did not canonicalize; `count + 1` | writes `[]`; URL unchanged; navigation log empty. (Old guard: `push /tracer/about?tab=overview`.) |
| B: popstate to a noncanonical entry | entry 1 `/tracer/about` (as served), application navigation → Home (`push /tracer/?tab=overview`), Back, unrelated `count + 1`, Forward | after Back: URL stays `/tracer/about`, state `/about`; after the unrelated commit: URL stays, About program shows 4 clicks; after Forward: Home. Writes throughout: only `push /tracer/?tab=overview` (the one application navigation); no push, no replace for either popstate or the unrelated commit. Navigation log `["/\|overview","/about\|overview","/\|overview"]` (one intent, two popstates, one command). PORT: `hydrate, draw, draw, update, draw`. |
| C: application navigation | Home → unrelated `count + 1` → About → unrelated commit on About → Back (to Home) → About again | writes exactly `[push /tracer/about?tab=overview, push /tracer/?tab=overview, push /tracer/about?tab=overview]`: one push per navigation, the same URL pushed again when navigated to again; the unrelated commits push nothing. PORT: `hydrate, update, draw, update, draw, draw`. |

Earlier tests (initial A/B/C URLs, acceptance sequence, listener lifetime, the Back-right-after-push probe) pass unchanged, so startup writes nothing, popstate never writes and the listener ends with the scope as before.

**Mutations** (each fails named tests, then restored):
- back to `location !== urlOf(state)`: guard A (both) and guard B fail;
- `last` not updated after a legitimate push: guard C and the acceptance sequence fail;
- popstate not re-baselining: guard B and the acceptance sequence fail.

### Confirmed
1. Synchronizing on "the application's URL changed" is sufficient for all three cases: application navigation pushes exactly once per navigation, popstate writes nothing, and an unrelated commit at a noncanonical URL writes nothing.
2. A popstate must re-baseline; without it, the next unrelated commit pushes (mutation M3).
3. The baseline must follow each push; without it, an unrelated commit after a navigation pushes again (M2).
4. Popstate-then-unrelated-commit while sitting at a noncanonical historical URL is left alone: the browser stays at the URL history stored.
5. No substrate change; no new public API; the `Web.history` signature is unchanged.

### `Web.history` contract (justified by the runs above)
- **On start:** the first observed state's `urlOf` is the baseline. No history write, regardless of the browser URL.
- **On a later state:** if `urlOf(state)` differs from the last synchronized `urlOf`, `pushState(urlOf(state))` and update the baseline; otherwise nothing.
- **On popstate:** `running.invoke(navigate, [stateOf(location)])`, then the resulting state's `urlOf` becomes the baseline. Never a write.
- It never compares with, or rewrites, the browser URL; canonicalization is the application's, before start.

### Unresolved
- **A failed popstate navigation:** the state stays at the previous value while the browser URL has moved; the baseline then follows the old state. Logged only.
- **A popstate while a state change is in flight** is processed in order, but the combination was not stress-tested (the earlier Back-right-after-push probe still passes).
- **A navigation to the URL the application is already at** (equal `urlOf`) writes nothing: no duplicate entry, but also no way to express "push the same URL again".
- Whether a not-found state should keep the visitor's requested URL; trailing-slash, query ordering/repeats/encoding, hash, deployment base path, real anchors, scroll/focus restoration, a real server's request-URL mapping (unchanged).

---

## Stage 7: the `Web.history` contract, stabilized

**The distinction this rests on.** The browser URL is not the application URL. The application URL is `urlOf(state)`: a function of application state, and only meaningful between two states. The browser URL is whatever history holds: it may be noncanonical, it may be an entry the application never wrote, and after a failed popstate it may be somewhere the application is not. `Web.history` synchronizes **application URL transitions** with browser history. It does not decide navigation by comparing the browser URL with the current application state.

**Contract** (each line is a test in `packages/valance/test/history.test.ts`, with the Chromium suite as acceptance):

| | |
|---|---|
| Start | The first state's `urlOf` is the baseline. No `pushState`, no `replaceState`, even at a browser URL that is not `urlOf(state)`. |
| Later state, same application URL | No write (including when the URL differs from the browser's). |
| Later state, changed application URL | Exactly one `pushState(urlOf(state))`; it becomes the baseline. Unrelated state afterwards pushes nothing. |
| Distinct navigations | Each pushes once, including back to an earlier application URL. |
| Popstate | `invoke(navigate, [stateOf(location)])`; then the resulting state's `urlOf` becomes the baseline. The popstate itself never writes, and a later unrelated change pushes nothing, including when history holds a noncanonical URL for that state. |
| Scope | One listener while the scope is open, none after. |

**Failed popstate (observed with a real NEXUS runtime and state; no machinery added).** History `/home → /restricted`, popstate, and the navigate command either fails (`UnmappedCommand`) or succeeds without changing state:

| After | Writes | Browser URL | Application state | Baseline |
|---|---|---|---|---|
| popstate to `/restricted` | none (no push, no replace) | `/app/restricted` | unchanged (`/home`) | `urlOf(state)` = `/app/home` |
| an unrelated state change | none | unchanged | `/home`, `n + 1` | unchanged |
| a real navigation to `/about` | `push /app/about` | `/app/about` | `/about` | `/app/about` |

The current implementation has a coherent behavior for this without any addition: the baseline follows the *state*, not the browser, so the invariant the task asked for holds (a failed popstate cannot make a later unrelated change manufacture a history entry), and navigation keeps working afterwards. Both the failing and the no-op variants behave the same. The cost is explicit: until the next application navigation, **the browser URL and the application URL differ** (the page shows `/home`, the address bar says `/restricted`, a reload would load `/restricted`), and the failure is only logged.

**Boundary (explicit).** `Web.history` does not restore or rewrite the browser URL when a popstate navigation does not produce an application state transition. If the application state changes, `Web.history` follows the resulting application URL; if it does not, `Web.history` writes nothing. Recovery or error behavior (restore the URL, show an error, redirect, or tolerate the mismatch) belongs to the application's navigation policy. This is a statement of where `Web.history` stops, not a claim that tolerating the mismatch is good navigation UX, and no hook for restoration was added.

**Regression evidence.** Unit: 12 `Web.history` tests + 4 boundary tests. Tracer (jsdom): 12. Chromium: 12 (three consecutive runs). Mutations, each failing in both the unit suite and Chromium: browser-URL-vs-state comparison (unit 4 failing, Chromium 3); baseline not updated after a push (unit 2, Chromium 2); no re-baseline after popstate (unit 4, Chromium 2).

**Remaining uncertainty that affects this contract:** a popstate arriving during an in-flight state change (processed in order, but only probed once); a state change between hydration and `Web.history` starting is taken as the baseline.

---

## Stage 8: the Application Model tracer (what is an application?)

**Question.** What is the smallest thing a VALANCE application is, found from ownership and lifecycle pressure rather than API design?

**Tracer.** `examples/tracer-web/src/catalog/` (a second application; the first is untouched). One state, a union whose discriminant is the selected view (`home | details(selectedId) | not-found`, each with `items`). Three MESH programs, three NEXUS commands (`open`, `home`, `changeItems`) bound twice in the one table: as MESH intents (`home/open`, `details/back`, `notfound/back`) and as external entries (`app/open`, `app/home`, `app/changeItems`, reached with `Running.invoke`). `view: (state) => state.view`. No Valance, MESH, PORT or NEXUS source changed.

**Scenario (asserted).** `home(1) → home(2) → details(A) → details(A, 3 items) → home → not-found → details(A)`: PORT `draw, update, draw, update, draw, draw, draw`. Run (a) against a bare `Target` with no DOM, no window and no history, and (b) against PORT Web in jsdom with MESH intents as real clicks: same operations, same selected views; DOM sections survive each `update` and are replaced by each `draw`. Platform resource `{acquired 1, released 0}` through the whole scenario, `{1, 1}` after the scope closed; status `Running` at every observation, `Stopped` after; follower interrupted; container emptied. `app.commands` was built once, over one state handle.

**Tripwires, mutation-checked** (`test/application.test.ts`): always-draw and always-update each fail both scenario tests; building the command table twice fails the one-state test.

**Observed, and what it means**
- *State owner:* the NEXUS `State` created in `Valance.start`; `Running.state`/`states` are read-only views of it. It is the application state, not a primitive the application sits beside. `Selector` appears only inside `start` (per-view scope); the application never touches one.
- *View selection:* `view(state)` expresses `state → program` naturally and in the application layer. One friction: `view` and `views` are keyed by a free `V`, and each `View.scope` receives the whole `S`. A union state whose variants carry different data needs a narrowing the type system does not know about (`at()` in the tracer throws on a mismatch). The correlation "this view receives this variant" is real and is currently unexpressed.
- *Lifetime:* everything long-lived hangs off the caller's Scope: the NEXUS runtime and platform resources, the one state, Valance's follower fiber, the target. Nothing in MESH, PORT or a view outlives a view change: per-view hosts are stateless dispatch tables; the only thing that dies on `draw` is the PORT realization.
- *External events:* the smallest mechanism that exists is `Running.invoke(key, args)`: one binding table, entered from MESH intents and from outside. It works, but both callers (`Web.history`, the tests) must wrap it as `Nexus.Runtime.run(running.nexus.runtime, running.invoke(...))`. The caller has to know the application's runtime to deliver an event to it.
- *Draw/update:* unchanged. "Same view → update" is the composer's memory in `connect` (`drawn.current.view`): it belongs to the connection to a target, not to the application.
- *Browser:* nothing in the model needed history. The scenario runs on a target with no `window`.

**Substrate discrepancy (resolved in Stage 9 by NEXUS 0.10.1).** The brief names MESH 0.7.0 and PORT Web 0.2.2; the repo resolves 0.6.0 and 0.2.1. Bumping to the published 0.7.0/0.2.2 passes Node and jsdom but fails every Chromium test: published NEXUS 0.10.0 depends on `@valancex/mesh-runtime ^0.6.0`, so the install holds two runtimes and the browser's `init()` reaches only one. Fixing it needs a NEXUS release that accepts MESH 0.7 (or an override, which the constraints forbid). Reverted. As a consequence the tracer renders item data as scalars: MESH 0.6.0 has no repeat syntax, so keyed `mesh-each` was not exercised.

---

## Stage 9: the Application Model on NEXUS 0.10.1 / MESH 0.7.0 / PORT Web 0.2.2, with keyed identity and history

**Substrate.** NEXUS 0.10.1 (patch: `mesh-runtime ^0.7.0`, nothing else) removed the Stage 8 blocker. A clean install, no overrides, resolves one each of `@valancex/nexus` 0.10.1, `@valancex/mesh-runtime` 0.7.0 (shared by NEXUS and PORT's peer), `@valancex/port-web` 0.2.2, `@valancex/mesh-compiler` 0.7.0 and `effect` 3.22.2. The existing suites passed on it unmodified (16 unit, 15 jsdom, 12 Chromium) before the tracer was touched.

**Added to the catalog tracer** (`src/catalog/`, `browser/catalog.browser.test.ts`): a `mesh-each` list in the `home` view (a `row` per item, with its own `open(item.id)` button); a pure `urlOf(state)` / `stateOf(url)` in `app.ts`; a `navigate` command that completes a URL's navigation into a full state with the data the application holds; `web.ts` (primitives table and `initialStateAt`, the page's first act) outside the definition. `Web.history`, Valance, NEXUS, MESH and PORT: unchanged.

**Keyed identity, Chromium (DOM objects compared, not text).** `[A B C] → [C A B] → [A C] → [A C D] → [D] → [A C D]`: A, B, C keep their elements through the reorder; through `[A C]` B's element leaves the document while A and C keep theirs; D is a new element and A, C keep theirs; through `[D]` D keeps its element and A, C leave; on reappearance A and C are new elements (the old ones stay detached) and D keeps its element. Every step is a PORT `update`; clicking a repeated row's button dispatches that item's `open`. Operations: `draw, update×5, draw`.

**History, Chromium.** `/` canonical: nothing written. A same-view data change: `update`, no write, no entry. Row click → `push /items/A` + `draw`; items change on details(A): `update`, no push. Back intent → `push /`; item C → `push /items/C`. Browser Back → `app/navigate` (the one existing binding; nothing else entered from outside MESH) → home with the data the URL does not carry intact → `draw`, no write. Forward → details(C), `draw`, no write. 150 ms later: no further write, navigation or render. Three pushes in total, and `urlOf(state) === location.pathname` at every observation. Initial `/items/zzz` and `/nope` → not-found and one `replace /not-found` made by the application's `initialStateAt`, no new entry, and `Web.history` wrote nothing; `/` and `/items/B` write nothing.

**Mutation checks (Chromium):** push on every state; no re-baseline after popstate; canonicalizing with push; always draw. Each fails the named tests.

**What this showed about the model.** (1) One state, one lifetime and `view(state)` carried keyed identity and history with no change to Valance: `mesh-each` is a property of a program, and the composer's "same view → update" is exactly what lets PORT keep keyed nodes. (2) A URL names a *navigation*, not a state: `items` is not in it. `stateOf` returns the navigation, and the application's command turns it into a state; an unknown item, from a click or from popstate, is the application's `not-found`. This is the same shape as the earlier tracer's `Navigation`. (3) The definition stayed platform-free: a test asserts `app.ts` names no Web, PORT, `window`, `history` or `popstate`, and Part 1 runs the application in Chromium with no history at all.

---

## Stage 10: SSR → hydration → keyed update

**Question.** Does keyed DOM identity survive the server/client boundary: server HTML adopted by PORT's `hydrate`, then updated by application transitions?

**Chain (existing machinery only).** `renderToHtml(app, { primitives, state })` in Node (`browser/setup.ts`, the "server") renders the catalog `home` view with `[A B C]`; the page puts that HTML in the document before anything starts; `Valance.start({ state: served.state })` and `Valance.hydrate` (PORT Web's `hydrate`) adopt it; later transitions are `Running.invoke` data changes and a MESH click. No Valance, NEXUS, MESH or PORT change, no new API. `app.ts` is unchanged, and the test that it names no Web, PORT, `window`, `history` or `popstate` still passes.

**Chromium evidence** (`browser/catalog.browser.test.ts`, Part 3; DOM objects compared, not text):

| Step | Verified |
|---|---|
| Server output | rows Alpha, Beta, Gamma in order, three buttons (checked on a probe DOM before any script) |
| Hydration | PORT reports `{ adopted: true }`; the three row elements and the `section` after hydration are the **server's own objects** (captured before the application started) |
| `[A B C] → [C A B]` | `update`; A, B, C are the same adopted objects, in the new order |
| `[C A B] → [A C D]` | `update`; A and C are the same adopted objects; B's server element is disconnected; D is a new element, not any earlier one |
| keyed view → details | `draw`; the adopted `section` and every row are disconnected, no row exists in the new view |
| Operations | `hydrate, update, update, draw` |
| Adopted handlers | clicking the **server's own** Beta button dispatches `open(B)`: `hydrate, draw`; the adopted row is then gone |
| Lifetime | platform resource `{1, 1}` |

**Mutation check.** Making hydration replace the server DOM (clear the container, `draw`) while still reporting `adopted` fails the adoption test, on the server-node identity assertions. The other Chromium suites, 20 tests in all, and the 16 jsdom and 16 unit tests pass.

**Result.** The keyed identity semantics held across the boundary with no friction found in the substrate: PORT's `hydrate` keeps every server node and the keyed `update` that follows matches them by key. Nothing needed to be weakened, and no cross-repository contract was violated.

**Friction recorded, not acted on.**
- The server's page needs the client's state: `renderToHtml` returns `state` and the page must carry it to `Valance.start` (here the harness passes it; a real page embeds it). The Application Model does not say how, and nothing in this tracer required it to.
- Hydration was exercised for one served view only (`home`, with its list). A server-rendered `details` or `not-found` view hydrating a keyed list was not tried; neither contains a list.
- Event replay and input made before hydration are PORT's documented non-goals and were not tested.

---

## Stage 11: Application Model reassessment

*An analysis, not an implementation. No source, test or substrate changed. Evidence is the code and the Stage 1 to 10 tracers on NEXUS 0.10.1, MESH 0.7.0, PORT Web 0.2.2 (one `mesh-runtime` 0.7.0, one Effect 3.22.2). Where a claim has no test behind it, it says so.*

### 1. Proven model

```text
Application
  one state            the NEXUS State made in `start`; read-only outside; changed only by NEXUS commands
  derived view(state)  pure, total, evaluated on each committed state; never stored
  one binding table    "key" -> command; entered from MESH intents and from outside, through one function
  one scope            the caller's: platform resources, state, follower, target, platform bindings

            state ──▶ view(state) ──▶ MESH program + scope values ──▶ render-v1 ──▶ PORT
   same view as the one drawn   ──▶ update      (keyed identity continues)
   another view                 ──▶ draw        (nothing of the old realization is reused)
```

Surrounding it, as bindings that need the application and that it does not need: a PORT target (`mount` / `hydrate`), browser history (`Web.history`), server rendering (`renderToHtml`). Each was removed in a tracer and the application still ran: Part 1 of the catalog Chromium test runs with no history; the first Application Model test runs with no DOM at all.

### 2. Ownership map

| Concern | Owner | Lifetime | Evidence |
|---|---|---|---|
| State | the application (a NEXUS `State` made in `start`) | the scope | `commands` built once over one handle across 6 transitions; `Running` has no write path |
| Lifecycle | the caller's `Scope`, via `start` | what the caller says | platform resource `{1, 0}` through every transition, `{1, 1}` and status `Stopped` after |
| Commands | the application (NEXUS `Command`s bound in one table) | the scope | one table served MESH intents, `app/*` entries and popstate |
| View selection | the application (`view(state)` and `views`) | pure, per commit | `shown` equalled `state.view` at every step |
| MESH programs | the application's build: compiled data (`root`, templates, model) | immutable | each example compiles with its own copy of one 25-line script (`compile.ts`); Valance never compiles |
| Rendering state → tree | Valance, through a MESH host (NEXUS adapter) | per commit | `renderOf` (a throwaway host per emitted state) and per-view hosts (dispatch only) |
| Realization | PORT; the composer keeps only *what was drawn* | per target connection | hydration adopted the server's own nodes; keyed nodes kept across updates |
| Draw/update decision | Valance, in `connect` (`drawn.current.view`) | per target connection | the memory belongs to the connection, not the application |
| Web history | `Web.history`, from the application's `urlOf` / `stateOf` | the scope; listener removed before the application ends | one listener while open, none after; writes only when `urlOf` changed |
| SSR | Valance (`renderToHtml`: start, render once, end) | one request | state returned for embedding; embedding is the page's |
| Hydration | PORT adopts; Valance picks `hydrate` for the first render | one first render | `{ adopted: true }`; server DOM objects preserved; PORT's setter-failure and event-replay limits stand |

### 3. Internal versus public

"Does the application author need to know this exists?" The *author* writes the definition and picks a platform. A *platform-binding author* (Valance's `./web`, a future target) needs more. The two are different audiences and the table keeps them apart.

| Concept | Author sees it? | Reason |
|---|---|---|
| Application state (schema, initial) | **yes** | the one thing the author defines about data |
| `view(state)` and `views` (program + scope per view) | **yes** | selection and the state → scope-values mapping are the author's |
| Commands and the binding table | **yes** | behavior; today written in NEXUS vocabulary (`Command.define`, `Mesh.bind`, `StateHandle.update`) |
| A MESH program (compiled data) | **yes, as data** | acquired at build time; Valance only consumes it |
| A platform (`Platform` layer) | **yes** | the one place services and capabilities enter |
| `urlOf` / `stateOf`, canonicalization | **yes, if the app uses history** | application policy; shown to be the application's |
| The lifetime (start, end) | **yes, as a lifetime** | the Scope is the present spelling, not the concept |
| `Running.state` (read) | yes, observation | read-only authority |
| `Running.nexus` | **no** | used by 2 internal sites and 16 test sites; no application code |
| `Running.invoke` + running it in `nexus.runtime` | **no** (platform bindings: yes) | see 4; its `R` leaks the runtime |
| `Running.render` / `values` / `dispatch` | **no** | composition mechanics between Valance and a target |
| `Running.states` | platform bindings only | `Web.history`'s observation |
| `renderOf`, per-view hosts | **no** | scaffolding for a missing render-from-value |
| `at()` | **no** (tracer scaffolding) | see 4 |
| `connect`, follower fiber, `drawn.current`, `pending` | **no** | the connection to a target |
| `Target`, `TargetFactory`, `Report`, `HydratableTarget` | platform bindings only | PORT's contract as the composer uses it |
| `Mounted.dispatched`, `settled`, `followed` | **no** | observation facilities used by tests |
| `renderToHtml`, `hydrate`, `Web.target`, `Web.history` | **yes, as Web integration** | the Web additions |
| the Web primitives table | yes, **as Web target configuration** | passed to both server and client by convention |

### 4. API pressure (demonstrated only)

1. **External event entry is a real boundary, but its author-facing need is not demonstrated.**
   - *Where it bites:* `invoke` returns `Effect<…, UnmappedCommand | E, R>`, and `R` is satisfiable only by the application's runtime. Whoever calls it must `Runtime.run(running.nexus.runtime, …)`.
   - *Who does:* two sites in the package (`connect`'s dispatch, `Web.history`'s popstate), both Valance's own, and nine test sites. No application definition, example `src` or author-written code ever did.
   - *Classification:* a real missing boundary *for platform bindings* (they are exactly "something outside the application that enters it"); a testing convenience otherwise (the tests' `app/changeItems` and `app/open` have no non-test counterpart); and in part an artifact of the NEXUS integration: Valance already holds the runtime, so the `R` is a leak, not a requirement. Whether an *author's* host page ever needs one is open.
   - *Related, same cause:* status and shutdown are read through `running.nexus` in 7 test sites; lifecycle observation has no Valance spelling.
2. **The binding table has two kinds of keys in one namespace.** Intent keys (`home/open`) are called by rendered programs; entry keys (`app/navigate`, `app/changeItems`) by platform bindings or outside. `Web.history`'s `navigate: "app/navigate"` is a convention the application must satisfy: a platform binding *requires an entry of the application*. The catalog application binds the same command twice (`home/open`, `app/open`). Not a failure; it is the same boundary as 1, seen from the table.
3. **View ↔ state variant (`at()`) is TypeScript ergonomics, not a model flaw.** `View<S>.scope` takes the whole union; the catalog application wraps three scopes in `at()` whose throw cannot fire when `view` is `state.view`. One union application is the whole evidence, and the runtime model is not affected. The correlation is real, and a stronger typed `views` would remove `at()`; the evidence does not justify a type-level framework, and a flat state (the earlier tracer) needs none.
4. **The Web primitives table is passed twice by convention** (`renderToHtml({ primitives })` on the server, `Web.target({ primitives })` on the client) (28 mentions across the examples' tests). Nothing enforces that the two tables match. Small, and the Web layer's.
5. **Program acquisition is copied.** `compile.ts` exists twice, identical except the component names. It is build-time; Valance rightly does not own it, and no product layer does yet.
6. **Earlier `app.ts` imports `Web`** (its primitives table, "target configuration, not part of the application"). The catalog application moved this to `web.ts` and asserts the stricter rule. The two examples disagree about invariant 11's strength.
7. **Not pressure, observed:** `render-from-value` (`renderOf`, per-view hosts) is a substrate gap (Stage 2); it costs one throwaway host per commit and nothing a user can see.
8. **Not demonstrated either way:** application services. `start` hardcodes `runtime: Layer.empty`; commands may require only the environment and the event bus. Every tracer needed only a `platform`.

### 5. Candidate public boundary

Two shapes, neither chosen, neither implemented. They are spellings of the model in section 1, not a decision. Both would hide NEXUS runtime mechanics, MESH runtime and PORT realization, `Fiber`, and history internals; whether `Scope` is hidden is each shape's assumption.

**A. A definition, and an opaque running application with entries.** Today's decomposition, with the runtime removed from view.

```text
definition   define({ name, state, views, view, commands })                      (data, as now)
start        start(definition, { platform?, state? }) -> a running application with a lifetime
             (spelled as a scope-bound Effect, or a Promise plus `stop`: unproven which)
event        running.send(entry, ...args)      (returns completion; the runtime is Valance's)
             running.state                     (read-only)
platform     the `platform` option; a Web platform is a layer the caller supplies
SSR          Web.renderToHtml(definition, { primitives, state }) -> { html, state }
Web          Web.mount | Web.hydrate(running, { container, primitives })   and   Web.history(running, { urlOf, stateOf, navigate })
```
- *Evidence:* every browser tracer composes exactly start → mount/hydrate → history in this order, in one lifetime; SSR is start → render → end.
- *Assumes:* a "running application" is a first-class value that platform bindings take; entries are named by string keys as now; the author calls the steps.
- *Exposes:* definition, lifetime, entries, observation. *Hides:* runtime, `Running` internals, the connection.
- *Constrains:* the order and lifetimes of bindings stay the caller's responsibility; the string-keyed entry convention becomes visible API.

**B. A definition, and a platform host that owns the lifetime.**

```text
definition   define({ name, state, views, view, commands })                      (data, as now)
start        Web.run(definition, { container, primitives, platform?, history?: { urlOf, stateOf, navigate }, state? }) -> a stop
event        none for the author: platform bindings call entries inside the host; a headless test host exists for tests
platform     the `platform` option, and the host *is* the Web platform
SSR          Web.serve(definition, { primitives, state }) -> { html, state }; the host `Web.run` hydrates when it finds server HTML
Web          the host composes mount/hydrate and history; the author names only their functions
```
- *Evidence:* the platform-binding order and ownership never varied across 6 browser tracers; platform bindings are the only callers of external entry; history needed nothing from the author but two functions and a key.
- *Assumes:* the platform is the unit of composition and one application runs on one platform host; a non-Web target has its own host; tests use a headless host.
- *Exposes:* definition, one host call per platform. *Hides:* start, mount, hydrate, history, entry, `Running`.
- *Constrains:* running an application without a platform (tests, server-side logic) needs a separate public path; combining two targets or a custom history needs the lower-level pieces made public after all; the pieces are not demonstrated to be unneeded by authors, only unused by them so far.

### 6. Architectural invariants for any future public API

Each is marked with its evidence and how it was changed.

1. **One authoritative application state.** *Kept.* One `State`, built once, read-only outside. Nothing writes it except NEXUS commands.
2. **The view is derived from state: pure, total, and recomputed per committed state.** *Modified:* "derived" is not enough: `view` is called for every emitted state, so it must be total. Never stored.
3. **Application lifetime is one coherent scope, and bindings end before the application.** *Modified:* platform bindings (follower, target, history listener) end first, then the application, in the caller's scope. Verified by listener counts and finalizer order.
4. **Every state transition is a command in the application's binding table; external events enter there.** *Narrowed:* demonstrated for MESH intents and popstate; there is no other write path. *Not* demonstrated: that external callers are many.
5. **MESH does not own application state.** *Kept.* A program is data; each render is a function of a snapshot.
6. **PORT does not own application state.** *Kept, with an addition (12).*
7. **Browser history is a platform binding, not the application model.** *Kept.* The application's `urlOf` is pure over its state; a test asserts the definition names no Web, PORT, `window`, `history` or `popstate`, and the application runs in Chromium with no history.
8. **SSR and hydration create no second application state model.** *Narrowed:* the served state is a value of the application's own state; hydration adopts DOM and PORT is told the same tree. *Unspecified:* how the page carries that state to the client.
9. **A same-view state change is an update.** *Modified:* continuity is **view identity** (a view name), not program equality. Two views draw; one view never changes program.
10. **A view change replaces the realization.** *Kept, strengthened:* it always draws; nothing of the old view is reused.
11. **Application code is platform-independent.** *Kept for the catalog application only.* The first tracer's `app.ts` imports `Web` for its primitives table; the rule is stricter than the earlier example holds to.
12. **(added) Realization continuity belongs to the connection to a target, not to the application.** The record of what was drawn lives in `connect`; a second target would keep its own.
13. **(added) A URL names a navigation, not a state.** `stateOf(url)` yields the part of the state a URL carries, and a command completes it with data the application holds, deciding unknown items itself (`not-found`).
14. **(added) Every commit is rendered, in order, with no gap and no coalescing.** Atomic current-and-following (`values`) plus an in-order follower. Whether coalescing is ever wanted is not tested.

### 7. Deferred work

| Item | Why deferred |
|---|---|
| Router, route DSL | **unnecessary**: `urlOf`/`stateOf` plus one navigate command did everything; nothing needed matching, nesting or a registry |
| Link DSL / anchors | **architecture not proven**: buttons only; real anchors need a MESH/PORT story |
| Global store, second state system | **unnecessary**: one NEXUS state served every tracer |
| Component abstraction | **unnecessary**: MESH owns composition; the application owns state |
| Generic event bus, application middleware | **unnecessary**: one binding table and NEXUS's own event bus sufficed |
| Plugin architecture | **unnecessary**, and unprovable without a second consumer |
| CSS optimizer, dev server / HMR | **a later product layer**: no tracer touched them |
| Broad SSR framework (streaming, routes, state embedding, event replay, progressive hydration) | **a later product layer**; PORT Web lists replay and pre-hydration input as non-goals; embedding is unspecified |
| A public PORT or MESH abstraction | **unnecessary**: Valance consumes both as data and as PORT's three operations |
| Typed view ↔ state-variant relationship | **architecture not proven**: one union application; revisit when a second shows the same friction |
| `renderOf` / per-view host removal | **substrate not ready**: needs a NEXUS render-from-value entry |
| Application services (`runtime` layer) | **architecture not proven**: `Layer.empty` was enough for every tracer |
| Program-acquisition tooling (the copied `compile.ts`) | **a later product layer**: it is a build step |
| Failure policy (render / dispatch diagnostics, failed popstate) | **architecture not proven**: only a logged, ignored policy exists |
| Multiple targets per application, per-view state, layouts, async loading | **architecture not proven**: never exercised |
| Rendering coalescing | **architecture not proven**: every intermediate commit is rendered |

### 8. Recommendation for the next coding task

**Make external event entry self-contained, and remove the NEXUS runtime from every caller that is not Valance's own composition.** It is the one pressure that both candidate boundaries need, it is behavior-preserving, and the Stage 1 to 10 suites are its regression net.

Scope, concretely:
- `Running.invoke` returns an effect with `R = never`, run in the application's runtime by Valance, so its callers no longer need `running.nexus.runtime` (the `R` leak, section 4.1).
- `Web.history` and `connect`'s dispatch use it; the 9 test sites that wrap `Runtime.run(running.nexus.runtime, …)` stop doing so.
- No change to the binding table, entry keys, `Web.history`'s contract or any PORT/NEXUS/MESH package; no name decision (`invoke` may stay `invoke`), no new type, no new concept.
- Lifecycle observation (status, shutdown) is **not** in this task: it is the same family but a separate question, and it is not needed to remove the runtime from callers of events.

Acceptance: the full matrix passes unchanged in meaning (16 unit, 16 jsdom, 20 Chromium); `grep "nexus.runtime"` finds only Valance's own composition; a focused test shows `invoke` succeeds and fails (`UnmappedCommand`) with no runtime in the caller's hands; mutation-check that an event still runs inside the application's runtime (a platform FiberRef reaches the command, and does not reach the caller: NEXUS I44).

What it deliberately does not decide: the public spelling (candidate A's `send`, candidate B's hidden entry), whether `Scope` stays visible, or whether an author's host page ever needs an entry.

---

## Stage 12: application event entry is self-contained

*Stage 11's first pressure point (4.1), acted on. An execution-boundary change only; NEXUS, MESH, PORT, `Web.history`'s contract, the binding table and every example application are unchanged.*

**Before.** `Running.invoke` and `Running.dispatch` returned effects requiring `R`, satisfiable only by the application's runtime, so every caller wrote `Runtime.run(running.nexus.runtime, …)`: two sites in the package (`connect`'s dispatch, `Web.history`'s popstate) and nine in tests.

**After.** One private function in `start`, `inApplication`, forks the effect into the application's runtime (`Runtime.runFork`) and joins the handle, interrupting the application's fiber if the caller is interrupted. `invoke` and `dispatch` return `Effect<_, UnmappedCommand | … | E>` with **no requirement**, so any caller runs them on the default Effect runtime. `Web.history` calls `running.invoke` and logs any failure or defect (as before, the follower is never ended by a command); `connect` forks `running.dispatch` on the default runtime; the test sites call `invoke`/`dispatch` directly. `grep "nexus.runtime"` now finds `index.ts` (the composition) and one test that subscribes to the application's NEXUS event bus (observation, not event delivery).

**Isolation, baselined first.** The focused test (`packages/valance/test/entry.test.ts`) was run in the old calling form against the **unchanged** source and passed, which fixes what the semantics were; the same assertions then pass with the new form:
- the platform's Clock reaches the command; neither it nor a command's own FiberRef write reaches the caller, and a later event does not see an earlier event's write (NEXUS I44);
- the caller's FiberRefs **at start** flow into the application; a change in the caller after start does not reach an event (so "caller → application" means start-time, not per-event, exactly as before);
- an unmapped key is the existing `UnmappedCommand` failure; a defect in a command reaches the caller as a defect; interrupting the caller interrupts the command;
- a type-level assertion that `invoke` has no environment.

Mutation checks: running the event in the caller's context fails the platform and caller-FiberRef tests; dropping interrupt propagation fails the interruption test.

**Validation.** Build, typecheck; 22 unit (16 + 6), 16 jsdom, 20 Chromium, all passing; lockfile and manifests untouched (one NEXUS 0.10.1, one `mesh-runtime` 0.7.0, one Effect).

### CONFIRMED
External event delivery can be encapsulated behind the VALANCE application boundary without changing application semantics: no behavior in the existing matrix changed, and the isolation semantics are those the unchanged code had.

### INTERNAL
NEXUS runtime execution is an implementation detail of `start`. A caller of `invoke` or `dispatch` holds no runtime and provides no services. `Running.nexus` remains on the type for lifecycle observation only.

### OPEN
- **Lifecycle observation** (`status`, `shutdown`, 7 test sites) still goes through `running.nexus`. Separate question, not touched.
- `Running<S, E, R>`'s `R` is now unused by its members (it still constrains the definition's commands). Removing it is a signature cleanup across `mount`, `hydrate`, `history` and the tests, not done here.
- Observing the application's own NEXUS events from outside (`Event.subscribe` in one test) is the last runtime use outside the composition and is not event delivery.
- Whether an application *author* ever needs an external entry (Stage 11 4.1) is still undemonstrated; this change removed the leak, not the question.
- The public Application API is undecided.

### NEXT
With the execution boundary clean, the next architectural decision is lifecycle: whether and how an application's status and shutdown are observed without `running.nexus`. It is the last way the runtime shows through `Running`, and it decides whether `nexus` can leave the type, which both Stage 11 candidate boundaries need before either is chosen.

---

## Stage 13: the lifecycle boundary (a tracer that stopped)

*Question: what lifecycle semantics does VALANCE itself need, and can they be owned without `running.nexus`? Result: VALANCE's lifecycle concept already exists and needs no NEXUS handle; a status or stop surface is not justified by anything but tests. No source changed; four tripwires were added (`packages/valance/test/lifecycle.test.ts`).*

**Current uses of `running.nexus`.** None in VALANCE source (the only mention is a doc comment). Eight test sites:

| Use | Sites | What it is |
|---|---|---|
| `status` = Running at each step | 4 | NEXUS observation, **redundant** with the platform resource counts `{1, 0}` those tests assert beside it |
| `status` = Stopped after the scope closed | 2 | NEXUS observation of "scope close ends the application"; derivable from counts `{1, 1}` plus `states` ending |
| `shutdown` | 1 (`lifecycle.test.ts`) | the **only** way an application ends before its scope; drives the documented `Mounted.followed` Success outcome |
| `Event.subscribe` in `nexus.runtime` | 1 | observing the application's own NEXUS events; not lifecycle |

**Behavior established (characterized before any conclusion).**
- *Scope close:* platform resources released once; `states` completes normally after the last commit; `invoke` is refused as a defect; the last state stays readable; NEXUS status `Stopped`.
- *`shutdown`, repeated and concurrent (4 calls):* idempotent, one release, the same observable end as a scope close, and closing the scope afterwards is harmless (no second release). This is NEXUS's documented behavior and VALANCE adds nothing to it.
- *No self-termination:* NEXUS documents exactly two ways an application ends (the caller's scope, or `Application.shutdown`); nothing ends one on its own.

**What VALANCE actually needs.** One lifetime, the caller's `Scope` (Stage 11, invariant 3), and a way for its own bindings to learn the application ended. It already has the second, without NEXUS: `states` and `values` complete (so `connect`'s follower and `Web.history`'s follower end by themselves), `Mounted.followed` reports it, and new work is refused as a defect. VALANCE code never asks "what is the status".

**Why no boundary was implemented.** A `status` would be `Running | Stopped` and nothing else observable (`start` returns only once `Running`; `Created`, `Initializing`, `Stopping` and `Failed` are NEXUS states a caller of VALANCE cannot see), so it would restate "has `states` ended". A `stop` would be a second termination route that no VALANCE code or example uses. Both would be new API justified only by tests, and the evidence does not require them.

**The precise reason `nexus` is still reachable.** The *early end*, an application ending while its scope is open, can happen only through `Application.shutdown(running.nexus)`. VALANCE documents what the follower does then (`Mounted.followed` Success; the target stays until the scope closes) and one test pins it. If `nexus` were private, that outcome would be unreachable: a documented behavior with no caller. So the question is not "how is the status observed", it is "does VALANCE promise an early end".

**Also inspected.** `Running<S, E, R>`'s `R` is unused by every member since Stage 12 (17 mentions across signatures and tests); removing it is mechanical and independent of lifecycle.

### CONFIRMED
VALANCE's lifecycle is the caller's scope. An ended application is observable without NEXUS (resources released, `states` completed, `invoke` refused, `Mounted.followed`), and those signals agree with NEXUS's own `Stopped`. No non-test VALANCE code reads `Running.nexus`.

### OPEN
Whether VALANCE promises an early end (an application stopping while its scope is open) and, if so, whether that is `Mounted.followed`'s Success outcome and a way to cause it, or whether the scope is the only route. Everything else about lifecycle follows from that decision.

### NEXT
Decide whether early end is part of the application model. If it is not (scope is the only route), `Running.nexus`, the `shutdown` test and `followed`'s Success outcome can leave the public surface together; if it is, it needs a VALANCE-owned spelling, and that is a public-API decision.

---

## Milestone: validated VALANCE composition

Validated in Node, jsdom and real Chromium against NEXUS 0.10.0 (published as `@valancex/nexus@0.10.0`; the `values` change is `79ce508`), MESH 0.6.0 (`173a828`) and PORT Web 0.2.1 (`d707b1d`), with MESH and PORT unchanged throughout and NEXUS changed only by `values` (Stage 1):

```text
one Valance application
    owns one NEXUS state and one platform lifetime (acquired once, released at scope close)
    and may select among several MESH programs

application state ──▶ view(state) program selection ──▶ MESH render-v1 ──▶ PORT realization
same-program state change ──▶ PORT update (same DOM nodes)
program change            ──▶ PORT draw   (fresh nodes; continuity is the composer's fact)

browser popstate ──▶ application-owned stateOf ──▶ the application's navigate command ──▶ state ──▶ program selection and render
application URL transition (urlOf(state) changed) ──▶ Web.history pushState
```

What carries this: the current render and later renders are observed atomically (`values`); the composer (Valance) keeps the drawn render and decides draw versus update; route state is ordinary application state; what a URL means (`urlOf`, `stateOf`, canonicalization before start) is application code; `Web.history` synchronizes application URL transitions with browser history and does not detect navigation by comparing the browser URL with the application state.

Evidence: NEXUS 492 tests; Valance 16 unit/boundary tests (12 `Web.history`, 4 boundary), 12 jsdom tracer tests, 12 Chromium acceptance tests; mutation checks on the three critical guard invariants (each caught by both the unit suite and Chromium).

New abstractions that survived: `define`, `start`, `mount`, `hydrate`, `Running.states`/`Running.invoke`, `Web.target`, `Web.history`, `renderToHtml`. **Not** introduced, and not justified by anything observed: a router, routes or a route registry, a URL codec or mapper, navigation events, redirect or canonicalization APIs, a link primitive, a browser abstraction, rollback hooks.
