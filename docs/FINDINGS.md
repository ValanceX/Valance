# Tracer findings: `@valancex/valance` 0.0.1

*Evidence base: NEXUS 0.10.0 (packed from the NEXUS branch, unpublished; see `vendor/`), MESH runtime/compiler 0.6.0, PORT Web 0.2.1; Node 22; Chromium 1194 via Playwright 1.56.1. No MESH or PORT source was changed. Constraints written before code: [CONSTRAINTS.md](./CONSTRAINTS.md).*

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
