# Implementation plan

*Written 2026-10-17 from the fifteen briefs, [decisions](decisions.md) and the research in [evidence](evidence/README.md). It turns the designs into work packages for implementation sessions. Everything here is a plan for work not yet done; nothing in it has been built except the footprint harness.*

## How an implementation session works

1. **Read, in this order:** the [front page](README.md) (fixed points, gates, the free window), the brief for the bet you are building, its rows in [decisions](decisions.md), and the scripts in [evidence](evidence/README.md) that back its numbers.
2. **One work package at a time**, on its own branch, in small commits. Every package ends in the **acceptance check** listed for it, and the check is run, not described.
3. **Build to stage 3** (a prototype behind a marked namespace on one target, measured against the budgets). A bet moves to stage 4 only when two targets realize it and the reference build uses it from outside; record that in the bets index.
4. **Verify against specifications** (fixed point 10): the verifiers in [Bet 7](bets/accessibility.md) are the gate for emitted output. A browser, bundler or screen reader that disagrees with a specification is not our bug.
5. **Keep the free window honest.** Anything may break until the Reference Gate passes, but a break names its replacement in a diagnostic (X4).
6. **Update the documents with the code:** a decision that turns out wrong is changed in `decisions.md` with the date and the reason; a new measurement goes into a new dated file under `baselines/`, never into an old one; a friction report goes to the bet's brief.
7. **Do not create pull requests unless asked, and push only to your session's branch.**

## Ground rules that apply to every package

- The ten fixed points in the front page bind. In particular: no arbitrary code in views (1), checked before it runs (2), nothing dropped silently (6), data only on every wire format (8), start-up carries only what start-up needs (9), output verified against specifications (10).
- Dev builds are silent about size; production builds minimize (W9, W10).
- A new diagnostic has a stable code and a suggestion where one exists.
- A new conformance vector is data, written before the implementation it covers (U6).

## Order of work

```
WP0 defects and housekeeping ─┬─ WP1 shared vectors ─┐
                              ├─ WP2 language ───────┼─ WP3 primitive specification ─┬─ WP4 style contract
                              └─ WP9a checker limits  │                               ├─ WP5 state units and forms
                                                      │                               └─ WP6 PORT behavior (focus, layers)
                       WP7 conformance kit, replay, verifiers ◄── after WP3 (verifiers can start after WP1)
                       WP8 start-up and budgets      ◄── after WP0 (re-baseline)
                       WP9 generated UI session      ◄── after WP9a
                       WP10 library tooling and the reference build ◄── after WP2 to WP6
```

## WP0. Defects and housekeeping (start here; every item is small)

| Item | Repo | Source | Acceptance check |
|---|---|---|---|
| The runtime fails near 690 nested composites with no diagnostic (`MeshInternalError`), and a compiled `template-v1` fails at about 42 nested elements although 128 is documented. Add the nesting counter (cap 512) and make the documented depth true | Mesh | U12, [Bet 5](bets/template-values.md) | A test at 600 and 1,000 levels gives a diagnostic, never an internal error; `evidence/language/depth.mjs` |
| The checker is quadratic in siblings and attributes (8,000 siblings 7 s; 10,000 attributes 15 s). Make both linear and add the limits | Mesh | G5, G6, [Bet 13](bets/safe-generated-ui.md) | `evidence/language/scale.mjs` and `stream2h.mjs` stay under their limits' times; limits are diagnostics |
| `override` collisions are silent; `template-duplicate` never fires for declared components; the `override-unknown` message mentions a `uses` list that no longer exists | Valance | K14, [Bet 12](bets/reference-library.md) | Two libraries with one component name give a compile error; the message is correct |
| `docs-app` README omits building the workspace packages first | Valance | W17 | Following the README builds it |
| MESH conformance README and `identity/README.md` say MPRX cannot express conditionals or repeats (stale since v0.11) | Mesh | the audit | Text corrected |
| The footprint harness builds with esbuild, not `vlx build` | Valance | W15, W16 | `scripts/measure-footprint.mjs` builds the counter and `docs-app` with `vlx build`, adds memory after updates (W18) and bytes per added page (W17), and writes a new dated baseline; W3's ceilings are recomputed from it |
| Desktop `heading` exposes `Label` with no level; `list`, `listitem`, `blockquote` expose nothing | Port | A11 | The invariant checker (`evidence/specs/spec_invariants.rs`) sees `Heading` with a level |

**WP0 status (2026-10-17, first implementation session).** All seven items are done except that qualified override ids (K14) are a marked TODO. Code is on the branch `claude/wp0-defects-housekeeping-k4q5kt` of `valancex/mesh`, `valancex/valance` and `valancex/port`; the baseline and the decision changes are on `claude/wp0-direction-docs` of `valancex/valance`. Findings that need a decision are recorded in [the new baseline](baselines/2026-10-17-vlx-build.md) (a second WebAssembly runtime in a plain install, and WebAssembly memory still growing after 1,000 updates) and below:

- The limits of G5 apply to every MPRX source, not only generated UI: a file over 64 KB is `input-too-large`. A 64 KB source holds at most about 4,600 elements of 14 bytes, so the 5,000-element limit is reached only by short elements.
- A11 names Heading, Paragraph, List and ListItem; `blockquote` (the web renders it as `blockquote`) is not in the 22-name role set and the Desktop still exposes nothing for it.
- The render nesting cap of U12 counts steps of the path to a node (512). Native debug builds overflow a 2 MB thread stack well before that, so a native host needs a larger stack; WebAssembly is bounded by the cap.

## WP1. Shared conformance data

[Bet 2](bets/conformance-kit.md), Q1 to Q3. Publish `@valancex/mesh-conformance` (data only) from MESH; make the Web PORT depend on it instead of its v0.6 copy; run the 22 identity vectors on the Web PORT and record what fails; have the Desktop PORT read the same data. **Acceptance:** a check fails if a copy of the vectors exists in a PORT tree or the installed version is older than the one claimed.

## WP2. Language (MESH)

In this order, each ending at stage 3 with vectors in Rust and JavaScript (the Language Gate needs stage 4).

1. **[Bet 4](bets/variant-types.md): `enum`, `has`, `??`, `default` on props** (T1 to T13). New codes `unknown-variant`, `manifest-enum-too-large`, `manifest-duplicate-variant`, `redundant-presence-test`, `redundant-default`; no new runtime code; no string joining. *Acceptance:* the codes are in the diagnostics manual; the equivalence law (`update` equals `render`) still holds on all vectors; `evidence/language/replay.mjs` still gives equal hashes.
2. **[Bet 5](bets/template-values.md): snippets** (U1 to U14): `{#snippet}`, `{@render}`, a snippet kind, `children` reserved, render step `0x08`, `template-v2` emitted only where used and `v1` still read, caps 512 and 64. Slots become sugar and are retired after the Language Gate. *Acceptance:* identity vectors for the render step are written first; recursion over a tree fails closed at the cap.
3. **[Bet 10](bets/collections.md): the `window` clause and `len`** (L1 to L14), plus the `scroller` primitive's tree fields. *Acceptance:* 10,000 rows windowed to 50 render in at most 35 ms with a tree of at most 12 KB (`evidence/language/floor.mjs`); a scroll step from the changes form takes at most 2 ms.
4. **`ref` kind** for node references (A12) belongs here because it is a manifest kind. *Acceptance:* `unknown-ref` on a reference to nothing.

## WP3. Primitive specification

[Bet 1](bets/primitive-specification.md), [Bet 7](bets/accessibility.md): P1 to P7, A1 to A5, A11, A14. Create `@valancex/primitives` in Valance with the specification schema (name, props, events, content, `role`, `name`, `keyboard`, `states`, `relations`, `controlled`, `replay`); generate the web manifest, check the Desktop vocabulary against it, and generate the vocabulary documentation. Make `label` required on `checkbox` and `textfield` (`unnamed-control`); a `list`'s children must be `item`; add `kind`, `invalid`, `describedby`, `radiogroup`, `radio`, `status`, `alert` to the web and `status`, `alert` to the Desktop; the Desktop sets Heading with level, Paragraph, List and ListItem. **Acceptance (the Spec Gate):** today's tables regenerate with no test changes and the parity report is green or waived with a reason per primitive.

## WP4. Style contract

[Bet 6](bets/style-contract.md): S1 to S8. Tokens (Design Tokens format), `root` as the only part, states as hooks, variants from closed sets, recipes compiled to static CSS in cascade layers on the web and resolved values over the Desktop `appearance` message; `vlx theme check` (contrast of declared pairs). **Acceptance:** the compiled stylesheet passes `stylelint` (`evidence/specs/css.mjs`); the tokens pass the official DTCG schema and suite plus the graph pass; a theme written with `root` only styles all seven portable-core primitives.

## WP5. State units and forms

[Bet 8](bets/state-units.md) (V1 to V14), then [Bet 11](bets/forms.md) (F1 to F16). The `units` input beside the snapshot, the one NEXUS adapter pass-through, the registry in Valance; then `Form.make`, descriptors, per-field state, row keys, `FieldErrors`, `Form.draft`. **Acceptance:** a disclosure's open state survives a re-sort of its list row and is absent from application state; a signup form is under 25 lines with no validation outside the schema.

## WP6. PORT behavior

[Bet 9](bets/interaction-state.md): I1 to I15. Focus follows identity after every patch (save key and selection, restore), `focus(key)` as a PORT call, `dialog` and `popover` on the web (server-rendered open then upgraded) and the Desktop (egui 0.31.1 `Modal`; the PORT supplies focus return and the invoker), scroll-lock CSS, state hooks. **Acceptance:** reordering a list with focus in a row keeps focus on both targets; the APG modal behavior passes as generated vectors; the specification subset of web-platform-tests runs in a reference browser (`evidence/specs/wptrun-browser.mjs`).

## WP7. Conformance kit, replay and verifiers

[Bet 2](bets/conformance-kit.md) (the rest), [Bet 15](bets/replay.md), Q4 to Q16, R1 to R15. The five-operation adapter, the report schema, generated primitive vectors, the gallery, forced states; the session log (`vlx dev --record`, `vlx replay`); the specification verifiers as scripts in `scripts/` (`vnu`, the name rule, `dom-accessibility-api`, `aria-query`, `stylelint`, DTCG, `accesskit_consumer` plus the invariant checker) producing the signed conformance report (A15). **Acceptance:** a new PORT passes with an adapter of at most 300 lines in a day (the terminal skeleton is the measurement); the three replay routes agree on every vector and on 1,000 random sessions in both runtimes; the report runs in the release dry run.

## WP8. Start-up and budgets

[Bet 3](bets/budgets.md) and [Bet 14](bets/resumable-start.md): W1 to W19, H1 to H12. The three load sets (paint, start, after start), `modulepreload` and parallel WebAssembly compile, the production/dev split, late admission as a re-render (W19), budgets in the release dry run and weekly; the early-input shell (389 bytes), `replay: "never"`, preserving changed fields. **Acceptance:** the counter and `docs-app` meet the recomputed ceilings; early taps in the dead zone are replayed once (the in-page test) and the conformance test drives real input through the browser's input protocol.

## WP9. Generated UI

[Bet 13](bets/safe-generated-ui.md): G1 to G14. After WP0's checker limits: profiles, the `open`/`push`/`close` session, prefix repair done by the checker, fresh render per preview, `effect` on commands, the generation log. **Acceptance:** `close()` equals the batch check on 100,000 random prefixes; a planted mistake is reported within 20 bytes of its start; no preview draws an unchecked node.

## WP10. Library tooling and the reference build

[Bet 12](bets/reference-library.md): K1 to K17. The `valance` export condition and metadata field, `vlx` adding the condition and `ssr.noExternal` for marked packages, `vlx init library`, `vlx library build`, `vlx library check`, qualified override ids, per-target diagnostics at the use site. Create **`ValanceX/Components`** (decided by the maintainer on 2026-10-17: the name stays) holding the six components, two themes, the terminal PORT and a playground, built as an outsider with the boundary test and registry-only CI; create **`ValanceX/ecosystem-ci`** (K16) seeded with `Components` and `acme-ui`; create **`ValanceX/rfcs`** (X6). **Acceptance (the Reference Gate):** at least two independent parties each publish a working component or theme from the documentation alone, with every severity-3 friction fixed or recorded as a decision (K17); the pilot needs zero private seams.

## Decisions that need a person before or during the work

| Item | Why it waits |
|---|---|
| Name the **accessibility maintainer** (A15), who signs the conformance report | A role, not a finding |
| Confirm the **RFC step** and its 10-day final comment period (X6) | Process choice |
| Check **npm downloads** of the `@valancex` packages by hand (U10) | The API was blocked; "no outside consumers" is unverified |
| Choose the **first ecosystem-CI partners** (K16, K17) | People |
| Rule on the **edition number** and the first stable promise at the Edition Gate | Not yet needed |

`ValanceX/Components` is the reference build and pilot (K2, K15), **not a CDK**: the behavior layer a CDK provides lives in the primitives, the layer primitives and the state units of the core. A CDK-style package would be a new bet.

## What to leave alone

- `baselines/2026-10-17.md` is immutable apart from its errata section. New numbers go in a new dated file.
- The evidence scripts are scratch-quality. Rewrite what you keep as tests in the right repository.
- Withdrawn decisions stay in the tables with their reason (T8, H12, and the superseded parts of G3, G4, U5, W8): they are evidence.
