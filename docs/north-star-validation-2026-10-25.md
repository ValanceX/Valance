# North star measurement: ecosystem compliance on 2026-10-25

A record of the current state, scored with the [scorecard](./NORTH_STAR_SCORECARD.md) against the [design north star](./DESIGN_NORTH_STAR.md), before any refinement is made. It records what is, and recommends nothing. Its last section, [After Phase A](#after-phase-a), re-scores the audits the first refinements touched. It is compared to the [2026-10-19 baseline](./north-star-validation-2026-10-19.md); the changes it prepares are in [north star refinements](./direction/north-star-refinements.md) §1.

**Method and limits.** A static read of `main` in all four repos (Valance, Nexus, Mesh, Port), re-checking the 10-19 results and the audits the refinements plan §1 names. **Nothing was executed**, so no result was reproduced. Each `file:line` cited below was opened again on 2026-10-25 and holds. Results not named in §1 are carried from the baseline unchanged, and the † marks of 10-19 that §1 did not revisit are dropped only where this pass re-checked them (Nexus E3). Results are judgments against the scorecard's definitions, not measurements.

## Scores

| | 10-19 | 10-25 | Band |
|---|---|---|---|
| **Ecosystem (weakest link)** | 59 | **63** | Needs improvement |
| Port | 87 | 88 | Needs improvement |
| Mesh | 85 | 82 | Needs improvement |
| Valance | 73 | 78 | Needs improvement |
| Nexus | 72 | 75 | Needs improvement |

No repo is in the Good band; none is Poor. The plan's §1 estimate for the ecosystem is "~61"; it keeps Valance X1 at Partial. This record takes the brief's X1 Pass for Valance (see the disagreement below), which gives 63. With X1 at Partial the ecosystem is 61. Arithmetic is in the [appendix](#appendix-arithmetic).

### By category (applicable audits only)

| Category | Weight | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| Tier 1: minimal surface | 20 | 50 | 85 | 50 | 100 | 85 |
| Encapsulation | 20 | 70 | 88 | 100 | 83 | 83 |
| Intention and contracts | 15 | 67 | 83 | 67 | 83 | 100 |
| Mental model | 10 | 75 | 75 | 75 | 75 | 100 |
| Data boundary | 10 | 80 | 80 | 100 | 100 | 100 |
| Context | 10 | **0** | 0 | n/a | 0 | n/a |
| Tier 2: opt-in tuning | 8 | 100 | 100 | n/a | 100 | 100 |
| Tier 3: hatches | 7 | 50 | 71 | n/a | n/a | 50 |

## Audit results

P = Pass, ◐ = Partial, F = Fail, – = N/A. Ecosystem = the lowest result among repos that own the audit. Cells that differ from 10-19 are in **bold**.

| ID | Audit | Eco | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| T1.1 | Zero-config path | ◐ | P | ◐ | P | P |
| T1.2 | Nothing required with a default | ◐ | ◐ | ◐ | P | ◐ |
| T1.3 | Docs lead with Tier 1 | ◐ | P | ◐ | P | P |
| E1 | Boundaries enforced by a test | P | P | P | P | P |
| E2 | No lifecycle step at Tier 1 | ◐ | P | P | ◐ | ◐ |
| E3 | Every export tiered | ◐ | ◐ | **P** | P | P |
| I1 | Names say what | ◐ | P | ◐† | ◐ | P |
| I2 | Typed, no stringly or positional coupling | ◐ | ◐ | ◐† | P | P |
| I3 | Command/query separation | P | P | P | P | P |
| M1 | One source of truth, `UI = f(state)` | P | P (at risk) | P | P | P |
| M2 | One term per concept | ◐ | ◐ | ◐† | **◐** | P |
| D1 | View models, not entities | P | P | P | P | P |
| D2 | Wire data can be masked | ◐ | ◐ | – | – | – |
| C1 | Value reaches a deep component without threading | F | F | – | F | – |
| C2 | Channel explicit and checkable | – | – | – | – | – |
| X1 | Opt-in knobs, behavior and performance | **P** | **P** | – | P | P |
| X2 | Defaults correct without knobs | P | P | – | P | P |
| H1 | Documented way down to the platform | **◐** | **◐** | – | – | **◐** |
| H2 | Hatch marked and safe | **◐** | **P** | – | – | **◐** |

The brief lists Valance X1 as "P", which is a change from 10-19's ◐; it is in bold above because it is the one Valance cell that moves besides H1 and H2.

## What moved since 10-19, with evidence

**Valance**
- X1 ◐→P (judgment). Behavior knobs were already counted. For performance: `admit` (`packages/valance/src/index.ts:626`, with the admission note at `:503`), the start-up `budgets` (`docs/use/start-up.md:1`, `:32`) and `Target.patch` (`packages/valance/src/index.ts:759-763`), which lets a target apply patches instead of redrawing. Whole-tree render is still the default (V16). This is a judgment that these count as performance knobs.
- H1 ◐ (was F): the CSS hatch `escape.web.css` in a recipe, or the `vlx-app` layer's own CSS (`docs/use/themes.md:28-30`). It reaches the web only, so it is a partial way down to the platform, not a general one.
- H2 P (was N/A): the same section says it "is outside the contract, is not checked for the Desktop and is reported as such in the coverage table" (`docs/use/themes.md:30`): visibly leaves the portable layer, and CSS cannot write the state cell.
- M1 P, at risk: unit state is kept outside the single state cell (`packages/valance/src/units.ts:1-8`, one NEXUS `State` per occurrence), while `docs/V1_CONTRACT.md:45` says "The application's single state cell is the only source of truth" and does not mention units. Scored P because the units file calls itself mechanism, not API; it moves to ◐ if units are judged to be state an author owns.
- E3 ◐ is unchanged. The exports with no `stability.md` row are listed in the plan §1 (`snippet`, `isSnippet`, the brands, `controlled*`, `textField`, `ManifestError`, native `PROTOCOL`/`MAX_LINE`, cli `./schemas/*`).
- M2 ◐ is unchanged. Collisions: `start` (`Valance.start`, `define.start`, `History.start`), `Host` (`packages/valance/src/web.ts:453`, `native.ts:117`), `scope`.
- With X1 at P, Valance's Tier 2 category (X1, X2) is 100 in the by-category table.

**Nexus**
- E3 ◐†→P. The tiering table in `nexus/docs/stability.md:16-24` covers `Application`, `Runtime`, `Service`, `State`, `Selector`, `Command`, `Capability`, `Resource`, `Event`, `Mesh`, `Semantic` (Provisional), `EventBusShape`/`EventBusLive` (Internal) and everything under `dist/` not exported (Internal). The 10-19 note about `Semantic`, `Mesh` and `EventBusShape` "beside the stable primitives" was stale: each now has a tier. No public API changed since the baseline.
- Doc drift found (does not move an audit): README says version 0.14.0 and a peer range of `^0.12.0` (the version is 0.16.0); shutdown wording at README:18 and `semantic.md:358` contradicts 0.12's grace-then-interrupt; `stability.md:21` calls the MESH runtime an "optional peer" while the README (`:107`) says it is a peer dependency; "nine primitives" against 11 namespaces.

**Mesh**
- M2 P→◐ (judgment). Units add a third meaning of "instance": a repeated site's key (`docs/manual/runtime.md:133`), a unit occurrence (`:58`, `:297-305`, `Render.instances`, `instance` on the intent), and a class instance (`:57`).
- E3 stays P, with doc drift: units are "Unreleased (0.15.0)" in `docs/manual/stability.md:21`, "0.15.0 (released)" in `README.md:122`, and the release note `docs/releases/v0.15.md:3` says "Released 2026-10-23 as v0.15.0". These disagree on release state; the tier (Provisional) is stated in all.

**Port**
- H1 F→◐: `inspect(key)` (`port-web/src/port.ts:131-137`) returns the DOM node a part realized, "for devtools", a read that is "not part of the contract". It is a way down to the platform, partial because it is read-only and aimed at devtools.
- H2 N/A→◐: marked (not part of the contract) but a returned `Node` can be mutated, and the doc only asks that it not be. One of the two.
- M2 P stays, with a collision to record: `port/README.md:49` uses "Tier 3" for a primitive author's `layer` entry, which collides with the north star's Tier 3.

## Evidence carried from 10-19, unchanged

T1.1 to T1.3, E1, E2, I1 to I3, D1, D2, C1, C2, X2 and the rest of E3 are as in the [10-19 evidence](./north-star-validation-2026-10-19.md#evidence). The open items inherited from the earlier review (N2, N7, N8, N9, V6, V7, V11, V16, G3) were not re-checked here and still bear on the † results.

## Disagreements between documents (recorded, not resolved)

- Plan §1 gives the ecosystem as "~61" and Valance X1 as "◐→P, judgment"; the weakest-link rule with Valance X1 P makes the ecosystem X1 P (Valance, Mesh, Port all P) and the total 63. Both numbers are stated above.
- Plan §1's Mesh range "82–85" is the M2 judgment call; the P column here takes M2 ◐, so 82.
- The Mesh release state of units (stability page, README, release note) is inconsistent, as above.

## Next measurement

The next measurement is [After Phase A](#after-phase-a), below.

## After Phase A

Re-scored on 2026-10-25 on the `north-star-refinements` branch of the four repos, after the Phase A documentation changes of the [refinements plan](./direction/north-star-refinements.md) §3 (A1 to A12). Only the audits Phase A touched were re-checked (T1.2, T1.3, E2, E3, I1, I2, M1, M2, D2, X1, H1, H2); the rest are as above. Two things were run: the Nexus README's first app (`pnpm exec vitest run tests/readme-first-app.test.ts` in `nexus/`, 1 passed), and a scan of each published Valance entry's exports against the names in `stability.md`. The rest is a static read.

| | 10-25 | After Phase A | Band |
|---|---|---|---|
| **Ecosystem (weakest link)** | 63 | **66** | Needs improvement |
| Port | 88 | 88 | Needs improvement |
| Mesh | 82 | 82 | Needs improvement |
| Nexus | 75 | **80** | Needs improvement |
| Valance | 78 | **76** | Needs improvement |

The goal of Phase A, ecosystem 66, is met, but only by rounding: 64 ÷ 97 = 0.660 (65.98). It rests on one audit moving, T1.3. The plan also expected Valance E3 to reach P (§3, A3); it did not (below). With it the ecosystem would be 69.

### Audit results after Phase A

Cells that differ from the 10-25 table are in **bold**.

| ID | Audit | Eco | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| T1.1 | Zero-config path | ◐ | P | ◐ | P | P |
| T1.2 | Nothing required with a default | ◐ | ◐ | ◐ | P | ◐ |
| T1.3 | Docs lead with Tier 1 | **P** | P | **P** | P | P |
| E1 | Boundaries enforced by a test | P | P | P | P | P |
| E2 | No lifecycle step at Tier 1 | ◐ | P | P | ◐ | ◐ |
| E3 | Every export tiered | ◐ | ◐ | P | P | P |
| I1 | Names say what | ◐ | P | **◐** | ◐ | P |
| I2 | Typed, no stringly or positional coupling | ◐ | ◐ | ◐† | P | P |
| I3 | Command/query separation | P | P | P | P | P |
| M1 | One source of truth, `UI = f(state)` | P | **P** | P | P | P |
| M2 | One term per concept | ◐ | ◐ | **◐** | ◐ | P |
| D1 | View models, not entities | P | P | P | P | P |
| D2 | Wire data can be masked | ◐ | ◐ | – | – | – |
| C1 | Value reaches a deep component without threading | F | F | – | F | – |
| C2 | Channel explicit and checkable | – | – | – | – | – |
| X1 | Opt-in knobs, behavior and performance | P | P | – | P | P |
| X2 | Defaults correct without knobs | P | P | – | P | P |
| H1 | Documented way down to the platform | ◐ | ◐ | – | – | ◐ |
| H2 | Hatch marked and safe | ◐ | **◐** | – | – | ◐ |

Bold without a change of letter: Valance M1 loses "(at risk)"; Nexus I1 and M2 lose their † (re-checked against the glossary).

### What moved, and what did not, with evidence

**Moved**
- **Nexus T1.3 ◐→P.** The README now opens with "Your first app" (`nexus/README.md:3-28`): `State`, one `Command` and `Runtime.make(Layer.empty)`, and nothing else, before the pitch and the Effect/Layer example. It is tested (`nexus/tests/readme-first-app.test.ts`, run above). With every repo at P, the ecosystem's T1.3 is P: this is the one change that moves the ecosystem score.
- **Valance H2 P→◐ (judgment).** Phase A documents a second hatch, `docs/use/platform.md` (A9): wrap the `TargetFactory` that `Web.target` makes and pass it to `mount` or `hydrate`. It is marked (a Tier 3 page, "outside the vocabulary"), and the application state stays authoritative (the wrapper gets `report` only, and state changes only through commands). But the wrapper holds the `container` and the PORT it wraps, so it can write to DOM the PORT owns; the page says such a write "can be overwritten on the next update" (`platform.md:46`), which warns rather than prevents. That is the reading 10-25 gave Port's `inspect` (◐: marked, but the returned node can be mutated). Scored on the weaker of the two documented hatches, so ◐; the CSS hatch alone is still P. The mechanism is not new (FINDINGS Stage 55, 2026-10), so this is a re-judgment of an existing path that Phase A made a documented hatch, not a change in behavior. It is reported as a finding below.

**Re-checked, unchanged**
- **Valance E3 stays ◐.** A3 added rows for every export plan §1 named (`docs/stability.md:44-49`: `snippet`/`isSnippet`, the brands and `derivedOf`, `controlled`/`controlledBoolean`/`textField`, `ManifestError`, `PROTOCOL`/`MAX_LINE`, cli `./schemas/*`). Under the same standard (a value export of an entry whose row lists its names, and not among them), these remain untiered, all present before Phase A: `@valancex/common`'s `SNIPPET` and `isFormField` (`packages/common/src/index.ts:129`, `:163`); `/native`'s `MAX_HREF` (`packages/valance/src/native.ts:18`); `/web/plugin`'s `DEFAULT_DELIVERY` and `HEAD_MARK` (`web-plugin.ts:96`, `:239`); `/replay`'s `FORMAT`, `CHECKPOINT`, `compact`, `sha256`, `applyChanges` and `postTo` (`replay.ts:17`, `:58`, `:63`, `:89`, `:179`, `:600`). Exports covered by an entry-wide row (the `./client`, `./server`, `./desktop`, `./http` entries of `@valancex/common`; `@valancex/router`; `@valancex/style`; `./node` of the CLI; "the PORT table helpers" of `/web`) and types ("and their types") are taken as tiered. Plan §1's list was incomplete; B5's test would find these.
- **Valance M1 P, no longer at risk (judgment).** `V1_CONTRACT.md` §3 now says unit state is held by the framework for each occurrence, "an input to the render, like a scope value, and never application state", not in `handle.state` and not read by an application command (A5). The contract now states what the API holds, so P. The other reading, that unit state is a documented exception to one source of truth, gives ◐ (Valance 74, ecosystem M1 ◐, ecosystem 63); it is recorded, not taken.
- **Valance H1 stays ◐.** `platform.md` documents a real way down (proved in Chromium, FINDINGS Stage 55), but, like the CSS hatch, it reaches the web only: the native host builds its own target (`packages/valance/src/native.ts:201`) and takes no factory, and `Web.run` takes no target (`platform.md:55`). 10-25 scored the CSS hatch ◐ for the same reason.
- **Valance I2 ◐.** The error-identity rule (A6, `V1_CONTRACT.md` §10 and `stability.md:50`) settles one of the 10-19 findings (G3, `code` against `_tag`). `invoke(key: string, …)` and the by-position filling of a bare command's input remain (B3).
- **Valance D2 ◐.** Now documented in both places a reader meets it (`V1_CONTRACT.md` §17, `learn/mounting-and-hydration.md:41`): "Whole state crosses; documented" is the ◐ definition. P needs a masking step (C-3).
- **Valance X1 P**, now with a Tier 2 page (`docs/use/performance.md`, A8): `admit`, `budgets`, `Target.patch`, `ledger`, `earlyInput`.
- **Valance T1.2 ◐.** `learn/first-application.md` derives the manifest with `manifest()` and moves the hand-written `components.json` to an aside (A4), but `define` still requires `view` for one view (B1).
- **Valance and Nexus M2 ◐, I1 ◐ (Nexus).** The shared glossary (`docs/understand/glossary.md`, A12, linked from each repo) names a canonical term for `scope`, `start`, `Host`, the identity fields, unit, occurrence/instance and `Render`. It documents the collisions; it removes none (every rename is deferred, C-4 or 1.0). The audit asks for consistent terms, so ◐ stays, as the plan expected ("M2 kept at ◐").
- **Mesh M2 ◐.** The glossary makes **occurrence** canonical for the unit sense, but `Render.instances` and the intent's `instance` still carry it (glossary, "occurrence and instance": "not done yet"), so the three meanings of "instance" remain in the API.
- **Mesh E3 P**, drift fixed: units are "**Provisional** (0.15.0; Tier 2)" in `docs/manual/stability.md:21`, "Units are **Provisional**" in `README.md:122`, and "Released 2026-10-23 as v0.15.0" in `docs/releases/v0.15.md:3` (A11).
- **Mesh E2 ◐.** `docs/manual/runtime.md:349` now says keeping a render, its version, `release()` and unit state are Tier 2 host duties that Valance does for a Tier 1 author. The steps are still left to whoever embeds the runtime, documented, which is the ◐ definition. Whether E2 applies to a layer with no Tier 1 author is plan §6's open question, not used to raise the score.
- **Port H1 ◐, H2 ◐.** `packages/port-web/README.md` "Leaving the portable layer" documents `inspect(key)`, `payload(event, element)` and an own `WebPrimitives` table, each tiered (A10). The audit's P is "exists and documented", but the same section and `docs/ARCHITECTURE.md:52` say a general hatch is "a direction, not built" and "only partial hatches exist today": `inspect` is a read for devtools. Partial, so ◐. H2: `inspect` is marked ("not part of the contract"), and the returned `Node` can still be changed; the README says changing it "is outside what the PORT keeps true", which warns rather than prevents. One of the two, ◐. Both wait for B6.
- **Port M2 P**, collision removed: the README's "Tier 3" for a `layer` table entry is now "an advanced table entry" (`packages/port-web/README.md:49`). The dated release notes `docs/releases/v0.11.md` and `v0.12.md` keep "Tier 3" in that sense; they are records and are not edited.
- **Nexus I1 ◐.** A2 fixed the doc drift of §1 (version, peer range, shutdown wording at `README.md:45` and `semantic.md:358`, the "optional peer" at `stability.md:21`, and the "nine primitives" now name the two other namespaces). That is accuracy; the overloaded names (`name`/`id`/`_tag`, `Host`, unit) remain.

### Findings (recorded, not resolved)

- **Valance H2 dropped P→◐ under a change that touched it** (A9). The scorecard's first rule is that no touched audit may drop. The drop comes from documenting an existing path, not from new behavior; B6 (a hatch that cannot write Port's slots) restores P. For the owner to decide whether `platform.md` ships before B6.
- **Valance E3:** plan §1's list of untiered exports missed eleven value exports (above). A row for each, or B5's test, moves E3 to P.
- **Port M2:** the dated Port release notes v0.11 and v0.12 use "Tier 3" for a primitive author's table entry, and so does Valance's Layers row (`docs/stability.md:42`, "`layer`, `layerProp`, `layerDismiss`: Tier 3"). Not scored as a collision in the API.

### Blocking the next goals

The Phase A goal is met. Still below P in the ecosystem, by the repo that holds it down: T1.1 (Nexus), T1.2 (Valance, Nexus, Port), E2 (Mesh, Port), E3 (Valance), I1 (Nexus, Mesh), I2 (Valance, Nexus), M2 (Valance, Nexus, Mesh), D2 (Valance), C1 F (Valance, Mesh), H1 (Valance, Port), H2 (Valance, Port).

### Arithmetic after Phase A

**Valance** (divisor 97). T1: 8 + 3 + 6 = 17. Encapsulation: 8 + 7 + 2.5 = 17.5. Intention: 5 + 2.5 + 5 = 12.5. Mental model: 5 + 2.5 = 7.5. Data: 6 + 2 = 8. Context: 0. Tier 2: 8. Tier 3: H1 2 + H2 1.5 = 3.5. Sum 74. 74 ÷ 97 = 0.763, so **76**.

**Nexus** (divisor 71). T1: 4 + 3 + 6 = 13. Encapsulation: 20. Intention: 10. Mental model: 7.5. Data: 6. Sum 56.5. 56.5 ÷ 71 = 0.796, so **80**.

**Mesh** (divisor 86): unchanged, 70.5 ÷ 86 = 0.820, so **82**.

**Port** (divisor 86): unchanged, 76 ÷ 86 = 0.884, so **88**.

**Ecosystem** (divisor 97). T1: 4 + 3 + 6 = 13. Encapsulation: 8 + 3.5 + 2.5 = 14. Intention: 10. Mental model: 7.5. Data: 8. Context: 0. Tier 2: 8. Tier 3: 2 + 1.5 = 3.5. Sum 64. 64 ÷ 97 = 0.660, so **66**.

### By category after Phase A

| Category | Weight | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| Tier 1: minimal surface | 20 | 65 | 85 | 65 | 100 | 85 |
| Encapsulation | 20 | 70 | 88 | 100 | 83 | 83 |
| Intention and contracts | 15 | 67 | 83 | 67 | 83 | 100 |
| Mental model | 10 | 75 | 75 | 75 | 75 | 100 |
| Data boundary | 10 | 80 | 80 | 100 | 100 | 100 |
| Context | 10 | 0 | 0 | n/a | 0 | n/a |
| Tier 2: opt-in tuning | 8 | 100 | 100 | n/a | 100 | 100 |
| Tier 3: hatches | 7 | 50 | 50 | n/a | n/a | 50 |

## Appendix: arithmetic

Score = 100 × Σ(weight × result) ÷ Σ(weights of applicable audits). P = 1, ◐ = 0.5, F = 0.

Weights: T1.1 8, T1.2 6, T1.3 6, E1 8, E2 7, E3 5, I1 5, I2 5, I3 5, M1 5, M2 5, D1 6, D2 4, C1 7, C2 3, X1 4, X2 4, H1 4, H2 3.

**Valance.** Not applicable: C2 (3), so the divisor is 97.
T1: 8 + 3 + 6 = 17. Encapsulation: 8 + 7 + 2.5 = 17.5. Intention: 5 + 2.5 + 5 = 12.5. Mental model: 5 + 2.5 = 7.5. Data: 6 + 2 = 8. Context: C1 0. Tier 2: 4 + 4 = 8. Tier 3: H1 2 + H2 3 = 5.
Sum 17 + 17.5 + 12.5 + 7.5 + 8 + 0 + 8 + 5 = 75.5. 75.5 ÷ 97 = 0.778, so **78**.

**Nexus.** Owns T1.x, E1 to E3, I1 to I3, M1, M2, D1; divisor 8 + 6 + 6 + 8 + 7 + 5 + 5 + 5 + 5 + 5 + 5 + 6 = 71.
T1: 4 + 3 + 3 = 10. Encapsulation: 8 + 7 + 5 = 20. Intention: 2.5 + 2.5 + 5 = 10. Mental model: 5 + 2.5 = 7.5. Data: D1 6.
Sum 53.5. 53.5 ÷ 71 = 0.754, so **75**. (10-19: E3 at 2.5 gives 51 ÷ 71 = 0.718, 72.)

**Mesh.** Not applicable: D2 (4), C2 (3), H1 (4), H2 (3); divisor 86.
T1: 8 + 6 + 6 = 20. Encapsulation: 8 + 3.5 + 5 = 16.5. Intention: 2.5 + 5 + 5 = 12.5. Mental model: 5 + 2.5 = 7.5. Data: D1 6. Context: C1 0. Tier 2: 8.
Sum 20 + 16.5 + 12.5 + 7.5 + 6 + 0 + 8 = 70.5. 70.5 ÷ 86 = 0.820, so **82**. (10-19: M2 P gives 73 ÷ 86 = 0.849, 85.)

**Port.** Not applicable: D2 (4), C1 (7), C2 (3); divisor 86.
T1: 8 + 3 + 6 = 17. Encapsulation: 8 + 3.5 + 5 = 16.5. Intention: 15. Mental model: 10. Data: D1 6. Tier 2: 8. Tier 3: H1 2 + H2 1.5 = 3.5.
Sum 17 + 16.5 + 15 + 10 + 6 + 8 + 3.5 = 76. 76 ÷ 86 = 0.884, so **88**.

**Ecosystem (lowest result per audit).** Not applicable: C2 (3), divisor 97.
T1: 4 + 3 + 3 = 10 (all ◐ through Nexus). Encapsulation: 8 + 3.5 + 2.5 = 14. Intention: I1 2.5, I2 2.5, I3 5 = 10. Mental model: 5 + 2.5 = 7.5. Data: 6 + 2 = 8. Context: 0. Tier 2: 4 + 4 = 8. Tier 3: H1 ◐ 2, H2 ◐ (Port) 1.5 = 3.5.
Sum 10 + 14 + 10 + 7.5 + 8 + 0 + 8 + 3.5 = 61. 61 ÷ 97 = 0.629, so **63**. With X1 at ◐ (the plan's reading) the sum is 59 and 59 ÷ 97 = 0.608, so 61.

**Category percentages** are category points ÷ category weight over applicable audits, rounded half up (for example Valance Encapsulation 17.5 ÷ 20 = 88; Port Tier 3 3.5 ÷ 7 = 50; Valance Tier 3 5 ÷ 7 = 71; Valance Context 0 ÷ 7 = 0 because C2 is N/A).
