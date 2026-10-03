# Tracer findings: `@valancex/valance` 0.0.1

> **How to read this file.** It is a chronological log of guarded tracers. Where an early stage describes a mechanism that a later stage replaced (the `path` option of `Web.history`, URL-equality as the push guard, `Stream.drop` as the baseline), the later stage wins. The **authoritative** statements are [Stage 7](#stage-7-the-webhistory-contract-stabilized) (the `Web.history` contract) and the [Milestone](#milestone-validated-valance-composition) at the end. Stages 3 to 6 are kept as the evidence trail.

## Canonical lifecycle architecture (consolidated at Stage 41; evidence in Stages 29 to 40)

This section is the one statement of the application / mount / command lifecycle. It adds no new finding. The stages below are the chronological evidence, and where an older paragraph conflicts with this section, this section governs (the superseded statements are indexed at its end, and the older paragraphs keep their original text). Constraint numbers refer to `docs/CONSTRAINTS.md`.

**1. Two Scopes, two owners.** `start` and `mount`/`hydrate` each take *a* Scope from the caller and create none.

| | owned through the application's Scope | owned through a mount's Scope |
|---|---|---|
| contents | NEXUS runtime, application state and `State.values`, the command registry, platform resources | the follower, the target, the mount-local pending dispatch machinery (`pending`), the diagnostic exit ledger (`dispatched`) |
| ends when | that Scope closes | that Scope closes (or, for the follower only, when the application's value stream ends) |

**2. Application shutdown (Stage 29, unchanged).** When the application's Scope closes: admission closes (synchronously); every admitted command is interrupted and awaited; then NEXUS terminates the runtime and ends the state stream; platform resources are released last; then `Scope.close` returns. No command exits after resources release. The registry is the application's, covers `invoke` and event commands alike, and owns commands only (daemon and escaped fibers are outside it; structured children are covered by their command). An uninterruptible command that needs new admission can hold the drain open: the application then stays alive and its resources are not released under it (documented liveness limitation, C23).

**3. A mount's lifetime is the caller's Scope's (Stage 38, C24).** `mount` does not relate its Scope to the application's. All three arrangements are valid: *shared* (one Scope holds both: the README usage; mounts end first, in reverse creation order, then the application), *parented* (`Scope.fork` of the application's Scope: same order, and a mount can still close alone), *independent* (own Scope). Consequently application close does **not** always unmount a target: it does so only for shared or parented mounts. For an independent mount the application's close leaves the target drawn and inert: state stays readable, commands and events are refused (`NEXUS: the runtime has begun terminating`), the follower has ended with `Success`, and the target is released only when the mount's own Scope closes. That is intended, not an accidental capability. A mount created after the application ended fails by itself (`the application ended before its first render`). With no mount at all the application is fully alive.

**4. Four notions that are not one lifecycle (Stage 39, C25).**

| notion | owner | decided by |
|---|---|---|
| admission | the application | `inApplication`: refused as a defect once draining begins (`VALANCE: admission is closed (draining)`), by NEXUS after termination; never by the mount |
| admitted command lifetime | the application | the registry; ends when the command exits or the application's drain interrupts it. **Closing the mount that reported an event does not end its command** |
| mount lifetime | the caller (the mount's Scope) | follower and target end with that Scope |
| application lifetime | the caller (the application's Scope) | closing it runs section 2 |

`invoke` and a click enter the same boundary and are the same kind of command. The mount is the *source* of a click (its drawn render selects the intent, its ledger records the exit); the application is the *owner* of everything that happens to the command.

**5. The event-exit ledger and `settled` (Stage 40, C26).** `Mounted.dispatched` is a mount-owned, append-only record, in settle order, of the exits of the dispatches that mount made; entries are never removed or reordered. It keeps receiving exits after the mount's target has closed, until every command that mount dispatched has exited (at the latest the application's close, except under C23). It is not application state, not on `ApplicationHandle`, not read by Valance, and not part of the application programming model: a diagnostic observation facility for hosts and tests, alive as long as `Mounted` is held. It is the only place an event command's outcome is recorded (a failure or defect is visible nowhere else). `Mounted.settled` is a barrier over the dispatches an *open* mount still holds; it does not read `dispatched`, and on a closed mount it returns at once without waiting for exits still to arrive. No ids, subscriptions, retention or cleanup exist.

**6. What not to assume.**
- Mounts are not application-owned; the two Scopes are related only by what the caller passes.
- Application close does not always unmount every target (section 3).
- Closing a mount does not interrupt the commands its events started; application close does (through the registry).
- Event admission and event execution lifetime are different things with the same owner; neither is the mount's.
- `settled` does not wait for all historical or future exits, only for the open mount's held dispatches, and never reads the ledger.
- The ledger is not application state and not a public event history; do not build behavior on it.
- "The target is unmounted before the drain" is a property of shared or parented Scopes, not an invariant.
- State, `values` and the registry are unaffected by any mount arrangement; resource safety (command exit before resource release) is independent of mount Scopes.

**7. Constraint map.** C6 (the caller's Scope owns lifetime) with C24 (mounts), C20 to C23 (command lifetime, admission, ownership boundary, liveness), C25 (event commands), C26 (the ledger). Stage 30's clarification of C20: "draining begins" means the application's Scope closing; `Application.shutdown(running.nexus)` is the substrate's early end, reachable only through `./internal`, and does not pass the drain.

**8. Superseded statements (kept as history, do not cite).** (a) Stages 26 to 28, 34 to 37: that a mount's close interrupts the commands its events started (removed in Stage 39). (b) Stages 28 to 33: "the target is unmounted before the drain" without the shared/parented qualifier (Stage 37). (c) Stage 11, invariant 3 without "one Scope" (Stage 38). (d) Stage 36's two-model tables describe the alternatives; the application-owned column is the adopted one.

**9. Outside this contract.** Packaging of `Mounted` and `DispatchExit` is not lifecycle; it was decided in Stage 42 (`Mounted` stays on the main entry as the declared result of `mount`/`hydrate`; the diagnostic `DispatchExit` lives behind `./internal`). The shape of `Mounted` itself was decided in Stage 43 (kept: every member is mount-owned information no other public surface provides). Stale-result handling, error presentation and event-exit retention policy are application or product policy (Stages 31 to 34).


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
3. **Application lifetime is one coherent scope, and bindings end before the application.** *Modified:* platform bindings (follower, target, history listener) end first, then the application, in the caller's scope. Verified by listener counts and finalizer order. *(Stage 38 precision: "in the caller's scope" means one Scope holding both; with separate Scopes only each mount's own Scope ends its bindings.)*
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

## Stage 14: early termination is not part of the VALANCE model

*Question: does VALANCE promise that an application may end while its owner scope is open? Answer from inspection of the source, constraints, README and examples: no. Source unchanged; two tests relabelled and this note added.*

**Evidence against it being a VALANCE concept**
1. *Constraints and docs.* C6: "the caller's Scope owns its lifetime". The README: "closing the scope ends everything". Nothing states or requires an early end.
2. *No author asks for it.* No example application or package source calls `shutdown` or reads `status`; the only references are the doc comments below and tests.
3. *No platform binding asks for it.* `connect`, `Web.history` and `renderToHtml` never request termination. They tolerate it: followers end when `states` ends.
4. *Not needed by SSR, browser, history or hydration.* `renderToHtml` is start, render once, end, through its own scope; the 20 Chromium tests (history, hydration, keyed updates) never end an application early.
5. *Only reachable through the substrate.* NEXUS documents exactly two ways an application ends (the scope, or `Application.shutdown`) and no self-termination. Without `running.nexus`, nothing can end an application before its scope.
6. *Observable only as a follower outcome.* The sole VALANCE-visible trace is `Mounted.followed` resolving to Success, a property with **no non-test consumer**. Its Interrupted (scope closed) and Failure (render diagnostic) outcomes need no early end.
7. *A consequence of exposing `nexus`.* The single test that exercises it reaches for `running.nexus` to do so; `connect`'s "application ended before its first render" branch is likewise reachable only that way, and is untested.

**Source comments that state a substrate fact, left untouched.** `start`'s doc ("closing it, or `Application.shutdown(running.nexus)`, ends the application") and `Mounted.followed`'s doc ("Success when the application ended") describe what NEXUS can do, not what VALANCE promises. They should be reworded when the public API is decided, not before.

**What remains as the invariant when the owner scope closes** (each pinned by an existing test, none needs `nexus`, except where noted):
- the follower is interrupted, before the application ends (`followed` is Interrupted);
- the target is unmounted (the container is emptied);
- platform bindings end first: the popstate listener is removed (unit and Chromium);
- the platform's resources are released exactly once;
- `states` completes after the last commit; new events are refused as defects; the last state stays readable;
- (NEXUS observation, redundant with the above) status `Stopped`.
Not pinned, noted as a gap rather than filled: an in-flight dispatch being interrupted when the scope closes.

**Tests.** The two early-end tests (`examples/tracer-web/test/lifecycle.test.ts`, `packages/valance/test/lifecycle.test.ts`) are relabelled: they pin a *tolerance of a substrate event*, not a VALANCE promise. They keep using `running.nexus` on purpose; the access is not hidden for grep's sake. Every other lifecycle assertion is, or can be, written on VALANCE-observable behavior (counts, `states`, `invoke`, `followed`, the container, the listener); the `status` checks remain as redundant NEXUS observation.

### CONFIRMED
The owner scope is the only application lifetime VALANCE has. Early termination is a NEXUS capability that VALANCE tolerates and does not promise, request, or depend on.

### OPEN
Whether `Running.nexus` stays on the type at all: it is now read only by tests, for substrate observation. That is a public-API question, not a lifecycle one. Also open, and unchanged: the in-flight dispatch gap above.

### NEXT
The lifecycle no longer constrains the public API. Candidate A or B (Stage 11) may be chosen without an `Application` stop or status surface. The decision that remains is whether tests get substrate access (an internal or test-only seam) or the field stays on the type.

---

## Stage 15: public API shape tracer (two candidates, one definition)

*A structural comparison, not a decision. No VALANCE source changed. The tracers are `examples/tracer-web/src/api/shape-a.ts` (52 lines) and `shape-b.ts` (43), built only from today's public exports; the spellings are local and decide nothing. One tiny test (`test/api-shape.test.ts`, 2 tests) drives both; the existing matrix ran unchanged (26 unit, 18 jsdom = 16 + 2, 20 Chromium). The shared definition gained one same-view intent (`home/reverse`), because the catalog had none and B needs a same-view update that is not an external entry.*

### Concrete shapes

**A. The caller starts it and holds a handle; bindings attach to the handle.**
```ts
const handle = yield* A.start(app, { platform, state: initialStateAt(window, items) });   // handle = { state, invoke }
yield* A.mount(handle, { container, primitives });                                         // or A.hydrate
yield* A.history(handle, { window, urlOf, stateOf, navigate: "app/navigate" });
yield* handle.invoke("app/changeItems", [{ value: items }]);                               // caller delivers an entry
const s = yield* handle.state;                                                             // caller reads state
```
**B. The platform owns the run; no handle.**
```ts
yield* B.run(app, { container, primitives, platform, state: initialStateAt(window, items), hydrate?: true,
                    history: { window, urlOf, stateOf, navigate: "app/navigate" } });      // returns void
```

### Structural comparison (not scored)

| | A | B |
|---|---|---|
| Author code | the definition (identical in both) | the definition (identical in both) |
| Platform binding code | 3 calls, in an order the caller must know (start, mount or hydrate, history) | 1 call, 6 options; the order is inside |
| External entry | `handle.invoke(key, args)`, on the default Effect runtime | none for the caller; only what the platform originates (popstate) and MESH intents |
| State observation | `handle.state` (one read); `states` stays with the bindings | none; observable only through the DOM and the URL |
| Lifetime | the caller's Scope, held by the caller | the caller's Scope, held by `run`; the same Scope |
| NEXUS/MESH/PORT leak | see below | see below |
| Invented | a handle narrower than `Running`, plus a private channel from handle to full `Running` for bindings | an explicit `hydrate` flag; `state` passed in (canonicalization stays the caller's pre-step) |
| Harder or impossible | sequencing errors are expressible (mount twice, history before mount, bind to an ended application) | external entry, state read, headless run, a host page pushing data, the hydration result `{ adopted }` and `Mounted.followed/settled/dispatched` (the tracer returns `void`; A's wrappers also drop them) |
| Simpler | the existing composition is kept; one handle serves several bindings; a host can push data | no handle to pass or misuse; ordering and the mount-or-hydrate call choice are not the author's |

**Leakage, both shapes.** The definition's own types: `Nexus.Command`, `Nexus.Mesh.bind`, `Nexus.State.StateHandle`, and `Ambient` (`EnvironmentShape | EventBusShape`). `platform` is a `Nexus.Application.Platform`. `StartError` is NEXUS's; mount failures are `Mesh.MeshDiagnostics`. History's `stateOf` returns a MESH `BoundaryValue`. PORT shows only as `WebPrimitives` and the Web target. **A only:** `handle.invoke`'s arguments are `Mesh.IntentArgument` and its errors `Mesh.UnmappedCommand | E`. **B only:** nothing beyond the shared set, because B has no entry.

### Hidden common machinery (explicit, neither shape removes it)

1. **`Running`'s composition face:** `values`, `dispatch`, `render` for targets; `states`, `state`, `invoke` for history. Both shapes still build it in `start` and hand it to bindings. In B it is created inside `run` and never returned.
2. **The ordering and scope protocol:** start, then mount or hydrate, then history, in one Scope, with bindings ending before the application. In A the caller supplies it; in B `run` does. The invariant is the same.
3. **The binding protocol:** the set of members a binding may use on the application. A made it explicit (a WeakMap) because a narrow public handle needs it; B hides it inside `run`; neither shape can drop it.
4. **Application policy before start** (what the URL means; canonicalization): outside both shapes, passed as `state`. A hook would be new API; neither tracer added one.
5. **The `"app/navigate"` entry-key convention:** history requires the application to register a binding under a name the caller passes. Present in both.

### Special questions

**Does B eliminate a meaningful abstraction or move `Running` into Web?** It moves it. `shape-b.ts` is `start`, `mount | hydrate`, `history` in one function over the same `Running`; `Running`, the binding protocol, and `core start` all still exist and are still needed (a headless application, tests and a non-Web platform all need `start` without `run`). What B removes is the author's *knowledge of the sequence* and the handle's visibility. It also removes capabilities (entry, state read, the hydration result) unless `run` returns something, and a `run` that returns `{ invoke, state }` is A's handle. SSR is already B-shaped today: `renderToHtml(app, options)` returns `{ html, state }` and never exposes `Running`, so both shapes coexist in the present code.

**Is A's `Running` an application concept or a wrapper around NEXUS execution?** Both, fused. Two members are the application's external face: `state` and `invoke` (what a caller may read and may enter). The rest (`values`, `dispatch`, `render`, `states`) are the protocol between VALANCE core and bindings; `nexus` (read only by tests) is the substrate. The tracer separated the two with no change to VALANCE and one private map, which shows they are separable and that the second set cannot be removed, only hidden.

### Which parts are application concepts

- **Application:** state, `view(state)`, the binding table, the scope, `urlOf` and `stateOf`, the pre-start policy, the external face `{ state, invoke }` (if an application has one).
- **Platform:** primitives, container, hydrate or mount, history writes, `popstate`, server HTML.
- **Substrate:** the runtime, FiberRefs, `Running`'s composition face, `Platform` (NEXUS), diagnostics.

### Unresolved
- Whether an application *author* ever needs `{ state, invoke }` or only bindings do. The tracers show what each shape costs; they cannot show need. Only B makes the author's need visible by removing the means.
- Whether `run` must return anything, since the hydration outcome and the follower's end are information a caller may want.
- How the page carries the server's state to the client (`state` in B, `state` option in A): unspecified in both.
- The error and type vocabulary: NEXUS types appear in every public signature of either shape.
- Core `start` is needed by both; whether it stays public is open.

### Recommended next experiment
Find out whether an application author has a use for an external face, with no new API: write one real author-side requirement that A can express and B cannot (a host page pushing data into a running application), and check whether it is the application's concept or the platform's. If it is the platform's, B stands and `Running` becomes internal; if it is the application's, A's handle is the application concept and B's `run` is a convenience over it.

---

## Stage 16: is there an application-level external face?

*Evidence only; no VALANCE source changed, neither candidate chosen. One test-local example (`test/external-face.test.ts`, 2 tests) and an inventory of who touches `state`, `states` and `invoke` today.*

### Inventory (who actually uses the application-facing members)

- **Non-test source:** `Web.history` (`invoke`, `states`, `state`) and `renderToHtml` (`state`, to return for embedding). Both are platform bindings.
- **Author-side example source:** none. `catalog/app.ts` mentions `Running.invoke` once, in a comment. The `app/*` entry keys (`app/open`, `app/changeItems`, `app/home`, `app/navigate`) are *authored* in the definitions, but are called only by bindings and tests.
- **Tests:** about 25 `invoke` calls, all harness-driven. `packages/valance/test/entry.test.ts` and `lifecycle.test.ts` are headless hosts: `start`, `invoke`, `state`, scope, no target.

### The example

A host page announces data as a window event; one producer function translates it to `app/open` and must reach the same command a MESH intent reaches (`home/open` and `app/open` are both bound to `catalog.open`). It is written once and handed (1) the A-style handle `{ state, invoke }` or (2) the full `Running` a binding gets. Result, identical in both: a MESH click on Beta and the producer's `open B` leave equal states (`details B`); an id the application does not have (`""`, reached from MESH by an empty list and "Open first") gives equal `not-found` states either way. **The function is unchanged between (1) and (2): it needs only `invoke`.** What it needs from outside the application: the entry; a Scope, to remove its listener before the application ends (it did, `live.size` 0); the entry key string and its argument contract (`{ value }`, untyped, defined in the definition); a decision about failure (logged here). Mutation: pointing the producer at another entry fails both tests.

| Requirement | Demonstrated outside tests? | Entirely a platform binding? | Needs the application to expose an entry? |
|---|---|---|---|
| 1. Host-driven data push | **no**; the nearest real analogue is popstate | yes, as a producer binding (the example) | yes: the binding enters by key |
| 2. Programmatic command, same semantics as MESH | **yes**: `Web.history` does exactly this | yes | yes |
| 3. State observation | **yes, by bindings only**: history (`states`, `state`), SSR (`state`) | yes | yes (`state`, `states`) |
| 4. Multiple producers | **yes**: MESH intents, popstate | the same mechanism (below) | yes |
| 5. Headless host | **yes, in tests**: start, `invoke`, `state`, scope | there is no provided binding: the host's own code is the binding | yes |

### Findings

1. **The question's dichotomy does not hold.** "The application exposes an external face" and "entirely a platform binding that dispatches application commands" are not alternatives: a binding that dispatches commands *needs the application to expose an entry*, because nothing else can receive it. Every requirement is representable as a binding (A: no) and every one needs the entry (B: also no). The face exists in either world; what varies is *who is allowed to hold it*.
2. **One mechanism, two doors.** All outside producers enter through `invoke(key, args)` into the one command table. MESH intents enter through `dispatch`, which resolves a handler id against a drawn render and reaches the same table. The example shows equal semantics through both doors. Producers do not need different concepts.
3. **What the pieces need.** A target needs `values` and `dispatch`. A pure producer needs only `invoke`. `Web.history` is both a producer and an observer: `invoke`, `states`, `state`. SSR needs one `state` read. The handle `{ state, invoke }` is therefore: *enter by key* and *read once*; continuous observation (`states`) is not in it and is used by one binding.
4. **What `Running`'s `{ state, invoke }` represents.** The contact surface of the application for code that is neither the definition nor a MESH render. The *entries* (the `app/*` keys, and which commands they bind) are application semantics: the author decides what an outside caller may do. The *handle* that carries them is plumbing. Its demonstrated users are exclusively platform bindings and tests (including headless hosts).
5. **Not demonstrated:** any author-written host code, or any external state read that is not a binding. Whether `state` has a use beyond SSR and history is open.
6. **A hazard common to every producer, not specific to a shape:** a synchronous callback turned into entries needs ordering, failure handling, and a Scope. `Web.history` solves this with a queue and one follower; the example does the minimum and does not. Nothing here adds a concept; it says what any producer carries.

### Answers
- **Is the external face an application concept or integration plumbing?** Both: the entries are the application's; the handle is plumbing.
- **Can the public API decision be made?** The architecture is determined; one question that the code cannot answer remains.
- **The one remaining unknown:** *who is the audience of `{ state, invoke }`: only Valance's own bindings (then it can stay internal, and B composes them), or code others write (a custom producer, a headless host, another platform)?* The example shows such code is trivial to write when handed `invoke`; whether VALANCE supports it is product intent, not something the architecture decides.

---

## Stage 17: the first public application boundary

*Implemented, not a tracer. Decision from Stages 15 and 16: the application has an external face, it is `{ state, invoke }`, and the composition machinery behind it is not part of it.*

### What changed
- **`start` returns an `ApplicationHandle<S, E>`**: `state` (one read of the committed state, `Effect<S>`) and `invoke(key, args)` (the Stage 12 entry: runs in the application's own context, no runtime, interruption and defects pass through). Frozen; no other member.
- **`Running<S, E>` is internal** (`src/internal.ts`): `nexus`, `render`, `values`, `dispatch`, `states`, `state`, `invoke`. Its `R` parameter, unused since Stage 12, is gone. A handle is registered against its `Running` in a module-private map, so nothing reachable from a handle leads there.
- **Bindings take the handle** and resolve the `Running` themselves: `mount`, `hydrate`, `Web.history`; `renderToHtml` takes the definition, as before. Web convenience is unchanged in behavior.
- **`./internal`** is a new package entry (`handleOf`, `runningOf`, `Running`, `Viewed`): the binding protocol for binding authors and for tests that must reach the substrate (lifecycle status, spies on `values`/`invoke`). It is not the application API and carries no stability promise. Package `exports` blocks every other deep import.
- No change to NEXUS, MESH, PORT, the binding table, entry names, command semantics, history, SSR, hydration, keyed identity, FiberRef isolation, the dependency graph.

### Evidence
- The compiler enforced the boundary: every test that reached `nexus`, `states`, `values`, `render` or `Running` through what `start` returns stopped compiling, and now resolves it explicitly through `runningOf`.
- New unit tests: the handle has exactly `state` and `invoke`, is frozen, and has none of `nexus`, `values`, `dispatch`, `render`, `states`, `runtime`, `shutdown`, `status` (also asserted at the type level); `state` is a read, not a subscription; invalid arguments to a known entry fail as the command's `CommandValidationError` and change nothing.
- The Stage 16 producer is now real author-side code (`examples/tracer-web/src/catalog/host.ts`, handed only the handle). A MESH click and the producer reach the same `catalog.open` and leave equal states, including `not-found` for an id the application does not have; the host reads state through the handle alone; its listener is removed before the application ends.
- Inherited and unchanged (they now run through the handle): caller FiberRefs at start flow into the application, application FiberRefs do not leak back, caller interruption interrupts the command, closing the Scope releases resources exactly once.
- Candidate A's tracer (`shape-a.ts`) was deleted: it is the real API now. Candidate B's tracer stays, composing the same bindings over the handle.
- Matrix: build, typecheck; 29 unit, 19 jsdom, 20 Chromium.

### Public-surface audit
| Export | NEXUS / MESH / PORT types in it | Classification |
|---|---|---|
| `ApplicationHandle.state` | none | public |
| `ApplicationHandle.invoke` | `Mesh.IntentArgument` (argument), `Mesh.UnmappedCommand` (error) | argument encoding: **application-facing leak, later task** (a MESH boundary value in a host's call); the error is the established error model: **intentional** |
| `define`, `ApplicationDefinition`, `View`, `Ambient` | `StateHandle`, `Mesh.bind` / `Binding`, `Mesh.Program`, `EnvironmentShape`, `EventBusShape` | **intentional public substrate dependency**: the author writes NEXUS commands and supplies compiled MESH programs |
| `start`, `StartOptions`, `StartError` | `Application.Platform`, `ApplicationInitError`, `StateInitError` | **intentional**: the one place services and capabilities enter |
| `mount`, `hydrate` | `MeshDiagnostics` (error) | **intentional**, binding-level |
| `Mounted`, `DispatchExit` | `Mesh.Dispatched`, `MeshDiagnostics`, `UnmappedCommand` | **internal-only but exported**: observation facilities (`dispatched`, `settled`, `followed`) used by tests; remove or narrow when `mount`'s result is decided |
| `Target`, `HydratableTarget`, `TargetFactory`, `Report` | `RenderTree`, `BoundaryValue` (MESH runtime) | **intentional**: PORT's contract as a binding author uses it |
| `Web.history`, `HistoryOptions` | `stateOf` returns a MESH `BoundaryValue` | **application-facing leak, later task** (the application's own function returns a MESH value) |
| `Web.target`, `renderToHtml`, `Served` | PORT Web types | **intentional**, Web layer |
| `./internal`: `Running`, `Viewed`, `handleOf`, `runningOf` | `RunningApplication`, `Render`, `MeshDiagnostics` | **internal binding protocol**, unstable; deliberately a separate entry |

The handle names no runtime, no fiber, no scope and no lifecycle type. Remaining NEXUS and MESH types in the public surface are the table above; removing them is a package-boundary exercise, not part of this change.

### CONFIRMED
- VALANCE has an application-level external face.
- It is narrower than the internal `Running`: `state` and `invoke` are application-facing; `values`, `dispatch`, `render`, `states` are internal binding/composition capabilities.
- NEXUS runtime and fiber machinery is not part of the application face.
- Application lifetime remains the caller's `Scope`; status and shutdown are not part of the public model.

### DECISIONS
- Custom and headless external producers are supported by the application face (a host page, a custom producer, a headless host hold the same handle as Valance's own bindings).
- Web is a convenience and platform layer; it does not own the application concept.
- The internal `Running` remains substrate and composition machinery, reachable only through `./internal`.

### DEFERRED
Complete removal of NEXUS and MESH types from every public signature (notably `IntentArgument`, `BoundaryValue`, `Mounted`); final package and module organization (including whether `./internal` stays a separate entry); `renderOf` and per-view hosts (a NEXUS render-from-value entry); CSS optimizer; dev server and HMR; additional platform targets; application services; async loading; rendering coalescing.

---

## Stage 18: application API vocabulary boundary

*An ownership analysis of the application-facing types Stage 17 flagged. No source changed: the evidence does not establish that any of them is owned by something other than what they already are, and each replacement would be a rename. The only measurement code was a throwaway probe, deleted.*

### Method
Ownership from semantics, traced end to end: a MESH intent reaches the table through `dispatch`; an external producer through `invoke`; both call the **same binding function**, `(args: ReadonlyArray<IntentArgument>) => Effect`, made by `Mesh.bind(command, toInput)`. History reaches it through `invoke` too, with `{ value: stateOf(url) }`.

### Ownership table

| Type | Declared in | Owner of the *concept* | Where the application meets it |
|---|---|---|---|
| `IntentArgument` (`{ value: BoundaryValue } \| { absent: true }`) | MESH runtime | MESH: the boundary data model (spec §9.8) | the `toInput` of **every binding the author writes**; the argument of `invoke`; built by `Web.history` |
| `BoundaryValue` | MESH runtime | MESH | inside `IntentArgument.value`; `HistoryOptions.stateOf`'s return type |
| `UnmappedCommand { component, name }` | NEXUS (`Mesh` adapter) | NEXUS adapter, over MESH's `component/name` addressing | `invoke`'s error; also what `dispatch` fails with; built by Valance in `invoke` |
| `Binding`, `bind`, `Mesh.Program` | NEXUS (`Mesh` adapter) | NEXUS adapter | the author's command table and views |
| `CommandValidationError` | NEXUS (`Command`) | NEXUS | flows into `E` (every `Mesh.bind` adds it); the failure of invalid arguments |
| `MeshDiagnostics`, `Dispatched`, `DispatchExit`, `Mounted` | NEXUS adapter / Valance | MESH rejection of render or dispatch input; the render-originated dispatch result | `mount`/`hydrate`'s error and result: **binding-facing**, not on the handle |
| `StartError`, `Platform` | NEXUS | NEXUS | `start`: whoever hosts the application |
| `Target`, `Report`, `RenderTree` | Valance / MESH runtime | PORT's contract | bindings and binding authors |

### Findings per type

**1. `IntentArgument` is the application's command-argument representation, because the command table is defined in it.** The table's entries consume exactly this type; that is not a MESH-specific *transport* choice made at the door, it is the binding signature. `invoke` takes the same type because it feeds the same function. Evidence: both example applications define a `firstValue` helper over `IntentArgument` in the author's own definition; no caller needed a cast (an ordinary `ReadonlyArray<Item>` is a valid `{ value }`; the three `as never` casts in tests are on untyped helper values, not forced by the type). A VALANCE-owned argument type would either be the same structure renamed, or require a conversion `value => ({ value })` at `invoke` *and* leave the table's bindings on `IntentArgument`. The one member with independent meaning, `{ absent: true }` (an omitted optional parameter), is available to external producers as well, which is correct for one table. The data model's limits (no `undefined`, no `Date`; asserted) apply equally to both doors, which keeps "one table, one argument representation". **Verdict: MESH-owned, inherited by the table, intentional.** The only accidental part is the *name*: `IntentArgument` also describes arguments that no intent produced. A naming issue, not a semantic one.

**2. `UnmappedCommand` is the one failure for "no such entry", correct for both doors, with one lossy edge.** Both `dispatch` and `invoke` fail with it; its fields mirror the table's key scheme (`component/name`, the NEXUS adapter's own-key lookup over MESH's addressing). The application's external entries borrow that scheme with a pseudo-component (`app/...`, by convention; not enforced). A VALANCE-owned replacement would add a second error for the same fact or map the first: a rename. **Verdict: intentional.** **Accidental edge (measured):** Valance derives `{ component, name }` by splitting the key, so the error does not carry the key: `"a/b/c"` and `"a/b/d"` both give `{ component: "a", name: "b" }`; `"nowhere"` gives `{ component: "nowhere", name: "" }`; `"/x"` gives `{ component: "", name: "x" }`. It is faithful for `component/name` keys and not otherwise. Fixing it means adding the key to a NEXUS-owned type (or a second error type): out of scope here, deferred.

**3. `BoundaryValue` in `Web.history` is derived, not independent.** `stateOf`'s result is placed as `{ value: stateOf(url) }`, the argument of the navigate entry; history never inspects it. The author's `stateOf` returns their own `Navigation` struct, which is also their `navigate` command's input schema; `BoundaryValue` is only the compatibility constraint at the type position, and no cast was needed. It is neither URL representation nor application state. It follows `IntentArgument` one for one, so it is intentional exactly as long as that is. A history-owned type would be a rename.

**4. `Mounted`, `DispatchExit`, `Dispatched`, `MeshDiagnostics`: binding- and platform-facing.** None is on `ApplicationHandle` (its error is `UnmappedCommand | E`). They appear on `mount`/`hydrate` and `renderToHtml`. `Mounted`'s members are used by tests only (Stage 11, 17). Classification only: no redesign.

### Application-facing surface, classified

| Leak | Where | Verdict |
|---|---|---|
| `IntentArgument` (and its `BoundaryValue`) | `invoke` argument; history's `stateOf` | **intentional**: the table's own argument vocabulary; name mismatch for non-intent producers is cosmetic |
| `UnmappedCommand` | `invoke` error | **intentional**; lossy key identification is an **accidental** defect of how Valance builds it |
| `CommandValidationError` (via `E`) | `invoke` error channel | **intentional**: NEXUS command validation |
| `Platform`, `StartError`, `Ambient`, `StateHandle`, `Mesh.bind`, `Mesh.Program` | `start`, definition | **intentional** substrate vocabulary (author writes NEXUS commands, supplies MESH programs) |
| `Mounted`, `DispatchExit`, `Dispatched`, `MeshDiagnostics` | `mount`, `hydrate`, `renderToHtml` | **binding-facing**; exported more widely than their audience (Stage 17) |
| the `app/` entry namespace | author convention | **accidental**: a pseudo-component in MESH's addressing, unenforced |

### Changes made
None. Per the stop conditions: ownership is not different from where the types already sit; replacing `IntentArgument` or `UnmappedCommand` renames them (or changes NEXUS, for the key); `BoundaryValue` follows `IntentArgument`.

### Deferred
- The lossy `invoke` error for keys that are not `component/name`. Deferred because `UnmappedCommand` is the one error contract shared by `dispatch` and `invoke`, owned by the NEXUS adapter: carrying the key is an adapter / error-contract decision outside VALANCE, to be taken only with evidence that a consumer needs the key. It is not fixed locally.
- Whether the entry namespace (`app/`) should be named and checked, or the table's key scheme made explicit for external entries.
- Narrowing or removing `Mounted` / `DispatchExit` from the main entry.
- Naming: `IntentArgument` for arguments not produced by an intent.
- Package organization: entry layout, and whether `./internal` should remain a separate package entry. Unchanged from Stage 17.

---

## Stage 19: an application-owned capability (tracer)

*Question: can an application define and use a capability whose implementation is supplied at `start`, with a resource owned by the application's lifetime, with no Web, PORT or MESH-runtime dependency and no new VALANCE concept? Answer: yes, with existing primitives only. No VALANCE, NEXUS, MESH or PORT source changed; three new example files and one test file.*

### What was built
- `src/catalog/service.ts`: the **contract**, `Catalog = Nexus.Capability.define<CatalogService>("example/catalog")` with `lookup(id)` and `close()`. Imports only `@valancex/nexus`.
- `src/catalog/with-service.ts`: the catalog definition plus one command, `catalog.lookupItem`, which does `yield* Nexus.Capability.require(Catalog)`, calls `lookup`, and commits the result into ordinary state (`items`). Bound at `app/lookupItem` like any entry. Written over `Valance.define({ ...base, commands })`; the shared definition is untouched.
- `test/capability.test.ts`: the external **platform** (an implementation backed by a counted resource, `Layer.scoped(Capability.Environment, acquireRelease(…))`, passed as `StartOptions.platform`), and the tripwires.

### Observed
| Tripwire | Result |
|---|---|
| A. ownership | the contract imports only NEXUS; neither file names Web, PORT, `mesh-runtime`, `window` or `document` (source assertion) |
| B. injection | `invoke("app/lookupItem", [{ value: "Z9" }])` puts `{ id: "Z9", name: "item-Z9" }` in state |
| C. lifetime | before start `{0, 0}`; running `{1, 0}`, **acquired by `start`, not by first use**; still `{1, 0}` after a command; after the Scope `{1, 1}` |
| D. missing | with no platform option, and with an empty `Environment`, `start` succeeds and `invoke` fails with NEXUS's own `{ _tag: "CapabilityUnavailableError", id: "example/catalog" }`; state unchanged |
| E. rendering | command, capability, state commit, existing `values`, **update** (same section, existing keyed row keeps its element), `item-Z9` on screen; operations `draw, update` |
| F. boundary | the handle is still exactly `state` and `invoke` |
| isolation | a command holding the capability: an application FiberRef write does not reach the caller; interrupting the caller interrupts the command; the resource is **not** released by the interruption (`{1, 0}`) and is released by the Scope (`{1, 1}`) |

Mutation checks: a host-owned implementation (`EnvironmentLive`, which NEXUS never releases) fails the lifetime, rendering and isolation tests; a platform that supplies nothing fails injection, rendering and isolation.

### Breaks
None. The first place anything could have broken was the type of the command: it requires `EnvironmentShape`, and `Valance.define` constrains commands to `Ambient`, which already includes it. It typechecked unchanged.

### Existing primitives that were sufficient
`Nexus.Capability.define` and `require`; `Nexus.Application.Platform` as `StartOptions.platform` (a platform `Layer` is provided to the application-owned runtime scope, so scoped implementations are acquired before and released after every application resource); `Nexus.Command.define` and `Mesh.bind`; `ApplicationHandle.invoke`; the existing `values` render path. The error is NEXUS's (`CapabilityUnavailableError` flows through `E`, as `CommandValidationError` does).

### New concept required
None.

### API pressure (demonstrated only)
- **Availability is discovered at use, not at start.** `start` succeeds with no implementation; the failure is the first `invoke` that needs it. That is NEXUS's `require`; v0.7 requirements and provision statements exist for a pre-start check, and VALANCE wires neither. Whether an application should be able to refuse to start without a capability it cannot work without is a question this tracer raises and does not answer.
- **Supplying an implementation is verbose for a platform author** (a `Map` of `{ _tag: "Available", implementation }` inside `Layer.scoped(Environment, …)`). It is a NEXUS-side platform-author concern, observed once; nothing in VALANCE or the application is affected.
- The handle's error channel now carries `CapabilityUnavailableError`, a NEXUS type, for an application-defined capability: consistent with Stage 18's classification of `E`.

### Not tested
`renderToHtml` accepts the same `platform` option (it takes `StartOptions`), so a request-scoped implementation should be acquired and released within the call; not exercised here. An implementation that is acquired lazily outside its platform layer is effectively host-owned (NEXUS documents this).

### Next probe
Make the capability's operation asynchronous (`lookup` returning an `Effect`), and observe, with the same platform, whether caller interruption reaches an in-flight capability call, whether a Scope that closes while a call is in flight releases the resource only after the call ends, and what a command that was interrupted mid-call leaves in state. That is the smallest step toward async data flow and it needs nothing the tracer has not already used.

---

## Stage 20: an asynchronous application-owned capability (tracer)

*Question: does the Stage 19 architecture behave correctly when the capability's operation is genuinely asynchronous? Answer: the happy path, interruption and state semantics follow the existing Effect/NEXUS boundary with no new concept; scope closure during in-flight work exposes a lifetime boundary that is documented by NEXUS and worth knowing. No VALANCE, NEXUS, MESH or PORT source changed; no API added.*

### What was built
`src/catalog/async-service.ts` (contract: `lookup(id): Effect<CatalogEntry, LookupError>`, NEXUS and Effect only), `src/catalog/with-async-service.ts` (the catalog definition plus `app/lookupAsync`: require the capability, await `lookup`, then `state.update`), and `test/capability-async.test.ts`. The implementation is the test's external platform: a scoped resource, and a controllable `lookup` that raises "started", waits on a gate the test opens, and records its own interruption. No sleeps in the positive paths: the test waits on those signals.

### Observed
| | |
|---|---|
| A. suspension | the command is still running after the capability starts (`Fiber.poll` empty); state unchanged; operations `["draw"]`; on completion: continuation, commit, `values`, **update** (same section, same keyed row element); never a second draw |
| B + D. caller interruption | `Fiber.interrupt` of the caller's `invoke`: the caller gets interruption; the capability call is interrupted (recorded); no `lookup completed`; **state unchanged, nothing rendered**; the resource is **not** released; a second lookup then runs on the same single acquired resource and commits (B only; A never) |
| C. Scope closes mid-call | **see below** |
| E. stale ordering | two lookups in flight at once (neither serialized nor cancelled); invoked A then B, completed B then A: both commit, state `["A0", "B", "A"]` (completion order); two updates |

### Async boundary
```text
caller invoke  ->  inApplication: fork into the application's runtime, join the handle   (Stage 12)
               ->  NEXUS command (app fiber)  ->  Capability.require  ->  capability.lookup   (suspends HERE)
               ->  state.update (commit)  ->  State.values  ->  render  ->  PORT update
```
Asynchrony is entirely inside the command's own Effect; the handle, `values` and render path see only commits. Nothing between them knows a wait happened.

### Cancellation
Interrupting the caller's effect interrupts the application's command fiber and, through it, the in-flight capability wait. It cancels exactly that operation: the application, its state and its resource are untouched. (Mutation: removing the Stage 12 interrupt propagation fails B.)

### Lifetime (the boundary)
Closing the owning Scope while a lookup is pending, in order: `resource acquired`, `lookup started A`, `scope closing`, **`resource released`**, `scope closed`. Then, when the test opens the gate: `lookup completed A`, `invoke succeeded`.
- Scope close **does not wait for** the in-flight command and **does not interrupt** it (no `lookup interrupted`).
- The capability's backing resource is **released while the call is still in flight**; the call then completes against a released resource.
- The command continues after termination, **commits to the stopped application's state** (`items` gains `A`), and the caller's `invoke` **succeeds**.
- It is **never rendered**: the follower ended with the Scope and the target is unmounted (`["draw"]`, container empty).

This agrees with NEXUS's documented rule ("effects already running when termination begins aren't interrupted by it"; the platform is "released last" relative to application resources, and an in-flight effect is not an application resource). What it means here is not obvious from either layer alone: for a resource-backed capability, the ordering is *release the resource, then let in-flight users finish*. Whether that is acceptable, or whether termination should interrupt or await admitted work, is a NEXUS lifecycle decision with a VALANCE-visible consequence. Pinned as an observation (test labelled as such), not fixed.

### State semantics
No commit before the capability completes; interruption leaves state exactly as it was (no rollback needed: the continuation never runs); after termination a still-running command can commit (above).

### Stale results
Tested (it was nearly free). Commands are not serialized and nothing is superseded: with an append-only `items` field both results land, in completion order. A field that a later result should replace would be overwritten by whichever finishes last; this tracer has no such field. Stale-result policy is entirely the application's today; no mechanism exists, and none was added.

### Rendering
Async commits behave as any commit: same-view updates, keyed row identity preserved across the commit, no extra render for a pending call (the application commits nothing while waiting), and draw only on the first render.

### Breaks
No failure in the intended behavior. The one boundary worth recording is Lifetime above (resource released under an in-flight call; post-termination commit).

### New concept required
None.

### API pressure (demonstrated)
- None for the handle: `invoke` already composes with long-running commands and propagates interruption.
- A *question* about termination, not an API: should an application's end await or interrupt commands that were already admitted? It is NEXUS's rule today and it decides what a capability implementation may assume about its own resource.

### Next probe
Observe the same boundary from the application's side with the smallest change: a capability whose `lookup` *uses* the resource after release (the resource refuses work once released), to see what the in-flight command, the caller and the state actually receive (a typed failure, a defect, or nothing), and whether `invoke` after `start`'s Scope closes behaves the same for a command already admitted. It shows whether the lifetime boundary is a harmless ordering or a real hazard, without adding any mechanism.

---

## Stage 21: an in-flight capability call whose resource has been finalized (probe)

*Question: does the Stage 20 termination ordering cause an actual resource-safety failure when an admitted command still needs its resource after the resource's finalizer has run? Method: only the external test implementation changed. Its finalizer now marks the resource closed, and past its gate the lookup uses the resource, which then fails deterministically (a typed `LookupError`, or a thrown defect). Nothing is caught, rewritten or kept alive. No VALANCE, NEXUS, MESH or PORT source changed; the four Stage 20 tests are unchanged and pass.*

### Observed (`test/capability-async.test.ts`, run for the typed failure and for the defect)

**Control: the Scope is not closed.** Events `resource acquired, lookup started A, lookup resumed A, lookup completed A, resource released`. The caller's `invoke` succeeds; state commits; `State.values` emitted the commit (`[1 item, 2 items]`); operations `draw, update`. The ordinary path.

**Probe: the Scope closes while the lookup is suspended, then the gate opens.**

```text
resource acquired
lookup started A
scope closing
resource released            <- the finalizer ran; the resource is now closed
scope closed                 <- Scope.close returned without waiting for the call
lookup resumed A
resource used after release A  <- the admitted call touched the released resource
```

| | |
|---|---|
| Resource touched after finalization | **yes**, by the in-flight call, once its gate opened |
| Capability operation | failed with the resource's own failure: no `lookup completed`, no result |
| Caller's `invoke` | **the resource's own error, unchanged**: `Fail { _tag: "LookupError", id: "A" }` for the typed resource, `Die` ("resource used after release (A)") for the throwing one. Not interruption, not success |
| Command fiber | ended with that failure or defect; nothing else observed to be affected |
| State | unchanged (the command failed before its commit) |
| `State.values` | emitted nothing after the start (it completed when the application ended) |
| Rendering | none (`draw` only; container empty) |

### Termination ordering
Release of the resource, then the Scope returns, *then* the in-flight call resumes. The resource is released before its user finishes; termination neither waits for the call nor interrupts it (Stage 20). The call is not told its resource is gone: it finds out by using it.

### Caller semantics
`invoke` reports whatever the capability reports. There is no VALANCE or NEXUS signal that the application has ended; a caller of an in-flight `invoke` sees success (Stage 20, a tolerant resource), the resource's typed failure, or its defect, depending only on how the resource behaves when used after release.

### State semantics
Whether state can commit after termination depends on the command, not on the application: Stage 20 committed (the tolerant resource let the call finish, and `state.update` on a stopped application succeeded); here the resource's failure prevented the commit. Nothing stops a command from committing after termination, and nothing makes a post-termination commit reach `values` or the render (the stream has ended, the follower is gone).

### Rendering
No render occurs after termination in either case. A related fact seen in the harness: a commit is emitted by `values` but rendered asynchronously by the follower, so a Scope that closes immediately after a commit can end the follower before it draws it (the control's first version drew only `draw` before it waited). The last commit before termination is therefore not guaranteed to be rendered.

### Architectural interpretation
This is **an actual lifetime hazard, not only an observation, but it violates no existing documented invariant**: NEXUS states that effects already running when termination begins are not interrupted, and that the platform is released after the application's own resources, not after in-flight effects. The hazard is the consequence: **work admitted under an application can outlive the resources the application owns**, so a capability implementation cannot assume its resource is alive for the whole of any call made through it. Safety then depends entirely on the resource: a defensive one fails cleanly, as the probe shows (the caller gets an honest error, nothing is corrupted, nothing is committed); a tolerant one (Stage 20) lets the call finish against a released resource and commit to a stopped application. The probe demonstrates the first and Stage 20 the second; neither shows data corruption, because the test resource has none to corrupt.

### New concept required
No. Existing Effect failure and defect semantics carried the resource's failure to the caller unchanged; nothing was needed to observe it.

### API pressure
No. `ApplicationHandle` and `invoke` behaved correctly: they relayed the failure and did not hide it. The open question belongs to application termination (NEXUS): whether admitted commands should be interrupted, awaited, or deliberately left to outlive the resource. Not decided here.

### Next probe
Establish what an already-admitted command can still do *after* termination, with no mechanism added: past its gate, a command that calls `state.update`, publishes a NEXUS event, and requires a second capability, and a second `invoke` made from inside it, recording for each whether it succeeds or is refused (and as a typed failure or a defect). Stage 20 showed `state.update` succeeds; the rest decide how much of "the application is stopped" an in-flight command actually experiences, which any lifetime policy has to start from.

---

## Stage 22: the execution boundary after termination (observation-only probe)

*Question: after the owning Scope closes, what can an already-admitted command still do, and, separately, what can a new invocation do? Method: reuse the Stage 20/21 controllable gate. One admitted command resolves the original capability, suspends behind the gate, and after the Scope has closed attempts each operation in turn. Only the probe records each step's exit (the step's effect is unmodified); nothing is guarded, caught on the application's behalf, or made to fail. No VALANCE, NEXUS, MESH or PORT source changed; Stage 19 to 21 tests untouched (`test/capability-async.test.ts`, run eight times: stable).*

### Trace (one run; the same each time)
```text
resource acquired            second resource acquired      command admitted      command suspended
scope closing
second resource released     resource released             (reverse of acquisition)
event subscriber stream ended                                (ended by the time the Scope returned)
scope closed                 <- returned without waiting for the admitted command

-- B. new invocations, with the admitted command still suspended --
invoke app/lookupAsync     (needs a capability)   died: NEXUS: the runtime has begun terminating
invoke app/home            (needs none)           died: NEXUS: the runtime has begun terminating
invoke nowhere/at-all      (unknown entry)        failed (typed) UnmappedCommand

-- A. the admitted command, resumed after termination --
state.update                              succeeded
event publish                             succeeded
require second capability                 succeeded
use second capability                     failed (typed) SecondClosed        (the released resource was touched)
original capability (captured): lookup B  failed (typed) LookupError         (the released resource was touched)
command completing; caller's invoke       succeeded
```

### Already-admitted command (A): everything it attempted ran; nothing was refused
| Operation | Result |
|---|---|
| `state.update` | **succeeded and committed**; readable afterwards (`["A0", "P1"]`) |
| event publish | **succeeded**; reached no subscriber (`delivered` is only the event sent before termination); the subscriber's stream had already ended |
| `Capability.require` of a second capability | **succeeded**: the environment's resolutions are still in memory; it returned the same implementation |
| using that second capability | the **released** resource was touched; its own typed failure |
| original capability, again | the released resource was touched; its own typed failure |

### New invocation (B): different from A, and not uniform
A new `invoke` of any **known** entry, with or without a capability, is **refused by the runtime as a defect** ("NEXUS: the runtime has begun terminating"), even while the old command is still running. An **unknown** entry is the ordinary **typed** `UnmappedCommand`: the key is looked up before the runtime is entered, so admission is never reached. Nothing was added to produce either.

### Termination boundary (factually)
- **Stopped:** new work through the runtime (so every new `invoke` of a known entry and any new runtime work); the event bus (subscriptions end normally); the application's state stream (`values` / `states`); the render follower and the mounted target; and the platform's resources, which are released (in the reverse of acquisition).
- **Still executable, for work already admitted:** everything it does inline in its own fiber: writing the state it already holds, publishing events, resolving capabilities from the environment, and calling the released resources by reference.
- `Scope.close` neither waits for nor interrupts admitted work.

### Resource lifetime
Released resources stay *reachable*: the environment still resolves them, and `Capability.require` gives no signal that anything was released. Whether a released resource can be *used* is entirely that resource's behavior (here it refuses; Stage 20's did not).

### Caller semantics
The caller of an admitted command receives whatever the command returns (here success, because the probe recorded each step); resource failures arrive as the resource's own typed errors. A caller of a new `invoke` receives an **untyped defect** whose only identification is an `Error` message. There is no `ApplicationStopped`-like type and none was added.

### State semantics
Post-termination state commits **remain possible** for admitted work and are **readable** through the handle. They are not published: the state stream had ended.

### Event semantics
Post-termination publication **succeeds and is unobservable**: the bus closed at the start of termination.

### Rendering
Nothing reaches the follower after termination (`draw` only, container empty), and the state stream emitted only the start. Command execution, effects, values publication and rendering are separate here: the command ran completely while the last two were gone.

### Consistency with NEXUS's documentation
Every observation matches what NEXUS documents: admitted effects are not interrupted by termination (application.md), publish never fails and reaches no one after the bus closes (event.md), and new work through a terminating runtime is refused (event.md, runtime.md). The probe adds the composition: for an in-flight command, "the application is stopped" is experienced only as no new entrances, no listeners and refusing resources, while its own writes still land.

### Architectural interpretation (no policy chosen)
Termination closes the application's entrances and its observers and releases its resources; it does not close the computation already running inside it. The state handle, the event bus's publish side and the environment stay callable from inside admitted work, but nothing outside can observe those effects except by reading the state afterwards.

### New concept required
No. Every behavior was visible with existing Effect, NEXUS and VALANCE primitives.

### API pressure
No. `ApplicationHandle` is unchanged and behaved as defined. The refusal being an untyped defect is a fact, recorded; no consumer in these tracers needs to distinguish it.

### Next probe
Whether the policy needs NEXUS at all: make the **platform implementation itself** drain its in-flight users before it releases, using only ordinary Effect (for instance, a call-tracking semaphore the finalizer acquires fully before closing the resource), and observe what `Scope.close` then does while a call is suspended (waits, and for how long), what the admitted command experiences, and what a new `invoke` experiences meanwhile. It shows, with no change to NEXUS, whether "await admitted work before releasing" is already expressible by the resource owner, which decides whether a lifetime policy belongs in NEXUS or in the implementation.

---

## Stage 23: can the resource owner keep its resource alive until admitted users finish? (probe)

*Question: can a capability's resource make its own lifetime safe by draining in-flight users before finalization, using only ordinary Effect? Method: only the external test platform changed. The resource counts its in-flight lookups (a call registers when it starts and leaves by any exit: completion, failure, interruption), and its finalizer waits for the count to reach zero before marking the resource closed. No source change in VALANCE, NEXUS, MESH or PORT; Stage 19 to 22 tests untouched; positive paths synchronize on signals; the one place a block must be shown uses a bounded run of cooperative yields (`test/capability-async.test.ts`, 13 tests, stable over 8 runs; a finalizer that does not wait fails exactly the dependent probes).*

### Observed

| Probe | Result |
|---|---|
| **A. control** | in flight 0, 1, then 0; `Scope.close`: `finalizer started`, `resource released`, no draining. The tracking is sound |
| **B. termination while a lookup is suspended** | **`Scope.close` does not return**: the finalizer reaches `finalizer draining: 1 in flight` and waits. The lookup is then allowed to finish and **completes against a live resource** (no `resource used after release`). Then `in flight: 0`, `finalizer drained`, `resource released`, `scope closed` |
| **C. circular wait** | **yes, and it is a deadlock** (below) |
| **D. new invocation while draining** | refused as a defect, `NEXUS: the runtime has begun terminating`, exactly as after termination (Stage 22). The drain did not reopen admission, and nothing in the runtime was touched |
| **E. the admitted command after the drain** | the caller's `invoke` succeeds; the state commit lands (`["A0", "A"]`); `State.values` had already ended (emitted only the start) and nothing was rendered (`draw` only) |
| **F. a command admitted but not yet inside the resource** | **not protected** (below) |

### Deadlock analysis (probe C)
Setup: the in-flight lookup's gate can only be opened by the application's own `app/signal`, which is a **new invocation** (a host-driven handshake). Trace after termination begins:

```text
scope closing
finalizer started
finalizer draining: 1 in flight          <- waits for the lookup
new invoke app/signal: died: NEXUS: the runtime has begun terminating   <- the lookup's only way forward is refused
(2000 cooperative yields: nothing can move)
Scope.close: still pending     admitted command: still pending     in flight: 1
```
The dependency is circular: **finalization waits for the command; the command waits for an admission that termination has already closed.** `Scope.close` blocks indefinitely. Recorded as a blocked lifecycle, with no workaround added. The test releases it only by opening the gate from *outside* the application's admission (cleanup, which also proves the block was exactly this dependency).

NEXUS documents that "admission never waits, so an admitted effect that requests more work can't deadlock". That guarantee is NEXUS's own. A resource-local drain **reintroduces waiting after admission has closed**, so the guarantee no longer covers an application that adds a drain.

### Gap (probe F)
The resource sees only calls that have **entered** it. A command already admitted, with its capability resolved, but not yet inside a lookup, is invisible: the finalizer finds nothing in flight, closes and releases at once, and the command's later lookup finds the closed resource (`resource used after release`, a typed `LookupError`). Likewise, a tracked call leaves when the lookup *returns*, which is before the command's own continuation (the state commit); in this run the commit landed before the finalizer finished draining, but nothing guarantees it.

### What this shows about resource ownership
- **A resource can make calls that are already inside it safe, with ordinary Effect, and without any change to NEXUS.** Probes A, B, D and E are a clean drain: `Scope.close` waits indirectly, the call finishes with a valid resource, then the resource releases; admission stays closed.
- **It cannot make the stronger statement "an admitted command finishes while its resources are valid".** The resource owner knows its own calls, not the commands admitted by the application: F.
- **And the mechanism can hang termination** when admitted work depends on anything termination closes (new admission here; plausibly observers and events, which have already ended by the time platform resources release): C.

### NEXUS pressure
Only for the stronger guarantee, and conditional on wanting it. No NEXUS change is required for resource-local draining of calls in progress. The set of **admitted, unfinished work** is a fact only the runtime has (it admits work); the resource owner cannot see it, so neither an await nor an interruption of *admitted commands* can be built at the resource boundary (F). Whether to want that guarantee, and whether it should be "await" (which C shows can hang) or "interrupt", is not decided here.

### New concept required
No. Ordinary Effect (a counter, a `Deferred`, `acquireUseRelease`, a waiting finalizer) was enough for everything resource-local. The observation is a visibility gap on an existing runtime fact, not a new concept.

### Next probe
The third option at the same boundary, still with no NEXUS change: the resource-owned finalizer **interrupts** its tracked in-flight calls (each call registers its fiber; the finalizer interrupts them and waits for their exit) instead of waiting for them. Run B, C and F again and compare: whether the caller gets interruption and nothing commits, whether C's circular wait disappears (an interrupt does not need admission), and whether F is still unprotected. It completes the comparison of the two resource-local policies (drain, interrupt) before deciding whether either belongs in NEXUS.

---

## Stage 24: a resource that interrupts its in-flight users when it is finalized (probe)

*The other resource-local policy, compared with Stage 23's drain. Same tracked resource; on finalization the resource **interrupts** its tracked in-flight calls (each runs in a fiber the resource owns; the caller joins it), waits for those fibers and then for their callers to leave, and only then closes. Interruption is not caught or translated anywhere. Only the external test platform changed; no source change in VALANCE, NEXUS, MESH or PORT; Stage 19 to 23 tests untouched (`test/capability-async.test.ts`, 18 tests, stable over 8 runs; a finalizer that does not interrupt fails exactly B, C and G).*

### Observed

| Probe | Result |
|---|---|
| **A. control** | the lookup succeeds, in flight returns to 0, `finalizer started`, `resource released`; no interruption anywhere |
| **B. in-flight lookup, Scope closes** | the finalizer interrupts the tracked call (`lookup interrupted A`); the call fiber exits; its caller leaves (`lookup call joined: interrupted`, `in flight: 0`); only then `resource released`, `scope closed`. **`Scope.close` returns on its own**, with no gate opened. The **command ends interrupted**; the caller's `invoke` is `interrupted`; **state unchanged** (`["A0"]`); `State.values` emitted only the start; nothing rendered; the lookup never completed and the resource was never used after release |
| **C. circular wait** | **the deadlock disappears.** With the lookup's only way forward being a new invocation, `Scope.close` still completes, the tracked call exits, the resource releases, the command exits and its caller receives interruption. The finalizer needed no admission and no external cleanup |
| **F. command admitted, not yet at the resource** | **not protected**, exactly as in Stage 23: nothing is registered, so the finalizer closes and releases at once; the command then resumes, **registers after the release** (the resource refuses nobody), finds the resource closed (`resource used after release`), and the caller gets the resource's own typed `LookupError` |
| **G. call vs containing command** | interrupting the call did **not** interrupt the command: a command that records its call's exit saw `interrupted`, was still running afterwards, and its caller's `invoke` **succeeded** |

### Interruption propagation (resource call vs containing command)
Interrupting the tracked call fiber is a signal to that fiber only. The command sees it as the **exit of the join** (a failure whose cause is interruption). If the command does not handle it, that cause *is* the command's own exit, so the command ends and the caller observes `interrupted` (B, C); if the command handles it, it carries on (G). So the command's end in B is **propagation by the join, not interruption of the command fiber**: the resource has no hold on the command. Which of the two happens is decided by the application's code after the call, not by the resource.

Ordering in B: `lookup interrupted` before `tracked calls exited`; `lookup call joined: interrupted` before `in flight: 0`; both before `resource released`; `resource released` before `scope closed`. The finalizer may also briefly wait for the caller to leave after the call has exited (it did, in these runs); that wait needs only the command fiber to run, never admission, so it cannot recreate Stage 23's cycle.

### Comparison

| | **Drain** (Stage 23) | **Interrupt** (Stage 24) | **Runtime visibility** |
|---|---|---|---|
| Resource never used after release by a call already inside it | **yes** (the call finishes first) | **yes** (the call is cancelled first) | n/a |
| Registered work gets to finish | yes | **no**: it is cancelled; nothing commits | whether admitted work finishes or is cancelled is the policy question |
| Circular wait with closed admission | **can deadlock** (C) | **avoided**: interruption needs no admission | an await-style policy at runtime level has the same hazard as drain; an interrupt-style one does not |
| Admitted work before it reaches the resource | **missed** (F) | **missed** (F), including late registration after release | needs the runtime's set of admitted, unfinished commands |
| What the application's command experiences | its call completes | an interrupt cause from the call (propagates unless the command handles it) | the runtime could interrupt the **command fiber itself** (not just a call), uniformly |

### Architectural boundary
**What resource-local ownership can guarantee:** that a call registered with the resource when finalization begins is either completed (drain) or cancelled (interrupt) before the resource is released, so the resource is not used after release *by those calls*; and, for a resource that refuses once closed (as these do), that a late call fails fast with the resource's own error. That is **resource safety**.

**What it fundamentally cannot guarantee:** anything about **admitted commands**. It cannot know a command that has not reached it (F), cannot reach the command's fiber (G), and cannot affect the command's other effects (its state commit, its events): a command that interrupted nothing of its own can still commit after termination. The resource sees calls; the application's commands are not its concern. The *outcome of an admitted command after termination* (finish, be cancelled, or run against a stopped application) is therefore outside any resource owner's control.

### NEXUS pressure (precisely, only if stronger lifetime safety is wanted)
- **Information:** the runtime already admits every command, so it holds a fact no resource can see: the set of admitted, unfinished commands. Neither policy, at either layer, can be applied to *commands* without it.
- **Control:** the ability to act on the command fibers themselves: interrupt them (runtime-level, uniform, needing no admission) or await them (with Stage 23's hazard), at a defined point relative to platform release.
- **Ordering:** platform resources are released last (documented); an action on admitted commands has to happen before that.
None of this is required for resource safety of calls in progress, which both policies already provide without changing NEXUS.

### New concept required
No. Interruption of a resource-owned fiber, `join`, `acquireUseRelease` and a waiting finalizer sufficed. The missing item is visibility of an existing runtime fact, not a new concept.

### Next probe
Whether the information gap can be closed **above NEXUS, with the platform's own ordering**, before anything is proposed for NEXUS: a platform-supplied registry of admitted commands, acquired **after** the other resources (so it is released **first**, since release reverses acquisition), where each command (wrapped once, at the definition) registers its own fiber at entry. The registry's finalizer interrupts the registered command fibers and waits for them, before any other resource is released. Run F, G and C against it: whether the admitted-but-not-yet-at-the-resource command is now covered, whether the command fiber itself is interrupted (not a call), and whether anything still depends on admission. It decides whether the stronger guarantee can live in the platform and the application's definition, or genuinely needs the runtime.

---

## Stage 25: can application-work lifetime be established above NEXUS? (a platform-owned registry of command fibers)

*The final experiment on the lifetime branch. Question: with only existing NEXUS primitives, can a platform-owned registry of admitted command fibers turn "close admission, then interrupt the admitted commands, await their actual exit, then release the resources" into a boundary? Method: a test-only capability (`example/admitted-registry`) supplied by the same platform, acquired **after** the capability resource, whose finalizer interrupts the registered fibers and awaits their actual exit (`Fiber.interrupt` returns only when the fiber has ended). Every command registers **its own fiber** at entry through one wrapper at the definition (`Effect.withFiberRuntime` inside `acquireUseRelease`), not around a capability call. No source change in VALANCE, NEXUS, MESH or PORT; Stage 19 to 24 tests untouched (`test/capability-async.test.ts`, 26 tests, stable over 13 runs; if commands do not register, all seven registry probes fail).*

### Registry ownership
Acquired as a scoped platform resource (`Layer.scoped(Capability.Environment, …)`, after the capability resource); commands resolve it with `Capability.require` and register `Effect.withFiberRuntime`'s current fiber, then unregister in the `acquireUseRelease` release (so on every exit). That fiber is **the actual command fiber**: `Command.invoke` runs the handler inline in the fiber NEXUS forked, and interrupting it makes the caller's `invoke` report `interrupted` (B, C), which would not happen for a child fiber.

### Ordering (observed, not assumed)
```text
resource acquired     registry acquired                       (acquisition order)
...
scope closing
registry finalizer started   registry interrupting 1 admitted command(s)
command exit: interrupted    registry: admitted commands exited
registry released     resource released     scope closed      (the reverse: the registry FIRST)
```
The intended ordering is the actual one: platform release reverses acquisition, so a resource acquired last is released first.

### Probe results
| | |
|---|---|
| **A. control** | registered before the command's own first step; left on exit; the finalizer has nothing to interrupt; normal order |
| **B. admitted, not yet at the resource** | **covered** (the gap of Stages 23 and 24 closes): the command is interrupted at its wait, `Scope.close` completes by itself, the caller gets `interrupted`, state unchanged (`["A0"]`), nothing published or rendered, and **the resource is never reached** (no lookup starts even after its way is opened) |
| **C. inside a capability call** | the command fiber is interrupted as a whole; the call exits **as a consequence** (no separate interrupt was issued); the command exits, then the registry, then the resource |
| **D1. command handles interruption** | it cannot: `catchAllCause` around its own call never ran (Effect does not let a fiber recover from its own interruption); nothing after it ran |
| **D2. uninterruptible region** | the registry waits for the ACTUAL exit: `Scope.close` stays blocked while the region is held; the command commits inside the region (state `["A0", "in-region"]`, **after termination began, while the resource was still valid**), leaves it, and the pending interruption takes effect at once (nothing after the region ran). Only then does the registry release, then the resource |
| **E. new invocation during the registry's drain** | refused as a defect, `the runtime has begun terminating`, exactly as before: draining did not reopen admission |
| **D2b. uninterruptible and needs a new invocation** | **blocked indefinitely**: the only way to open the region's gate is a refused invocation (the Stage 23 cycle, at command level; the harness releases it only from outside) |
| **D3. work a command hands to a daemon fiber** | **escapes**: the command fiber is interrupted and exits, the registry releases, the resource releases, the Scope closes; then the daemon runs, uses the released resource and fails with its own error |
| **H. a command that does not use the wrapper** | **invisible** (the application's own `app/lookupAsync`): the registry finds nothing, closes immediately, and the command goes on and reaches the released resource, exactly as in Stage 22 |

### Architecture: what this established
**Outcome 1, with stated limits.** Using only existing primitives (`Capability`, platform `Layer.scoped` ordering, `Effect.withFiberRuntime`, `acquireUseRelease`, `Fiber.interrupt`) and NEXUS's already-closed admission, a platform and a definition can establish: *close admission, interrupt the registered command fibers, await their actual exit, then release the resources*, for commands that are registered, interruptible and not escaping. The boundaries that made it possible: platform release order (observed), handlers running inline in the admitted fiber (so the real fiber can be captured), `Fiber.interrupt` awaiting actual exit, and NEXUS's refusal of new work.

What it does **not** give, each demonstrated:
- **Coverage is by convention.** Only wrapped commands are visible (H). Nothing enforces the wrapper.
- **Untracked work escapes** (D3): a daemon fiber a command spawns is not the registry's.
- **An uninterruptible command that needs admission blocks termination** (D2b). Awaiting actual exit, not the request, is correct (D2) and is exactly what makes this possible. Interruptible commands never block it.
- By structure (not tested): the registry's finalizer runs at **platform release**, which NEXUS documents as after the application's own resources are released. Admitted commands keep running (and can commit state and publish events) from the start of termination until that point.

### NEXUS pressure (demonstrated gaps only)
- **Total coverage needs the runtime as registrar.** Admission is the single choke point at which every command can be captured; above NEXUS that is only possible by convention (H) and only for the fiber, not what it spawns (D3). This is the one gap the experiment demonstrates.
- Not demonstrated as missing: the ordering (it works), the ability to interrupt the real fiber (it works), awaiting actual exit (it works), closed admission during the drain (it holds).
- Whether the action should run *earlier* than platform release (before the application's own resources are released) is a structural observation, not a demonstrated failure here.

### New concept required
No. Every element was an existing primitive. The only addition was a discipline: every command must go through one wrapper.

### Next probe
Whether the convention gap (H) can be closed **in VALANCE composition, with no NEXUS change**, because every producer already enters through one place: `start`'s binding table, via `invoke` and `dispatch` (`inApplication`). Simulate it test-only: wrap the handle's entries so each admitted command's run is registered in a registry owned by the caller's Scope and released **before** the NEXUS application is shut down, then repeat B, H and the unwrapped case. It shows whether total coverage of table-entered commands, and an action that precedes NEXUS termination altogether, are available at VALANCE's own boundary. (From the source, but not tested here: the MESH-dispatch path already interrupts its pending fibers when the Scope closes; the `invoke` path does not.)

---

## Stage 26: where VALANCE owns command lifetime (the two entry paths, tested)

*Question: can VALANCE own the lifetime of every command that enters through its existing command boundary, without changing NEXUS? Method: drive both real entry paths (`ApplicationHandle.invoke`, and a real MESH click through PORT and `connect`'s dispatch) against one application, first with nothing added, then with ONE central wrapper over the whole binding table (no command registers itself), then with a registry owned by the caller's Scope instead of the platform. Test-only; no source change in VALANCE, NEXUS, MESH or PORT; Stage 19 to 25 tests untouched (`test/capability-async.test.ts`, 36 tests, stable over 8 runs; a VALANCE-level drain that requests nothing fails E and E2).*

### The two entry paths (from the source, then confirmed by the traces)
```text
invoke    caller fiber -> ApplicationHandle.invoke -> key lookup in the binding table (outside the runtime:
          unknown key = typed UnmappedCommand) -> inApplication(binding(args))
          -> Nexus.Runtime.runFork -> NEXUS handle -> the application fiber runs binding(args)

dispatch  PORT click -> target report -> connect: Effect.runFork(Effect.exit(running.dispatch(...)))   [a VALANCE `pending` fiber]
          -> running.dispatch -> inApplication(host.dispatch(render, handler, payload))
          -> Nexus.Runtime.runFork -> NEXUS handle -> the application fiber: NEXUS adapter -> MESH dispatch -> commands[key](args)
```
**Shared boundary: yes, at two levels.** (1) `inApplication` (VALANCE), which both paths call; there VALANCE holds the NEXUS **handle**, not the fiber (NEXUS's documented proxy; interrupting it interrupts and awaits the real fiber, as every trace here shows). (2) The binding table entry, `commands[key]`, called by both inside the **actual command fiber**. Evidence: one central wrapper registered `app/slowOpen` (by invoke) and `home/open` (a real MESH intent, by dispatch), and also `app/home`, `app/changeItems` and `home/reverse` (application-defined entries), each with its own key and the real fiber (`Effect.withFiberRuntime`).

### Baseline: nothing added (the finding that changes the picture)
| Path | When the Scope closes with a command suspended before any capability |
|---|---|
| **invoke** | **not interrupted**: `scope closing`, `resource released`, `scope closed`; the command later goes on to the released resource (Stage 22) |
| **MESH dispatch** | **already interrupted, before the resource is released, by VALANCE itself**: `scope closing`, `command exit: interrupted`, `resource released`. The cause is `connect`'s Scope finalizer, which interrupts and awaits its `pending` fibers; `inApplication` then interrupts the NEXUS handle. It never reaches the resource. The interrupted dispatch leaves no `Mounted.dispatched` entry | *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*

So VALANCE **already owns** the lifetime of MESH-dispatched commands today (for as long as a target is mounted), and does **not** own invoke-entered ones. The two paths are asymmetric.

### With the central table wrapper (platform-owned registry)
- **invoke:** registered; registry interrupts and awaits at platform release; the order of Stage 25: `registry finalizer started`, `command exit: interrupted`, `registry released`, `resource released`; the caller receives `interrupted`; state unchanged; the resource is never reached.
- **dispatch:** registered by the same wrapper, but `connect`'s finalizer interrupts it first: `command exit: interrupted`, `registry: command left (0)`, and only then `registry finalizer started`, which finds nothing to interrupt. The registry is redundant for this path.

### Command coverage
Every ordinary entry went through the wrapper (invoke and dispatch, application-defined and probe-defined keys), each leaving cleanly; no ordinary path escaped. `Web.history`'s popstate uses `invoke` (source, not exercised). A command could escape only in the instant between admission and the wrapper's first step, which is not observable. The wrapper lives in the test; VALANCE's `start` receives the table (`app.commands(state)`) and so is the place a production version could apply it. Not done here.

### Child fibers
A structured child (`Effect.fork`) is interrupted with its command (`command exit: interrupted`, then `child (fork) interrupted`). A **daemon child escapes**: it survives the command's exit, the registry's and the resource's release and the Scope's close, then uses the released resource and fails with its own error. Command lifetime covers the command fiber and its structured children, not detached work.

### VALANCE versus NEXUS ordering (probe E, a registry owned by the caller's Scope, drained by a finalizer added right after `start`)
```text
scope closing
valance registry finalizer started   (interrupts the registered command; here an uninterruptible one holds it)
  [ NEXUS has NOT begun to terminate: nothing is released ]
valance registry drained
resource released          <- NEXUS termination and platform release, after VALANCE's drain
scope closed
```
- **VALANCE can drain before NEXUS releases anything**, with the existing composition: Scope finalizers run in reverse registration order, and `Application.start`'s was registered first. Nothing was forced.
- **But admission is still open during that drain.** A new `invoke` was **accepted** (NEXUS refuses only once its own termination begins), and a command admitted after the drain began registered `AFTER the drain began`, was not in the drain's snapshot, stayed in flight, and after the Scope closed **reached the released resource** (`resource used after release L`). A VALANCE-level drain that does not close VALANCE's own entrance is unsound.
- **A benefit of the same fact (E2):** because admission is still open, a command that needs a **new invocation** to finish can get it, so the circular wait of Stages 23 and 25 does not arise at this level: the drain completes by itself, with no external cleanup.

### Architectural interpretation
**What VALANCE can guarantee today with existing primitives:**
- MESH-dispatched commands are interrupted and awaited before NEXUS terminates (already true while a target is mounted).
- `invoke`-entered commands can be owned the same way: a registry at the binding table or `inApplication`, drained by a Scope finalizer registered after `start`, runs before NEXUS terminates and before any resource is released; it needs the table (or `inApplication`) and `Effect.withFiberRuntime`, both available to VALANCE.
- The registry's drain runs while admission is open, so a sound version must close VALANCE's own entrance when the drain starts (demonstrated necessary), which also brings back the cycle E2 avoids (new invocations are then refused). The two cannot both be had.

**What remains outside VALANCE's control:** daemon-detached work; an uninterruptible command that waits on something that has already closed; the instant between admission and registration; and what a command does with its own state commits before it is interrupted (a commit made inside an uninterruptible section lands).

### NEXUS pressure
**None demonstrated.** Stage 24 and 25 concluded tentatively that total coverage needs the runtime as registrar. This stage shows VALANCE already has both the single entrance (`inApplication`, the binding table) and an earlier-than-NEXUS point (Scope finalizer order), for every table-entered command. Nothing found requires a NEXUS change. (The documented NEXUS rules about admitted work and platform release remain as they were; they are no longer the obstacle.)

### New concept required
**Narrowly, yes:** a VALANCE-owned closure of its own entrance at the moment its drain begins, because admission is otherwise open during the drain (demonstrated by E). It is the existing idea of "admission closes at termination", applied earlier at VALANCE's boundary, not a new architectural concept; no other addition was needed.

### Next probe
Whether that entrance closure is sound with the drain, test-only: add a guard to the Scope-owned registry so the central wrapper **refuses new entries from the moment the drain starts** (a fail-fast error at the wrapper, before the binding runs), then re-run E and E2. It shows whether the late command is now refused (it should be), and, decisively, whether closing the entrance brings back the circular wait that E2 avoided (a command waiting for a new invocation), which decides whether a sound VALANCE-level drain exists without a policy for uninterruptible work.

---

## Stage 27: closing VALANCE's own entrance when its drain begins

*Question: is a VALANCE-level drain sound if VALANCE refuses new entries from the moment the drain starts, and does closing admission recreate the circular wait? Method: the Stage 26 Scope-owned registry plus exactly one test-only behavior: once its finalizer starts, the central binding-table wrapper refuses any new registration. The refusal is a thrown `Error` inside the registration step (a defect by Effect's own means; no error type invented), and the check and the add are one synchronous step, since a gap between them is the race being closed. No public API, no NEXUS change, no production VALANCE change; Stage 19 to 26 tests untouched (`test/capability-async.test.ts`, 42 tests, stable over 8 runs; with the guard disabled exactly B and C2 fail).*

### Closed admission
**When it closes:** at the very start of the VALANCE registry's finalizer, which is the Scope finalizer registered right after `Valance.start`. `connect`'s finalizers (follower, pending MESH dispatches, unmount) run before it, by reverse registration order; NEXUS's termination runs after it. **What happens to a new entry:** refused at the central wrapper as a defect, `VALANCE: admission is closed (draining)`, the binding never runs. *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*

### Probes
| | |
|---|---|
| **A. ordinary drain** | command admitted (open admission) and suspended before any resource; `scope closing`, `valance registry finalizer started`, `interrupting 1`, `command exit: interrupted`, `valance registry drained`, **then** `resource released`, `scope closed`. Caller `interrupted`; state unchanged; `values` emitted only the start; nothing rendered; the resource was never reached |
| **B. late invocation** (while an uninterruptible command holds the drain open) | `app/home` and `app/slowOpen` both **refused as defects, with VALANCE's message** (not NEXUS's). The binding never ran, no resource was touched, no `command admitted`. The Stage 26 escape is gone. After the Scope closed, NEXUS's own refusal took over (`the runtime has begun terminating`) |
| **C1. interruptible command waiting for a new invocation** | **no circular wait**: the drain interrupts it and `Scope.close` completes by itself |
| **C2. uninterruptible command waiting for a new invocation** | **the circular wait reproduces.** The only door to its gate is a new invocation, refused by the entrance the registry just closed. The registry has requested interruption and waits for the actual exit; `Scope.close` and the command stay blocked through 2000 cooperative yields; the registry did not treat the request as termination; **`resource released` never happens, so NEXUS never begins and the resource stays alive**. Released from outside only after the block was observed |
| **D. inside a capability call** | `scope closing`, `valance registry finalizer started`, `interrupting 1`, **`lookup interrupted`** (the call exits as a consequence), `command exit: interrupted`, `valance registry drained`, `resource released`, `scope closed`; the released resource is never used |
| **E. uninterruptible, entered before the entrance closed** | the drain waits for the actual exit: interruption requested, command and `Scope.close` still pending, **resource not released, application still readable**, until the command leaves its region; then the pending interrupt takes effect (nothing after the region runs), then drained, released, closed |

### Where the refusal sits, and whether a late entry "reaches NEXUS"
The wrapper runs **inside** the application fiber NEXUS has already admitted, so a refused late entry **has reached NEXUS**: NEXUS admitted it and started its fiber, and VALANCE's guard ended it at the wrapper's first step. The distinguishing evidence is the message: NEXUS's own refusal ("the runtime has begun terminating") stops the work from ever starting. A table-level guard is therefore *later* than NEXUS admission; a guard in `inApplication` (before the fork) would refuse earlier, and was not tested because it needs a VALANCE source change.

### What closing VALANCE's entrance guarantees
For every command registered before the entrance closed and that is interruptible: it is interrupted and has exited before the registry finishes, before NEXUS begins to terminate, and before any resource is released; no command can enter and outlive the drain (B); a command that cannot be interrupted keeps the resource alive until it exits (E) instead of letting the resource be used after release. **The failure mode of a closed entrance is liveness, never safety**: a blocked drain holds resources open.

### Tradeoff (not decided)
| | **Admission open during the drain** (Stage 26, E and E2) | **Admission closed** (this stage) |
|---|---|---|
| Late commands | **escape** the snapshot, stay in flight and reach the released resource (safety violated) | **refused** (B); the set to drain is finite |
| Command that needs a new invocation | gets it: no admission cycle (E2) | interruptible: interrupted, no cycle (C1); **uninterruptible: blocks the drain** (C2) |
| Failure mode | use-after-release | a hang with the resources still alive |
| Drain completes | only against a snapshot | whenever every registered command can exit |

The deadlock is a property of one class of commands, **uninterruptible and admission-dependent**; every other command class drains.

### NEXUS pressure
None demonstrated. Everything in this stage ran on VALANCE's own boundary and on existing primitives; NEXUS's termination was never changed and was never the obstacle.

### New concept required
No new concept beyond the entrance closure Stage 26 identified, which is now shown sound for safety. What remains is a policy question, not a mechanism: what to do with an uninterruptible, admission-dependent command during a drain.

### Next probe
Whether this mechanism survives being production-shaped, before any design: spike it on a scratch branch in VALANCE's own `start` (registry around `inApplication`'s admitted handle, a finalizer added right after `Application.start`, the refusal in `inApplication` before the fork), change nothing else, and run the **whole existing matrix** (unit, jsdom, Chromium). It shows which established behaviors the production-shaped change would move (the lifecycle and entry tests, the `Mounted` observation, history, hydration), which is the largest remaining unknown between these probes and an implementation.

---

## Stage 28: the command-lifetime boundary inside the real VALANCE `start()` (spike)

*Question: can the Stage 27 mechanism be inserted into VALANCE's real lifecycle without disturbing established behavior? A scratch spike, preserved at commit `77605eb` and **reverted at the branch tip (`5811de1`)** so the tip's code is identical to Stage 27's and green; `git revert 5811de1` re-applies it. No NEXUS, MESH or PORT change, no public API change (`ApplicationHandle` and every export untouched), one source file, +29/−1 lines.*

### Integration point
`packages/valance/src/index.ts`, inside `start()`:
- **Registry:** a `Set` of fibers and an admission flag, created right after `Nexus.Application.start` (private; no new type).
- **Admission and registration:** `inApplication` wraps the effect it hands to `Nexus.Runtime.runFork` so the command **registers its own fiber** as its first step (`Effect.withFiberRuntime` in the `acquire` of an `acquireUseRelease`, which also unregisters on every exit). The admission check and the add are **one synchronous `Effect.sync`**; a refusal is a thrown `Error` (a defect, by Effect's own means). `inApplication` is where both `invoke` (line 130) and `dispatch` (line 122) already converge, and the fiber it forks is the real command fiber, so the registry covers the command that runs, not the caller.
- **Drain:** a Scope finalizer added immediately after `Application.start`: close admission, interrupt every registered fiber, await each one's actual exit (`Fiber.interrupt`).

### Finalizer ordering (observed, not forced)
Registration order in the caller's Scope: NEXUS's shutdown (`Application.start`) → the VALANCE drain → `connect`'s finalizers (follower, pending MESH dispatches, unmount) and any history finalizer, added later. Scope close runs them in reverse: *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*

```text
history / connect finalizers  (follower ends, pending dispatches interrupted, target unmounted)
VALANCE drain                 (admission closed, registered commands interrupted, actual exit awaited)
NEXUS termination             (its own admission closes, application resources, then platform resources)
```
Observed in the traces: `scope closing`, `command exit: interrupted`, `resource released`, `scope closed`.

### Command coverage (real paths)
| Path | Covered? |
|---|---|
| `ApplicationHandle.invoke` | **yes**: registered, interrupted and awaited by the drain; the caller observes `interrupted`; state unchanged; the resource never reached |
| MESH dispatch | **yes**, at the same boundary; VALANCE's existing `connect` pending-fiber interruption acts first (one exit, once; no double interruption observed) | *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*
| Structured child (`Effect.fork`) | **yes**: interrupted with its command (Stage 26's test still passes with the spike present) |
| Daemon / detached fiber | **no**, as designed: it escapes (Stage 26's daemon test still passes with the spike present) |

### Late entry and where it is refused
A late `ApplicationHandle.invoke` during the drain is refused as a **defect with VALANCE's message** (`VALANCE: admission is closed (draining)`), distinct from NEXUS's (`the runtime has begun terminating`), which applies only after the drain, once NEXUS's termination has begun. Because the check is the first step of the fiber NEXUS already admitted, the refusal happens **inside** an admitted NEXUS fiber, not before NEXUS admission. The binding does not run and no resource is touched. A pre-fork check would only move the message earlier; the in-fiber check is the atomic one. Not changed, per instruction.

### Test results
| Suite | Baseline (clean tip) | With the spike |
|---|---|---|
| Valance unit | 29 pass | **29 pass** |
| jsdom (examples) | 66 pass | 71 tests: **51 pass, 20 fail** (the 5 new probes pass; see below) |
| of which: every suite that existed before Stage 20 (8 files, 24 tests) | pass | **pass** (3 of 3 repeats) |
| Chromium | 20 pass | **20 pass** (agrees with unit and jsdom) |

Stability: the five Stage 28 probes passed 8 of 8 runs; the 20 failures are the **identical set** (same hash) on all 3 repeats, so they are deterministic. Against the unmodified source four of the five probes fail (they depend on the spike) and probe D passes (it asserts that existing dispatch behavior is unchanged).

### Behavioral changes
**Intended (a direct consequence of the command-lifetime invariant):** an admitted command is interrupted and has exited before NEXUS terminates and before any resource is released; no command can enter after the drain begins; between the drain and NEXUS's termination a new invocation is refused with VALANCE's message instead of being accepted.
**Regressions in established behavior: none.** Every suite written before Stage 20 (lifecycle, entry, history, hydration, multiview, render, application, external-face, Stage 19's synchronous capability) passes, in unit, jsdom and Chromium.

### The 20 failures, classified
All 20 are in `capability-async.test.ts` and all are **A, an intended semantic change**: each asserts a behavior of an admitted command *after the Scope closes* that the spike deliberately removes. None is B, C or D.
- Stage 20 C, Stage 21 (two), Stage 22 A+B, Stage 26 baseline `invoke`: asserted that the admitted command **survives** the Scope close and reaches the released resource; it is now interrupted first.
- Stage 23 (B+D+E, C, F), Stage 24 (B, F, G): resource-local drain and interrupt policies expect to find **in-flight calls** in the resource's finalizer; VALANCE now drains before the platform's finalizers run, so they find none. Several wait for signals that no longer occur (hence the 5 s timeouts, not assertion failures).
- Stage 25 (B, C, D1, D2+E, D2b, D3, H), Stage 26 A: expected the **platform registry** to find and interrupt the command; VALANCE's own drain has already done it, or (D2b, D2+E) is itself the one blocked, so the platform registry's finalizer never begins.
- Stage 26 E: asserted that an **open entrance accepts** a late command; it is now refused.
- **D (a dependency on admitting after shutdown began): none among established behaviors.** The only dependencies on post-shutdown admission are the probe-constructed circular-wait cases (Stages 23 C, 25 D2b, 27 C2), and they still behave as before.
These tests are characterizations of the *old* post-termination semantics; they were not rewritten, by instruction. If the mechanism were adopted they would need a disposition (rewrite to the new invariant, or retire).

### Circular wait, reproduced in the real lifecycle
An uninterruptible command that needs a new invocation: the invocation is refused by the closed entrance, the drain waits for the command's actual exit, `Scope.close` stays blocked through 2000 cooperative yields, and **`resource released` never happens, so NEXUS never begins and the resource stays alive**. The failure mode is liveness, never safety. Recorded as a known policy question; no timeout, no forced cancellation. A consequence worth noting: while VALANCE's drain is blocked, no platform-level finalizer (including the Stage 23 to 26 test registries) runs at all.

### Does the Stage 27 safety invariant survive real integration?
**Yes.** In the real `start()`: an interruptible command admitted before the drain is interrupted and has exited before the registry completes, before NEXUS terminates, and before any resource is released (probes A and C: `lookup interrupted`, `command exit: interrupted`, `resource released`, no `resource used after release`); no command can enter after admission closes (B), and after the Scope closes NEXUS's own refusal takes over; MESH dispatch and `invoke` share the same boundary (D); an uninterruptible command keeps resources alive instead of letting them be used after release (E). No NEXUS change was needed.

### Remaining unknowns
- The uninterruptible, admission-dependent command (policy; not solved, not attempted).
- VALANCE exposes no signal that the drain has begun; these tests infer it from an ordering VALANCE guarantees (the target is unmounted by `connect`'s finalizer, which runs just before the drain) plus a bounded run of yields. Whether production needs an observable is open. *(Stage 37 precision: this ordering holds when the mount lives in the same Scope as the application, as in the README's `Effect.scoped` usage, or in a child Scope forked from it; with an independent mount Scope nothing is unmounted at an application close. See Stage 37.)*
- "No command remains registered after normal completion" holds by construction (`acquireUseRelease` releases on every exit) but is not observable from outside without exposing the registry; not asserted.
- The direct `Application.shutdown(running.nexus)` route (outside the VALANCE model, Stage 14) bypasses the VALANCE drain; not tested.
- `renderToHtml` and headless hosts (no mounted target) were not given dedicated probes; they pass the existing suites.
- The disposition of the 20 characterization tests.

---

## Stage 29: the command-lifetime contract, adopted

Stage 27 proved the mechanism in tests, Stage 28 proved it fits the real `start()`/`inApplication()`; Stage 29 adopts it. The Stage 28 spike (`77605eb`) was re-applied (comments rewritten, one no-op helper removed; materially the same +28/−1 lines in `packages/valance/src/index.ts`), the 20 tests that characterised the old semantics were reconciled one by one, and four contract tests were kept. No NEXUS, MESH or PORT change; no public API change.

### The contract
- **Command lifetime.** A VALANCE command admitted through the application's command boundary remains owned by the application until it exits. When application draining begins, VALANCE closes command admission and drains all already-admitted commands before NEXUS termination and platform-resource release.
- **Admission during drain.** No new VALANCE command may be admitted after draining begins.
- **Liveness limitation.** An uninterruptible admitted command that depends on new VALANCE admission can prevent application shutdown from completing. The application remains alive rather than releasing resources underneath the command. This is a documented liveness limitation, not a bug: no evidence yet that it violates a required product invariant.
- **Rule that follows:** a command admitted before draining must not rely on admission of a new VALANCE command after draining begins. It is a command-lifetime rule, not a generic fiber rule.

Safety (no command runs against a released resource) is guaranteed; liveness (shutdown completes) is guaranteed only for interruptible commands.

### Ownership boundary
VALANCE owns commands admitted through `inApplication`, the registry that tracks them, admission closure, and their drain. It does not own arbitrary application fibers, daemon fibers, escaped fibers, or fibers detached from a command. Structured children of a command are covered by the command's lifetime. Pinned by D2/D3 below (a `fork` child is interrupted with its command; a `forkDaemon` child still reaches the released resource). The registry is not a general fiber supervisor.

### The exact admission boundary
`inApplication` (the one place an event enters the application's execution, reached by `ApplicationHandle.invoke` and by MESH dispatch) now runs `Nexus.Runtime.runFork(nexus.runtime, admit(effect))`. `admit` is an `acquireUseRelease` whose acquire step, as the first step of the command's own fiber, checks `admissionClosed` and registers the fiber in ONE synchronous step; the release step unregisters on every exit. A refusal is a defect (`VALANCE: admission is closed (draining)`). Two refusals therefore exist and are distinct: during the drain the call reaches NEXUS's admission and is refused inside the fiber NEXUS admitted, by VALANCE; after the Scope has fully closed, NEXUS's own refusal (`NEXUS: the runtime has begun terminating`) is unchanged. An unknown entry is still the typed `UnmappedCommand` and never reaches admission.

### The exact drain ordering
```text
admission open -> command admitted (registered) -> command runs
caller's Scope closes
  VALANCE finalizer (registered right after Application.start; Scope finalizers run in reverse):
    admissionClosed = true               (synchronous)
    Fiber.interrupt every registered command, awaiting each ACTUAL exit
  NEXUS finalizer: runtime terminates
  platform finalizers: resources release (last)
  Scope.close returns
```
No second lifecycle framework: the existing Scope finalizer order is the mechanism.

### Classification of the 20 former failures
Method: for each, the unmodified test and its setup were read (what was admitted, when termination began, what the command did afterwards, what it touched, what was asserted), then re-run on the production implementation; the received event trace was compared with the assertion. 12 were A, 8 were B, **none C, none D**. No failure was unexplained by the new contract.

**A, obsolete expectation (12)**: the test asserted that an admitted command continues after termination began.
- Stage 20 C: closing the Scope neither waited for nor interrupted the in-flight call, the resource was released under it, and the call committed to a stopped application. Now: call interrupted, resource released after, nothing commits.
- Stage 21 probe (fail) and (die): the call resumed and touched the released resource (typed failure or defect). Now: interrupted before release; neither use-after-release mode can occur.
- Stage 22 A+B: after close, every operation of the admitted command (state commit, event publish, capability use, captured capability) ran; the post-termination commit was readable. Now none of them run, the commit never happens, the caller observes interruption; the new-invocation refusal after close is unchanged (NEXUS's).
- Stage 23 C: the resource-local drain waited forever (circular wait) for a command needing a new invocation. Now the interruptible command is interrupted; `Scope.close` returns by itself.
- Stage 23 F and Stage 24 F: an admitted command that had not reached the resource went on to a released resource. Now interrupted where it waits; it never reaches or registers with the resource.
- Stage 24 G: the resource's interruption of its call left the containing command running. Now the command's own fiber is interrupted; it cannot capture the interruption and continue.
- Stage 25 H: coverage was "by convention" (an unwrapped command was invisible to a platform registry). Now every command is covered at the boundary; the unwrapped command is interrupted.
- Stage 26 baseline invoke: the invoke path was the uncovered one. Now it is interrupted before release (like dispatch always was).
- Stage 26 probe A invoke path: the platform registry did the interrupting. Now VALANCE's registry gets there first; the platform registry finds nothing.
- Stage 26 probe E: a snapshot drain by the caller's registry missed a late command, which escaped to the released resource. Now VALANCE's own registry (drained after the caller's, before NEXUS) interrupts it; no use after release.

**B, still-required behavior (8)**: the property survives independently of the old post-termination model; the test was adapted to the new lifecycle, not weakened.
- Stage 23 B+D+E: the resource is never released while a call is in it. Now holds because the command has already exited (the resource's drain finds nothing in flight); strengthened to an explicit ordering (`scope closing < lookup interrupted < in flight: 0 < finalizer started < resource released < scope closed`).
- Stage 24 B: call exited, caller left, then release; nothing commits. Same ordering, with VALANCE as the interrupter.
- Stage 25 B, C, D1: admitted-not-yet-at-resource command interrupted; command interrupted as a whole with the call exiting as a consequence; a command cannot catch the interruption of its own fiber and carry on. Orderings now run through VALANCE's drain (`command exit` before the platform registry finalizer, before resource release).
- Stage 25 D2 + E: an uninterruptible command keeps the drain waiting for its ACTUAL exit; new invocations are refused. Now refused by VALANCE (not NEXUS); it finishes its region, commits against a live resource, then the pending interruption takes effect.
- Stage 25 D2b: the circular wait for an uninterruptible, admission-dependent command. Kept as the documented liveness limitation (new refusal message; the drain is observed closed by a bounded poll, since the drain runs on its own fiber).
- Stage 25 D3: a daemon child still escapes the command and fails against the released resource (ownership boundary).

**C (architectural dependency): none.** All 20 live in `capability-async.test.ts`, in probe applications that characterise Stage 20 to 26 mechanisms. The 8 older jsdom files (24 tests), the 29 package unit tests and the Chromium suite never depended on post-termination execution and passed unmodified both with the spike and now. **D: none.**

### Tests changed, and why
Only `examples/tracer-web/test/capability-async.test.ts` (+ the production source and docs). Every changed test keeps its question and its original probe name stem, is marked `(command lifetime)` / `(still required)` / `(liveness limitation)` and has a comment saying what the old semantics were; no assertion was merely re-valued. Not changed: Stage 20 A/B+D/E, Stage 21 controls, Stage 23/24 A controls, Stage 25 ordering control, Stage 26 probe B/C/D1/D2/E2 and baseline MESH dispatch (they asserted behavior that is unchanged), and all of Stage 27. Stage 28's five probes were renamed `contract 1` to `contract 5` (the four contract tests plus the liveness case):
1. admitted command is interrupted and has exited before NEXUS terminates and the resource releases (`command admitted < scope closing < command exit: interrupted < resource released < scope closed`);
2. a late `invoke` during the drain is refused by VALANCE as a defect, the binding does not run, the resource is untouched;
3. a command inside a capability call: `lookup interrupted < command exit < resource released`, no use after release;
4. MESH dispatch: ordinary dispatch and rendering unchanged; a suspended dispatched command exits interrupted exactly once;
5. the documented liveness limitation.

### Mutation check
With the production source reverted to the Stage 27 tip, 24 of 71 tests fail (the 20 reconciled ones, plus contract 1, 2, 3 and 5; contract 4 passes on both by design). With the implementation, 0 fail.

### Results
| | before Stage 28 | spike, unreconciled | Stage 29 |
|---|---|---|---|
| package unit | 29/29 | 29/29 | 29/29 |
| jsdom (examples/tracer-web) | 66/66 | 71 (66 + the 5 Stage 28 probes): 51 pass, 20 fail | 71/71, identical on 3 consecutive runs |
| Chromium | 20/20 | 20/20 | 20/20 |
Typecheck and build clean.

### Behavioral changes
Intended: closing the Scope interrupts admitted commands (callers observe interruption); no command runs, commits or publishes after termination; no use after release; during the drain VALANCE (not NEXUS) refuses new commands. Unchanged: error types, capability behavior, command mapping and `UnmappedCommand`, state validation, rendering, hydration, events, NEXUS's refusal after the Scope closes, MESH dispatch (VALANCE's connect finalizer still interrupts pending dispatch fibers first; the registry sees an already-empty set: one exit, once). One observation: a command that is inside an uninterruptible region during the drain still commits while NEXUS is alive, and that commit IS published (`values` emits it), because the application has not yet terminated; before, a post-termination commit was never published.

### Remaining
Liveness limitation above (policy open). VALANCE still exposes no drain signal; the direct `Application.shutdown(running.nexus)` route outside the VALANCE model bypasses the drain (untested, as in Stage 28). The Stage 28 section's "disposition of the 20 characterization tests" is resolved here.

Documentation: this section is the source of the findings; the constraint is recorded as C20 to C23 in `docs/CONSTRAINTS.md` and summarised in the `packages/valance/src/index.ts` header.

---

## Stage 30: closing the lifecycle boundary (audit; no mechanism change)

**Shutdown-path map.** Every `Application.start`, `Scope.close` and shutdown site in `packages/*/src`, `examples/*/src` and tests was read.

| path | VALANCE drain | NEXUS termination | resource release |
|---|---|---|---|
| caller's Scope closes (the model's one route; includes `renderToHtml`, whose `Effect.scoped` closes it) | **yes**, first (finalizer right after `Application.start`) | after the drain | last |
| `connect` / `history` finalizers (unmount, follower, pending dispatches) | not the drain; they run just BEFORE it (registered later) | n/a | n/a |
| `Application.shutdown(running.nexus)` | **no** | starts at once | by the resources' own policy |
| anything else | none exists: VALANCE source never calls `Application.shutdown`; NEXUS has no self-termination (Stage 14) | | |

**`Application.shutdown` (Case A in intent, with a real bypass on the internal face).** It is NEXUS's. It is not in `ApplicationHandle` (frozen `{state, invoke}`), no VALANCE source or example calls it, and `start`'s doc already calls it outside the model. It is reachable only by a caller that imports `./internal` and reads `runningOf(handle).nexus` (7 test sites in Stage 13; today one, `lifecycle.test.ts`). Two characterisation tests now pin it (`early end through the substrate`): during an in-flight command NEXUS refuses new work with its own message and VALANCE does not interrupt anything; with a non-self-draining resource the resource is released under the command (the pre-contract Stage 22 behavior); a later Scope close finds nothing left and is harmless. This does not violate C20 to C23: their trigger is the Scope closing, and that is stated explicitly now. No production correction: making the drain observe a NEXUS-initiated shutdown would need a NEXUS hook or a handle method, i.e. a lifecycle API, which Stage 14/17 decided against. Open only if the early end ever becomes a public route.

**Commit during drain: Interpretation A.** Observed precisely: an uninterruptible command that commits during the drain is **published to `values`** (NEXUS is still alive) but **not rendered**, because `connect`'s follower and target are finalized just before the drain (Stage 29 said "published"; rendering never happens, now asserted: `operations == ["draw"]`). Nothing in `CONSTRAINTS.md` or `FINDINGS.md` says "no state change once draining begins": C20 says commands stay owned until they exit; Stage 22/29 record that admitted work commits both before and after NEXUS termination; `values` ends only at NEXUS termination. Interpretation B would require suppressing commits of commands the contract deliberately lets finish (an uninterruptible region cannot be cut short without forced interruption, which is excluded). So the behavior follows from "stop admitting, drain what exists" and is unchanged. The reader-visible consequence: during a drain the state stream may still emit; after the Scope closes it has ended. *(Stage 37 precision: this ordering holds when the mount lives in the same Scope as the application, as in the README's `Effect.scoped` usage, or in a child Scope forked from it; with an independent mount Scope nothing is unmounted at an application close. See Stage 37.)*

**C20 to C23:** preserved (C20 trigger clarified, no weakening). No public API, drain signal, timeout or NEXUS/MESH/PORT change.

**Results:** unit 29/29, jsdom 73/73 (71 + 2 characterisation tests), Chromium 20/20, typecheck and build clean.

The lifecycle boundary is closed. Next exploration: async/data flow under this command-lifetime model.

---

## Stage 31: async data flow, observed (evidence; no abstraction added)

**Tracer.** `examples/tracer-web/test/async-flow.test.ts` (13 tests, tests only; no source file changed). An ordinary application: state `{ value: string }`, one view (the existing `notfound` program, `title = value`, so the value shows as the page's `aria-label`), commands `startA` and `startB` that begin an async operation, suspend on a gate the test opens (a `Deferred` per invocation, handed out by invocation index), and then `state.update` the value the test released. Real `Valance.start`, `mount`, `State.values` (read through `runningOf(handle).states`, as in Stages 20 to 28) and PORT's draw/update. One ordered trace records command steps, `values` emissions and render operations. A pseudo platform resource (a Scope finalizer registered before `start`, so it runs after NEXUS terminates) marks "resource released". No timers; "does not happen" is a bounded run of cooperative yields.

**Data path (Probe A).** Suspended: nothing in the trace but `A#0 started` (no commit, no emission, no render; state still `init`). After the gate opens, the observed order is `A resumed -> A committed -> command exit -> caller returns -> values emits -> render update`. The command's commit is synchronous inside the command; `values` and the render follower observe it afterwards, asynchronously. Async work enters as an ordinary command, mutates ordinary state, and the existing `state -> values -> render/update` pipeline carries it with no async awareness (render: `update`, same nodes).

**B, sequential.** Two runs of the same command give three emissions (`init, a1, a2`) and `draw, update, update`: independent transitions, nothing replaced or coalesced.

**C and D, concurrent and stale.** A and B started in that order; gates opened `B then A` give final state `from-A`, emissions `init, from-B, from-A`, renders `draw, update, update`; opened `A then B` give final state `from-B`. **Completion order decides the state. VALANCE has no notion that A became stale when B started**: the older invocation overwrites the newer result. Both intermediate values are emitted and rendered (no skipping). Recorded as the current semantics, not as correct or incorrect.

**E, caller interruption.** Interrupting the caller interrupts the command and its pending gate wait (`gate wait interrupted`, `command exit: interrupted`, caller sees `interrupted`). Opening the gate afterwards changes nothing: no commit, emission or render. The application stays healthy (the next command runs end to end). The command does not stay registered: the later Scope close does not interrupt it again (its exit appears once), which is the only external evidence, since the registry is not observable. Cancellation here is entirely the existing chain `caller -> command fiber -> the async wait`; it is distinct from shutdown (separate test).

**F, children.**
- *F1:* a `fork` child that the command does not wait for is interrupted when the command exits (the child must already be at its gate to observe this; a child interrupted before its first step records nothing at all). Opening the gate later changes nothing. So async work started inside a command and not awaited does not outlive it.
- *F3:* a `fork` child the command waits for is inside the command lifetime: the drain interrupts the command and the child, before the resource releases.
- *F2/F4:* a `forkDaemon` child is outside VALANCE's command ownership. While the application lives it commits, emits and renders like any commit. Pending at drain, it survives the Scope close and commits afterwards: the commit is neither emitted (`values` has ended) nor rendered, and state is still readable. This is the Stage 22/25 daemon finding, now with data attached.

**G and H, drain.** A command suspended at Scope close is interrupted (never resumed) before the resource releases; opening the gate afterwards does nothing; the caller sees `interrupted`. Two suspended commands (H): both exit interrupted before the resource releases; neither commits. **Race (extra probe, resolves the "gate openable around the same time" ambiguity):** the gate opened in the same turn as the close begins, 25 repeats per variant, 5 full runs, always the same outcome: the command **completes and commits** (its waiter resumes before the drain's interrupt reaches it), `values` emits it, it is **not rendered** (the follower is already finalized), and the command exits before the resource releases. That is the Stage 29/30 "commit during drain is allowed" case, reached by a real async race, not a new behavior. (The "close forked first" variant is nominal: `Scope.close` starts on its own fiber after the caller's turn, so the waiter resumes first either way.) *(Stage 37 precision: this ordering holds when the mount lives in the same Scope as the application, as in the README's `Effect.scoped` usage, or in a child Scope forked from it; with an independent mount Scope nothing is unmounted at an application close. See Stage 37.)*

**Rendering.** Does not need async awareness: it sees only state, and each committed state is one `update`. Two consequences of the commit-per-completion model are visible, not problems yet: intermediate and stale states are all rendered, and renders trail the commit.

**Architectural pressure (observed, not decided).**
- Async data is not fundamentally different from an ordinary command that suspends: the same command, state, values and render path, the same ownership and cancellation chain.
- Cancellation is owned by the caller through command interruption; nothing else is needed for it to work.
- **Stale results are a real semantic gap, not a mechanism gap:** nothing in VALANCE can say that an operation became obsolete. The race exists today with two commands or two invocations of one command. Whether VALANCE should own that, or whether it is application policy expressible with existing state (the application can store what it is waiting for), is the open question; no probe here needed request identity to function.
- No evidence that the lifecycle is insufficient: command lifetime covered every command-owned async case (E, F1, F3, G, H). The only async work outside it is work the author deliberately detached (daemon).
- No stop condition occurred: no NEXUS, MESH, PORT or rendering change, no new public concept, no new lifecycle race.

**Rejected as premature (and not built):** async state abstraction, Resource/Query/Future/PromiseState, request identity, latest-wins or stale suppression, cancellation tokens, loading/error conventions, retry, debounce.

**Results:** unit 29/29, jsdom 86/86 (73 + 13 new, identical on 3 full runs; the tracer file alone on 5 runs, including 2 x 25 race repeats each), Chromium 20/20, typecheck and build clean. No constraint added: nothing here is an invariant yet.

---

## Stage 32: async composition and ownership, observed (evidence; no source change)

**Tracer.** `examples/tracer-web/test/async-compose.test.ts` (22 tests, tests only). Same method as Stage 31: real `Valance.start`, commands, state, `State.values`, mount/render, a pseudo platform resource (a Scope finalizer registered before `start`, so it runs after NEXUS terminates), deterministic `Deferred` gates, one ordered trace, no timers. State `{ value, ticket }`; every command composes gate-controlled operations with plain Effect only: sequencing, `Effect.all`, `Effect.either`, `Effect.fork` + `Fiber.join`, `Effect.forkDaemon`. Commands were driven through `ApplicationHandle.invoke`; the MESH dispatch path was not exercised by these probes (same boundary, `inApplication`, but not re-tested here).

**A, sequential.** Plain sequencing expresses it. B does not start until A's commit; trace `A started, A done, commit a, B started, B done, commit b, exit, caller returns`; three values (`init, a, b`), `draw, update, update`.

**B, parallel owned.** One command owning two operations (`Effect.all`, each branch commits): it stays alive after the first branch finishes and exits only after the second (no `exit` event before the second commit); both orders give commits in completion order, last completion wins. Contrast, same two operations joined and committed ONCE (`all` then one `commit`): one transition (`a+b`) in either completion order, no intermediate state. So "what becomes state, and when" is decided by the command's own structure, not by anything VALANCE adds.

**C, partial failure** is ordinary Effect failure and nothing more:
- C3 both succeed: command succeeds.
- C1 A commits, then B fails: the command fails with B's typed error; A's commit stays (no rollback exists or is implied); nothing after.
- C2, A fails first: `Effect.all` interrupts B (`B interrupted`); the command fails with A's error; opening B's gate later changes nothing; no commit at all. The caller's exit is a composite cause (the typed failure plus the interrupted sibling, `Parallel`), an ordinary Effect fact that a naive `isFailType` check misses.
- C2, B succeeds first then A fails: B's commit stays; command fails with A's error.
- Caught failure (`Effect.either` per branch): the sibling is NOT interrupted; the command succeeds and commits the settled outcome (`A:ok,B:failed`) once.
Failure never reaches state, values or the render by itself: only what the command chooses to commit does.

**D, owned vs detached.**
- D1 (`fork` + `join`, owned): at drain the command and its child are interrupted before the resource releases; a gate opened afterwards changes nothing. Observation: the child's interruption is recorded after the command body's last step (children are interrupted as part of the command fiber's exit) and before the resource releases.
- D2 detached, application alive: after the command has exited, the daemon work still commits, emits and renders like any commit.
- D2 detached at drain: nothing is interrupted (the command is gone); the gate opened after the Scope closed commits after termination, unemitted and unrendered. (A gate opened between "drain begins" and "NEXUS terminates" cannot be held open deterministically here: the drain does not wait for detached work.)
No third category appeared: work is command-owned (including structured children) or deliberately detached.

**E, composed workflow at drain.** Two pending operations: both interrupted, the command exits interrupted before the resource releases, nothing commits. With one operation already committed: that commit stays, the pending one is interrupted, exit before release. The Stage 29 contract covers the whole composition; it needed nothing composition-specific.

**F, race against drain (125 repeats, 5 runs).** Both gates opened in the same turn as the close begins: always the same outcome. The whole composition completes first (`commit a, commit b, command exit`), then the follower is unmounted, then the resource releases, then the Scope returns; **`values: a` emits before the unmount and `values: b` is delivered after `scope closed`** (the collector fiber drains already-committed values after the Scope returned; it is the commit that happened before termination, not a post-termination commit); nothing is rendered. Exit before release in every run. No new race: this is the Stage 31 shape with two operations.

**G, one command owning A+B vs two commands.** In states, emissions and renders they are identical (both orders). They differ exactly in failure and cancellation scope: inside one command a failing branch interrupts its sibling (C2) and interrupting the owning command's caller stops both operations; with two commands a failing B leaves A running and committing, and interrupting one caller leaves the other running. That distinction already exists at the command boundary and is sufficient to express both cases.

**H, stale results.** Two commands, B completes then A: A overwrites B (Stage 31). The same race with the policy written by the application in ordinary state (a `ticket` incremented at start, checked after the await): the stale result is dropped (`commit b` only, final `b`) with no new VALANCE concept. Cost observed: the tickets are state, so each start emits a value (`init t1`, `init t2`) and the unchanged view is re-rendered. Composition does not make stale-result policy unavoidable; whether the ergonomics warrant framework help is a separate, unobserved question.

**Architectural pressure (classification):**
- Async abstraction (Query/Resource/Future/PromiseState): **not required**: every workflow was ordinary Effect inside a command.
- VALANCE-specific async failure semantics: **not required**: Effect causes carry it; failure is not state unless the command commits it.
- Third ownership category: **not required**: command-owned (with structured children) vs detached sufficed.
- Request identity / latest-wins / cancellation tokens: **not required**: cancellation is the interruption chain; staleness is expressible as application state.
- Rendering async awareness: **not required**: it remained downstream of state in every probe.
- Lifecycle changes: **not required**: Stage 29 covers composed work unchanged.
- Framework-owned stale-result handling as an ergonomic convenience: **unresolved** (capable without it; the cost shown above is real but small).

No stop condition occurred. No constraint added: nothing here is an invariant beyond Stages 29 to 31.

**Results:** unit 29/29, jsdom 108/108 (86 + 22 new, identical on 3 full runs; the tracer file alone 5 runs, 25-repeat race inside), Chromium 20/20, typecheck and build clean.

**Next uncertainty:** how a failed or interrupted command becomes visible to the application and its view on the UI-driven (MESH dispatch) path. Here failure reaches only the `invoke` caller; state and render see nothing unless the command catches and commits. Whether that is enough for event-triggered work was not probed.

---

## Stage 33: failure at the event boundary, observed (evidence; no source change)

**The event path actually exercised.** `examples/tracer-web/test/async-event.test.ts` (14 tests, jsdom) and `browser/event-failure.browser.test.ts` (1 test, Chromium). Every command is triggered by a real click on the rendered page: PORT reports the event, `connect` (`packages/valance/src/index.ts`) calls `running.dispatch(render, handler, payload)`, which is `inApplication(host.dispatch(...))`, which resolves the MESH intent `home/open(id)` and runs the bound command inside the application. Nothing awaits it: `connect` forks the dispatch with `Effect.runFork(Effect.exit(...))` and pushes the resulting `Exit` onto `Mounted.dispatched`; the fiber is kept in `pending` (drained by `Mounted.settled` and by `connect`'s finalizer). One MESH intent is bound to every behavior, selected by which row was clicked, so the real intent (`{command: home/open, arguments: [{value: id}]}`) is the same in every probe. No `invoke` is used for the core probes. Real `start`, state, `State.values`, mount, render, pseudo platform resource as in Stages 31 and 32.

**Where an event command's exit goes.** One place: the `Exit` is recorded, unchanged, in `Mounted.dispatched` (public type `DispatchExit<E>`). Typed failure arrives as the typed error; a defect as a defect; success as `Dispatched` (with the intent). The runtime logs nothing (no output on any failing probe); the application does not terminate; state, `values` and the render are not told.

| case | `dispatched` exit | state / values / render | later events |
|---|---|---|---|
| A success | `succeeded` (intent recorded) | commit, then values, then render update | n/a |
| B typed failure (sync) | `failed "typed-boom"` | untouched | work |
| C defect (sync) | `died: defect-boom` (distinct from typed) | untouched | work |
| D async typed failure | nothing until the gate fails, then `failed "async-boom"` | untouched | work |
| E async defect | `died: async-defect-boom` | untouched | work |
| G commit A, await, fail | `failed "late-boom"` | A stays committed, emitted and rendered; no rollback; B never commits | work |
| H failure caught in the command, committed as ordinary state | `succeeded` | value `error: caught-boom` emitted and rendered, visible in the page | work |
| F interrupted at drain | **no exit recorded** | no commit, value or render | n/a |
Chromium agrees with jsdom for B, C, H and the follow-up event (typed failure, defect, caught failure, reverse click).

**Application visibility and recovery.** An uncaught event-command failure changes nothing the application or the page can see; the application keeps processing events. Same binding, same intent, same admission: a failing binding can fail again after a success (I). It poisons none of the dispatch path, the binding, or admission. Failure and "application in a failed state" are different things here: there is no failed state.

**Caught failure vs uncaught.** If the command catches and commits ordinary state, the page shows it with no framework knowledge of errors (H): application-level visibility needs nothing from VALANCE. Uncaught, the only observer is whoever reads `Mounted.dispatched`.

**I and J, ordering and concurrency.** Async failure, then a success while it is still suspended, then the failure resolves: exits are recorded in settle order (`succeeded`, then the failure). The MESH path does not serialize: two suspended event commands are in flight at once, and in either order of failure the sibling is untouched (no interruption), commits and renders on its own. Failure scopes are per dispatch.

**Drain through the event boundary (F, K).** A suspended event command is interrupted at drain and exits before the resource releases; it leaves **no entry** in `dispatched` because `connect`'s finalizer interrupts the dispatch fiber before it can record (Stage 26 baseline, unchanged). After the drain, a held reference to a once-rendered button reports nothing: the target is unmounted before the drain begins, so by this ordering no UI event can reach VALANCE's admission refusal at all (the refusal is reachable through `invoke`, not through the page). Race (gate opened in the same turn as the close begins, 25 repeats, 5 runs): always the command completes and commits, its exit **is** recorded (1 dispatch exit), exit before release, nothing rendered: the Stage 29 to 32 shape through MESH. No new race. *(Stage 37 precision: this ordering holds when the mount lives in the same Scope as the application, as in the README's `Effect.scoped` usage, or in a child Scope forked from it; with an independent mount Scope nothing is unmounted at an application close. See Stage 37.)* *(Superseded by Stage 39: a mount's close no longer interrupts the commands its events started; they are the application's. What this paragraph records is the behavior before that decision.)*

**Code-reading observations (not exercised, not changed).** `Mounted.dispatched` and `pending` grow with every event for the life of the mount; `pending` holds the completed dispatch fibers until `settled` is called or the Scope closes, and `dispatched` is never pruned. Nothing in the library reads `dispatched`: an application that does not look at it never learns about a failed event command.

**Architectural pressure (classification):**
- Event error boundary / error-to-state conversion / automatic error UI / error state: **not required**: failure is an `Exit` with an existing place to go, the application stays usable, and visible failure is expressible as ordinary state (H).
- Retry: **not required**.
- Cancellation (event-level): **not required**: interruption is drain or caller interruption, already covered.
- Lifecycle change: **not required**: MESH commands are covered by admission, ownership, drain and release ordering (F, K).
- NEXUS / MESH / PORT change: **not required**.
- Whether event-failure exits need a more deliberate observability story (who reads them, how long they are retained): **unresolved**, see below.
No stop condition occurred. No constraint added: "failure is not rendered" is current behavior, not an established property.

**Results:** unit 29/29, jsdom 122/122 (108 + 14 new, identical on 3 full runs; the Stage 33 file alone on 5 runs including the 25-repeat race), Chromium 21/21 (20 + 1 new, 3 runs), typecheck and build clean.

**Next uncertainty:** the retention and ownership of the event-exit record (`Mounted.dispatched` and `pending`) in a long-lived application: whether an unbounded, never-read per-mount list is the intended end state of the event boundary.

---

## Stage 34: ownership and retention of event-dispatch exits, observed (evidence; no source change)

**Method.** `examples/tracer-web/test/event-retention.test.ts` (15 tests, jsdom). The real path (click, PORT report, `connect`, `running.dispatch`, command) with one piece of test instrumentation: the Running's `dispatch` is wrapped (as Stage 28 wrapped `invoke`) to attach two WeakRef canaries per event: a FIBER canary pinned only by the fiber `connect` forks for the event (set in its FiberRefs), and an EXIT canary placed in the Exit's value or typed error. Liveness is read after a forced full GC; counts are logical (how many canaries are alive), never bytes or time. `pending` is private to `connect`; this is how it is observed without changing source. (A defect cannot be marked with an exit canary: re-raising it inside the dispatch fiber pins that fiber, which I verified is an artifact of the instrumentation, so defect exits are measured through `dispatched.length` and the fiber canary only.) Chromium was not run for these: retention is runtime-independent; the Chromium suite is unchanged (21/21).

**What the implementation is (read, then confirmed).** In `connect`: `pending` is a `Fiber[]` of the fibers forked for each event; `dispatched` is a `DispatchExit[]` that each fiber appends to as its last step (`Effect.tap`). `settled` is `Effect.suspend(() => pending.length === 0 ? void : forEach(pending.splice(0), Fiber.await).andThen(settled))`. The close finalizer interrupts the follower, unmounts the target, then `forEach(pending.splice(0), Fiber.interrupt)`. Both arrays are closure state of one `connect` call; `dispatched` is also handed out as `Mounted.dispatched` (typed `ReadonlyArray`, the live array).

**Ownership.** `pending` and `dispatched` are owned by the mount: created by `connect`, reachable only from its closure, the target's report callback and the `Mounted` value the caller holds. They are released when nothing references the mount.

**One event (A).** After completion: 1 Exit in `dispatched`, the fiber still held by `pending`. Completed does not mean released. `settled` then drops the fiber and leaves the Exit.

**Many events (B, C).** Logical growth is linear and exact: N events give N recorded Exits and N held fibers (N = 10, 100, 1000 measured), until `settled` or the Scope close. `settled` then releases the N fibers; the N Exits remain. Typed failures and defects are retained exactly like successes (C, 100 each): same ledger, same fiber retention, same effect of `settled`. Retention is by completion, not by outcome.

**Mixed (D).** success, failure, success, defect, async success, async failure: one ledger in settle order (the later event that completed first appears first); all six fibers held; one `settled` releases them all. One mechanism for every outcome, sync or async.

**`settled` (E, F, I).** It is synchronization, with the side effect of emptying `pending`:
- It snapshots-and-removes the fibers currently in `pending` and awaits them; it never interrupts anything and never fails (it returns normally after failed or defective events and does not say which ones failed).
- It waits while work is suspended (two suspended events: still waiting after 500 yields, and after one of them finished), and it also awaits events dispatched while it waits (it loops until `pending` is empty). While waiting, the running fibers stay held.
- It is reusable and scoped to what is pending at the time: settle, more events, settle again each releases only the fibers held then; with nothing pending it returns at once and changes nothing.
- It never touches `dispatched`: entries are identical, in the same order, before and after, cumulative across cycles, never reset.
So `settled` is a barrier, not a cleanup primitive; `pending` emptying is incidental to it.

**Mount close (G, H).** Close without `settled`: suspended events are interrupted and leave no ledger entry; already-completed ones keep theirs; once the mount is unreachable every fiber and every Exit is collectable (7 of 7 fibers, all exit canaries). Settle first and then close: the same end state, with both formerly-suspended events recorded. So `settled` is not required for lifecycle correctness. While a caller still holds `Mounted`, the close finalizer empties `pending` (fibers released at close) but the recorded Exits stay as long as the holder keeps `Mounted.dispatched`. *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*

**Retention scope.** Mount-scoped. Nothing outlives the mount; no fiber survives its mount (the finalizer interrupts and drops them). Retention does not affect command ownership, drain, resource release or later dispatch: the arrays are bookkeeping after completion, and none of Stages 29 to 33's ordering results depend on them.

**Unread failure (J).** A failed or defective event leaves nothing visible except the ledger: state, `State.values`, the page, `settled`, and the public handle (`{state, invoke}`, no failure surface) carry on unchanged. Confirms Stage 33: an application that never reads `Mounted.dispatched` never learns of the failure.

**What `dispatched` is (K).** An append-only completion ledger in settle order: entries appear at completion (never while a command is suspended), are never removed or reordered, and cover every outcome. It is not a pending-work tracker (suspended events are only in `pending`, which is not exposed) and not an event history in the sense of click order.

**Stop conditions:** none occurred. No completed event is retained beyond the mount's lifetime; mount close releases everything; `settled` is not required for correctness; no new abstraction was needed.

**Architectural pressure (classification):** exit retention policy: **unresolved** (the current behavior is a linear, mount-scoped ledger with no consumer; whether that is intended is an author decision, not a correctness problem); automatic pruning: **not required** (nothing demonstrates a correctness problem; pruning would only change memory for long mounts); event history API: **not required**; error propagation API: **not required** (Stage 33's explicit-state route works); event error boundary: **not required**; lifecycle change: **not required**; NEXUS, MESH, PORT change: **not required**. No constraint added.

**Results:** unit 29/29, jsdom 137/137 (122 + 15 new, identical on 3 full runs; the Stage 34 file alone on 5 runs), Chromium 21/21, typecheck and build clean.

**Next uncertainty:** whether the unbounded, unread ledger is an intended product behavior or an accident, i.e. whether the event boundary has a defined observer at all (the only reader is a caller who holds `Mounted`; in the repository's own examples nobody does). That is a product-intent question the experiments cannot answer.

---

## Stage 35: one application, several mounts, observed (evidence; no source change)

**Method.** `examples/tracer-web/test/multi-mount.test.ts` (14 tests, jsdom). One `Valance.start` in the application's Scope; several real `Valance.mount` calls over the same handle, each in ITS OWN Scope and over its own page (independent `connect` lifetimes: follower, target, pending dispatches). Real clicks in each mount's own page, or `invoke`; one MESH intent `home/open(id)` bound to every behavior. Two independent subscribers to the application's state stream stand in for "what each observer is handed". No store, no sync, no new API.

**Topology actually implemented.**
```text
Application (start's Scope)
  |- state (one NEXUS state)         owned here, survives every mount
  |- State.values / states           one stream per subscriber over the same commits
  |- commands + command registry     owned here (Stage 29)
  |- Valance.mount(...) x N          each its own Scope, follower, target, `drawn` render,
                                     `pending`, `dispatched` (Stage 34)
```
`mount` does not own the application and the application does not know its mounts: nothing in `start` references a mount, and each `connect` closes over its own state. Mounting twice on one handle is simply allowed (no exclusivity).

**State ownership (A, B, E, J, K).** Application-owned. Both mounts begin from the same state and mounting commits nothing. One command is one commit; the state stream hands every subscriber the identical value object (no per-subscriber copy), and each live mount renders it once. A mount made after the state changed draws the current state, not the initial one. With every mount unmounted, commands still run and commit; a later mount draws the then-current state (the state stream kept running through the empty period).

**Observation and render lifetime (B, C, D, F).** Each mount independently follows the same value stream with its own render lifetime. Unmounting B (or A, the first mount) removes only that mount's follower and target: the other keeps updating, the application and its commands are untouched, the unmounted page records nothing afterwards. An async command that is suspended while B unmounts commits normally; A updates, B stays silent.

**Command ownership (F, G, H, I).** Two kinds, observed separately: *(Superseded by Stage 39: a mount's close no longer interrupts the commands its events started; they are the application's. What this paragraph records is the behavior before that decision.)*
- **Invoked** commands are application-owned: unmounting any mount (even the one the caller associates with it) mid-command leaves it running; it commits and the remaining mount renders it.
- **Click-initiated** commands are application-owned AND ALSO owned by the mount that dispatched them: `connect`'s finalizer interrupts that mount's `pending` dispatch fibers. **Counterexample (stop condition 4, reported not fixed):** click in A starts a suspended command; unmount A while B stays mounted and the application stays alive: the command is interrupted (`gate interrupted`, exit `interrupted`), nothing commits, B sees nothing, the application is unaffected. The same command invoked instead continues. This is the Stage 26/34 `pending` behavior meeting a second mount; it is not new code, but with several mounts "which lifetime ends a click-initiated command" has a visible answer: the dispatching mount's. A click in A and a click in B each run an application command (one commit per click, both mounts follow, the exit is recorded in the dispatching mount's `dispatched` only). Two suspended commands from two mounts run concurrently; completion order decides the state in both orders and both mounts follow every commit (no stale handling, as before).

**Failing mount (L).** A mount whose first draw fails fails by itself (a defect from `mount`); the application, its state and the other mount are unaffected, closing its Scope is harmless, and a retry mounts fine.

**Application close vs mounts.** With independent Scopes, closing the application's Scope does not unmount any mount: their targets stay drawn (last page still present) until each mount's own Scope closes, which then unmounts each exactly once. So the Stage 29/30 statement "the target is unmounted before the drain" holds only when the mount is closed first or lives in the same Scope as the application (finalizer order); it is a consequence of scope placement, not of the library.

**Lifecycle coupling.** Distinct: state lifetime, values subscriptions, command lifetime (application) and mount lifetime (render, target, follower). Coupled in exactly one place: a click-initiated command is also bound to its dispatching mount (`pending`). Nothing else couples them: no mount can end, mutate or diverge the application's state; one mount's teardown never interrupts another mount's observation. *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*

**Stop conditions.** Only one was touched: (4) a command is mount-owned, in the click-initiated case above, as already implemented since Stage 26 and documented by Stage 34; no other mount, state or the application was affected, so I recorded and continued. Not occurred: another mount mutating or terminating state, state diverging, teardown of one mount interrupting another, a synchronization abstraction becoming necessary, any NEXUS/MESH/PORT change.

**Architectural pressure (classification):** multi-mount abstraction: **not required** (mounting twice already works); shared store: **not required**; observer registry: **not required** (each mount subscribes to the same stream); mount-specific state: **not required**; lifecycle change: **unresolved** (only the click-initiated-command-ownership question above); NEXUS, MESH, PORT change: **not required**. No constraint added.

**Results:** unit 29/29, jsdom 151/151 (137 + 14 new, identical on 4 full runs after a Stage 34 test timeout fix: its 1000-click case takes about 4.5s and timed out once in a loaded run, given a 60s limit; its logic is unchanged), Chromium 21/21, typecheck and build clean. Browser behavior was not separately probed: nothing here depends on the runtime.

**Next uncertainty:** whether a click-initiated command should end when the mount that dispatched it unmounts while the application lives on (it does today), or belong to the application like an invoked one. The experiments show the behavior and cannot say which is intended.

---

## Stage 36: who owns a click-initiated command, observed under both models (evidence; no production change kept)

**Phase A, the current boundary, read in `packages/valance/src/index.ts`.**
```text
PORT click -> target's report callback (in connect)
  -> Effect.runFork(Effect.exit(running.dispatch(render, handler, payload)).pipe(tap(push to dispatched)))   = the OUTER dispatch fiber
       forked with the global Effect.runFork: no parent Scope, held only by connect's `pending` array
  -> running.dispatch = inApplication(host.dispatch(...))
  -> inApplication: Nexus.Runtime.runFork(nexus.runtime, admit(effect))                                      = the INNER command fiber
       admit registers the inner fiber in the application registry (Stage 29); Fiber.join(inner) with onInterrupt(interrupt inner)
  -> binding -> command Effect
```
1. The outer fiber is forked in the target's report callback. 2. No Scope owns it: `pending` (connect's closure) holds it. 3. Mount close interrupts it because connect's finalizer runs `forEach(pending.splice(0), Fiber.interrupt)`, and `inApplication`'s `onInterrupt` then interrupts the inner fiber: the mount reaches the command through that interruption edge. 4. The registry sees the INNER fiber only. 5. The command fiber is already forked by `inApplication` under the application's runtime and registered there: command ownership is already the application's; changing the fork would change nothing. What ties a click-initiated command to its mount is only the finalizer's interruption of the joiner. 6. `Mounted.dispatched` does not require that: the outer fiber pushes its exit from its own `tap`; it works the same if that fiber outlives the mount.

**Current model (production, unchanged): "mount-owned event execution".** Command = application-owned (registered) AND ended by the dispatching mount's close.

**Phase B, characterisation** (`examples/tracer-web/test/event-ownership.test.ts`, 11 tests, default expectations = production). B1 baseline commits and renders and records `succeeded`. B2 click in A, A unmounts, B and the application alive: the command is interrupted, nothing commits, B renders nothing, A's ledger has no entry. B3 invoke control: continues. B4 unmounting the non-dispatching mount: survives. B5 two click commands, A unmounts: A's is interrupted, B's commits. D5b/D5c/D7 drain and D8 late mount also characterised.

**Phase C, the disposable spike (commit `f951d72`, reverted in `6112b1d`; re-apply with `git revert 6112b1d`).** The whole change is 2 lines in `connect`'s finalizer: `forEach(pending.splice(0), Fiber.interrupt)` becomes `pending.splice(0)` (the mount lets go of the joiners and no longer interrupts them). No new API, no new type, no change to dispatch, `Mounted`, `settled`, or the registry. This was possible without any abstraction: the existing `inApplication` entry point already makes the command application-owned, so the spike only removes the extra interruption.

**Phase D, the same 11 tests run with `VALANCE_EVENT_MODEL=app` (3 runs, all pass with the app expectations):**

| Question | Mount-owned event (production) | Application-owned event (spike) |
|---|---|---|
| Mount unmount interrupts the event command? | Yes, the dispatching mount's (B2, B5, D8) | No |
| Remaining/late mount sees the eventual commit? | No: nothing commits (B renders `init`; a mount made later draws `init`) | Yes: B renders it; a late mount C renders it (D8) |
| Application command registry owns it? | Yes (inner fiber registered) | Yes, identical (D7: exit before release in both) |
| Event Exit has a natural owner? | Only if the command ends while the mount is open; an interrupted-by-close dispatch leaves no Exit at all | The dispatching mount's `dispatched`, even when that mount is already closed (B2/D6: `succeeded` appears after its unmount); nothing is drawn into the closed target |
| Exit retention survives mount close? | Exits recorded before close stay while a holder keeps `Mounted`; none is created for the interrupted ones | Yes, and the closed mount's bookkeeping (`dispatched` array, held by the still-running outer fibers) stays reachable until its outstanding commands exit; the mount can no longer `settle` them (`pending` was emptied) |
| Application drain interrupts it? | Yes (D5b, D7) | Yes (D5b, D7) |
| Drain with the mount closed first (shared-scope order, D5c) | Command interrupted by the mount's finalizer first; no Exit recorded (Stage 33 F) | Command interrupted by the registry; an `interrupted` Exit IS recorded in the mount's ledger |
| Resource safety preserved? | Yes (exit before release) | Yes (exit before release; all Stage 29 contract tests pass under the spike) |
| Multiple mounts remain independent? | Yes (B4, B5) | Yes (B4, B5) |
| Requires a new abstraction? | No | No (2-line change) |
| Requires NEXUS/MESH/PORT change? | No | No |
Chromium 21/21 and unit 29/29 under the spike. **Existing tests that encode the mount-owned model** and fail under the spike (the only collateral): Stage 26 baseline MESH dispatch ("the interrupted dispatch leaves no result"), Stage 33 F ("no exit recorded at drain"), Stage 34 G (the exit count after a shared-scope close: 7 instead of 5, the two suspended events now record `interrupted`), Stage 35 I counterexample. All four assert what a mount close does to a click-initiated command; none asserts anything about state, resources or the registry.

**Phase F, the semantic distinction.**
1. *What a mount owns:* rendering, observation (its follower on the shared value stream), the event listener, and event-dispatch bookkeeping (`pending`, `dispatched`). Command execution is not among them in either model: the inner command fiber is the application's from the moment `inApplication` forks it. What differs is only whether the mount's teardown also cancels the commands its events started.
2. *What an event is:* today an application command invocation whose caller is a mount-owned joiner fiber; the mount owns the caller, the application owns the command, and tearing down the caller cancels the command. The spike makes the joiner outlive the mount, so the event becomes an invocation with a mount only as source.
3. *What `Mounted.dispatched` is:* the ledger of command executions initiated by that mount, in settle order. Under the mount model it can only hold commands that ended while the mount was open (or that the application, not the mount, ended); under the spike it can still receive entries after the mount closed. It is not a mount-local UI history in either model: its entries are commands, not clicks.
4. *When the source disappears:* mount model: the command is cancelled with its caller, state is unchanged, other mounts and later mounts never see its result, resources are untouched (released after the interruption). App model: the command runs to its end, state commits, remaining and later mounts render it, the commit is invisible to the source (unmounted), the closed mount's ledger records the exit, and the command ends earlier only through the application drain.

**Stop conditions:** none occurred. The spike needed no public API; the Stage 29 registry/drain contract held (D5b, D7, contracts 1 to 5); Exit retention does not depend on mount-owned fibers (it works with them outliving the mount); no command escaped the registry; the models are distinguishable (B2, B5, D8); no undocumented invariant was found that neither model preserves.

**Architectural conclusion.** Both models are coherent and cost one finalizer line apart. Mount-owned means "the user left the place the event came from, so what it started is cancelled"; application-owned means "the event only initiated an application command; its fate belongs to the application". Neither touches state ownership, multi-mount observation, rendering or remount behavior. The boundary each requires is already there (the interruption edge in `connect`'s finalizer versus `inApplication`'s registration). What remains is a product decision about intended semantics (whether leaving a mount cancels the work its events started). No constraint added: nothing here is an invariant, only a choice between two behaviors. *(Superseded by Stage 39: a mount's close no longer interrupts the commands its events started; they are the application's. What this paragraph records is the behavior before that decision.)*

**Results (production tip, spike reverted):** unit 29/29, jsdom 162/162 (151 + 11 new, identical on 3 runs), Chromium 21/21, typecheck and build clean. `git diff b627d44 HEAD -- packages` is empty. Under the spike (not kept): the 11 new tests pass with `VALANCE_EVENT_MODEL=app` (3 runs); jsdom has the 4 existing + 5 default-expectation failures listed above; unit 29/29 and Chromium 21/21. The Stage 34 1000-click test kept its 60s timeout and did not flake.

**Next uncertainty:** the product decision above, nothing else: what should leaving the mount that initiated a command mean for that command.

---

## Stage 37: application / mount Scope topology, observed (evidence; no source change)

**Phase A, implementation (read, not inferred).**
- *Application Scope:* `start` takes the caller's Scope from the environment (`Effect<..., Scope.Scope>`); it creates none. Acquisition order inside it: `Application.start` registers NEXUS's finalizer (platform resources release inside NEXUS's shutdown), then `start` registers the command-registry finalizer (Stage 29: close admission, interrupt and await admitted commands). Scope finalizers run in reverse, so the registry drains before NEXUS terminates and before the platform releases. State and `values` are NEXUS-owned resources of this same Scope (the state stream ends when NEXUS terminates).
- *Mount Scope:* `mount`/`hydrate` also take the caller's Scope from the environment and create none. `connect` forks the follower into that Scope (`forkIn(scope)`) and registers one finalizer in it: interrupt the follower, `target.unmount()`, interrupt the mount's `pending` dispatch fibers. Nothing parents a mount Scope under the application Scope or the reverse: the public API takes "a Scope" for each and relates them only through what the caller passes. There is no `Mounted` close handle; a mount ends only when its Scope closes (or the application ends it, below). *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*
- *Render lifetime:* mount, then follower (a stream of `running.values`), then `draw`/`update` on the target; the finalizer above ends the follower, unmounts, and interrupts the mount's pending dispatches; the dispatch Exits stay in the mount's closure (`dispatched`, Stage 34). The follower also ends by itself, with Success, when the value stream ends (application terminated). *(Pre-Stage-39 behavior: a mount's close interrupted the commands its events started. Removed in Stage 39; see "Canonical lifecycle architecture" at the top of this file.)*
- *Command lifetime (unchanged):* `invoke` and click both reach `inApplication` and the registry; a click additionally has a mount-owned joiner in `pending` (Stage 36, left as is).

**Topologies expressible with public APIs** (all three probed in `examples/tracer-web/test/scope-topology.test.ts`, 14 tests, jsdom): *shared* (start and mount in the same Scope: what the README, every example and every browser/capability test in this repository do), *parented* (each mount in `Scope.fork(applicationScope)`), *independent* (each mount in its own Scope). Effect provides all three; VALANCE neither requires nor prevents any. The README's canonical usage is the shared Scope ("closing the scope ends everything").

**Application close with a command suspended** (invoked and click, same order in each topology):
```text
shared / parented:  B unmounted, A unmounted            (mount finalizers, reverse of creation)
                    gate wait interrupted, command exit: interrupted [invoke(...): interrupted]   (registry drain, Stage 29)
                    platform resource released, application closed                                (NEXUS, then resources)
independent:        gate wait interrupted, command exit: interrupted [invoke(...): interrupted]   (registry drain; targets STILL MOUNTED)
                    platform resource released, application closed
                    -- nothing is unmounted; each mount unmounts later, when its own Scope closes
```
Finalizer ledger: *mount finalizer* (owner: the mount's Scope; trigger: that Scope closing; interrupts the follower and the mount's pending click dispatches; does not wait for commands; releases the target); *registry finalizer* (owner: the application's Scope, registered right after NEXUS's; interrupts and awaits every admitted command, closes admission; releases nothing); *NEXUS finalizer* (terminates the runtime, ends the state stream, releases platform resources last; waits for nothing, the registry having already drained). *(Superseded by Stage 39: a mount's close no longer interrupts the commands its events started; they are the application's. What this paragraph records is the behavior before that decision.)*

**Application closes before mounts (independent).** Terminated: the application (commands refused, state stream ended, platform released, admitted commands interrupted). Still there: both targets, drawn with the last render (`label` unchanged), and both mounts' Scopes. The mounts' followers have ended with Success (the value stream ended), so no further update can arrive. Events still reach `connect` and dispatch: they are refused by the runtime (`died: NEXUS: the runtime has begun terminating`) and recorded in the live mount's `dispatched`. `invoke` is refused the same way, state stays readable. Each mount's Scope still closes cleanly, once. A mount created after the application closed fails by itself (`the application ended before its first render`): there is no resurrection and no undefined behavior. A click command suspended at that close is interrupted by the registry, and since the mount was open, its `interrupted` Exit IS recorded (Stage 36 D5b); in shared/parented topologies it is interrupted by the mount's finalizer first and no Exit is recorded.

**Mounts close before the application.** The application is fully alive with zero mounts: commands run and commit, values flow (the state stream kept emitting), a new mount draws the current state (B2/B7). Closing A then B then the application releases in that order, each exactly once (B1). Mount close with a pending command (control, B6): the invoked command survives; the click command is interrupted (the existing Stage 35/36 behavior, left unresolved). A parented mount closes on its own like an independent one; the parent adds "and with the application, before the release". *(Superseded by Stage 39: a mount's close no longer interrupts the commands its events started; they are the application's. What this paragraph records is the behavior before that decision.)*

**Resource safety.** Independent of mount Scope: in all three topologies and for invoked and click commands, `command exit: interrupted` precedes `platform resource released`; nothing commits after the drain began except what the command itself finishes (Stage 30). The registry lives in the application's Scope, so no mount arrangement can release platform resources under an admitted command.

**Correction to the Stage 29/30 wording.** "The target is unmounted before the drain" (Stages 28 to 33) is **topology-dependent**: true when the mount lives in the same Scope as the application (README usage) or in a Scope forked from it, because finalizers run in reverse creation order; **not true** for independent mount Scopes, where the registry drains with the targets still mounted and nothing unmounts at an application close. It is not a library invariant and not specific to the test harness (the harness used the README's shared Scope for most stages; Stage 35 introduced independent Scopes). The four affected sentences now carry an inline precision note. The Stage 29 contract itself (registry before NEXUS before platform release) is unaffected: it does not depend on mount placement.

**Phase F.**
- *State:* application-owned always: it lives in the application's Scope and survived every mount arrangement and closure.
- *Values:* the stream is application-owned; each subscription (each mount's follower, any collector) is subscriber-owned and ends when its owner is interrupted or the stream ends.
- *Render:* strictly mount-owned (follower, target, `drawn`, unmount), except that the application's end ends the follower (Success) without touching the target.
- *Commands:* invoked commands are application-owned. Click commands: the command fiber is application-owned and registered; the joiner that links it to its mount, and the recorded Exit's ledger, are mount-owned (production behavior, Stage 36 undecided).
- *Mount outliving the application:* possible and observed under independent Scopes (mounted but dead, no update, events refused); under shared or parented Scopes the mount ends with the application. *Application outliving every mount:* supported and the normal independent case.
- No policy was derived from these; they describe what the implementation provides.

**Stop conditions:** none strictly occurred. (1) there is a clearly canonical topology in the repository's documented usage (the shared Scope), though the API does not enforce it; (2) application resources never released under an admitted command; (3) mount teardown never touched application state; (4) the independent-Scope "mounted but dead" state is coherent (every part of it is owned by a Scope that will close it, and each piece behaves predictably); (5) the Stage 29 ordering does not depend on how the caller constructs Scopes; (6, 7) no new API was needed to express or observe any topology.

**Architectural conclusion.** The implementation guarantees: state, commands, the registry, NEXUS and the platform live and end together in the application's Scope in the Stage 29 order; a mount is whatever its own Scope says; the relationship between the two Scopes is entirely the caller's. Unspecified: whether an independent mount outliving its application is a supported use or merely permitted (nothing documents it either way), and the intended Scope placement for multiple mounts. Event-command lifetime (mount-owned vs application-owned) remains a product/API semantic decision and was not touched.

**Results:** unit 29/29, jsdom 176/176 (162 + 14 new, identical on 3 full runs; the Stage 37 file alone 5 runs), Chromium 21/21, typecheck and build clean. No production source changed. Constraints: none added (the topology is permitted, not mandated).

**Next uncertainty:** whether independent mount Scopes (a mount that can outlive its application as a drawn, dead page) are intended or accidental: i.e. should `mount` tie the follower's/target's end to the application's end, or is that the caller's job?

---

## Stage 38: whose lifetime is a mount's? (decision: caller-owned; no behavior change)

**Question.** Is an independent mount outliving its application (a drawn-but-dead target until its own Scope closes) an intended semantic or an accidental capability?

**Evidence, by source.**
- *Public API text.* `mount`'s own documentation said: "Draws the application's current render on a target, and keeps it current. **Ends with the caller's Scope.**" `Mounted.followed`: "Completes when Valance stops following renders: **Success when the application ended**, a Failure when a render failed, **Interrupted when the scope closed**." The API therefore already names two distinct endings, "the application ended" and "the mount's scope closed", and gives the first one a Success outcome that leaves the mount Scope open. That outcome only makes sense if a mount can still be open when its application has ended.
- *Constraints.* C6: the caller's Scope owns the lifetime; the follower and the target are "both finalized by the Scope, target first". C2/PORT contract: the composer decides when a target unmounts; nothing in NEXUS or PORT does it on VALANCE's behalf.
- *Earlier findings.* Stage 11, invariant 3 ("bindings end before the application", modified) is stated "in the caller's scope": one Scope holding both. It is an ordering consequence of a single Scope, not a claim about separate ones; the wording was ambiguous about that and now says so. Stage 14: ending an application early is not part of the model; the application's end is observed by the follower, which is the Success outcome above. Stage 37: the topology is caller-controlled, shared in every documented example, and VALANCE neither requires nor prevents the others.
- *README.* Shows one `Effect.scoped` holding start and mount; "closing the scope ends everything" is true of that Scope. It says nothing about separate Scopes, and the claim was not normative for them. Ambiguous, not contradictory: the README now states the separate-Scope case explicitly.
- *Ownership.* Each piece of an independent mount is owned by exactly one Scope that will close it: the target and follower by the mount's Scope; the application's resources, state and commands by the application's. The mount holds no application resource after the application ends: its events are refused at admission, the follower ended with Success, and its own Scope closes the target once.

**The probe** (`examples/tracer-web/browser/mount-lifetime.browser.test.ts`, real Chromium, real PORT web target, real clicks, the real catalog application, mounts in their own Scopes, 3 runs). Observed lifecycle: (1) application alive, mount A alive: a click reaches the application and the page follows (`Beta, Alpha`), exit recorded. (2) A's Scope closes: A's target is emptied; the application stays fully usable (a command commits `C, D`); a new mount B draws the current state. (3) The application's Scope closes: B stays drawn with `Gamma, Delta`; `followed` is `Success`; state is still readable. (4) B's Scope is still open. (5) A click in B reaches admission and is refused (`died: NEXUS: the runtime has begun terminating`, recorded in B's ledger); `invoke` is refused the same way; the page does not change. (6) B's Scope closes: B's target is emptied, cleanly, once. No resource or ownership contradiction at any step. The jsdom probes of Stage 37 (shared, parented and independent Scopes, both command kinds) are the matrix behind it and were not repeated.

**Is independent mount lifetime coherent?** Yes. It is the case where the two ends are driven by two owners, and each end happens exactly once, in an order the owners control. The outcome (drawn, inert, refusing events) is observable and consistent, and is exactly what `Mounted.followed`'s Success outcome describes.

**Decision: caller-owned (Model A).** Model B (the application owns its mounts) would contradict the explicit public text ("ends with the caller's Scope"), C6's finalization rule and the documented `followed` outcome, and would require VALANCE to unmount a target (PORT's) on an event its Scope does not signal, i.e. a second ending for the mount besides the caller's Scope. The evidence is not ambiguous.

**Not decided here (explicitly).** Event-command ownership (mount-owned vs application-owned, Stage 36) stays a product/API semantic decision. This stage touched neither the follower's click-dispatch interruption nor any command path.

**Changes.** No behavior change. Documentation only: `mount`'s doc comment now states the contract (comment text; build output unchanged apart from the comment); the README gains one paragraph under its example saying that `start` and `mount` each take a Scope and relate them in no other way, and what an independent mount does when the application ends first; C24 is added to `docs/CONSTRAINTS.md`; Stage 11's invariant 3 carries a precision note. The README wording that implied otherwise was "closing the scope ends everything" read without its context (one Scope).

**Results:** unit 29/29, jsdom 176/176, Chromium 22/22 (21 + 1 new, 3 runs), typecheck and build clean.

**Next uncertainty:** none structural about mounts. The remaining open questions are the product decisions already recorded: event-command ownership (Stage 36) and whether the event-exit ledger has an intended reader (Stage 34).

---

## Stage 39: who owns an admitted click command (decision: the application)

**Trace of a click command's whole life (read in `packages/valance/src/index.ts`).** PORT reports the event to the mount's target callback; `connect` captures the render drawn at that moment (the mount's context) and forks an OUTER dispatch fiber (`Effect.runFork`, no Scope; held in the mount's `pending`); that fiber calls `running.dispatch`, i.e. `inApplication`: admission is checked and the INNER command fiber is registered in the application's registry in one synchronous step (C20/C21, the same boundary `invoke` uses); the command runs in the application's runtime and commits to the one application state; the OUTER fiber joins it and records the exit in the mount's `dispatched`. Mount close used to interrupt the outer fiber, whose `onInterrupt` interrupts the inner command; application close interrupts the inner command through the registry (the outer fiber then records the exit). Pending state: the mount's `pending` holds the outer fibers, the registry holds the inner ones.

**Admission ownership.** The application's. It is decided at `inApplication` (refused as a defect once draining begins, or by NEXUS after termination), never by the mount; the mount supplies only the source and the drawn render the intent is resolved against.

**Execution-lifetime ownership: the contradiction found.** The adopted constraint C20 (Stage 29) says a command admitted through the command boundary, "reached by both `ApplicationHandle.invoke` and MESH dispatch", "remains owned by the application until it exits". Experiment A below shows that a click command admitted at that boundary was nevertheless ended by the closing of the mount that reported the event while the application was alive: the application's command was ended by a presentation lifetime, with no adopted statement allowing it.

**Evidence (not implementation topology).** For application ownership: (1) C20 names MESH dispatch explicitly; (2) Stage 11 invariant 4 ("every state transition is a command in the application's binding table; external events enter there"): a click is an entry into the application's table, and what it commits is an application transition, observed by every mount; (3) `Mounted.dispatched` is documented as "every dispatch Valance made for a reported event, as it settled", which is only true if dispatches are not cancelled by their mount's teardown; (4) the original reason for the mount-side interruption (Stage 1 and Stage 11 invariant 3, "bindings end before the application") was an ORDERING in a single Scope, which the Stage 29 registry now provides for every command with the same observable order, so the mount-side interruption no longer protects any guarantee (Stage 36 showed resource safety identical under both models); (5) Stage 36's table: the models differ only in what survives a mount's close, not in state, observation or registry ownership. For mount ownership the only supports are the placement of `pending` inside `connect` and its classification as "the connection to a target" (Stage 11 table): both implementation topology, which the stage's framework excludes. No public text promised that closing a mount cancels the work its events started.

**Experiment A (Chromium, real PORT target, independent mount, a command held pending; `browser/event-lifetime.browser.test.ts`).** Mount's Scope closes first, application alive. Before the change: `A unmounted`, then `command interrupted`, `command exit: interrupted` (the only lifetime that ended was the mount's, so the mount finalizer was the cause); no commit; no exit in the closed mount's ledger; the application fully usable (a new mount drew and modified state). After the change: `A unmounted`, then (gate opened) `command resumed`, `command exit: succeeded`; state `late`; the closed mount's ledger holds `succeeded`; a new mount draws `late` and can modify state.
**Experiment B.** Application's Scope closes first, mount open (unchanged by the change): `command interrupted`, `command exit: interrupted`, THEN `platform resource released` (nothing released under an admitted command); the mount stays drawn; `followed` is `Success`; the exit is recorded in the live mount's ledger (`interrupted`); state readable; closing the mount's Scope afterwards unmounts once, cleanly.

**Split contract?** One distinction survives and is coherent, but it is not an ownership split: the mount is the *source* (its drawn render selects the intent, its target ends with its Scope, its ledger records the exit of what it dispatched, even after it closed); the application is the *owner* (admission, execution, interruption, commits).

**Decision: application-owned.** Once admitted, a click command is an application command. Closing the mount that reported the event ends that mount's follower and target and nothing else. Application close interrupts and awaits it through the registry, before NEXUS and the platform (Stage 29).

**Does production satisfy it?** It did not (Experiment A: contradiction with C20). **Smallest correction, in `packages/valance` only:** `connect`'s finalizer no longer interrupts the mount's `pending` dispatch fibers; it only drops its references (2 lines in the finalizer, plus a doc-comment update on `Mounted.settled`: it covers the dispatches the mount still holds, and a closed mount holds none). No new API, type, abstraction or Scope; dispatch, the ledger, `settled`, registry and shutdown order are untouched. This is the Stage 36 spike (`f951d72`) made permanent.

**Consequences, all observed.** (a) Event commands ended by the application drain record an `interrupted` exit in their dispatching mount's ledger (before: none, when the mount closed first, i.e. shared/parented topologies). (b) A closed mount's bookkeeping stays reachable until its outstanding commands exit (outer fibers hold it). (c) After a mount closes, its `settled` returns at once; what it dispatched is the application's to finish. (d) Four shared/parented click expectations changed from "interrupted, no exit" to "interrupted by the registry, exit recorded"; independent-mount close with a pending click now behaves like invoke. State, observation, rendering, remount behavior, shutdown order, resource safety and Stage 29's contract are unchanged (all contract tests and every Stage 29 to 38 ordering assertion pass).

**Tests changed (13, all asserting what a mount close does to a click command; none asserts state, resources or the registry):** Stage 26 baseline MESH dispatch (now interrupted by the registry, exit recorded); Stage 33 F (exit recorded); Stage 34 G (7 recorded exits instead of 5); Stage 35 I counterexample (rewritten: the command survives, commits, B renders, A's ledger records `succeeded`); Stage 37 shared and parented click timelines (exit recorded) and B6 control (the click survives like invoke); Stage 36's ownership probes (the model switch removed, the application-owned expectations kept as plain assertions); Experiment A's own expectations. Added: `browser/event-lifetime.browser.test.ts` (2 tests, Chromium).

**Not decided here.** The event-exit ledger question (does it have an intended reader, should it retain forever) is unchanged and unresolved; the ledger's API, representation and retention are as in Stage 34 (a closed mount's ledger now also receives its commands' late exits, which is a consequence, not a decision about the ledger).

**Constraint added:** C25 in `docs/CONSTRAINTS.md` (an event command admitted from a mount is the application's until it exits; the mount's close ends its follower and target only).

**Results:** unit 29/29, jsdom 176/176 (unchanged count, 13 rewritten) identical on 3 full runs, Chromium 24/24 (22 + 2 new) identical on 3 runs, typecheck and build clean.

**Next uncertainty:** none about command ownership. The one remaining recorded question is Stage 34's: whether the per-mount event-exit ledger (now also the place a closed mount's late exits land) has an intended reader and lifetime.

---

## Stage 40: the event-exit ledger contract (decision: a diagnostic observation facility)

**API surface.** `Mounted<E>` (returned by `mount`/`hydrate`, exported from the main entry) has `dispatched: ReadonlyArray<DispatchExit<E>>` (the live array), `settled: Effect<void>` and `followed`. It is on neither `ApplicationHandle` (frozen `{state, invoke}`) nor the README. Documented only by its own doc comments, which this stage made precise. `dispatched` is historical (append-only, settle order, never removed or reordered); `settled` is synchronization (a barrier), not state; neither reads the other (`settled` awaits `pending`, `dispatched` is written by each dispatch fiber's last step). Terminal condition: `dispatched` stops growing once every command the mount dispatched has exited, which is at the latest the application's close (the registry drains every admitted command; the only exception is Stage 29's documented liveness limitation, where the application stays open); the array is released when the holder drops `Mounted`.

**Readers found (searched all of `packages/*/src`, `examples/*/src`, tests, README, docs).** Production readers: **none**; the only code touching it is `connect` itself (the tap that writes, the `settled` loop over `pending`). README/API docs for authors: none. Documented classification already in the findings: Stage 11 table "`Mounted.dispatched`, `settled`, `followed`: public **no**, observation facilities used by tests"; Stage 17 "**internal-only but exported**; remove or narrow when `mount`'s result is decided", "binding-facing, exported more widely than their audience"; the Stage 18 close-out lists narrowing the export as a deferred item. Test readers: 14 test files (jsdom and Chromium). Examples' own sources (`src/`): none. So: no public/documented application usage, no internal production usage, test-only and diagnostic usage.

**What it gives that nothing else does.** The exit of an event-triggered command: Stage 33 showed a failure or defect there appears in no state, value, render, handle or `settled`; only `dispatched` holds it (and the dispatch's `intent` on success). `invoke` callers get their exit directly; click commands have no caller, so this is the only record. `settled` gives deterministic synchronization of event dispatches (every event test uses it), which no other surface offers.

**Trace of one dispatch.** click, then admission (the registry registers the inner fiber), then the command runs, exits, the outer fiber (held by the mount's `pending`, and by nothing else) appends the exit to `dispatched`; an open mount's `settled` awaits that fiber. Late case (Stage 39): the mount closes while the command is pending: follower and target end, `pending` is emptied, the outer fiber and its closure (the `dispatched` array, the `pending` list, the target object) stay alive only because the running command's joiner references them; the command continues in the application; on exit the joiner appends the exit to the closed mount's `dispatched` and ends, after which the whole closure is reclaimable once the caller drops `Mounted`. Alive at each point: before close, everything; after close and before the command exits, the outer fiber and its closure; after the exit, only what the holder of `Mounted` keeps (the ledger).

**Probe (`browser/event-ledger.browser.test.ts`, real Chromium, real PORT target, independent mount, only the existing surface; 17 runs).** (1) Click admits a command that pends. (2) The mount's Scope closes: the target is gone, `dispatched` is empty. (3) `settled` returns at once and `dispatched` is still empty: **`settled` does not wait for exits still to arrive.** (4) The command is released and fails: the exit (`failed "late-boom"`) arrives in the closed mount's ledger; state is unchanged (the failure is visible nowhere else); `followed` is `interrupted` (the mount's Scope closed). (5) The application closes: the ledger is unchanged. A second case: the mount closes, then the application closes with the command pending: the drain's `interrupted` exit is in the closed mount's ledger by the time `Scope.close` returns (observed 17 of 17; two observers of the same inner exit, so not a documented guarantee).

**The closed-mount, late-exit case is coherent.** It is not bookkeeping `settled` needs (`settled` never reads the ledger and a closed mount's `settled` does not wait), and not an accident of a missing owner: its owner is the mount that dispatched (provenance: the ledger answers "what happened to what this mount dispatched"), its terminal condition is the command's exit (bounded by the application's close), and what keeps it alive meanwhile is the command's own joiner plus whoever holds `Mounted`. No Scope is left open by it, no resource is held beyond memory, no application guarantee depends on it. The retained closure includes the (unmounted) target object until the last of the mount's commands exits: bounded, not a leak.

**Decision: diagnostic / observation facility** (not the application programming model, not removable bookkeeping). Evidence: no production or application reader; the repository's own earlier classification (Stage 11, 17, 18); but it carries information available nowhere else (event exits) and a synchronization primitive every event test depends on, so it is purposeful observation infrastructure for hosts and tests. It is not internal coordination (nothing in Valance depends on it), and not accidental (owner, terminal condition and lifetime are all defined). Contract, as now documented on `Mounted.dispatched` and `Mounted.settled`: append-only record, in settle order, of the exits of the dispatches that mount made; exits keep arriving after the mount closed, until the commands end; unread by Valance; lives as long as `Mounted` is held; `settled` is a barrier over an open mount's own dispatches only. Not an event-history API: no ids, subscription, retention or cleanup was added.

**Changes.** Documentation only plus one regression test: the two doc comments in `packages/valance/src/index.ts` (comments only; no behavior change), the new `browser/event-ledger.browser.test.ts` (2 tests; there was no coverage of a closed mount's ledger or of `settled` on a closed mount in a real browser), this section. No constraint added: this classifies an observation facility, it does not add an invariant. Stage 34's "unread failure" observation stands.

**Results:** unit 29/29, jsdom 176/176, Chromium 26/26 (24 + 2 new, identical on 5 runs; the new file alone 12 more), typecheck and build clean.

**Next uncertainty:** none about the ledger. The deferred item from Stage 17/18, whether `Mounted`/`DispatchExit` should stay exported from the main entry or move behind `./internal`, remains a packaging decision, not a lifecycle one. The lifecycle contracts of Stages 29, 38, 39 and 40 are now consistent and ready to be consolidated into one architecture statement.

---

## Stage 41: lifecycle consolidation (documentation only)

Consolidated Stages 29 to 40 into the section "Canonical lifecycle architecture" at the top of this file (application Scope, mount Scope, caller-controlled relationship, shutdown order, independent-mount behavior, the admission / command / mount / application distinction, the ledger and `settled`, what not to assume, a constraint map, an index of superseded statements). Historical stages were not rewritten; nine paragraphs that describe the pre-Stage-39 mount-side interruption gained a one-line pointer. `docs/CONSTRAINTS.md`: C26 promoted (the ledger as a mount-owned diagnostic facility, an architectural boundary with a tripwire in the handle-shape tests); the Stage 30 clarification relabelled "C20, trigger and scope" (it had been numbered as a second C20); C25 moved to follow C23; a pointer to the canonical section added. README and the `Valance` module header point to it.

**One discrepancy found while consolidating (in the brief, not in the repository).** The Stage 41 brief states the application shutdown order as "admitted commands drain/interruption, then platform resources released, then NEXUS/application closes". The order validated since Stage 29 and observed in every later stage is: admission closes, admitted commands are interrupted and awaited, NEXUS terminates the runtime and ends the state stream, platform resources are released LAST, then `Scope.close` returns (platform resources are NEXUS-owned and release inside its shutdown). The canonical section states the validated order; nothing in the repository contradicted itself. No production behavior changed.

---

## Stage 42: `Mounted` and `DispatchExit` on the package surface (decision: keep `Mounted`, move `DispatchExit` behind `./internal`)

**Current surface (before).** The main entry (`.`) exported `Mounted<E>` (the declared result type of `mount` and, intersected with `{hydration}`, of `hydrate`) and `DispatchExit<E>` (the element type of `Mounted.dispatched`), next to `define`, `start`, `ApplicationHandle`, `Target`, `HydratableTarget`, `TargetFactory`, `Report` and the other types. `./internal` (documented as the composition protocol for "code that binds an application to something outside it (a PORT target, browser history, a server render, a test)", "unstable by design") held `Running`, `Viewed`, `handleOf`, `runningOf`. The build's `dist/index.d.ts` carried both names.

**Consumers (searched the whole repository, excluding `node_modules`/`dist`).** *Production source:* `Mounted` is the result type of `mount`/`hydrate`/`connect`; `DispatchExit` is used only inside `Mounted`'s own member type and the ledger array. No other production module (`web.ts`, `web-server.ts`, the examples' `src/`) names either. *Tests:* `Mounted` is named in 9 test files (casts and annotations such as `Valance.Mounted<string>`); `DispatchExit` is named in none (tests read the entries structurally). *Examples:* none. *Documentation:* README: neither (it binds the result of `hydrate` without naming a type); `CONSTRAINTS.md`/`FINDINGS.md`: described as diagnostic/binding-facing (Stages 11, 17, 18, 40).

**Published surface.** `@valancex/valance` is `0.0.1`, described as "a guarded tracer bullet: the API is a hypothesis", and **is not published**: `npm view @valancex/valance` returns not found, no git tags exist, and no CI publishes it. There is therefore no external consumer and no published API to break; the only consumers are this repository's tests.

**Integration value.** `Mounted`: the *value* `mount`/`hydrate` return is part of the package's API whatever the type is called (callers receive `dispatched`, `settled`, `followed` and, from `hydrate`, `hydration`, which is the adoption report a host legitimately needs), and the name is the declared result type of two main-entry functions; a host that wraps `mount` in its own function needs to name it. Keeping the name beside the functions that return it is the coherent choice; moving it would leave public signatures pointing at an internal module. The diagnostic nature of its members is stated by their doc comments (Stage 40). `DispatchExit`: only describes what a diagnostic member's entries look like; no consumer anywhere names it; naming it publicly would commit the package to a type with no demonstrated use, exposing MESH and NEXUS types (`Mesh.Dispatched`, `MeshDiagnostics`, `UnmappedCommand`) in a name. It was already classified "internal-only but exported" (Stage 17) and "binding-facing, exported more widely than its audience" (Stage 18).

**Breaking-change assessment.** None relative to a published surface (none exists). Inside the repository: no file imports `DispatchExit` by name, so nothing else changed. Readers of `Mounted.dispatched` are unaffected: the element type is still the same type, reached structurally (the declaration now imports it from `./internal`, so TypeScript consumers can still read it, just not name it from the entry).

**Decisions.** `Mounted`: **stays on the main entry** (declared result of public functions; carries the public `hydration` result; names a diagnostic member set, not the application model). `DispatchExit`: **moved behind `./internal`** (diagnostic element type, no consumer, no demonstrated use, previously classified internal). Not a removal and not a runtime change: the type is defined in `src/internal.ts` and imported by `index.ts`.

**Changes.** `packages/valance/src/index.ts`: `DispatchExit`'s definition and `export` removed, `import type` from `./internal.js` added (the declaration output keeps `Mounted.dispatched`'s type intact); `packages/valance/src/internal.ts`: the definition, with a doc comment; `packages/valance/test/entry.test.ts`: one surface check (`// @ts-expect-error` that `DispatchExit` is not on the entry, which fails the typecheck if it is exported again, verified by temporarily restoring the export; plus the runtime export keys `define, hydrate, mount, start`). No lifecycle code, no behavior, no NEXUS/MESH/PORT change. Not changed: `Mounted` and the other names, and what `mount` returns (narrowing which members of `Mounted` are public would be a separate API decision about `mount`'s result, not packaging; recorded as the next uncertainty).

**Validation (focused).** `pnpm -r run typecheck` clean (every consumer, including all tests, still typechecks); package build clean (`dist/index.d.ts` imports `DispatchExit` from `./internal.js` and no longer exports it); `@valancex/valance` unit suite 30/30 (29 + the new surface check). Chromium and the jsdom lifecycle matrix were not run: the change is type-only and no runtime code differs.

**Next uncertainty:** whether `mount`'s result shape should be narrowed or split (public `hydration` and the follower outcome versus the diagnostic `dispatched`/`settled`), the remaining half of the Stage 17 note "remove or narrow when `mount`'s result is decided". It is an API-shape decision about `mount`, not about packaging or lifecycle.

---

## Stage 43: the public shape of `Mounted` (decision: keep; static audit, no probe)

**Current shape (declarations read).** `mount(application, create): Effect<Mounted<E>, MeshDiagnostics, Scope>`; `hydrate(application, create): Effect<Mounted<E> & { hydration: H }, MeshDiagnostics, Scope>`. `Mounted<E>` has three members, `dispatched`, `settled`, `followed`; `hydrate` adds `hydration` (PORT's adoption result, "unchanged"). Internally `connect` also produces `first` (the first draw or hydrate result); `mount` drops it and `hydrate` renames it `hydration`, so the two operations return the shapes they need (`hydrate` has something `mount` does not: an adoption result), by construction, not by leak.

**Usage (searched all of `packages/*/{src,test}`, `examples/*/{src,test,browser}`, README, docs).**

| Member | Production host use | Test use | Public reason |
|---|---|---|---|
| `hydration` (hydrate only) | none in the repository (the README and `examples/.../shape-b.ts` discard the result) | `tracer.test`, `multiview.test`, browser catalog/history/tracer tests: adoption vs mismatch asserted | returned by a public operation; PORT's adoption result is information a host (logging, telemetry, mismatch handling) has no other way to get |
| `followed` | none | `lifecycle`, `application`, `scope-topology`, browser mount-lifetime/event-ledger/event-lifetime | the only public observation of how a mount ended (application ended = `Success`, render failure, Scope closed = `Interrupted`); the Stage 38 contract names it as the documented outcome of an application ending under an open mount |
| `settled` | none | ~12 files; every event test | the only way to wait for the event dispatches a mount made (they run in fibers nobody else can see); the capability exists nowhere else |
| `dispatched` | none | ~13 files | the only record of event-command outcomes (Stage 33: failures appear nowhere else) |
No member has a production host consumer in the repository, because the repository has no production host beyond tracers: `shape-b.ts` (the Stage 15 shape experiment) calls `mount`/`hydrate` and ignores the result, which shows a host may ignore `Mounted`, not that no host needs it.

**What a host needs after `mount`/`hydrate`.** Nothing, to run (the mount ends with its Scope, Stage 38). To coordinate: how and when its mount ended (`followed`), when its event dispatches have finished (`settled`, e.g. before it closes the mount or inspects what it caused), what its events produced (`dispatched`: error reporting for event commands that have no caller), and, for `hydrate`, whether the server output was adopted.

**Decision rule applied.** Keep a member public when it represents information not otherwise observable through the public API and a credible host use exists, or when a public operation naturally returns it. All four qualify: `hydration` (returned by `hydrate`, unobservable elsewhere), `followed` (unobservable elsewhere, needed to coordinate with the mount's end), `settled` (no other way to await event dispatches), `dispatched` (no other record of event outcomes; entries stay readable although `DispatchExit` is no longer nameable from the entry, Stage 42). None is derivable from `ApplicationHandle` (`state`, `invoke`). Narrowing any of them would delete a capability, not hide an implementation detail: the state they expose is closure-private, so there is no internal path to fall back to.

**Split?** No. A split needs different consumers and different ownership or lifetime boundaries. All members have the same consumer class (hosts and binding authors, which tests are instances of), the same owner (the mount) and the same lifetime (the mount's, with the ledger's tail from Stage 40). The diagnostic or synchronization character is a matter of documentation, which Stage 40 and this stage provide; a second type would add a name without a boundary.

**Decision: keep** (outcome A). `Mounted` is intentionally a host-facing, mount-owned result: its current shape is a deliberate union of one lifecycle observation (`followed`), one barrier (`settled`), one diagnostic ledger (`dispatched`) and, for `hydrate`, PORT's result (`hydration`). `mount()` and `hydrate()` do not need the same shape and do not return it (`hydrate`'s adds `hydration`).

**Change.** An interface-level doc comment on `Mounted` stating this (comment only; the member comments are Stage 40's and unchanged). No runtime or type change; no test added (nothing changed to prove). The canonical lifecycle section's item 9 now points here.

**Validation.** Static audit and declaration inspection only; package typecheck after the comment edit (clean). No probe: no semantic uncertainty remained after the audit. Chromium, jsdom and the unit suites were not run.

**Next uncertainty.** None about `Mounted`. The Stage 17 deferred items are now all decided (`ApplicationHandle` Stage 17, vocabulary Stage 18, exports Stage 42, shape Stage 43). What the repository still lacks is a real production host that exercises these members; until one exists, "credible host use" rests on the absence of any other observation path, not on a consumer.

---

## Stage 44: the first host integration of `Mounted` (the web host `run` consumes `followed`)

**Candidate hosts found.** `examples/tracer-web/src/catalog/host.ts` (`fromWindowEvent`): a real producer that sees only `ApplicationHandle.invoke` and decides how failure is handled (logged, never thrown into the page's event loop); it never touches `Mounted`. `examples/tracer-web/src/api/shape-b.ts` (`run`): the repository's web host function, `start` + `mount | hydrate` + `history` in one operation, importing only the public entries (`@valancex/valance`, `@valancex/valance/web`); it called `mount`/`hydrate` and **discarded** the `Mounted` result. The browser tests build their own pages and are fixtures, not hosts. So `run` is the smallest existing place where VALANCE is consumed as a host-facing runtime; it did not yet consume the public mount contract.

**What a host owes that only `Mounted` can tell it.** Stage 43 listed what each member gives. For a host whose job is to put the application on a page, the one duty already visible in this tracer is the one `host.ts` already shows for entries, "a decision about failure": the page can stop following the application and nothing else says so. Observed before this stage (`test/host-run.test.ts`, written first): with `run`, a render that fails after the first draw (a scope violating the program's manifest) ends the follower, the page stops updating, the application keeps running, and **nothing is reported anywhere** (no log; the test timed out waiting for one). `Mounted.followed` is the only public observation of that end (Failure for a render failure, Success if the application ended under an open mount, Interrupted for a normal Scope close).

**Integration.** `run` retains the `Mounted` it gets and forks one fiber into the caller's Scope that awaits `followed` and reports an abnormal end (error log for a failure, warning for "the application ended; the page is inert", nothing for the normal Scope close). It adds no abstraction and no second owner: the mount remains the Scope's (the test asserts the container is still unmounted when the Scope closes). 12 lines in the example host.

**Public capability exercised:** `Mounted.followed`, through `Valance.mount` / `Valance.hydrate`, by a host that imports only public entries.

**Was the existing API sufficient?** Yes. `followed` gave the host exactly the information it needed with no change to `Mounted`, `mount`, `hydrate` or any VALANCE package source. No deficiency appeared, so none is proposed.

**Why this qualifies.** It is code that consumes VALANCE through the public host contract rather than through test or internal access, for a responsibility the host actually has (telling its operator that its page went inert); its test is a regression guard for that responsibility, not a coverage test of settled semantics. It is a tracer host, not a product: it exists under `examples/`, and nothing ships.

**What remains missing for a production host.** (1) `settled` and `dispatched` are still consumed only by tests. The analogous host duty for them, reporting the failure of an event-triggered command, has no host consumer here because `dispatched` is a passive array: a host can read it at moments it chooses (for example after `settled`), and nothing notifies it of a new entry. Whether hosts should have to poll or whether that need is real enough to justify anything is a product question, recorded and not designed. (2) A real entry point (page script) that calls `run`: the repository's pages are served by test setup, so no end-to-end consumer of `run` exists beyond its own test.

**Validation.** Focused: `test/host-run.test.ts` (new, written first and seen failing, then passing) and `test/api-shape.test.ts` (the existing `run` consumer), 3 tests, 3 runs; the example's typecheck. No package source changed, so no package typecheck/build, no Chromium, no full suite.

**Next uncertainty.** How a host should learn that an event-triggered command failed (the Stage 33 gap) given that `dispatched` has no notification: whether polling `dispatched` after `settled` is an acceptable host contract or whether the first real page entry will show a need.

---

## Stage 45: can a real host observe event-command outcomes with `settled` + `dispatched`? (yes, at the moments the host has)

**Scenario exercised (the existing web host, `src/api/shape-b.ts` `run`, and the Stage 44 test).** The page's events are real clicks on the rendered page (PORT report, MESH dispatch). The host has no event path of its own (clicks originate inside the mount), so the only natural moments at which it can want an event's outcome are the ones it already observes: the mount's end. At the page's abnormal end, which Stage 44 already reports via `Mounted.followed`, the operator also needs what the page's events had done. `run` now retains `Mounted` and, in the same forked fiber, awaits `settled` (the dispatches the still-open mount holds), reads `dispatched`, and logs a tally (`N succeeded, M failed, K interrupted`, success, failure and interruption distinguished by the Exit) plus one error per failed command. No polling, subscription, callback, id or history API; it runs once.

**Observed (focused test, `test/host-run.test.ts`, 5 runs).** Click 1: an event command fails (typed) on a healthy page. The host reports nothing at that moment (log empty after the command has failed): the failure sits in `dispatched` unannounced. Click 2: a successful event command whose commit cannot be rendered (a manifest violation) ends the page's updates; `followed` resolves with a Failure; the host logs the error once, awaits `settled`, reads `dispatched`, and reports `1 succeeded, 1 failed, 0 interrupted` and the one failed command. Closing the Scope afterwards still unmounts the target (the host's observation is not a second owner).

**Are `settled` + `dispatched` sufficient?**
- *For reporting event outcomes at the mount's abnormal end: yes.* The two members gave the host everything the report needs, distinguishing success and failure, with no API change. `settled` has real meaning there: the mount is still open (its Scope has not closed), so it waits for the dispatches in flight before the host reads the ledger.
- *At a normal Scope close: not applicable.* The host stays silent (`followed` is `Interrupted`), and `settled` would be vacuous there anyway (a closing or closed mount holds no dispatches, Stage 40).
- *For reporting a failure WHEN it happens: no, and it was observed, not argued.* Nothing triggers the host between the failed click and the mount's end. This is the Stage 33/34/44 gap, now seen from a host: the members give the host the information, but only at moments the host itself has; there is no moment between events. The tracer host has no such moment (`run` has no event path of its own), and no real consumer yet needs in-life reporting, so no need for a trigger is demonstrated and none is proposed.
- *Reachability caveat.* Through `run` (one caller Scope for application and mount) the abnormal end is reachable via a failing render; the "application ended under an open mount" branch needs an early end or an independent Scope, neither of which `run` exposes. The branch is exercised by the Stage 38/40 tests, not by this host.

**Is this a genuine host responsibility or test-shaped?** A modest, coherent extension of the Stage 44 duty, not a product feature: the host already reports that the page went inert, and a report that says what the page's events had done is what an operator reading that log would want. It is not a manufactured action: it adds no new host operation, only completes the report at the one moment the host already acts. What it does not establish is a demand for in-life reporting; that remains untested because no real page needs it yet.

**API verdict.** The existing public API (`Mounted.followed`, `settled`, `dispatched`) was sufficient for this scenario. No `packages/*` change; NEXUS, MESH and PORT untouched.

**Validation.** Focused: `test/host-run.test.ts` and the existing `test/api-shape.test.ts` (the other consumer of `run`), 3 tests, 5 runs; the example typecheck. No package, Chromium or full-suite runs (no package source changed).

**Next uncertainty.** Whether any real page needs failures reported when they happen rather than at the mount's end. Until a page does, the host contract "read `dispatched` at moments the host controls" is the observed behavior, and a trigger would be a product requirement to be shown, not a gap to be assumed.

---

## Stage 46: the first real page entry (a document, a script, `run`)

**Boundary found.** There was none. `examples/tracer-web` had no document, no page script and no server: the "page" was the vitest browser iframe; `browser/setup.ts` (Node) rendered HTML with `renderToHtml` and handed it, the compiled programs and the state to the tests through `provide`; every browser test then built its own container and called `start` + `hydrate` itself. `run` (Stages 44 and 45) was called only by `api-shape.test.ts` and `host-run.test.ts`. So the test setup was a server and a fixture, not a page entry; a real entry was missing.

**Smallest entry implemented (three small files and one dev-server route, no framework, no VALANCE change).**
- `src/document.ts` (Node): `renderDocument(url)` turns a request URL into a complete HTML document: the application rendered with the public server path (`renderToHtml`, `stateFor(url)` being the application's meaning of the URL), the compiled programs and the state in one JSON block (the browser never compiles MPRX), and a script tag.
- `src/page.ts` (browser): reads the JSON block, starts the MESH runtime, applies the application's first act (`initialStateAt`, canonicalize the URL), and calls the existing host `run` once with `hydrate: true` and the `history` option, inside one Scope that closes on `pagehide`. It owns nothing of the mount and reads no `Mounted`: that is `run`'s.
- `vitest.browser.config.ts`: a 12-line dev-server route answering requests under the application's own base path (`/tracer`) with `renderDocument`; the same server then transforms and serves `src/page.ts`. (The repository has no other server and no `vite` dependency of its own; adding one was not warranted.)

**Proven by one focused Chromium tracer (`browser/page.browser.test.ts`, 3 runs).** The browser requests `/tracer/about?tab=details`, loads the server-rendered document into its own window, shows the server's HTML before the script runs, and the page script mounts through `run` (readiness marker `data-valance="running"`). Clicks work (About-to-counter draws a different program; the next click updates the same `section` in place through a command reading the platform clock), the `history` option takes effect (About reaches the browser's URL, `/tracer/about?tab=overview`), and hiding the page closes the page's one Scope: the target is unmounted by the Scope (not by the page script). The mount/hydrate path is the unchanged public one (`run` calls `Valance.hydrate`); lifecycle ownership is as established (the Scope owns the mount; `Mounted` stays observation only; no notification API).

**What the page can observe of the host's lifecycle reporting.** The host reports only abnormal ends (Stages 44 and 45). A normal end (`pagehide`) is silent, and the test asserts that no error is reported. The abnormal end, a render failing after the first draw, is **not reachable from this application through a real page** without manufacturing a failure: its scopes always satisfy their programs' manifests, and PORT does not throw on foreign DOM mutation. The abnormal-end report therefore remains exercised by `test/host-run.test.ts` (a deliberately violating scope), not by a real page. This is recorded as the remaining gap, not worked around.

**Validation.** Static: example typecheck clean. Focused: `browser/page.browser.test.ts`, 3 runs, passing. Because the shared browser config changed, the existing Chromium suite was run once: 27 of 27 (26 + the new one). No package or jsdom runs: no package source changed.

**Changes.** `examples/tracer-web/src/document.ts`, `src/page.ts`, `vitest.browser.config.ts`, `browser/page.browser.test.ts`, this section. Nothing in `packages/*`, NEXUS, MESH or PORT.

**Not established (left for a product integration).** The page is served only by the test dev server: there is no production build, static serving or cache story, and the wasm is located through Vite's `?url`. The document is rendered per request. No page-level failure UX exists: when `run` itself fails (a `StartError`), the page script's top-level rejects and the page stays as the server drew it.

**Next uncertainty.** What a real page does when `run` fails to start (a bad embedded state, a missing wasm): the page entry is where that is decided, and the first real page has no policy for it yet.

---

## Stage 47: what a real page does when `run` cannot start (observed, then a page-only policy)

**Failure exercised.** The embedded state in the server's document is corrupt (`count` is `"zero"`, not a number), as a stale or damaged server payload would be. `Valance.start` inside `run` rejects it with the typed `StartError` `InitialValueInvalid`, citing the schema's reason. It goes through the real page (document, `src/page.ts`, `run`, Chromium) and needs no change to any package. The corruption is injected by the dev server route for requests carrying `__corrupt=state` (test-only code in `vitest.browser.config.ts`, which also installs an inline observer before the page script to record any error event, unhandled rejection and `console.error/warn/log`); `src/page.ts`'s startup path is exactly the real one. A missing `wasm` was not used: it fails earlier, at the page script's top-level `init`, outside `run`.

**Observed behavior, before any policy** (one focused Chromium run first, recording only; confirmed by a temporary exit observer that the fiber ended with `Failure(InitialValueInvalid ...)`, then removed): the server-rendered HTML stayed exactly as drawn (`About Tracer: 0 clickstab: detailsBack`); nothing was mounted and the server's buttons were inert (a click changed nothing); no `data-valance` marker was ever set; **no uncaught error, no unhandled rejection, no console output of any level**; the server received nothing but the document, script and wasm requests (no reporting channel exists). `Effect.runFork` of the failing effect swallows the failure; the page's Scope (`Effect.scoped`) closed with the fiber, so no application or mount remained alive.

**Is that a policy gap?** Yes, a concrete and small one. It is silent: neither the page nor its operator learns that the page never started, while the page still looks alive (live-looking server HTML with dead buttons). This is the same class of silence Stages 44 and 45 removed for the host's abnormal mount end, one level earlier. It is not a VALANCE deficiency: `run` failed with a precise typed error exactly as the public contract says; the page script chose to ignore it.

**Page-only policy (4 lines in `src/page.ts`).** If the page fiber fails for any reason other than interruption (closing the page's Scope on `pagehide` stays silent), the page marks `data-valance="failed"` (the counterpart of `"running"`) and reports once with the cause (`Effect.logError("the page could not start", Cause.pretty(cause))`). No fallback UI (the server's HTML stays as it is), no retry, no error boundary, no logging abstraction, no VALANCE API. The successful path is unchanged (the Stage 46 page test still passes).

**After the policy (4 runs).** The page ends with `data-valance="failed"`; the server HTML is untouched; exactly one report is emitted, through Effect's default logger (every level goes through `console.log`, not `console.error`): `level=ERROR ... message="the page could not start" ... InitialValueInvalid ... Expected number, actual "zero"`; no uncaught error or rejection; clicks are still inert. A corollary found on the way: the Stage 46 page test's "a normal end is silent" check hooked only `console.error`, which could never have seen the host's reports (they use `console.log`); it now hooks `error`, `warn` and `log`, and still passes, so the silence of a normal end is now actually verified.

**Not covered (left as is).** A missing or unreachable `wasm` (the page script's top-level `await init(...)` rejects before `run` is reached): the module fails as an uncaught error, which the browser does report in its console; no policy was added because that failure is outside `run` and already visible. No server-side error reporting exists for any page failure (a product decision, nothing in the repository asks for one).

**Validation.** Focused Chromium: `browser/page-failure.browser.test.ts` (new) and `browser/page.browser.test.ts`, 2 tests, 4 runs; example typecheck clean. No package, jsdom or full-suite runs: no package source changed and the only shared file touched (`vitest.browser.config.ts`) only acts on the `__corrupt` flag. `packages/*`, NEXUS, MESH and PORT untouched.

**Next uncertainty.** None about page startup under `run`. The remaining open integration question is what a real deployment does with these reports (they stop at the browser console; there is no collection endpoint), which is a product decision, not an architecture one.

---

## Stage 48: the real page across URL changes (observed; no change needed)

**What the existing path promises (read first).** `Web.history` (documented in `packages/valance/src/web.ts`, Stage 7): an application URL change is a `history.pushState` (never a document navigation); a `popstate` is delivered to the application's own navigate command through `invoke`, in place; the URL carries only what `urlOf`/`stateOf` say (here `path` and `tab`, not `count`). `run` does not react to history itself: it passes the `history` option to `Web.history`, whose fiber lives in the page's one Scope with the mount. `page.ts` calls `run` once.

**Observed in one focused Chromium tracer (`browser/page-navigation.browser.test.ts`, 5 runs; the Stage 46 test covers only the click-to-URL step and is not duplicated).** One document loaded from the dev server, then:
1. *Event-triggered URL changes:* Back (About to counter) and About (counter to About) each push one entry (`/tracer/?tab=overview`, then `/tracer/about?tab=overview`); an update the URL does not carry (the click counter) writes nothing. `history.length` grew by exactly 2; `frame.contentDocument` is the same object, a marker set on the window survives, and `performance.getEntriesByType("navigation")` stays at 1: **the browser requested no new document.** The mechanism is in-place history.
2. *Traversal:* `history.back()` twice and `forward()` once move the URL and the rendered view each time; the counter view comes back with **count 1 and the same stamp**, which no new document could reproduce. Same document, same marker, still one navigation entry, no report of any level: **the same running application handles the popstate** (popstate becomes `invoke("app/navigate")`).
3. *Reload:* `location.reload()` is a genuinely new document (a different `Document`, the marker gone, a new `data-valance="running"`): the page starts again and the application is rebuilt **from the URL alone** (`/tracer/?tab=overview` renders the counter view with count 0). What the URL does not carry does not survive; that is the documented "URL is not state" split, not a defect.
4. *Page end:* `pagehide` closes the page's one Scope: the target is unmounted AND the history binding is gone: a `history.back()` afterwards moves the browser's URL (the browser's, not the page's) and the page neither navigates nor redraws nor reports anything.

**Is the lifecycle coherent?** Yes. URL change is in-place history on one document and one running application; a reload is a new page that rebuilds from the URL; the page's one Scope owns both the mount and the history binding and ends them together. No bug, no ambiguous contract, no example change; no new test duplicates Stage 46 (this one asserts different facts: document identity, navigation count, traversal, state survival, reload, post-close inertness).

**Validation.** Focused Chromium only: the new test, 5 runs; example typecheck clean. The shared browser config and page infrastructure were not changed this stage, so the existing Chromium suite was not rerun. `packages/*`, NEXUS, MESH and PORT untouched.

**Next uncertainty.** `page.ts` treats `pagehide` as the final end of the page. A real browser can also fire `pagehide` with `persisted: true` when it puts the page in the back/forward cache and later restores that same document with `pageshow`; in that case the Scope has been closed and nothing restarts it, so a restored page would show the server's last drawn HTML with a dead application. This is a hypothesis about real browser behavior that the synthetic `pagehide` used here cannot confirm; it needs one real bfcache navigation to observe, and is the next concrete page-lifecycle question.

---

## Stage 49: a real back/forward-cache restore (hypothesis confirmed; one page-local fix)

**Why a Node-driven top-level tab.** bfcache only applies to top-level documents, never to the iframes the vitest browser mode uses, so the Stage 46 to 48 iframe tests cannot exercise it. `bfcache/page-bfcache.test.ts` (own config `vitest.bfcache.config.ts`, script `test:bfcache`) starts the dev server programmatically, launches Chromium through Playwright, loads the tracer page in a top-level tab, moves to another document and goes Back. Nothing is synthesized: `pagehide` and `pageshow` are the browser's own, recorded per document in `sessionStorage`.

**Can bfcache be observed at all here?** Not with Playwright's defaults. Observed first: with default launch arguments (Playwright's `--disable-back-forward-cache`, and the headless shell build) Back creates a **new Document** (new id, `pagehide persisted=false`, `pageshow persisted=false`, navigation type `back_forward`) rebuilt from the history entry's URL with count 0: ordinary navigation, not the hypothesis. The same with the flag removed on the headless shell. Only the full Chromium build (`channel: "chromium"`) with Playwright's disabling flag removed, i.e. the browser's own default behavior restored, restores from bfcache. That is the only departure from Playwright's defaults, stated in the test; nothing forces the cache.

**Observed with the page as it was (the test written first and seen failing).** A genuine restore: the log shows `pagehide persisted=true` then `pageshow persisted=true` on the same document; the Document, the window marker and the single `navigate` navigation entry are the same, and `data-valance` still reads `"running"`. But **the target was blank** (`text` was `""`) and no button existed: the page's Scope had been closed by the `pagehide` handler, so the mount was unmounted and the application ended while the page was merely being stored. The restored page was a blank document with a stale "running" marker: worse than the server HTML a startup failure leaves behind.

**Fix (page-local, one line in `src/page.ts`).** The `pagehide` handler ends the page only when `event.persisted` is false. A persisted `pagehide` means the same document may be restored by `pageshow`; the application is simply frozen with the page and resumes with it. No `pageshow` handler, no restart, no lifecycle framework, no persistence layer, no VALANCE change. A document that is truly going away (`persisted` false) closes its Scope exactly as before (the Stage 46 to 48 tests still close the page with `pagehide`; a synthetic event has `persisted` undefined and takes the same branch).

**After the fix (3 runs).** The restored page is the same document with its marker, the target still drawn with the in-memory count (`1 clicks, ...`), `data-valance` `running`, a click reaches the same application (`2 clicks`), and the history binding is alive (About changes the URL). No new navigation entry.

**Validation.** One real-Chromium test (`pnpm run test:bfcache`), 3 runs, failing before the fix and passing after; the three existing page browser tests that load `page.ts` (Stage 46 page, 47 failure, 48 navigation), 3 tests, passing; example typecheck clean. The shared dev-server config was not touched, so the full Chromium suite was not rerun. `packages/*`, NEXUS, MESH and PORT untouched.

**Not covered.** A page evicted from the cache is discarded by the browser without further events (nothing to clean up: the Scope's resources are JS-heap objects). Behavior of a document restored after a long freeze (timers, clocks, a platform `Clock` capability reading wall time) was not examined.

**Next uncertainty.** What the application should assume about time and data after a restore: the page resumes with its in-memory state exactly as left, possibly long after, while nothing tells the application it was frozen (a stale `stamp` is only the visible example). Whether anything needs to react to a restore is a product question that the first real page with time-sensitive data would answer.

---

## Stage 50: time after a bfcache restore (one time-sensitive behavior; no defect, no policy)

**What is time-sensitive in the real page.** A search of `examples/tracer-web/src` and `packages/valance/src` finds exactly one reader of time: `counter/increment` stamps the click with `Clock.currentTimeMillis` (shown as "last at <stamp>"). The page passes no platform, so the clock is Effect's default (`Date.now`). There are no timers, no schedules, no expiry, no polling, and no capability with a time-to-live; VALANCE itself reads no clock. So the only behavior whose result depends on wall-clock time across a freeze is that stamp.

**Exercised (the Stage 49 real-bfcache test, extended; 3 runs).** Genuine restore as in Stage 49 (full Chromium, top-level tab, the browser's own `pagehide`/`pageshow`). The page is moved to another document and left there for 1.5 s, then restored. Observed: the restored state still carries the stamp of the click made BEFORE the freeze (the same text as before); the next click after the restore is stamped with a value at least 1.5 s later: **the clock the application reads did not freeze with the page; it is the wall clock at the moment of the command.** The application kept working (`2 clicks`, history binding alive), as in Stage 49.

**Is anything stale?** No defect. The restored stamp is a record of when a past click happened, which stays true; it makes no claim of freshness. Nothing in the application renders "now", derives a duration from a stored time, or caches data with a lifetime, so nothing becomes wrong with elapsed time. The stale-clock hypothesis from Stage 49 does not apply: the platform clock is read per command, never cached across the freeze.

**Decision.** No policy change: no `pageshow` handler, no refresh, no resume API, no VALANCE change. Stage 49's invariant is unchanged (persisted `pagehide` suspends; non-persisted closes). The question "what should an application assume about data age after a restore" is **currently unobservable** in this repository because no application behavior depends on data age; it should be asked of the first application that has such data, not answered for this one.

**Validation.** Focused: `pnpm run test:bfcache`, 3 runs; example typecheck clean. No page tests rerun (`page.ts` and shared page infrastructure were not changed); no package, jsdom or full-suite runs. `packages/*`, NEXUS, MESH and PORT untouched.

**Next uncertainty.** None specific to bfcache and time. The example now has a real page, startup failure policy, navigation, and suspend/restore lifecycle; what it still lacks is an application with data that ages (fetched or cached data with a lifetime), which is where any resume policy would be decided.

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
