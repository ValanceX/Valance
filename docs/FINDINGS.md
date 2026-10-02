# Tracer findings: `@valancex/valance` 0.0.1

*Evidence base: NEXUS 0.9.0, MESH runtime/compiler 0.6.0, PORT Web 0.2.1, all from npm; Node 22; Chromium 1194 via Playwright 1.56.1. No substrate source was changed.*
Constraints written before code: [CONSTRAINTS.md](./CONSTRAINTS.md).

## What ran

```text
application = Valance.define({ program, state, scope, commands })        data; starts nothing
server  renderToHtml(app) ─ start ─▶ MESH render-v1 ─▶ PORT Web realizeHtml ─▶ HTML (+ state for the page)
client  start(app, {platform, state}) ─▶ hydrate(running, Web.target) ─▶ PORT verify + adopt
click ─▶ PORT report(handler) ─▶ Valance dispatches with the DRAWN render ─▶ MESH intent
      ─▶ NEXUS command (platform Clock) ─▶ state ─▶ selector ─▶ MESH render ─▶ PORT update (same DOM nodes)
scope close ─▶ follower interrupted ─▶ target unmounted ─▶ NEXUS application ended
```

Run in jsdom (`examples/tracer-web/test`, 8 tests) and in Chromium with a real click and SSR HTML produced in Node (`browser/`, 1 test). PORT's own browser tracer does not cover SSR or hydration; this one does.

## Answers

| Question | Answer, from the run |
|---|---|
| **What is a Valance application?** | Plain data: `name`, MESH `program` (compiled templates + manifest text), one NEXUS `state` (schema + initial), `scope` (state → MESH snapshot) and `commands` (state → `"component/name"` → NEXUS binding). No target, no platform. |
| **What does `start` do?** | Calls `Nexus.Application.start` (supplying `platform`), `createState`, and builds the `Mesh.host`. Returns `Running`. Nothing is drawn. It needs the caller's `Scope`. |
| **Ownership** | Create + start: `Valance.start`. Lifetime: the caller's Scope. Platform: the caller, as a `start` option (NEXUS D30). Render/update orchestration: `Valance.mount`/`hydrate` (a scope-owned follower fiber + the target). Shutdown: scope close, or `Application.shutdown(running.nexus)`. |
| **How does behavior enter NEXUS?** | The definition's `commands(state)` returns NEXUS commands bound to MESH intents; `start` creates the state in the application's own runtime scope. Event dispatch runs in the application runtime (`Runtime.runFork`), so platform FiberRefs apply to it. |
| **NEXUS ↔ MESH boundary** | `Mesh.host` (NEXUS). Valance adds nothing to it; MESH only ever sees a snapshot and returns render-v1. |
| **How does render-v1 reach PORT?** | `Target.draw/hydrate/update(tree)` with MESH's tree untouched. Tripwire `render.test.ts` compares it with a direct `mesh-runtime.render` of the same snapshot. |
| **Does Valance know anything target-specific?** | Core (`.`): no. It knows PORT's contract shape (draw/update/unmount, optional hydrate), which PORT's CONTRACT.md already makes universal, and it knows program continuity and the drawn render, which that contract assigns to the composer. `./web` only forwards `container`/`primitives` and the report callback to `createWebPort`. |
| **SSR: who owns what?** | PORT: HTML (`realizeHtml`). Valance: choosing to start, render once, end (`renderToHtml`), returning the state. The application: serializing that state into the page. |
| **Hydration: who owns what?** | PORT: verification, adoption, mismatch → fresh draw, and the result. Valance: calling it with the *client's* render and retaining that render; making the target available only after that. No second protocol. |
| **Update path** | event → PORT report → Valance dispatch (drawn render) → MESH intent → NEXUS command → state → selector → `host.renders` → Valance follower → `target.update`. The application never touches the target (tripwire). |
| **Lifetime** | start / run / update / shutdown as in the ownership row. Scope close ends things in reverse order of creation: follower, target, application. |
| **Routing** | See below: not built; the probe says what it will need. |

## Confirmed

1. **`@valancex/valance` can compose the real NEXUS 0.9 + MESH 0.6 + PORT Web 0.2 path**, including SSR → hydration → interaction → update, in Node, jsdom and Chromium, with no mock of any substrate.
2. **J1 is closed in NEXUS 0.9.0** and holds through Valance: the platform's Clock (42) is seen by application behavior and by nothing in the caller, before, during and after, with Valance's follower and dispatch fibers in play (`lifecycle.test.ts`; Chromium).
3. **MESH and PORT acquired no dependency on NEXUS or Valance.** PORT Web depends on `@valancex/mesh-runtime` only; the MESH runtime on nothing (`boundaries.test.ts`).
4. **The composer's obligations are real and belong to Valance's layer, not a substrate**: program continuity, retaining the drawn render, hydrating with the client's render. Previously this lived in a *test file* (`Port/integration/test/compose.ts`).
5. **The Web realization table is target configuration, not application.** The definition never mentions it; `primitives` is passed to `Web.target`/`renderToHtml`.
6. **A real defect at the composition boundary, found by running it.** NEXUS `renders` is future-only (State.changes drops the replayed value), and the test composer took the first render *then* subscribed. A commit during that window reached state but never the DOM: state `count: 1`, DOM `0 clicks`, 100/100 runs. Valance now subscribes first and holds the render that arrives before the first draw. Both halves are pinned by a test that fails without them (mutation-checked).

## Likely

- Valance should own `renderToHtml`/`mount`/`hydrate`-style orchestration permanently; each is one function today. Whether they stay three functions or become `start({ target })` is not yet determined.
- `Running.nexus` should not be public. The tests needed it (`Application.shutdown`, `Runtime.runFork`), the application author did not.
- The commit window is only *narrowed* by subscribe-first: it depends on Effect running the forked follower's subscription before the first render resolves. Nothing in NEXUS's contract guarantees it.

## Unresolved

- **NEXUS gap (recommended change): an atomic "current value, then changes"** on `Selector`/`Mesh.Host` (SubscriptionRef already gives it; `State.changes` removes it). That makes the first-render window impossible instead of unlikely.
- **O15 stands.** Rendering and dispatch are outside NEXUS admitted work. Valance ties its follower to the caller's Scope, but `Application.shutdown` alone ends the follower (cleanly, observed) and leaves the target mounted until the scope closes.
- **Failure policy.** A failed dispatch is recorded in `Mounted.dispatched`; a failed render/update kills the follower and is visible only through `Mounted.followed`. Nothing reports either to the user. A diagnostics design is not justified yet, but silence is not a design.
- **Routing, from the probe (`route-probe.test.ts`).** MPRX has no conditionals, so a view is a MESH *program*; a view switch is therefore a PORT *draw afresh*, which only the composer may decide. Today that is "end one Valance application's scope, start another": the previous view's state does not survive (0 clicks after returning). So route state must live above a single application's state, and whichever layer owns it must also own program switching (continuity). That points at *Valance*, not NEXUS/MESH/PORT, but the shape (one application with N programs vs N applications with shared state) is not decided by one data point.
- **Who calls `init()` for the MESH WASM engine in browsers?** Currently the page. Likely Valance/web later; not justified yet.
- **Duplicated vocabulary:** the manifest declares primitives (`page`, `text`, `button`), and the `primitives` table realizes them. Nothing checks they agree until render time (PORT reports unknown/unsupported).
- **Not exercised:** M1 pairing with a *distinguishing* intent (the tracer's `increment` takes no arguments; PORT's integration covers it); the application `runtime` Layer/services (Valance passes `Layer.empty`); more than one capability; concurrent interactions during a render; a production bundle; `Application.start` failure paths through Valance.
- Stale metadata observed in PORT: `integration/package.json` still declares `@valancex/nexus ^0.8.1`, while its README and the NEXUS 0.9 notes describe 0.9. Not changed here.

## Where things belong

| | Owns |
|---|---|
| **Valance** | The application definition (data); `start`; follower + dispatch orchestration; program continuity; drawn-render retention; choosing when to hydrate; lifetime via Scope; the `./web` target forwarding and `renderToHtml`. |
| **NEXUS** | Application lifecycle, state, commands, events, platform/capabilities, FiberRef isolation, `Mesh.host`. Candidate change: atomic snapshot-and-follow. |
| **MESH** | Compiler, manifest, templates, render-v1, intents. Unchanged; it cannot express a route. |
| **PORT** | Realization, `realizeHtml`, hydrate verification/adoption/mismatch, event resolution, value realization. Unchanged. |

## Not extracted yet (the tracer did not justify these)

Router; one-application-many-programs model; platform helpers or a registry; `runtime` services layer in the definition; diagnostics/error-reporting framework; state serialization/embedding helper; WASM `init` helper; a `Target` registry or other targets; a CLI/dev server; a combined `start({ target })`.

## Recommended next move

**Fix the substrate gap and probe routing with one real use, in that order.** (1) Ask NEXUS for an atomic current-and-follow on the selector/host, then delete Valance's hold-and-catch-up. (2) Add a two-view tracer (`/` counter, `/about`) where route state is shared across the switch, to decide whether it is one Valance application with N programs or N applications; do not build a router until that choice is forced by code.
