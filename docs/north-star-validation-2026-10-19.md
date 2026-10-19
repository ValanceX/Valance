# Ecosystem validation against the design north star

Date: 2026-10-19. Standard: [Design north star: progressive disclosure](./DESIGN_NORTH_STAR.md). Scope: Valance, Nexus, Mesh, Port, as checked out on the `ccr-f7c90719-pn82ma` branches (the default branch's head at the start of the session).

**How this was done, and its limits.** A read of the READMEs, architecture documents, contracts, the MPRX spec, the Valance public source (`packages/valance/src/index.ts`, `web.ts`), the Valance boundary tripwire, the Nexus and Valance examples, and the 2026-10-09 [API design review](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-09-api-design-review.md). **Nothing was executed**: dependencies are not installed in this environment, so no test, build or example was run, and no finding below was reproduced. Valance alone has about 445 source files; they were sampled through their contracts and entry points, not read in full. A finding cites what was read; where a claim leans on the earlier review without being re-checked, it says so. Nothing was changed except adding the north star, this report and the `CLAUDE.md` pointers.

## Verdict

The ecosystem is built on the north star's central bet and mostly honors it: one state, `UI = f(state)`, commands as the only mutation, mechanisms hidden behind enforced boundaries, and a zero-config Tier 1 through `vlx init`. Three things the north star treats as essential are **not there yet**: a way to supply a value to a deep component without threading it (anti-pattern 4.4), a built Tier 3 escape hatch, and a Tier 2 performance knob. The rest is polish on naming and on how much of the lower layers a direct embedder must handle.

| Principle or pattern | Verdict | One line |
|---|---|---|
| 1.1 Cognitive load | **Partly** | Excellent through `vlx init`; the engines-up route carries extraneous steps. |
| 1.2 Information hiding | **Meets** | Boundaries are enforced by tests, not only by convention. |
| 1.3 Intention-revealing | **Partly** | MPRX and Nexus read in domain terms; Valance's `invoke` and argument mapping do not. |
| 1.4 Side-effect-free / CQS | **Meets** | Selector vs Command, a language with no code, pure `scope` and reducers. |
| 1.5 Mental model | **Meets** | "One state drives the whole screen" is the product. |
| 2.1 Compile vs runtime | **Meets** | Compile-time check against a manifest, runtime evaluation of the checked template. |
| 2.2 Core vs mechanisms | **Meets** | Scheduling, diffing and effect execution sit behind Mesh, Nexus and PORT contracts. |
| 2.3 Layers, open/closed | **Partly** | Closed top layer is real; the open lower layers are mostly unstable or internal. |
| Tier 1 | **Meets** | `vlx init`, Markdown pages, one layout, one `main.ts`. |
| Tier 2 | **Partly** | Behavior knobs exist; no performance knob, and none is needed until fine-grained reactivity lands. |
| Tier 3 | **Gap** | Promised in Port's architecture; no hatch found built or documented. |
| 4.1 Eager configuration | **Partly** | Generated for the CLI route; hand-written in the embedding route. |
| 4.2 Smart UI | **Meets** at Tier 1, **Partly** below | Valance hides the draw/update/release loop; a direct Mesh+Port composer owns it. |
| 4.3 Entity trap | **Meets**, one watch item | Views see a projection; hydration ships the whole state. |
| 4.4 Sinkhole | **Gap** | No inherited-scope or injection primitive in MPRX; values are threaded. |

## What holds, with evidence

- **Boundaries are tests.** `packages/valance/test/boundaries.test.ts` asserts that Mesh's runtime has no dependencies, that Port Web depends only on the Mesh runtime, that Nexus's only `@valancex` dependency is the Mesh runtime, and that Valance's core entries import no PORT package and name no DOM or Web type (constraints C1, C4, C5). This is the north star's "boundary a test enforces" at its best.
- **Mechanism hidden.** Mesh's parse pipeline (Tree-sitter, CST, AST, IR) is stated to be an implementation detail; Port's contract is three verbs (`draw`, `update`, `unmount`, plus `patch`) and a report; Nexus never imports its Mesh adapter from the nine primitives (README, tested per `docs/ARCHITECTURE.md` §1).
- **No smart UI at Tier 1.** In the counter, the author writes state, a command and a template; nothing calls draw, update, flush or release (`docs/learn/first-application.md`). Valance does the composition (C1, C2) and presents "latest state" itself (contract §5).
- **Commands and queries are separate by construction.** Nexus has `Selector` (read-only) and `Command` (the way to change); MPRX has no arbitrary code, no side effects and no business logic (Mesh README); `scope(state)` and the `command(state)((current) => next)` reducer form are pure.
- **View models, not entities.** A Valance view is `{ program, scope: (state) => values }`, and the manifest declares the type of every value the template may use. A template cannot reach a field the author did not project. Command inputs are schema-checked and rejected before the command runs.
- **Fail-closed, checked before running.** `any` and `any?` are the only deliberate loosenings in MPRX (spec §9); every unknown component, prop, event, name or command is a compile error against the manifest. That is the north star's "compile-time transform" value (§2.1) delivered for generated UI.
- **Stability tiers now exist in all four repos** (`docs/stability.md`, or `docs/manual/stability.md` in Mesh). The 2026-10-09 review's G5 asked for this. Presence only was checked, not each row.
- **Earlier findings already addressed.** The start-work failure log now carries identity only (`_tag`, `code` or `name`) and the cause goes only to `onStartFailure` (`index.ts`, the `start` doc comment), which settles that review's G4.

## Findings

Ranked by distance from the north star. "Owner" means a decision that is not made here; none of these changes a released surface until the owner chooses.

### F1. No inherited-scope primitive: anti-pattern 4.4 has no remedy available (Gap)

**Evidence.** MPRX §9.1: "References resolve against the template's scope and nothing else ... there are no global or implicit names." Composites receive values only through props; the spec offers slots (`mesh-slot`, `mesh-fill`), snippets and forwarded composite events for composition, and a search of the spec for provide, inject or context finds none. Commands do not have this problem: a bare command name binds to every declared `component/name` that uses it (contract §3), so only *values* are threaded.

**Why it matters.** A theme, a locale, the current user, or a layout setting needed by a leaf must be passed through every composite between it and the root. That is the sinkhole.

**The constraint that makes this a real decision.** The strictness is deliberate: it is what lets a machine-written template fail closed. A React-style implicit `useContext` would give that up. The north star's remedy is "provider/injection primitives"; the version that fits this ecosystem is an **explicit, manifest-declared, type-checked inherited scope**: a component declares in the manifest that it reads `theme` from an ancestor, the compiler checks an ancestor provides it with a compatible type, and nothing is looked up by name at run time. It stays additive and stays checkable.

**Disposition.** Owner. Needs a Mesh spec revision (MPRX, manifest) and, afterwards, a Port-neutral render-v1 effect of none (resolution happens before the render tree). Recommended next item.

### F2. No Tier 3 escape hatch built (Gap)

**Evidence.** Port's `ARCHITECTURE.md` lists, among its responsibilities, "explicit escape hatches down to target primitives and native APIs, clearly marked as leaving the portable layer", unlike its neighbouring bullets it is not marked "(direction, not built)". Searching Port Web's README and Valance's web entry for hatch, raw element, ref or imperative access found nothing. What exists is a partial hatch: the primitives table maps a building block to any element and attributes (`WebPrimitive`), and `Target` is user-implementable, so a whole target can be replaced. There is no way to get the drawn element of a given node to paint a canvas or a WebGL scene, so such an application cannot be written inside the model today.

**Why it matters.** The north star's Tier 3 is the safety valve that keeps Tier 1 honest. Without it, the pressure goes to `./internal` or to forking a target.

**Disposition.** Owner. Shape to consider, in line with Port's own rule (an optional capability of a PORT, never a shared API): a Web-PORT-only, explicitly named hook that hands a node's element to author code after draw and before removal, cannot write to MESH state except through a command, and is documented as leaving the portable layer. Needs a Port design note first.

### F3. No Tier 2 performance knob, and a whole-view render per state change (Partly)

**Evidence.** Tier 2 behavior knobs are real and opt-in: waiting commands with supersession, `present` modes (`mount` / `hydrate`), `Web.history`, `start` work, and `Plugin`. But the 2026-10-09 review's V16 notes each state commit renders the whole program and gives PORT a whole tree, and that `update`, `updateChanges`, `diff` and `patch` would remove that. The mechanism is built in Mesh and Port; the Mesh reactivity design (`docs/superpowers/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md`) is the plan.

**Assessment.** Consistent with the north star for now: nothing forces a knob on a Tier 1 author. When it lands, the Tier 2 surface should be a **selector with an opt-in comparator** on a view's `scope`, with the Tier 1 default being "correct without it". Do not let the reactivity work add required parameters.

**Disposition.** Already planned; this finding adds only the constraint that its surface be opt-in.

### F4. Direct embedding leaks the mechanism and asks for hand-written config (Partly; 4.1, 4.2)

**Evidence.** Below Valance, a host that composes Mesh and Port directly must keep each `Render`, track program continuity (the composer's, per Port's contract), call `draw`, `update` or `patch`, report events back with the render they came from, and release renders (`Render.release()`, now also `[Symbol.dispose]`). That is the smart-UI symptom, but placed where the north star permits it: in the lower layer, with Valance as the closed top layer that hides it. In the embedding route of Valance itself (`first-application.md`), the author writes `components.json` by hand, runs a compile step, and supplies a `primitives` table mapping every building block to an element; `manifest` from `@valancex/valance/web/build` removes the first, and the CLI removes all three. `define` requires `view: (state) => V` even for a one-view application.

**Disposition.** Small, additive and Tier 1 in spirit: default `view` when there is exactly one view; make `primitives` derivable for the Web target from the manifest's component names where an element mapping is obvious, leaving the table as the Tier 2 override. Owner. Not required to meet the north star at the CLI route.

### F5. Intention-revealing gaps in Valance's author surface (Partly; 1.3)

**Evidence.** Three, all documented:

1. `invoke(key: string, args)` takes untyped string keys, with an `"app/"` prefix convention (`V1_CONTRACT.md`; the 2026-10-09 review's V6).
2. A bare command's input is filled from the event's arguments **by position, in the struct's field order**; "the event's own parameter names are not used" (`index.ts`, the `commands` doc comment). The binding between a template and a command is therefore invisible in the template and breaks on reordering fields.
3. Naming and vocabulary: `Render` names an entity after a process (the review's M8, deferred to a major); `name`/`id`/`_tag`, `scope`, `Host`, `start` carry more than one meaning (N8, V11).

**Disposition.** (2) is the most worth acting on: map arguments by name (the event already declares parameter names in the manifest), keeping positional as a documented fallback. Additive. The others are the owner's, with renames only at a major version.

### F6. Hydration ships the whole state to the client (4.3 watch item)

**Evidence.** `renderToHtml` returns `{ html, state }`, "the state it was rendered from", and the browser takes it over with `present: "hydrate"` and that state (`first-application.md`, contract §5). The state's schema thereby doubles as the wire format; there is no mask. Everything else in the entity-trap check is clean, which makes this the one place an internal shape crosses a public boundary.

**Disposition.** Owner. An optional field-masking projection for the hydration payload would be Tier 2; the default must stay "the whole state", correct for most applications. A secret held in state would reach the browser; `learn/mounting-and-hydration.md` does not say so (a search for "secret" and "sensitive" found nothing), and it should.

### F7. The open lower layers are mostly unstable or internal (Partly; 2.3)

**Evidence.** The closed layer is clear and enforced. The open layers: `Mesh.host` and `createWebPort` are public for embedding, Mesh/Port/Nexus carry stability pages, and Valance publishes `./internal` outside its contract. The earlier review's N7 (Nexus exports `Semantic`, `Mesh` and `EventBusShape` beside the stable primitives) and V7 (`./internal` tier in prose only) are open items; they were not re-checked in this pass.

**Disposition.** Owner. Resolve by marking each export's tier in its type docs, so "drop down a layer" is a stated choice rather than a discovery.

## Not a finding

- Nexus's own examples are Effect-heavy (`Schema`, `Layer`, `Resource`, `Service`). Nexus is the engine tier, not the onboarding surface; Tier 1 is Valance. Its README says so by pointing apps at `vlx`. A short Nexus "no UI at all" Tier 1 example would still help but is not a gap against the north star.
- MPRX's smallness (no code, no string building) is the product's safety claim, not a Tier 1 limit.

## Suggested order

1. **F1** inherited scope (owner decision, then a Mesh spec change).
2. **F5.2** argument mapping by name (additive, Valance).
3. **F2** a Tier 3 hatch design note in Port.
4. **F4** defaults for `view` and `primitives`.
5. **F3** hold the opt-in constraint when reactivity ships.
6. **F6, F7** by owner decision.

## Keeping it true

The north star's §5 checklist is the review form. The cheapest way to make a principle stick is a tripwire, as `boundaries.test.ts` does for C1 to C5; candidates here are a test that a minimal `define` example needs no more than its listed required fields (4.1) and one that no public Valance entry exposes a `draw`, `update`, `flush` or `release` verb at Tier 1 (4.2). Neither is built.
