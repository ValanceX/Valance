# North star baseline: ecosystem compliance on 2026-10-19

A record of the current state, scored with the [scorecard](./NORTH_STAR_SCORECARD.md) against the [design north star](./DESIGN_NORTH_STAR.md). It records what is, and recommends nothing. Later measurements are compared to this one.

**Method and limits.** A static read of the READMEs, architecture documents, contracts, the MPRX spec, Valance's public source (`packages/valance/src/index.ts`, `web.ts`), its boundary test, the Nexus and Valance examples, and the 2026-10-09 [API design review](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-09-api-design-review.md), on the `ccr-f7c90719-pn82ma` branches. **Nothing was executed** (dependencies are not installed here), so no result was reproduced. Valance (about 445 source files) was sampled through its contracts and entry points. **Confidence is highest for Valance, lower for Mesh, Port and Nexus**, which were read through their READMEs, architecture documents and the earlier review; a result that rests on the earlier review without being re-checked is marked †. Results are judgments against the scorecard's definitions, not measurements.

## Scores

| | Score | Band |
|---|---|---|
| **Ecosystem (weakest link)** | **59** | Needs improvement |
| Port | 87 | Needs improvement |
| Mesh | 85 | Needs improvement |
| Valance | 73 | Needs improvement |
| Nexus | 72 | Needs improvement |

No repo is in the Good band; none is Poor.

### By category (applicable audits only)

| Category | Weight | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| Tier 1: minimal surface | 20 | 50 | 85 | 50 | 100 | 85 |
| Encapsulation | 20 | 70 | 88 | 88 | 83 | 83 |
| Intention and contracts | 15 | 67 | 83 | 67 | 83 | 100 |
| Mental model | 10 | 75 | 75 | 75 | 100 | 100 |
| Data boundary | 10 | 80 | 80 | 100 | 100 | 100 |
| Context | 10 | **0** | 0 | n/a | 0 | n/a |
| Tier 2: opt-in tuning | 8 | 75 | 75 | n/a | 100 | 100 |
| Tier 3: hatches | 7 | **0** | 0 | n/a | n/a | 0 |

## Audit results

P = Pass, ◐ = Partial, F = Fail, – = N/A. Ecosystem = the lowest result among repos that own the audit.

| ID | Audit | Eco | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| T1.1 | Zero-config path | ◐ | P | ◐ | P | P |
| T1.2 | Nothing required with a default | ◐ | ◐ | ◐ | P | ◐ |
| T1.3 | Docs lead with Tier 1 | ◐ | P | ◐ | P | P |
| E1 | Boundaries enforced by a test | P | P | P | P | P |
| E2 | No lifecycle step at Tier 1 | ◐ | P | P | ◐ | ◐ |
| E3 | Every export tiered | ◐ | ◐ | ◐† | P | P |
| I1 | Names say what | ◐ | P | ◐† | ◐ | P |
| I2 | Typed, no stringly or positional coupling | ◐ | ◐ | ◐† | P | P |
| I3 | Command/query separation | P | P | P | P | P |
| M1 | One source of truth, `UI = f(state)` | P | P | P | P | P |
| M2 | One term per concept | ◐ | ◐ | ◐† | P | P |
| D1 | View models, not entities | P | P | P | P | P |
| D2 | Wire data can be masked | ◐ | ◐ | – | – | – |
| C1 | Value reaches a deep component without threading | F | F | – | F | – |
| C2 | Channel explicit and checkable | – | – | – | – | – |
| X1 | Opt-in knobs, behavior and performance | ◐ | ◐ | – | P | P |
| X2 | Defaults correct without knobs | P | P | – | P | P |
| H1 | Documented way down to the platform | F | F | – | – | F |
| H2 | Hatch marked and safe | – | – | – | – | – |

## Evidence

**Tier 1**
- T1.1: `vlx init my-app --web && npm run dev` (Valance README) produces a running site from Markdown, one layout and one `main.ts`; `mesh check <file>` runs with no setup (Mesh README). Nexus's shortest runnable example (`examples/basic-app`) needs Effect `Schema`, `Layer`, `Service` and `Resource` (◐).
- T1.2: Valance `define` requires `view: (state) => V` even for one view (`index.ts`); the embedding route hand-writes `components.json` and a `primitives` table (`docs/learn/first-application.md`), which the CLI generates. Port's `createWebPort` requires a `primitives` table with no default realization. Nexus's basic app requires a schema, a layer and a service to do one thing. Mesh requires nothing beyond the file.
- T1.3: Valance's README and learning path start at `vlx init` and the CLI guide; Mesh's start at `mesh check`; Port's start at the contract. Nexus's README opens with its pitch and an Effect-based example before any simpler route.

**Encapsulation**
- E1: `packages/valance/test/boundaries.test.ts` asserts Mesh's runtime has no dependencies, Port Web depends only on the Mesh runtime, Nexus's only `@valancex` dependency is the Mesh runtime, and Valance's core entries import no PORT package and name no DOM or Web type (constraints C1, C4, C5). Nexus's `docs/ARCHITECTURE.md` §1 states a test keeps its core from importing the Mesh adapter †.
- E2: In the Valance counter nothing calls draw, update, flush or release. A Mesh host keeps each `Render`, tracks `version`, and calls `release()` (◐); a Port composer decides draw versus update and reports events back (◐), by those layers' own design, with Valance as the composer.
- E3: `stability.md` exists in all four repos (Mesh: `docs/manual/stability.md`). Valance publishes `./internal` outside its contract with the tier in prose; Nexus exports `Semantic`, `Mesh` and `EventBusShape` beside the stable primitives (review N7, V7 †). Mesh and Port tier each surface (Port's `inspect` and `patch` keys are stated as not part of the contract).

**Intention and contracts**
- I1: MPRX (`selectUser($event)`), Nexus primitives and Valance's `command`/`state`/`view` read in domain terms. `Render` names an entity after a process (review M8); `name`/`id`/`_tag`, `scope`, `Host` and `start` each carry more than one meaning (N8, V11 †).
- I2: Valance `invoke(key: string, args)` takes untyped string keys with an `"app/"` prefix; a bare command's input is filled from event arguments by field order, "the event's own parameter names are not used" (`index.ts`, `commands`). Nexus `Event.subscribe` matches on `_tag` and casts the payload; `Schema<A>` parameters reject transforming schemas (N2, N9 †). Mesh has stable error `code`s, `MeshUsageError` and a branded `RenderVersion`; Port's `WebRealizationError` carries `code`, `key` and `cause`. Error identity is spelled `code`, `reason`, `_tag` and message prefix across the repos (review G3; Valance's defects in particular).
- I3: Nexus `Selector` (read-only) and `Command` (the only mutator); MPRX has no code or side effects; Valance `scope(state)` and the `command(state)((current) => next)` form are pure.

**Mental model**
- M1: "State is authoritative. The application's single state cell is the only source of truth" (`V1_CONTRACT.md` §3); screen is a function of state; commands are the only way to change anything.
- M2: see I1 and the error-identity spellings above.

**Data boundary**
- D1: a Valance view is `{ program, scope: (state) => values }`, and the manifest types every value a template may use; Port receives only render-v1 and never sees commands or state.
- D2: `renderToHtml` returns `{ html, state }`, the whole state, and hydration takes it back (`first-application.md`; contract §17). There is no masking step. `learn/mounting-and-hydration.md` carries no note about secrets in state (a search for "secret" and "sensitive" found none).

**Context**
- C1: MPRX §9.1: "References resolve against the template's scope and nothing else ... there are no global or implicit names." Composites take values by props only; the spec offers slots, snippets and forwarded events. A search of the spec for provide, inject and context found none. Commands do not have this property: a bare command name binds to every declared `component/name` that uses it (contract §3), so only values are threaded.
- C2: not applicable, no channel exists.

**Tier 2**
- X1: behavior knobs exist: waiting commands with supersession, `present` modes (`mount`, `hydrate`), `Web.history`, `start` work, `Plugin` (Valance); incremental `update`, `updateChanges` and `diff` (Mesh); `patch` (Port). Valance gives a view no performance knob: each state commit renders the whole program and hands Port the whole tree (review V16; fine-grained reactivity is designed in `Mesh/docs/superpowers/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md`, not shipped).
- X2: `render()` and `draw()` are correct without any knob; every knob found is optional.

**Tier 3**
- H1: Port's `ARCHITECTURE.md` lists "explicit escape hatches down to target primitives and native APIs" among its responsibilities, without the "(direction, not built)" mark its neighbouring bullets carry. A search of Port Web's README and Valance's web entry for hatch, raw element, ref and imperative access found nothing. Partial substitutes exist but are not hatches in the north star's sense: the primitives table maps a building block to any element and attributes, `Target` is user-implementable, MPRX `any`/`any?` loosen types only.
- H2: not applicable, no hatch exists.

## Open items inherited from the earlier review

Not re-checked in this pass, and bearing on the † results: N7 and V7 (tiers of Nexus's and Valance's mixed exports), N8 and V11 (vocabulary collisions), N2 and N9 (Nexus typing), V6 (untyped `invoke`), V16 (whole-tree render), and G3 (error identity).

## Next measurement

Recompute with the [scorecard](./NORTH_STAR_SCORECARD.md) whenever a change touches an audit, and update this file in the same change. The next measurement, taken 2026-10-25 before any refinement, is [north-star-validation-2026-10-25.md](./north-star-validation-2026-10-25.md).
