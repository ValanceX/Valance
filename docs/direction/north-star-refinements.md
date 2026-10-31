# North star refinements: plan (2026-10-25)

Status: **implemented on branch `north-star-refinements`, not released**. Final measurement: [After Phase C](../north-star-validation-2026-10-25.md#after-phase-c) (ecosystem 88 on the branch, 74 without the DO-NOT-MERGE packs). Measured against the [design north star](../DESIGN_NORTH_STAR.md) with the [scorecard](../NORTH_STAR_SCORECARD.md); compared to the [baseline](../north-star-validation-2026-10-19.md). Goal: raise the score as far as possible without closing options for later work. Every change below states the audits it touches, before and after, as the scorecard requires.

## 1. Re-measurement (static read of `main` in all four repos, nothing executed)

| | Baseline 10-19 | Now 10-25 | What moved |
|---|---|---|---|
| **Ecosystem (weakest link)** | 59 | **~61** | H2 now applies (◐) |
| Port | 87 | ~88 | `inspect(key)` (since 10-06) is a partial hatch the baseline missed: H1 F→◐, H2 –→◐ |
| Mesh | 85 | 82–85 | Units add a third meaning of "instance" (M2 P→◐ by judgment) |
| Valance | 73 | ~76–78 | CSS escape hatch `escape.web.css` (H1 F→◐, H2 –→P); `admit`, `budgets`, `Target.patch` as performance knobs (X1 ◐→P, judgment) |
| Nexus | 72 | ~75 | E3 † was stale, now P. No public API change since the baseline |

Per-audit evidence that changed:

- **Valance E3 ◐:** these exports have no row in `stability.md`: `snippet`, `isSnippet`, the brands `FIELD`, `FORM`, `DERIVED`, `APP`, `COMPONENT`, `isField`, `derivedOf`; web's `controlled`, `controlledBoolean`, `textField`; `ManifestError`; native's `PROTOCOL`, `MAX_LINE`; cli's `./schemas/*`.
- **Valance M1 at risk:** unit state is kept outside the single state cell (`units.ts:1-8`). `V1_CONTRACT.md:45` doesn't mention it.
- **Valance M2 ◐:** collisions in `start` (`Valance.start`, `define.start`, `History.start`), `Host` (`web.ts:453`, `native.ts:117`) and `scope` (`View.scope`, layout scope, `record.redact.scope`, Effect `Scope`).
- **Nexus doc drift:**
  - README says version 0.14.0 (it is 0.16.0) and peer range `^0.12.0`.
  - The shutdown wording contradicts 0.12's grace-then-interrupt (README:18, `semantic.md:358`).
  - `stability.md:21` calls the MESH runtime an "optional peer".
  - The README says "nine primitives"; there are 11 namespaces.
- **Mesh E3 drift:**
  - Units are "Unreleased (0.15.0)" in `docs/manual/stability.md:21`.
  - They are "0.15.0 (released)" in `README.md:122`.
  - They are "not yet published" in `docs/releases/v0.15.md:3`.
- **Port M2:** README:49 uses "Tier 3" for a primitive author's `layer` entry. That collides with the north star's Tier 3.

Weakest-link rule: the ecosystem score rises only when every repo owning an audit is fixed, so the phases are ordered by that.

## 2. Phase 0: record the measurement

Write `docs/north-star-validation-2026-10-25.md` from §1, with the full 19-row table. Later changes are scored against it.

## 3. Phase A: docs only (no API risk; ecosystem → ~66)

| # | Repo | Change | Audit |
|---|---|---|---|
| A1 | Nexus | README opens with a first app using only `Schema.Struct`, `State`, `Command` and `Runtime`; the pitch and the Effect/Layer example move below it. | T1.3 ◐→P |
| A2 | Nexus | Fix the doc drift in §1. | I1, accuracy |
| A3 | Valance | Add stability rows for every untiered export in §1: brands and `derivedOf` are Internal, the rest Provisional. | E3 ◐→P |
| A4 | Valance | `learn/first-application.md` derives the manifest with `manifest()` first; the hand-written `components.json` moves to an aside. | T1.2 (with B1) |
| A5 | Valance | `V1_CONTRACT.md` §3: unit state is framework-held state for each occurrence, an input to render, never application state. | M1 kept |
| A6 | Valance | Error-identity rule in `V1_CONTRACT.md` §10 and `stability.md`: `_tag` is a typed failure, `code` is a refusal or defect. | I2, M2 |
| A7 | Valance | `learn/mounting-and-hydration.md` and contract §17: the whole state is embedded in the page (until C-3 ships). | D2 |
| A8 | Valance | A Tier 2 performance page: `admit`, `Target.patch`, `budgets`, `ledger`, `earlyInput`; it points to Bet 10 for windowed lists. | X1 P secured |
| A9 | Valance | `docs/use/platform.md`, a Tier 3 page (wrap a `TargetFactory`), from FINDINGS Stage 55. | H1 |
| A10 | Port | README section "Leaving the portable layer": `inspect`, `payload(event, element)` and custom targets, each tiered. Mark `ARCHITECTURE.md:50` "(direction, not built)" until B6. Rename README:49's "Tier 3". | H1, M2 |
| A11 | Mesh | Settle the units status (§1 drift). One docs line: keeping a render, its version and `release()` are Tier 2 host duties; Tier 1 is Valance. | E3, E2 |
| A12 | All | One glossary shared by the four repos: `scope`, `start`, `Host`, `id`/`name`/`_tag`, unit, occurrence, `Render`. | M2 kept at ◐ |

## 4. Phase B: additive API (existing code keeps compiling; ecosystem → ~77)

| # | Repo | Change | Audit |
|---|---|---|---|
| B1 | Valance | `define` overload: `view` may be omitted when `views` has one key (it defaults to that key). | T1.2 ◐→P (with A4) |
| B2 | Nexus | `Runtime.make(layer = Layer.empty)`. `Application.define` input may omit `runtime`; the stored record keeps the field. Add `examples/hello`. | T1.1, T1.2 |
| B3 | Valance | `ApplicationHandle<S, E, K extends string = string>` so `invoke` keys are typed. A `vlx check` warning when an event's parameters and a bare command's fields differ in name or order (the positional rule stays). Generate a `package/name` union for `resolve`. | I2 |
| B4 | Nexus | `Command`/`Event.define` accept `Schema<A, I, never>` through a defaulted type parameter (`State` is unchanged). Opt-in `subscribe(def, { validate: true })`. A structured `cause` next to `issues`. | I2 ◐→P (with B3) |
| B5 | Valance | A test fails when an entry exports a name with no row in `stability.md` (extends `test/tree-shaking.test.ts`). | E3 locked |
| B6 | Port, Valance | A Tier 3 native hatch (details below). | H1 → P, H2 → P |

**B6 design.**

- **Shape:** subpath `@valancex/port-web/native`, used as `native?: { [component]: (element, { key }) => cleanup | void }`. The Valance web entry passes it through, and `Web.run({ target })` lets a wrapper keep run's reporting.
- **When it runs:**
  - The callback runs after an element exists: on draw, on insert, and after hydration adopts the DOM.
  - Its cleanup runs before a replacement, a removal, a `draw` or `unmount`, and after focus has been handed off.
  - The server ignores it.
- **State cannot be corrupted:**
  - The callback gets no dispatch or report; state changes only through commands.
  - Port re-asserts every slot it owns on its next write, and a test proves this.
  - Only primitives marked `opaque` (no tree children; hydration skips their contents) give their subtree to the callback. `layer` primitives are never opaque.
- **Tier:** Provisional, Web only, not in contract v1. A desktop parallel waits for evidence (Port ROADMAP §2.8).

## 5. Phase C: decisions (made 2026-10-25 from the literature review in §7)

### C-1. Context channel: **adopt, declared and type-checked** (C1 F→P, C2 –→P; +10 weight)

- **Decision:** add an opt-in Tier 2 context channel to MPRX/Mesh and Valance.
  - The manifest declares names and types once at the top level: `"context": { "theme": T }`.
  - A component opts in with `"uses": ["theme"]`. Those names join its scope read-only. They are checked before run, exactly like units (`manifest.md:146`).
  - A clash with a prop or scope name gets its own diagnostic.
  - Valance supplies the values through a projection `context: (state) => {…}` beside `scope`.
  - The host passes them beside the snapshot, as it does units, so the runtime stays stateless and server and client agree.
  - `updateChanges` gets a `context` path root. A conformance vector proves that a context change re-evaluates its readers.
- **Fixed now so later work stays open:**
  - A snippet or slot reads context where it was **declared** (consistent with `templates.md:465`).
  - Commands are not part of context; they already bind by name.
  - There is no implicit inheritance: a component reads only names it `uses`.
- **Left open:**
  - A subtree override (`{#with theme=expr}`), as a later additive block.
  - Providers for each subtree.
- **Why:**
  - The literature separates *ambient* context, a global lookup the reader cannot see, from *declared* requirements.
    - Seemann and van Deursen reclassified Ambient Context as an anti-pattern in 2019 because the dependency is invisible.
    - Scala 3 replaced implicits with `using` clauses for the same reason: say what you mean, and keep the requirement in the signature.
    - Effect tracks every requirement in `R`, and a missing provider is a compile error.
    - Svelte 5.40 added `createContext<T>()` to make context typed.
  - Bet 8 rejected "a context or provide/inject mechanism" because it **hides dependencies** (`bets/state-units.md:199`). That objection is right against React/Svelte-style lookup and does not apply to a `uses` declaration: every read is traceable to the component's own contract, and the language server can show where it comes from.
  - React's own guidance (pass props or children first; context for values many distant components need, such as theme, locale or the current user) bounds its use. The docs page for the channel must repeat that guidance.
- **Recorded disagreement:**
  - This supersedes Bet 8's "context" alternative row and amends MPRX §9.1 ("no global or implicit names" becomes "no implicit names: a context name is in scope only where the manifest says the component uses it").
  - Record it as a K-decision in `decisions.md` before any code, as the north star's header requires.
- **Risk:**
  - Context values cross to the client with the snapshot, so they fall under C-3's masking rule.
  - Valance gains a second projection beside `scope`; document both on one page.

### C-2. Default Web vocabulary in Port: **ship opt-in, do not default** (Port T1.2 ◐→P contested)

- **Decision:** add `@valancex/port-web/vocabulary`, a data table plus its manifest that mirrors `port-desktop-vocabulary`.
  - The Port README's first example imports it in one line.
  - `primitives` stays required, because the vocabulary is the essential input of a PORT, not a setting.
  - Valance's portable core web vocabulary (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`) should come from this table later, which leaves one source.
- **Why:**
  - Flutter's layering keeps a style-neutral core with the design system as a separate opt-in layer. In 2026 Flutter moved Material and Cupertino out of the SDK because the core had come to depend on them implicitly.
  - A default table would become the de facto catalog that MPRX §9.9 deliberately leaves out. Removing a default later would be breaking, while adding one later would not, so the opt-in keeps the option open.
  - The Tier 1 path for Port users is Valance, which already supplies the table.
- **Scoring note:** P if the reviewer accepts the table as essential (one import, nothing to write); otherwise ◐. The plan counts it as ◐.

### C-3. Masking the embedded state: **adopt, through `Schema.Redacted`** (D2 ◐→P)

- **Decision:**
  - Fields typed `Schema.Redacted` are never embedded by `renderToHtml`.
  - Such a field must declare a default, which the client restores it to on hydrate.
  - A view or context projection may not read it; `vlx check` reports that.
  - No configuration. Authors already mark secrets with `Redacted` (forms, replay `record.redact`).
- **Why:**
  - Next.js tells authors not to rely on its taint API alone and warns against client props "that accept more data than they need".
  - Astro advises passing only the fields an island uses.
  - Qwik exposes only `PUBLIC_`-prefixed values.
  - The common lesson is that a declared, checked boundary beats an object-by-object runtime check.
  - Using the existing `Redacted` marker adds no new concept (Tier 1), and a projection function stays possible as a later Tier 2 knob.
- **Recorded disagreement:**
  - Resumable start (`bets/resumable-start.md:104`) assumes server and client start from the same state.
  - Restate that invariant as "server and client render the same tree": unreadable fields cannot change the tree, so it holds.
  - Record the restatement in `decisions.md`.

### C-4. Mesh "instance" → "occurrence" for units: **rename now** (stops M2 from slipping)

- **Decision:** in one coordinated set (Mesh 0.18, then Nexus and Valance), rename:
  - `render.instances` → `occurrences`
  - `intent.instance` → `occurrence`
  - `runtime-unknown-instance` → `runtime-unknown-occurrence`

  "Instance" keeps its MPRX meanings: an element of a component, and a repeat's key. Release notes name the change.
- **Why:**
  - Mesh's own stability page tiers units "Unreleased … may change before it is called stable", and Valance tiers them Provisional. SemVer 0.x promises no stability.
  - Hyrum's Law says the cost of a rename only grows with adoption, so the cheapest time is before the first outside dependent.
  - Domain-driven design's ubiquitous language asks for one term per concept, and the prose already says "occurrence".
- **Precondition:** settle the units status first (A11).

### Not adopted (left for 1.0)

- **I1/M2 to Pass:** this needs renames (`Render`, the `start`/`Host`/`scope` collisions, Nexus identity fields). The plan does it at 1.0 (review M8). Aliases are refused, because two names for one concept costs M2 again.
- **E2 for Mesh/Port:** these are ◐ by design (the composer is Valance), and no additive API fixes them.

## 6. Expected scores

| After | Ecosystem | Remaining gaps |
|---|---|---|
| Now | ~61 | – |
| Phase A | ~66 | T1.3, E3 |
| Phase A+B | ~77 | C1/C2 F, D2 ◐ |
| A+B+C | **~85** | T1.1 ◐ (Nexus needs Schema/State/Command), T1.2 ◐ (Port, contested), E2 ◐ (by design), I1/M2 ◐ (1.0 renames) |
| …and if C-2 is accepted as P and Nexus `examples/hello` is judged one-call | ~89–90 | Good band boundary |

Open scorecard questions, recorded as findings and not used to raise the score:

- Should E2 be N/A for a layer that has no Tier 1 author?
- Nexus's C1/C2 are marked N/A, but Effect `Context` is a real, type-checked channel (it would be P/P).
- Nexus's X1/X2 are marked N/A, but it now has optional behavior knobs (X1 would be ◐).

## 7. Sources consulted for Phase C

- React, [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context): pass props or children first; context for widely needed values.
- M. Seemann, [Some thoughts on anti-patterns](https://blog.ploeh.dk/2019/01/21/some-thoughts-on-anti-patterns/); van Deursen & Seemann, *Dependency Injection Principles, Practices, and Patterns* (Manning 2019) §5.3, Ambient Context as an anti-pattern.
- Scala 3, [Contextual Abstractions](https://docs.scala-lang.org/scala3/reference/contextual/) and [Relationship with Scala 2 Implicits](https://docs.scala-lang.org/scala3/reference/contextual/relationship-implicits.html).
- Effect, [Managing Services](https://effect.website/docs/v3/requirements-management/services): requirements in `R`, checked at compile time.
- Svelte, [`createContext`](https://svelte.dev/docs/svelte/svelte) ([PR #16948](https://github.com/sveltejs/svelte/pull/16948)).
- WCCG [Context community protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md); [Lit context](https://lit.dev/docs/data/context/).
- Flutter, [Building user interfaces](https://docs.flutter.dev/ui); [Decoupling Material and Cupertino](https://www.freecodecamp.org/news/decoupling-material-and-cupertino-in-flutter/).
- React, [`experimental_taintObjectReference`](https://react.dev/reference/react/experimental_taintObjectReference); Next.js, [data security](https://nextjs.org/docs/15/app/guides/data-security).
- Qwik, [Think Qwik](https://qwik.dev/docs/concepts/think-qwik/); Astro islands props serialization ([tuurt.com](https://tuurt.com/en/blog/islands-architecture-in-astro-deciding-what-actually-needs-client-side-javascript/)).
- [Semantic Versioning](https://semver.org/) (major version zero); [Effective Rust, Item 21](https://effective-rust.com/semver.html) (Hyrum's Law).
- E. Evans, *Domain-Driven Design* (2003): ubiquitous language.
