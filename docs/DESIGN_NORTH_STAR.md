# Design north star: progressive disclosure

Status: **locked** (2026-10-19). Applies to every public surface in the ValanceX ecosystem: Valance, Nexus, Mesh and Port. Canonical copy: this file. Each repo's `CLAUDE.md` carries a short form and points here.

Companion documents:

- [API Design Principles v1.0](https://github.com/ValanceX/Mesh/blob/main/docs/standards/api-design-principles.md) (the rules; this north star is the shape those rules serve, and agrees with its §2.1 progressive disclosure, §6.4 defaults and §6.5 escape hatches; no conflict was found).
- [Scorecard](./NORTH_STAR_SCORECARD.md) (the 0 to 100 criteria new work is validated against) and the [baseline](./north-star-validation-2026-10-19.md) (the ecosystem's current score and evidence).

**How to use it.** Before adding or changing a public API, name its tier (§3), check it against the principles (§1) and the anti-patterns (§4), and say so in the change. A change that cannot be placed in a tier, or that matches an anti-pattern, is a finding for the owner, not something to ship quietly. If this document and another one disagree, record the disagreement as a finding; do not resolve it silently.

## 1. Core principles and abstractions

A framework API (frontend or backend) is the boundary between the framework's internal runtime engine and its client developers. Designing that surface around **progressive disclosure** rests on human psychology and software architecture:

1. **Cognitive load and working-memory capacity.** Working memory is a strict bottleneck when someone acquires or navigates novel information. An API must eliminate *extraneous* load (mental effort spent on unneeded boilerplate, manual execution loops, configuration mechanics) so developers spend their limited capacity on *intrinsic and germane* load (the core business-domain problem).
2. **Information hiding and encapsulation.** Hide as much internal mechanism (DOM reconciliation, event delegation, state-graph traversal, asynchronous batching) as possible behind an explicit boundary. That decouples the public contract from internal change and keeps independent releasability and backward compatibility.
3. **Intention-revealing interfaces.** Names, signatures and types describe *what* an operation achieves in domain terms, not *how* the framework executes it. When developers must read framework internals to predict behavior, encapsulation has failed and cognitive load explodes.
4. **Side-effect-free functions and predictable contracts.** Strictly separate state-mutating commands from data queries. Side-effect-free functions and explicit assertions or invariants make operations safely combinable without tracing internal execution.
5. **Conceptual contours and mental models.** The surface aligns with the developer's natural mental model (for example the declarative `UI = f(state)`), not the framework's internal execution pipeline.

## 2. Architectural decisions that drive the surface

A surface that reveals complexity progressively needs specific structural decisions under the hood:

```text
+--------------------------------------------------------------+
| TIER 1: Declarative surface                                  |
|   (sensible defaults, zero-config component syntax)          |
+------------------------------+-------------------------------+
                               v
+--------------------------------------------------------------+
| TIER 2: Fine-tuning and selectors                            |
|   (opt-in memoization, custom schedulers, hooks)             |
+------------------------------+-------------------------------+
                               v
+--------------------------------------------------------------+
| TIER 3: Controlled hatches                                   |
|   (direct platform refs, unmanaged DOM)                      |
+------------------------------+-------------------------------+
                               |
 ================== ARCHITECTURAL BOUNDARY ====================
                               |
+------------------------------+-------------------------------+
| COMPILER / RUNTIME ENGINE                                    |
|   (cohesive mechanisms: fiber tree, signal graph, batching)  |
+--------------------------------------------------------------+
```

1. **Compilation vs runtime execution engine.**
   - *Decision:* whether declarative code is processed by a compile-time transform (the Svelte compiler) or a runtime virtual-tree engine (React Fiber).
   - *Surface impact:* manual DOM creation, listener binding and teardown are encapsulated behind one declarative contract.
2. **Separation of the core domain from cohesive mechanisms.**
   - *Decision:* factor complex operational algorithms (asynchronous scheduling, state-graph dependency tracking) into an isolated, lightweight supporting subsystem.
   - *Surface impact:* simple primitives (`signal()`, `useState()`, `@Input`) are exposed while the runtime mechanics are delegated entirely to the framework.
3. **Layered boundaries and open/closed surface rules.**
   - *Decision:* structure the framework into explicit horizontal layers where high-level primitives sit on top of low-level driver primitives.
   - *Surface impact:* standard consumers use only the closed top-level primitives; advanced consumers can explicitly drop to the open lower layers when needed.

## 3. The three-tier progressive-disclosure surface

The code in this section is **illustrative of the shape of each tier** (it is not Valance API).

### Tier 1: minimal surface and sensible defaults (zero-config onboarding)

*Principle:* standard use cases are self-evident, zero-config and obvious on first inspection.

```ts
// Tier 1: simple component state.
// The framework handles subscriber tracking, batching and DOM updates.
const count = signal(0);

function increment() {
  count.update(n => n + 1);
}
```

### Tier 2: opt-in fine-tuning and performance optimization

*Principle:* disclose advanced tuning knobs, custom schedulers or fine-grained selectors only when a specific performance or scale bottleneck arises.

```ts
// Tier 2: revealed only when component re-renders become expensive.
const userHeader = useSelect(
  userStore,
  (state) => ({ name: state.name, avatar: state.avatar }),
  { shallowEqual: true }   // opt-in memoization and comparator control
);
```

### Tier 3: controlled escape hatches (safe veil-piercing)

*Principle:* provide explicit, constrained boundaries for the moments a developer must touch native platform primitives (raw DOM, WebGL, native canvas) without corrupting the framework's state invariants.

```ts
// Tier 3: explicit escape hatch using refs and forcing functions.
const canvasRef = useRef<HTMLCanvasElement>(null);

useEffect(() => {
  // Isolated imperative side-effect boundary
  const ctx = canvasRef.current?.getContext('2d');
  renderWebGLScene(ctx);
}, []);
```

Rules that follow from the tiers:

- A higher tier never requires knowing a lower one. Tier 1 must not make Tier 2 or 3 harder to discover, and must not need them.
- Every Tier 2 knob has a default that is correct for Tier 1.
- A Tier 3 hatch is explicit, visibly leaves the portable layer, and cannot corrupt framework invariants (the framework's state stays authoritative).

## 4. Framework API anti-patterns and remediations

### 4.1 The "eager configuration" monster

- **Symptom:** developers must pass dozens of mandatory initialization parameters or flags just to create a basic component or service.
- **Cause:** no sensible defaults; core workflows not separated from secondary options.
- **Remediation:** apply **sensible defaults**. Default every non-critical property internally; allow optional override objects or builder chains only when custom behavior is requested.

### 4.2 The "smart UI" / leaky mechanism

- **Symptom:** client code is forced to trigger internal lifecycle steps, call update/flush functions or manage reconciliation loops by hand.
- **Cause:** blurred layer responsibilities; no **intention-revealing interface**.
- **Remediation:** encapsulate execution mechanisms inside declarative contracts and side-effect-free functions.

### 4.3 The "entity trap" / raw schema exposure

- **Symptom:** internal database entities or raw runtime data structures exposed directly on public component contracts.
- **Cause:** mapping the public API surface onto internal tables rather than user workflows.
- **Remediation:** establish a **bounded context** and expose lightweight view models or field-masked DTOs that isolate consumers from internal schema shifts.

### 4.4 The "architecture sinkhole" / pass-through boilerplate

- **Symptom:** props or parameters forced through several intermediate wrapper components that transform nothing.
- **Cause:** rigid layering without context boundaries or direct dependency-injection channels.
- **Remediation:** provide contextual provider/injection primitives (`useContext`, `@Inject`) to eliminate pass-through coupling.

## 5. Review checklist (use on every public-API change)

| # | Question | Source |
|---|---|---|
| 1 | Which tier is this in? Is the Tier 1 path unchanged and still the obvious one? | §3 |
| 2 | Does a first-time user have to supply anything that has a correct default? | §4.1 |
| 3 | Does any caller have to trigger a lifecycle, flush, update or release step the framework could orchestrate? | §4.2 |
| 4 | Does a public type or payload mirror internal state, a table or a runtime structure instead of a workflow? | §4.3 |
| 5 | Does a value have to travel through components that do not use it, with no way to supply it where it is used? | §4.4 |
| 6 | Do names say what, in the domain's words? Can a user predict behavior without reading internals? | §1.3 |
| 7 | Is every operation either a command (changes state) or a query (does not), never both? | §1.4 |
| 8 | Does the surface match `UI = f(state)` and the one-state, commands-only model? | §1.5 |
| 9 | Is there a documented, constrained way down to the platform for the cases that need it? | §3 Tier 3 |
| 10 | Is the mechanism behind a boundary a test enforces, so it cannot leak back out? | §1.2, §2 |

## 6. Provenance

Transcribed on 2026-10-19 from four screenshots supplied by the project owner (sections 1 to 4 of a design-principles summary). The source's citation markers are dropped. The three code samples are the source's and are generic; the "Valance" examples live in the validation report, not here. The §5 checklist and the usage paragraph at the top are additions that turn the text into something a review can apply; they restate the principles and add none.
