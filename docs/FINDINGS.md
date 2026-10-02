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
