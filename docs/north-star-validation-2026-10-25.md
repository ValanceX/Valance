# North star measurement: ecosystem compliance on 2026-10-25

A record of the current state, scored with the [scorecard](./NORTH_STAR_SCORECARD.md) against the [design north star](./DESIGN_NORTH_STAR.md), before any refinement is made. It records what is, and recommends nothing. Its last sections, [After Phase A](#after-phase-a), [After Phase B](#after-phase-b), [After Phase B iteration](#after-phase-b-iteration) and [After Phase C](#after-phase-c), re-score the audits the refinements touched; After Phase C re-scores all 19 and gives the final scores (ecosystem 88 on the branch, 74 without the unreleased packs). It is compared to the [2026-10-19 baseline](./north-star-validation-2026-10-19.md); the changes it prepares are in [north star refinements](./direction/north-star-refinements.md) §1.

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
| **Ecosystem (weakest link)** | 63 | **69** | Needs improvement |
| Port | 88 | 88 | Needs improvement |
| Mesh | 82 | 82 | Needs improvement |
| Nexus | 75 | **80** | Needs improvement |
| Valance | 78 | **79** | Needs improvement |

The goal of Phase A, ecosystem 66, is met: 66.5 ÷ 97 = 0.686, so 69. Two audits move it, T1.3 (Nexus) and E3 (Valance, after the stability sweep of `5d76068`). The margin is small: without E3 it is 66 only by rounding (64 ÷ 97 = 0.660, 65.98), without T1.3 it is 65 (63.5 ÷ 97 = 0.655), and the other reading of Valance M1 (◐, below) gives 66 (64 ÷ 97).

### Audit results after Phase A

Cells that differ from the 10-25 table are in **bold**.

| ID | Audit | Eco | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| T1.1 | Zero-config path | ◐ | P | ◐ | P | P |
| T1.2 | Nothing required with a default | ◐ | ◐ | ◐ | P | ◐ |
| T1.3 | Docs lead with Tier 1 | **P** | P | **P** | P | P |
| E1 | Boundaries enforced by a test | P | P | P | P | P |
| E2 | No lifecycle step at Tier 1 | ◐ | P | P | ◐ | ◐ |
| E3 | Every export tiered | **P** | **P** | P | P | P |
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
- **Nexus T1.3 ◐→P.** The README now opens with "Your first app" (`nexus/README.md:3-28`): `State`, one `Command` and `Runtime.make(Layer.empty)`, and nothing else, before the pitch and the Effect/Layer example. It is tested (`nexus/tests/readme-first-app.test.ts`, run above). With every repo at P, the ecosystem's T1.3 is P.
- **Valance E3 ◐→P.** A3 added rows for every export plan §1 named (`docs/stability.md:44-49`). Plan §1's list was incomplete: eleven value exports, all present before Phase A, still had no row (`SNIPPET`, `isFormField`, `MAX_HREF`, `DEFAULT_DELIVERY`, `HEAD_MARK`, and `/replay`'s `FORMAT`, `CHECKPOINT`, `compact`, `sha256`, `applyChanges`, `postTo`). Commit `5d76068` gives each a row (`docs/stability.md:45`, `:51-53`) and sweeps the rest: `/web`'s re-exports and types, `@valancex/common/http` and `/server`, the CLI's `./node`, `@valancex/style`'s helpers, `@valancex/router`'s `RouteDefinitionError`/`RouteState`, and the private `@valancex/primitives` (not a public API). A re-scan of every published entry's value exports against `stability.md` finds two names not written in any row, `@valancex/common/desktop`'s `assetPath` and `withAssets` (`packages/common/src/desktop.ts`). They are tiered by the entry-wide row "`@valancex/common/desktop` … **Provisional**" (`docs/stability.md:27`), which lists no names and so covers the entry, so every export is tiered: P. (The error-identity row, `:50`, moved from Stable to Provisional in the same commit; it is still tiered.)
- **Valance H2 P→◐ (judgment).** Phase A documents a second hatch, `docs/use/platform.md` (A9): wrap the `TargetFactory` that `Web.target` makes and pass it to `mount` or `hydrate`. It is marked: a Tier 3 page, and since `5d76068` it says "This is Tier 3 and it is unprotected" (`platform.md:43`), naming what is safe (reading the DOM, `focus`, writing only nodes the PORT does not own). The application state stays authoritative (the wrapper gets `report` only, and state changes only through commands). But the wrapper holds the `container` and the PORT it wraps, so it can still write to DOM the PORT owns: "the next `update` may overwrite what you wrote, a hydration may not adopt it, and nothing checks it". Marking it does not prevent it. That is the reading 10-25 gave Port's `inspect` (◐: marked, but the returned node can be mutated). Scored on the weaker of the two documented hatches, so ◐; the CSS hatch alone is still P. The mechanism is not new (FINDINGS Stage 55, 2026-10), so this is a re-judgment of an existing path that Phase A made a documented hatch, not a change in behavior. It is reported as a finding below.

**Re-checked, unchanged**
- **Valance M1 P, no longer at risk (judgment).** `V1_CONTRACT.md` §3 now says unit state is held by the framework for each occurrence, "an input to the render, like a scope value, and never application state", not in `handle.state` and not read by an application command (A5). The contract now states what the API holds, so P. The other reading, that unit state is a documented exception to one source of truth, gives ◐ (Valance 76, ecosystem M1 ◐, ecosystem 66); it is recorded, not taken.
- **Valance H1 stays ◐.** `platform.md` documents a real way down (proved in Chromium, FINDINGS Stage 55), but, like the CSS hatch, it reaches the web only: the native host builds its own target (`packages/valance/src/native.ts:201`) and takes no factory, and `Web.run` takes no target (`platform.md:57`). 10-25 scored the CSS hatch ◐ for the same reason.
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

- **For the owner: Valance H2 dropped P→◐ under a change that touched it** (A9). The scorecard's first rule is that no touched audit may drop. The drop comes from documenting an existing path as a hatch, not from new behavior, and `5d76068` marks it as unprotected; marking does not make it safe. The planned B6 (a `native` hatch that gives a callback no dispatch and whose slots PORT re-asserts, proved by a test) restores P. The owner decides whether `platform.md` ships before B6.
- **Valance E3:** plan §1's list of untiered exports was incomplete; `5d76068` closed it. Nothing yet fails when a new export has no row; B5's test would keep E3 at P.
- **Port M2:** the dated Port release notes v0.11 and v0.12 use "Tier 3" for a primitive author's table entry, (Valance's Layers row, `docs/stability.md:42`, no longer does since `5d76068`). Not scored as a collision in the API.

### Blocking the next goals

The Phase A goal is met. Still below P in the ecosystem, by the repo that holds it down: T1.1 (Nexus), T1.2 (Valance, Nexus, Port), E2 (Mesh, Port), I1 (Nexus, Mesh), I2 (Valance, Nexus), M2 (Valance, Nexus, Mesh), D2 (Valance), C1 F (Valance, Mesh), H1 (Valance, Port), H2 (Valance, Port).

### Arithmetic after Phase A

**Valance** (divisor 97). T1: 8 + 3 + 6 = 17. Encapsulation: 8 + 7 + 5 = 20. Intention: 5 + 2.5 + 5 = 12.5. Mental model: 5 + 2.5 = 7.5. Data: 6 + 2 = 8. Context: 0. Tier 2: 8. Tier 3: H1 2 + H2 1.5 = 3.5. Sum 76.5. 76.5 ÷ 97 = 0.789, so **79**.

**Nexus** (divisor 71). T1: 4 + 3 + 6 = 13. Encapsulation: 20. Intention: 10. Mental model: 7.5. Data: 6. Sum 56.5. 56.5 ÷ 71 = 0.796, so **80**.

**Mesh** (divisor 86): unchanged, 70.5 ÷ 86 = 0.820, so **82**.

**Port** (divisor 86): unchanged, 76 ÷ 86 = 0.884, so **88**.

**Ecosystem** (divisor 97). T1: 4 + 3 + 6 = 13. Encapsulation: 8 + 3.5 + 5 = 16.5. Intention: 10. Mental model: 7.5. Data: 8. Context: 0. Tier 2: 8. Tier 3: 2 + 1.5 = 3.5. Sum 66.5. 66.5 ÷ 97 = 0.686, so **69**.

### By category after Phase A

| Category | Weight | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| Tier 1: minimal surface | 20 | 65 | 85 | 65 | 100 | 85 |
| Encapsulation | 20 | 83 | 100 | 100 | 83 | 83 |
| Intention and contracts | 15 | 67 | 83 | 67 | 83 | 100 |
| Mental model | 10 | 75 | 75 | 75 | 75 | 100 |
| Data boundary | 10 | 80 | 80 | 100 | 100 | 100 |
| Context | 10 | 0 | 0 | n/a | 0 | n/a |
| Tier 2: opt-in tuning | 8 | 100 | 100 | n/a | 100 | 100 |
| Tier 3: hatches | 7 | 50 | 50 | n/a | n/a | 50 |

## After Phase B

Re-scored on 2026-10-26 on the `north-star-refinements` branch, after the Phase B additive API of the [refinements plan](./direction/north-star-refinements.md) §4: B1 (`define` without `view`), B3 (`invoke` keys, `command-argument-order`, typed `resolve`), B5 (stability coverage test) and B6b (`Web.run`'s `native` and `target`) in Valance; B2 (defaults, `examples/hello`) and B4 (transforming schemas, validated `subscribe`, `cause`) in Nexus; B6a (the native hatch, `opaque`) in Port. Mesh did not change. Only the audits Phase B touched were re-checked (T1.1, T1.2, E2, E3, I2, H1, H2); the rest are as after Phase A. Run: in `valance/packages/valance`, `npx vitest run test/stability-coverage.test.ts test/define-default-view.test.ts test/invoke-keys.test.ts` (29 passed); in `valance/examples/todo`, `npx vitest run test/native-hatch.test.ts` (4 passed); in `nexus/`, `npx vitest run examples/hello tests/readme-first-app.test.ts tests/defaults.test.ts` (4 passed); in `port/packages/port-web`, `npx vitest run native` (17 passed). The rest is a static read.

| | After Phase A | After Phase B | Band |
|---|---|---|---|
| **Ecosystem (weakest link)** | 69 | **72** | Needs improvement |
| Port | 88 | **92** | Good |
| Valance | 79 | **86** | Needs improvement |
| Nexus | 80 | **84** | Needs improvement |
| Mesh | 82 | 82 | Needs improvement |

**The Phase B goal, ecosystem 77, is not met**: 70 ÷ 97 = 0.722, so 72. The plan's §6 estimate of ~77 lists only C1/C2 and D2 as the gaps left after Phase B, but T1.1 (Nexus), T1.2 (Port), E2 (Mesh, Port), I1, I2 and M2 are still ◐ in the ecosystem, and §6 itself expects T1.1, T1.2, E2, I1 and M2 to stay ◐ after Phase C. See [Blocking the Phase B goal](#blocking-the-phase-b-goal).

These scores take the controller's rulings for H1 and H2 (below). The stricter reading of H2 that Phase A used (score the weaker of the documented hatches) gives Valance 84, Port 91 and the ecosystem 71.

**Unreleased upstream.** Valance's H1 and H2 count `Web.run`'s `native`, which works only with the PORT Web from Port's branch, installed here from a local pack (`5a6fc77`, `DO NOT MERGE BEFORE THE RELEASES`). Without that pack, on released PORT, `native` is not there, so only `target` counts: Valance H2 is ◐ (Valance 84, ecosystem 71), and H1 stays P under the Web-only ruling. Every other result here reads code on each repo's own branch, with no dependency on another repo's unreleased version.

### Audit results after Phase B

Cells that differ from the After Phase A table are in **bold**.

| ID | Audit | Eco | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| T1.1 | Zero-config path | ◐ | P | ◐ | P | P |
| T1.2 | Nothing required with a default | ◐ | **P** | **P** | P | ◐ |
| T1.3 | Docs lead with Tier 1 | P | P | P | P | P |
| E1 | Boundaries enforced by a test | P | P | P | P | P |
| E2 | No lifecycle step at Tier 1 | ◐ | P | P | ◐ | ◐ |
| E3 | Every export tiered | P | P | P | P | P |
| I1 | Names say what | ◐ | P | ◐ | ◐ | P |
| I2 | Typed, no stringly or positional coupling | ◐ | ◐ | **◐** | P | P |
| I3 | Command/query separation | P | P | P | P | P |
| M1 | One source of truth, `UI = f(state)` | P | P | P | P | P |
| M2 | One term per concept | ◐ | ◐ | ◐ | ◐ | P |
| D1 | View models, not entities | P | P | P | P | P |
| D2 | Wire data can be masked | ◐ | ◐ | – | – | – |
| C1 | Value reaches a deep component without threading | F | F | – | F | – |
| C2 | Channel explicit and checkable | – | – | – | – | – |
| X1 | Opt-in knobs, behavior and performance | P | P | – | P | P |
| X2 | Defaults correct without knobs | P | P | – | P | P |
| H1 | Documented way down to the platform | **P** | **P** | – | – | **P** |
| H2 | Hatch marked and safe | **P** | **P** | – | – | **P** |

Bold without a change of letter: Nexus I2 loses its † (re-checked after B4).

### What moved, and what did not, with evidence

**Moved**
- **Valance T1.2 ◐→P.** `define`'s `view` is optional when `views` has one entry, and is then that view (`packages/valance/src/index.ts:128-143`); with no view or several, a JS caller gets `missing-view` instead of a later "not a function". `learn/first-application.md` §3 drops `view`. With A4's derived manifest, the first application's required inputs are `name`, state, views and commands, and for `Web.run` `container` and `present`. `present` is required on purpose ("Explicit, and never inferred", `packages/valance/src/web.ts:433-437`), and `primitives` is optional (`:431`). Each is essential to the task, so P. Test: `test/define-default-view.test.ts`.
- **Nexus T1.2 ◐→P.** `Runtime.make()` takes no layer (`nexus/src/runtime/index.ts:40-44`), and `Application.define({ name })` takes no `runtime` (`src/application/index.ts:86-90`), both through overloads, so `R` is `never` and is never inferred. The README's first app (`nexus/README.md:5-28`) and `examples/hello` need no Service, Layer or Resource. What is left is a state schema and initial value, a command name, its input schema and its handler: essential. One reading for the record: a command with no input still passes `Schema.Struct({})`, an obvious default. Not taken, because the first app's command takes input. That reading would give Nexus 80.
- **Valance H1 ◐→P (ruling).** `docs/use/platform.md:7-14` documents two ways down from `Web.run`, `native` (PORT Web's hatch, passed through unread, `packages/valance/src/web.ts:450-455`) and `target` (a wrapper of run's own factory, so run keeps the `Mounted`, the URL policy and `stop`, `:456-461`). Both are tested through `Web.run`, including hydration (`examples/todo/test/native-hatch.test.ts`). Phase A held H1 at ◐ because the hatches are Web only. The controller's ruling is that Web only is fine for H1: `platform.md` says so, and a desktop parallel waits for evidence (Port ROADMAP §2.8). This changes how Phase A read the audit, not only the code, and is recorded as such.
- **Valance H2 ◐→P (ruling, partly disputed).** The page leads with `native` (`platform.md:16-41`). It is marked (Tier 3, Provisional, types from a separate subpath), it gets no `report` or dispatch, the PORT writes back every slot it owns on the element on its next write, and only an `opaque` primitive gives the callback its content. So it visibly leaves the portable layer and state stays authoritative: P on the hatch the docs lead with. `target` is unchanged from Phase A: marked "Tier 3 and it is unprotected" (`platform.md:65`), and it can still write DOM the PORT owns, with nothing to restore it. The literal P wording holds even for `target` if "state" means the application's state, because the wrapper only passes `report` on and state changes only through commands. It fails if, as Phase A read it, the PORT's drawn DOM is framework state too. Phase A scored the weaker hatch and gave ◐. The ruling scores the hatch the docs lead with. **Disagreement recorded:** nothing about `target` changed. What lifts the cell is the rule for choosing which hatch to score. On Phase A's rule Valance H2 stays ◐ (Valance 84, ecosystem 71).
- **Port H1 ◐→P.** `createWebPort`'s `native` option and the `@valancex/port-web/native` subpath are built and documented (`packages/port-web/README.md`, "The native hatch", `:185-192`; `docs/ARCHITECTURE.md:52` "*(built: Provisional, Web)*"; `docs/stability.md:20`). Port Web is a Web PORT, so Web only is the whole of its target.
- **Port H2 ◐→P (ruling).** The hatch the README leads with is marked (a subpath that the client and server entries do not re-export) and keeps state authoritative: no report or dispatch, owned slots re-asserted at the end of every `update` and `patch` (tested, `test/native.test.ts:214`), `opaque` refused with children (`opaque-children`), and layers never opaque. What the README leaves to the author is stated: text-run children of a hatched element and the PORT's other elements, reached through the DOM, are not re-asserted, so "leave them alone" (`README.md:190`). Strictly, that is the same kind of gap as `target`, smaller in scope. `inspect(key)` still returns a node that can be mutated (Phase A's ◐), but it is a devtools read, "Not part of the contract" (`docs/stability.md:21`), and is not offered as a way down. On Phase A's weaker-hatch rule Port H2 stays ◐ (Port 91).

**Re-checked, unchanged**
- **Valance I2 ◐ (agree with the implementer).** `invoke(key: K | (string & {}), args: ReadonlyArray<IntentArgument>)` (`packages/valance/src/index.ts:408`): keys are completed, not checked, so a typo still type-checks. The arguments are untyped `IntentArgument`s. A bare command's input is still filled by position, and `command-argument-order` only warns (`packages/cli/src/argument-order.ts`). The typed `resolve` id (`packages/common/src/index.ts:306-309`) removes one untyped key. That still leaves "some untyped keys … position-dependent mapping", so ◐. P needs an opt-in strict handle (typo-checked keys, typed arguments per key), or name-based binding.
- **Nexus I2 ◐ (re-checked, † dropped).** B4 settles N9: `Command.define` and `Event.define` take `Schema.Schema<A, I>` (`nexus/src/command/index.ts:20`, `src/event/index.ts:14`), and `CommandValidationError.cause` carries the `ParseError`. N2 is only mitigated: `subscribe` still matches on the `_tag` string, and on the default path it casts the payload (`src/event/index.ts:60`, `payload as Payload`). `docs/primitives/event.md:88`: "Two `EventDef`s with the same tag receive each other's payloads, unvalidated unless `{ validate: true }` is passed." The checked path is opt-in, and the default keeps a cast that a tag collision makes unsound, so ◐. The Nexus v0.17 release note says "I2 ◐→P (with Valance B3)". **Disagreement recorded.** P needs a tag-uniqueness check (at `define` or at runtime) or a validated default.
- **Nexus T1.1 ◐.** The first app is one program, but it needs Effect (`Effect.Do`, `bind`, `runPromise`, `scoped`), `Schema`, `State`, `Command` and `Runtime` before it prints. That is "several concepts", not "one documented call, no prior concepts". Plan §6 also expects T1.1 ◐ after Phase C ("Nexus needs Schema/State/Command"). `examples/hello` is the same program through `Application`.
- **Nexus E2 P.** The defaults add no step: `Runtime.make()` still ties the runtime to the caller's `Scope`, and nothing new is called by hand.
- **Valance E2 P.** A `native` callback's cleanup is Tier 3 and is run by the PORT. A Tier 1 author drives nothing new.
- **Valance E3 P, now enforced.** `test/stability-coverage.test.ts` fails when a value export of a published entry is not named in its row, and it passes. The new names are tiered: `LibraryComponentIds` and `ResolveId` (`docs/stability.md:30`), `ApplicationHandle<S, E, K>` (`:16`), the two `Web.run` options (Provisional row), and `missing-view` (`docs/use/README.md:24`). Port's and Nexus's new surfaces have rows (`port/docs/stability.md:20`, `nexus/docs/stability.md`, the 0.17.0 row).
- **Port T1.2 ◐.** `primitives` is still required with no default table. This is decision C-2, and contested.
- **Mesh:** no change on the branch since Phase A.

### Blocking the Phase B goal

77 needs 74.2 of 97 points (0.765 rounds to 77). The ecosystem has 70. The audits holding it below P, by the repo that holds each one down, and what P would add:

| Audit | Held down by | Points to P | Lifted by |
|---|---|---|---|
| C1 (F) | Valance, Mesh | 7 (and C2 becomes applicable: +3 points, +3 divisor) | **C-1** context channel |
| T1.1 | Nexus | 4 | nothing planned (§6 keeps it ◐) |
| E2 | Mesh, Port | 3.5 | nothing planned (◐ by design, §5) |
| T1.2 | Port | 3 | **C-2**, only if the opt-in vocabulary is accepted as P (contested) |
| I2 | Valance, Nexus | 2.5 | not in Phase C: a strict `invoke` handle (Valance) and a tag-uniqueness check or a validated default (Nexus), both together |
| I1 | Nexus, Mesh | 2.5 | 1.0 renames |
| M2 | Valance, Nexus, Mesh | 2.5 | 1.0 renames (C-4 removes Mesh's collision, not the others) |
| D2 | Valance | 2 | **C-3** `Schema.Redacted` |

No single Phase B audit closes the gap of 4.2. The cheapest lifts outside Phase C are two together: I2 and T1.2 (75.5 ÷ 97, 78), or I2 and T1.1 (76.5 ÷ 97, 79). In Phase C, **C-1 alone meets 77**: (70 + 7 + 3) ÷ 100 = 80. With C-3 that is 82, and with C-2 taken as P, 85 (§6's estimate). On the strict H2 reading (69 ÷ 97, 71), C-1 alone gives 79 and all three C items give 84.

### Arithmetic after Phase B

**Valance** (divisor 97). T1: 8 + 6 + 6 = 20. Encapsulation: 8 + 7 + 5 = 20. Intention: 5 + 2.5 + 5 = 12.5. Mental model: 5 + 2.5 = 7.5. Data: 6 + 2 = 8. Context: 0. Tier 2: 8. Tier 3: H1 4 + H2 3 = 7. Sum 83. 83 ÷ 97 = 0.856, so **86**. (H2 ◐: 81.5 ÷ 97 = 0.840, 84.)

**Nexus** (divisor 71). T1: 4 + 6 + 6 = 16. Encapsulation: 20. Intention: 2.5 + 2.5 + 5 = 10. Mental model: 7.5. Data: 6. Sum 59.5. 59.5 ÷ 71 = 0.838, so **84**. (T1.2 ◐: 56.5 ÷ 71, 80. I2 P: 62 ÷ 71, 87.)

**Mesh** (divisor 86): unchanged, 70.5 ÷ 86 = 0.820, so **82**.

**Port** (divisor 86). T1: 17. Encapsulation: 16.5. Intention: 15. Mental model: 10. Data: 6. Tier 2: 8. Tier 3: 4 + 3 = 7. Sum 79.5. 79.5 ÷ 86 = 0.924, so **92**. (H2 ◐: 78 ÷ 86 = 0.907, 91.)

**Ecosystem** (divisor 97). T1: 4 + 3 + 6 = 13. Encapsulation: 8 + 3.5 + 5 = 16.5. Intention: 2.5 + 2.5 + 5 = 10. Mental model: 7.5. Data: 8. Context: 0. Tier 2: 8. Tier 3: 4 + 3 = 7. Sum 70. 70 ÷ 97 = 0.722, so **72**. (H2 ◐: 68.5 ÷ 97 = 0.706, 71.)

### By category after Phase B

| Category | Weight | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| Tier 1: minimal surface | 20 | 65 | 100 | 80 | 100 | 85 |
| Encapsulation | 20 | 83 | 100 | 100 | 83 | 83 |
| Intention and contracts | 15 | 67 | 83 | 67 | 83 | 100 |
| Mental model | 10 | 75 | 75 | 75 | 75 | 100 |
| Data boundary | 10 | 80 | 80 | 100 | 100 | 100 |
| Context | 10 | 0 | 0 | n/a | 0 | n/a |
| Tier 2: opt-in tuning | 8 | 100 | 100 | n/a | 100 | 100 |
| Tier 3: hatches | 7 | 100 | 100 | n/a | n/a | 100 |

## After Phase B iteration

Re-scored on 2026-10-30 on the `north-star-refinements` branch, after the Phase B iteration that followed the [After Phase B](#after-phase-b) score of 72: in Mesh, the screen (`openScreen`, `9e3034f`, `f068e61`) and argument names on the command intent (`6ab1180`, `2a523d1`); in Port, `composeWebPort` (`bc9b378`); in Nexus, the refusal of a second `EventDef` with a tag already used in the runtime (`82bc0ee`, `0adb181`); in Valance, the opt-in `handle.command(key, input)` (`4571553`) and named binding of a bare command's arguments (`25f151a`, `7596375`, `596a4e7`), with `command-argument-order` narrowed to the positional case (Valance `docs/releases/v0.16.md`). Re-checked: E2 and I2 in every repo, and I1, M2 and T1.2 where the new names and options touch them; the rest are as after Phase B. Run: in `nexus/`, `npx vitest run tests/event.test.ts` (14 passed); in `mesh/packages/mesh-runtime`, `node --test test/screen.test.mjs` (14 passed); in `port/packages/port-web`, `npx vitest run compose` (13 passed); in `valance/packages/valance`, `npx vitest run test/named-binding.test.ts test/command-keys.test.ts test/invoke-keys.test.ts` (15 passed); in `valance/packages/cli`, `npx vitest run test/argument-order.test.ts` (4 passed). The rest is a static read. The reviewers' verdicts (Mesh E2 P, Port E2 P, Nexus I2 P, Valance I2 P) were checked against the code and the scorecard's wording, not taken as given.

| | After Phase B | After Phase B iteration | Band |
|---|---|---|---|
| **Ecosystem (weakest link)** | 72 | **78** | Needs improvement |
| Port | 92 | **97** | Good |
| Valance | 86 | **88** | Needs improvement |
| Nexus | 84 | **87** | Needs improvement |
| Mesh | 82 | **86** | Needs improvement |

**The Phase B goal, ecosystem 77, is met on the branch**: 76 ÷ 97 = 0.784, so 78. It is met only with the DO-NOT-MERGE packs: without them it is 71 (below). Two audits move it: E2 (Mesh and Port to P, so every repo is P) and I2 (Valance and Nexus to P, so every repo is P).

| Reading | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|
| With the packs, H2 on the hatch the docs lead with (the ruling) | **78** | 88 | 87 | 86 | 97 |
| With the packs, strict H2 (the weaker documented hatch) | **77** | 87 | 87 | 86 | 95 |
| Without the packs, leading-hatch H2 | 71 | 84 | 87 | 86 | 92 |
| Without the packs, strict H2 | 71 | 84 | 87 | 86 | 91 |

On the strict H2 reading the goal is met by rounding only: 74.5 ÷ 97 = 0.768, 76.8, so 77.

**Unreleased upstream.** Three cells count code that another repo has not released, each installed from a local pack in a commit titled `DO NOT MERGE BEFORE THE RELEASES`:
- **Valance I2** counts named binding, which needs `IntentArgument.name` from the Mesh runtime on Mesh's branch (`7d9f2ed`, packed from mesh `2a523d1`). With released `@valancex/mesh-runtime` 0.17.0 no argument has a name, the binding is positional as in 0.15 (`docs/releases/v0.16.md`, "A bare command binds by name"), and Valance I2 is ◐ (`handle.command` alone does not lift it, below).
- **Port E2** counts `composeWebPort`, which takes a Mesh screen. The helper imports nothing from Mesh (`packages/port-web/src/compose.ts`, structural `ComposedScreen`), but no released Mesh has `openScreen` (`port/CHANGELOG.md`: "it needs a Mesh with `openScreen` (not in 0.17.0)"); its tests run against `2d65e20`. Without it a Port author drives `draw`/`patch` and releases renders, so Port E2 is ◐.
- **Valance H2** counts `Web.run`'s `native` (`5a6fc77`, the PORT Web pack), as after Phase B.

Mesh's and Nexus's cells read only their own branch. Since the ecosystem's E2 is held by Port and its I2 by Valance, without the packs neither moves and the ecosystem is the After Phase B figure without its pack, 71. **Releasing Mesh alone** (the screen and the argument names) lifts Port E2 and Valance I2 and gives 74.5 ÷ 97, **77**; releasing PORT Web's `native` as well gives 78. Each downstream release also needs the peer floor moved (Valance's `@valancex/mesh-runtime` and `@valancex/port-web` ranges; Task 29 M2 and Task 14, deferred to release).

### Audit results after Phase B iteration

Cells that differ from the After Phase B table are in **bold**.

| ID | Audit | Eco | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| T1.1 | Zero-config path | ◐ | P | ◐ | P | P |
| T1.2 | Nothing required with a default | ◐ | P | P | P | ◐ |
| T1.3 | Docs lead with Tier 1 | P | P | P | P | P |
| E1 | Boundaries enforced by a test | P | P | P | P | P |
| E2 | No lifecycle step at Tier 1 | **P** | P | P | **P** | **P** |
| E3 | Every export tiered | P | P | P | P | P |
| I1 | Names say what | ◐ | P | ◐ | ◐ | P |
| I2 | Typed, no stringly or positional coupling | **P** | **P** | **P** | P | P |
| I3 | Command/query separation | P | P | P | P | P |
| M1 | One source of truth, `UI = f(state)` | P | P | P | P | P |
| M2 | One term per concept | ◐ | ◐ | ◐ | ◐ | P |
| D1 | View models, not entities | P | P | P | P | P |
| D2 | Wire data can be masked | ◐ | ◐ | – | – | – |
| C1 | Value reaches a deep component without threading | F | F | – | F | – |
| C2 | Channel explicit and checkable | – | – | – | – | – |
| X1 | Opt-in knobs, behavior and performance | P | P | – | P | P |
| X2 | Defaults correct without knobs | P | P | – | P | P |
| H1 | Documented way down to the platform | P | P | – | – | P |
| H2 | Hatch marked and safe | P | P | – | – | P |

### What moved, and what did not, with evidence

**Moved**
- **Mesh E2 ◐→P (agree with the re-reviewer).** `openScreen({ program, model, transitions? })` (`packages/mesh-runtime/src/screen.ts`) keeps the render on screen and its snapshot, releases the one before it once its patches are given, holds the occurrences' unit state, runs a unit command's transition and does its `raise`. Its caller only calls `show(snapshot)` and `dispatch(handler, payload?)`; `close()` ends the screen as closing a scope ends a Valance application, not a step of the mechanism. `docs/manual/runtime.md` leads with it ("Showing a program", `:15-42`), renames the old section "The host by hand (Tier 2)" (`:62`) and says the duties are Tier 2 and a Tier 1 author never meets them (`:393`); the package README's quick start uses it (`packages/mesh-runtime/README.md:5-22`). Tiered Provisional, Tier 1 (`docs/manual/stability.md:30`). Tests: `test/screen.test.mjs` (14, including one render kept in the module, release after the patches, and a trap). Checked against the one gap: the screen is JavaScript only, and a Rust host still keeps the `Render` it drew and passes it to `update` (`runtime.md:42`). That is holding a value, not a release or flush step (Rust frees a render when it is dropped), and the Tier 1 path of the published package is the JavaScript one, so P. A stricter reading, that keeping the previous render in Rust is an update step, would keep Mesh ◐ (Mesh 82; ecosystem unchanged, since Port also holds E2).
- **Port E2 ◐→P (agree with the reviewer; with the pack).** `composeWebPort({ screen, container, primitives, onIntent })` (`packages/port-web/src/compose.ts`) chooses `draw` or `patch` from what the screen gives, routes each report through the screen, applies a unit's patches, and serializes every call so each result is applied before the next report is dispatched; `close()` empties the container and closes the screen. The package README leads with it as Tier 1 (`packages/port-web/README.md:5-24`) and calls `draw`, `update`, `patch` and `report` the Tier 2 contract. Tiered Provisional (`docs/stability.md:21`). Tests: `test/compose.test.ts` (13: draw then in-place patch, intent, `native` passed through, unit patches with and without a raised intent, ordering, diagnostics, `onError`, recovery). The CHANGELOG states E2 ◐→P. Without the Mesh pack (`2d65e20`) no screen exists to pass, so ◐.
- **Nexus I2 ◐→P (agree with the reviewer).** After Phase B left it ◐ because the default `subscribe` casts a `_tag`-matched payload and a tag collision made that cast unsound. Now each runtime's bus registers a tag to the first `EventDef` that publishes or subscribes with it (`src/event/internal.ts:34-38`, called at `src/event/index.ts:40` and `:54`), and a second, distinct def dies with `Runtime.Refusal`, `code: "duplicate-event-tag"`, a new `RefusalCode` (`src/runtime/internal.ts`). `docs/primitives/event.md:88` now says a subscription only receives its own def's payloads, "which is why delivering the payload as `Payload` without a check is sound". Checked for a way around it: the bus's `publish` takes an untyped envelope, but the `EventBus` tag is internal (`src/event/internal.ts`) and `EventBusShape` is Internal (`docs/stability.md:25`), so no public path skips the claim. The refusal is a defect at first use, not a type error, and its failure has a stable code: P. Tests: `tests/event.test.ts:177-203` (refused on publish and on subscribe, one def reused, per runtime). The hot-reload caveat is documented (`event.md:88`, `docs/releases/v0.17.md:19`), and this is a behavior change for programs that had the hazard (controller ruling). The v0.17 release note's earlier "I2 ◐→P (with Valance B3)" (`:11`), disputed after Phase B, is now true for a different reason.
- **Valance I2 ◐→P (with the pack; agree with the reviewer).** After Phase B named what P needs: "an opt-in strict handle (typo-checked keys, typed arguments per key), or name-based binding". Both are now in:
  - `handle.command(key, ...input)` (`packages/valance/src/index.ts:465`): the key is `keyof C`, so a typo is a type error, and a bare command's `"app/name"` takes its input whole, typed by its schema, a struct by field name (`docs/use/README.md:15`, `docs/releases/v0.16.md:25-29`). Test: `test/command-keys.test.ts` (with `@ts-expect-error` for a typo, a wrong field type, a missing field and a missing input).
  - A template's call binds by name when every argument is a plain path naming a distinct field (`bareBinding`, `index.ts:326-341`; `V1_CONTRACT.md:53`), so `move(to, from)` sets each field as written. Test: `test/named-binding.test.ts`, including a real compiled template through MESH. `command-argument-order` now warns only where the binding is still positional and the names disagree (`packages/cli/src/argument-order.ts:72`; `test/argument-order.test.ts`).

  What is still positional, checked: a call with a literal or `$event` among its arguments, `invoke`, and an exact key's `entry` adapter. Each such argument fills a parameter MESH type-checks against the manifest (`command-arity-mismatch`, `type-mismatch`; the derived manifest's parameters are the fields in field order, `V1_CONTRACT.md:292`), which is how Mesh's and Port's positional intent arguments were scored P since 10-19; and where a name contradicts the position, `vlx check` says so. `invoke`'s key still accepts any string (`index.ts:454`), with the typed `UnmappedCommand` for an unknown one, and a checked accessor now exists beside it. So types carry meaning and failures have stable codes: P. Without the Mesh pack only `handle.command` is left, and a template's call, the Tier 1 path, ignores the call site's names again: ◐. That is the controller's ruling when Task 25 part 2 was split off (positional mapping is named in the ◐ definition).

**Re-checked, unchanged**
- **Valance E2 P, Nexus E2 P.** `handle.command` and named binding add no step. Valance does not use the screen (its own host already did these duties; `runtime.md:393`).
- **Mesh I2 P, Port I2 P.** The intent's `name` is additive, tiered Provisional (`mesh/docs/manual/stability.md:29`), and Rust's `Intent` is unchanged (`NamedIntent` is `#[non_exhaustive]`). `composeWebPort`'s `Intent` and `Diagnostics` are inferred from the screen passed.
- **Port T1.2 ◐.** `composeWebPort` needs `screen`, `container`, `primitives` and `onIntent`; `onError` and `onDiagnostics` are optional with defaults (`port/CHANGELOG.md:10`). `primitives` is still required with no default table (C-2), so ◐ stays.
- **Mesh M2 ◐, I1 ◐.** "Screen" collides with no public name (Task 23 report), and its fields say `occurrence` (C-4), so it adds no meaning of "instance". Port's "composer" is the PORT contract's own word for the host (`docs/CONTRACT.md:22`).
- **Valance I1 P, M2 ◐ (finding, recorded, not taken).** `handle.command(key, input)` runs a command; `Valance.command(state)` makes one (`docs/use/README.md:15-16`). One name now has two meanings in the API. M2 is already ◐ for `start`, `Host` and `scope`, so it does not move. On I1 the two are told apart by where they live (a handle's method, a module's function) and both are about commands, so I1 stays P. The reading that this is an overloaded name gives Valance I1 ◐: 83 ÷ 97, 86, and no change to the ecosystem (I1 is ◐ through Nexus and Mesh). The glossary (`docs/understand/glossary.md`) does not list it.
- **Finding: the tutorial still teaches `invoke` by position.** `learn/first-application.md:139-142` shows `invoke("app/add", [{ value: 5 }])`, "in the command's field order", and does not mention `handle.command`. It is correct, and the audit is judged on what the API offers, so it does not move I2. A reader who scores I2 on the path the first page teaches would keep Valance I2 ◐: Valance 86, ecosystem 73.5 ÷ 97, 76 (74 with strict H2), and the goal not met. Recorded for the owner; changing that line to `handle.command` would remove the question.
  - **Resolved on the branch (after this measurement).** `learn/first-application.md` §5 now runs `application.command("app/increment")` and `application.command("app/add", { amount: 5 })`, and §3 says the event's arguments fill a struct by name when each is a plain field name, else in field order. The tutorial no longer teaches positional mapping, so the stricter reading also gives Valance I2 P and the scores above stand.
- **Disagreement recorded:** `docs/releases/v0.16.md:44` says Valance I2 goes "Partial to Pass once this and the refinements' Task 26 (Nexus's duplicate-tag refusal) are both in". Valance's column does not depend on Task 26: Valance exposes no `Event` API, and its Nexus peer range (`^0.14.0 || ^0.15.0 || ^0.16.0`) excludes the 0.17 that has the refusal. Task 26 lifts Nexus's column, and both are needed for the ecosystem's I2.

### Blocking the next goal

The Phase B goal is met on the branch, and is blocked off the branch only by the releases above (Mesh: `openScreen` and argument names; PORT Web: `native`). Still below P in the ecosystem, by the repo that holds each one down:

| Audit | Held down by | Points to P | Lifted by |
|---|---|---|---|
| C1 (F) | Valance, Mesh | 7 (and C2 becomes applicable: +3 points, +3 divisor) | **C-1** context channel |
| T1.1 | Nexus | 4 | nothing planned (§6 keeps it ◐) |
| T1.2 | Port | 3 | **C-2**, only if the opt-in vocabulary is accepted as P (contested) |
| I1 | Nexus, Mesh | 2.5 | 1.0 renames |
| M2 | Valance, Nexus, Mesh | 2.5 | 1.0 renames (C-4 removes Mesh's collision, not the others) |
| D2 | Valance | 2 | **C-3** `Schema.Redacted` |

For the Phase C goal of 85: C-1 alone gives (76 + 7 + 3) ÷ 100 = 86; with C-3, 88; with C-2 taken as P, 91. On the strict H2 reading, 85, 87 and 90.

### Arithmetic after Phase B iteration

**Valance** (divisor 97). T1: 8 + 6 + 6 = 20. Encapsulation: 8 + 7 + 5 = 20. Intention: 5 + 5 + 5 = 15. Mental model: 5 + 2.5 = 7.5. Data: 6 + 2 = 8. Context: 0. Tier 2: 8. Tier 3: 4 + 3 = 7. Sum 85.5. 85.5 ÷ 97 = 0.881, so **88**. (H2 ◐: 84 ÷ 97 = 0.866, 87. Without the packs, I2 ◐ and H2 ◐: 81.5 ÷ 97 = 0.840, 84.)

**Nexus** (divisor 71). T1: 4 + 6 + 6 = 16. Encapsulation: 20. Intention: 2.5 + 5 + 5 = 12.5. Mental model: 7.5. Data: 6. Sum 62. 62 ÷ 71 = 0.873, so **87**.

**Mesh** (divisor 86). T1: 20. Encapsulation: 8 + 7 + 5 = 20. Intention: 2.5 + 5 + 5 = 12.5. Mental model: 7.5. Data: 6. Context: 0. Tier 2: 8. Sum 74. 74 ÷ 86 = 0.860, so **86**.

**Port** (divisor 86). T1: 17. Encapsulation: 8 + 7 + 5 = 20. Intention: 15. Mental model: 10. Data: 6. Tier 2: 8. Tier 3: 4 + 3 = 7. Sum 83. 83 ÷ 86 = 0.965, so **97**. (H2 ◐: 81.5 ÷ 86 = 0.948, 95. Without the pack, E2 ◐: 79.5 ÷ 86 = 0.924, 92; with strict H2 too, 78 ÷ 86 = 0.907, 91.)

**Ecosystem** (divisor 97). T1: 4 + 3 + 6 = 13. Encapsulation: 8 + 7 + 5 = 20. Intention: 2.5 + 5 + 5 = 12.5. Mental model: 7.5. Data: 8. Context: 0. Tier 2: 8. Tier 3: 4 + 3 = 7. Sum 76. 76 ÷ 97 = 0.784, so **78**. (H2 ◐: 74.5 ÷ 97 = 0.768, 77. Without the packs, E2 ◐, I2 ◐ and H2 ◐: 68.5 ÷ 97 = 0.706, 71.)

### By category after Phase B iteration

| Category | Weight | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| Tier 1: minimal surface | 20 | 65 | 100 | 80 | 100 | 85 |
| Encapsulation | 20 | 100 | 100 | 100 | 100 | 100 |
| Intention and contracts | 15 | 83 | 100 | 83 | 83 | 100 |
| Mental model | 10 | 75 | 75 | 75 | 75 | 100 |
| Data boundary | 10 | 80 | 80 | 100 | 100 | 100 |
| Context | 10 | 0 | 0 | n/a | 0 | n/a |
| Tier 2: opt-in tuning | 8 | 100 | 100 | n/a | 100 | 100 |
| Tier 3: hatches | 7 | 100 | 100 | n/a | n/a | 100 |

## After Phase C

Re-scored on 2026-10-31 on the `north-star-refinements` branch, after Phase C of the [refinements plan](./direction/north-star-refinements.md) §5. Decisions K27 to K30 are recorded (Valance `8cbec02`, `cbfe751`). The changes:
- **C-1, context channel.** Mesh 0.18.0 prepared (`dedf5da`, `b6b54a8`). The Nexus adapter's `context` (`5d45fa3`, `838244e`). Valance's `context` projection on `define` and `defineApp`, `uses`, the manifest's `context`, `docs/use/context.md` and the `context-not-recordable` refusal (`2d8b177`, `411bdd9`).
- **C-2, opt-in web vocabulary.** `@valancex/port-web/vocabulary` (Port `42990f5`, `95aefd9`).
- **C-3, Redacted masking.** Valance `a9f5dc0`, `d115809`, `79a25ef`.
- **C-4, occurrence rename.** Mesh `f9e215c`, `b3de788`, with Nexus `occurrence` (`5d45fa3`, `838244e`).
- **New packs.** Valance `c64a936` and `15dafd1` (mesh-runtime and mesh-compiler 0.18.0 from mesh `b6b54a8`, nexus from `838244e`) and Nexus `538d8e2` (Mesh 0.18.0).

**All 19 audits were re-checked in every repo.** Cells that Phase C did not touch were checked again against the new code: new exports have tiers, the new names were checked for I1 and M2, and the new options for T1.2, E2 and X2. They did not move. The release notes' and reviewers' claims were checked against the code, not taken as given.

**Run, all passing:**
- `valance/packages/valance`: `npx vitest run test/context.test.ts test/redacted.test.ts test/stability-coverage.test.ts` (32 passed).
- `valance/packages/cli`: `test/context.test.ts test/redacted.test.ts` (10 passed).
- `valance/packages/common`: `test/context-types.test.ts test/redacted.test.ts` (2 passed).
- `valance/examples/todo`: `test/redacted-hydrate.test.ts` (1 passed).
- `mesh/packages/mesh-runtime`: `node --test test/context.test.mjs test/screen.test.mjs` (17 passed).
- `port/packages/port-web`: `npx vitest run vocabulary readme` (9 passed).
- `nexus`: `npx vitest run tests/mesh-context.test.ts tests/mesh-units.test.ts` (6 passed).

The Rust tests were not run. All four trees were clean after the runs.

| | After Phase B iteration | After Phase C | Band |
|---|---|---|---|
| **Ecosystem (weakest link)** | 78 | **88** | Needs improvement |
| Valance | 88 | **98** | Good |
| Port | 97 | 97 | Good |
| Mesh | 86 | **94** | Good |
| Nexus | 87 | 87 | Needs improvement |

**The Phase C goal, ecosystem ≥ 85, is met on the branch**: 88 ÷ 100, so 88. It is met only with the DO-NOT-MERGE packs. Without them the ecosystem is 74 (below). Three audits move the ecosystem:
- **C1** F→P (Valance and Mesh).
- **C2**, which now applies, P (Valance and Mesh). The divisor becomes 100.
- **D2** ◐→P (Valance).

| Reading | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|
| With the packs, H2 on the hatch the docs lead with (the ruling) | **88** | 98 | 87 | 94 | 97 |
| With the packs, strict H2 (the weaker documented hatch) | **87** | 96 | 87 | 94 | 95 |
| Without the packs, leading-hatch H2 | 74 | 86 | 87 | 94 | 92 |
| Without the packs, strict H2 | 74 | 86 | 87 | 94 | 91 |

Three judgment calls could lower the score. Each is taken below and stated with its alternative:
- **Valance C2 ◐** (the `define` route's projection is untyped): ecosystem 87, or 85 with strict H2.
- **Mesh M2 P** (deprecated aliases not counted): Mesh 97. The ecosystem does not change.
- **Port T1.2 P** (the vocabulary accepted as essential): Port 100, ecosystem 91, or 90 with strict H2.

The lowest reading that applies (strict H2 and Valance C2 ◐) is exactly 85.0, so the goal holds on every with-pack reading.

**Unreleased upstream.** Five cells count code another repo has not released. Each comes from a local pack committed under `DO NOT MERGE BEFORE THE RELEASES`:
- **Valance C1 and C2** need Mesh 0.18 (`context` in the manifest, `uses`, `context` on `render` and `update`) and the Nexus adapter's `context` (`Mesh.render(program, snapshot, units?, context?)`, `src/mesh/index.ts:125`). Released Mesh 0.17 refuses a manifest with `context` (`manifest-unknown-property`, `mesh/docs/releases/v0.18.md`, "Compatibility"). Released Nexus 0.16's `render` takes no fourth argument (`998a533:src/mesh/index.ts:104`). Without them no channel exists: Valance C1 F, C2 N/A.
- **Valance I2** needs Mesh's argument names, now inside the 0.18 pack (`2a523d1` is an ancestor of `b6b54a8`), as after the Phase B iteration.
- **Valance H2** needs PORT Web's `native` (`local-packs/valancex-port-web-0.14.0.tgz`), as before.
- **Port E2** needs a Mesh with `openScreen` (`2d65e20`), as before.

Valance D2 counts no pack. The masking is Valance's own code (`packages/valance/src/web-redacted.ts`) and landed before `c64a936`. Mesh's and Nexus's cells read only their own branch, as before.

Without the packs the ecosystem has C1 F (Valance) and C2 P. C2 takes Mesh's P, because the scorecard makes an ecosystem audit N/A only if every repo is N/A. The sum is 73.5 ÷ 100, so **74**. If C2 is read as N/A while C1 fails (not the scorecard's rule), it is 70.5 ÷ 97, so 73. Releasing in steps:
- **Mesh 0.18 alone**: Port E2 and Valance I2 rise, which gives 79.5 ÷ 100, 80.
- **Then Nexus 0.17** (the adapter's `context`): Valance C1 and C2 rise, which gives 86.5, 87.
- **Then PORT Web's `native`**: 88.

Each downstream release also needs its peer range raised (see the finding on the Nexus range below).

### Audit results after Phase C

Cells that differ from the After Phase B iteration table are in **bold**.

| ID | Audit | Eco | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| T1.1 | Zero-config path | ◐ | P | ◐ | P | P |
| T1.2 | Nothing required with a default | ◐ | P | P | P | ◐ |
| T1.3 | Docs lead with Tier 1 | P | P | P | P | P |
| E1 | Boundaries enforced by a test | P | P | P | P | P |
| E2 | No lifecycle step at Tier 1 | P | P | P | P | P |
| E3 | Every export tiered | P | P | P | P | P |
| I1 | Names say what | ◐ | P | ◐ | ◐ | P |
| I2 | Typed, no stringly or positional coupling | P | P | P | P | P |
| I3 | Command/query separation | P | P | P | P | P |
| M1 | One source of truth, `UI = f(state)` | P | P | P | P | P |
| M2 | One term per concept | ◐ | ◐ | ◐ | ◐ | P |
| D1 | View models, not entities | P | P | P | P | P |
| D2 | Wire data can be masked | **P** | **P** | – | – | – |
| C1 | Value reaches a deep component without threading | **P** | **P** | – | **P** | – |
| C2 | Channel explicit and checkable | **P** | **P** | – | **P** | – |
| X1 | Opt-in knobs, behavior and performance | P | P | – | P | P |
| X2 | Defaults correct without knobs | P | P | – | P | P |
| H1 | Documented way down to the platform | P | P | – | – | P |
| H2 | Hatch marked and safe | P | P | – | – | P |

### What moved, and what did not, with evidence

**Moved**
- **Mesh C1 F→P, C2 –→P.** The channel and its checks:
  - **Declared once.** The manifest's top-level `context` declares each name and its type.
  - **Opt-in per component.** A component lists what it reads in `uses`, and those names join its scope read-only. A name it does not list is not in scope. `crates/mesh-manifest/tests/load.rs:1281-1294` asserts `!declared.scope.contains_key("user")` for a name the component does not use.
  - **Checked before run.** `manifest-unknown-context` and `manifest-context-clash` are checked when the manifest loads (`crates/mesh-manifest/src/validate.rs:361-392`; fixtures `examples/fixtures/manifest/fail/{unknown-context,context-clash}.json`). Every read is then type-checked by `mesh check` like any scope name.
  - **Values come from the host.** They are given beside the snapshot (`render`/`update` `context`, Rust `render_context`/`update_with_context`) and validated at `$context.<name>`. A change path `{ context: name }` re-evaluates the readers.
  - **Tests.** `crates/mesh-runtime/tests/context.rs`, `packages/mesh-runtime/test/context.test.mjs` (3, including the screen's `show(snapshot, context?)`), and conformance vectors `examples/conformance/context/` in both runtimes.
  - **Documented and tiered.** Spec §9.11, with §9.1 amended. Tiered Provisional, Tier 2 (`docs/manual/stability.md:31`).

  This is an injection channel (C1 P), and it is declared and type-checked ahead of run (C2 P). The values a host passes are checked at render, as a snapshot's are. That is the runtime's boundary, not the channel's contract.
- **Valance C1 F→P, C2 –→P (with the packs).** How the channel reaches Valance:
  - **The projection.** `define` takes `context: (state) => values` beside each view's `scope` (`packages/valance/src/index.ts:122-128`). `start` passes the values to every render and update through `Nexus.Mesh.render`/`update` (`index.ts:619-655`).
  - **`uses`.** `component(…, { uses })` writes the entry's `uses` (`packages/cli/src/contract.ts:25`).
  - **The manifest.** The derived manifest's top-level `context` comes from the Schema passed to `manifest({ context })` (`web-manifest.ts`, `namesOf`). For `defineApp` it is the layout's own types for the names returned (`contextSchema`, `packages/common/src/app.ts`), and a name the layout does not read is refused.
  - **Checked ahead of run.** `vlx check` reports a template that reads a name it does not list, and MESH's `manifest-unknown-context` (`packages/cli/test/context.test.ts`, 6 tests, including a run where a state change reaches a badge two levels down). `defineApp`'s `context` is typed by the layout names (`ContextValues`, `packages/common/src/index.ts:408`). A wrong type for a state field is a type error (`test/context-types.test.ts`, `@ts-expect-error`).
  - **Documented and tiered.** `docs/use/context.md` repeats React's "props first" guidance, as C-1 required. Tiered Provisional (`docs/stability.md:42`).

  P/P, with one stricter reading recorded. `Valance.define`'s `context` returns `Record<string, unknown>`, and nothing ties it to the Schema given to `manifest({ context })` at compile time. A wrong value is caught at render, as a MESH diagnostic at `$context.<name>`. That is the same typing as `define`'s `scope`, which every measurement since 10-19 has scored without objection. The reads are checked ahead of run on both routes, and the provided values are typed ahead of run on the Tier 1 `defineApp` route. Reading the `define` route as "checked at run time" gives Valance C2 ◐: Valance 96 (96 ÷ 100), ecosystem 87 (85 with strict H2).
- **Valance D2 ◐→P (pack-independent).** A masking step now exists:
  - **Omitted from the embed.** `renderToHtml` leaves every top-level `Schema.Redacted` field (or `NullOr` of one) out of the `state` it returns (`withoutRedacted`, `packages/valance/src/web-redacted.ts`; `web-server.ts:58`).
  - **Head written from the masked state.** The head is written from the state the browser will have (`web-server.ts:60`).
  - **Restored on hydrate.** `Web.run` with `present: "hydrate"` restores each field's declared default (`web.ts:516-517`).
  - **Fails closed.** A Redacted that cannot be masked (below the top level, or under a schema that is not a plain struct) makes `renderToHtml` die with `ValanceError` `redacted-unmaskable` before anything starts (`web-server.ts:42-46`, `errors.ts:26`). So a server that never ran `vlx check` still cannot embed it.
  - **`vlx check` codes.** `redacted-no-default`, `redacted-in-view` (a view's `scope`, the `view` selector and the `context` projection, run on the initial state) and `redacted-unmaskable`.
  - **Context is masked too.** The `context` projection is given the state without Redacted fields (`index.ts:620`).
  - **Documented.** `V1_CONTRACT.md:320` and `learn/mounting-and-hydration.md:41`.
  - **Tests.** `packages/valance/test/redacted.test.ts` (8, including the head and fail-closed cases), `packages/cli/test/redacted.test.ts`, `packages/common/test/redacted.test.ts`, `examples/todo/test/redacted-hydrate.test.ts` (the hydrated tree adopts the server's), and `test/context.test.ts` (a secret read through `context` does not reach the HTML).

  Every other field still crosses, but the audit's P is "a masking or projection step exists", and it does. Masking is by top-level field only, and the limit is refused rather than leaked.

**Re-checked, unchanged**
- **Mesh M2 ◐ (agree with Mesh's own corrected note, not its first draft).** The occurrence rename removes the third meaning of "instance" from what the runtime writes: `Render.occurrences`, `intent.occurrence`, `runtime-unknown-occurrence` (`docs/releases/v0.18.md`; `docs/manual/runtime.md:353`; glossary, "occurrence and instance"). The unit sense of "instance" is still on the public surface for this release, though:
  - The JavaScript aliases `Render.instances` and `instance` are kept, non-enumerable.
  - In Rust, the Stable `Intent`'s only field for the occurrence is still named `instance`, read through `Intent::occurrence()`.
  - Nexus keeps `UnitOccurrence.instance` and `CommandIntent.instance`, deprecated.

  Plan §5 refuses aliases "because two names for one concept costs M2 again". The rename is right and the aliases are a documented one-release bridge. Even so, while they exist the unit concept has two names in the API, so ◐. It becomes P in the release that removes them. Reading deprecated aliases as not counting gives Mesh M2 P: 86.5 ÷ 89, 97. The ecosystem does not change (Valance and Nexus hold M2 ◐).

  Mesh's first draft of the changelog claimed I1 ◐→✓. `b3de788` corrected that to M2, and I1 stays ◐ for `Render` (an entity named after a process, deferred to 1.0).
- **Port T1.2 ◐ (C-2, the plan's count).** `@valancex/port-web/vocabulary` (`src/vocabulary.ts`, tiered Provisional at `docs/stability.md:21`) is the portable core as data, with a manifest a test keeps equal to the Desktop vocabulary (`test/vocabulary.test.ts`). The README's Tier 1 example imports it in one line (`packages/port-web/README.md:9-17`).

  `primitives` is still required by `createWebPort` and `composeWebPort`, and C-2 decided not to default it. So the README's first example now always passes the same table, which is the ◐ definition ("some required inputs have an obvious default") on a plain reading. The plan's case for P is that a PORT's vocabulary is its essential input, not a setting, and that MPRX §9.9 leaves the catalog out. That case is recorded and not taken, because the decision record itself counts ◐. Taking it gives Port 100 and ecosystem 91 (90 with strict H2). No default table is proposed here (C-2).
- **Nexus M2 ◐, I1 ◐.** `occurrence` is added beside a deprecated `instance` (`src/mesh/index.ts`; `docs/releases/v0.17.md:21`). The identity-field, `Host` and unit collisions remain. The new `ContextValues` is the MESH sense.
- **Valance M2 ◐, I1 P.** Nothing public named the unit sense of "instance" (`2d8b177`; glossary). `context` adds a meaning beside Effect's `Context` (service requirements) and the router's `GuardContext`/`NavigationContext`, which describe a navigation. Both are recorded below and are not scored, because M2 is already ◐ for `start`, `Host`, `scope` and `command`.
- **E2 everywhere P.** Context adds no step at Tier 1. Mesh's screen keeps the last context shown (`b6b54a8`). Valance passes it itself.
- **E3 everywhere P.** New exports have rows:
  - Valance: `docs/stability.md:36`, `:42`. `test/stability-coverage.test.ts` passes.
  - Mesh: `docs/manual/stability.md:21-22`, `:31-32`.
  - Port: `docs/stability.md:21`.
  - Nexus: `ContextValues` falls under `Mesh` (Stable, `docs/stability.md:21`), with the additions in `docs/releases/v0.17.md:22`.
- **I2, I3, M1, D1 P.** `context` is a pure function of the state (a query, held to `UI = f(state)`), and MESH checks its values against declared types with stable codes. The recording refusal has its own code, `context-not-recordable` (`errors.ts`, `docs/use/README.md:24`).
- **X1, X2 P.** `context` and `uses` are opt-in, and a program without them is unchanged. A context name is required only when the manifest declares it with a non-optional type.
- **T1.1 ◐ (Nexus), T1.3 P, H1/H2 as before.**

### Findings (recorded, not resolved)

- **Valance's Nexus peer range admits a Nexus without `context`.** `packages/valance/package.json:66` and `packages/common/package.json:74` say `^0.14.0 || ^0.15.0 || ^0.16.0`, and the pack is labelled `valancex-nexus-0.16.0.tgz` although it carries 0.17's adapter. Released Nexus 0.16.0 satisfies the range. Its `Mesh.render` drops the fourth argument, so an application with `context` meets a MESH diagnostic at render instead of an install-time refusal. The stability row (`docs/stability.md:42`) says the channel "needs … the NEXUS with `context`". The floor has to move to 0.17 at release, as Task 29 M2 and Task 14 already defer for MESH and PORT.
- **`composeWebPort` cannot give context.** Port's composer calls `screen.show(snapshot)` only (`packages/port-web/src/compose.ts:13`, `:102-104`). So a program whose manifest declares a non-optional context name cannot use Port's Tier 1 helper, and its author must drop to `draw`/`patch`. C1/C2 are N/A for Port, so this is not scored. The smallest fix is an optional `context` on the composer's `show`, passed through to the screen.
- **"context" across the ecosystem.** It now names the MESH injection channel (Mesh, Nexus `ContextValues`, Valance `context`), Effect's `Context` (Nexus services, Valance's `R`) and the router's guard and navigation records. The glossary (`docs/understand/glossary.md`) has no entry. M2 is already ◐ wherever both meanings occur.
- **The plan's "aliases are refused" (§5) and C-4's one-release deprecated aliases disagree.** The disagreement is recorded, not resolved. This measurement scores the aliases as keeping Mesh M2 ◐.
- **An application with `context` cannot be recorded or replayed** (`docs/use/context.md`, "Not yet"). It is refused up front with a stable code, so nothing corrupts. It is a gap in the Tier 2 replay tool, and no audit is affected.

### Blocking the next goals

The Phase C goal is met on the branch. Off the branch it is blocked only by the releases: Mesh 0.18 (screen, argument names, context), Nexus 0.17 (the adapter's `context`) and PORT Web's `native`, each with its downstream peer floor raised. Still below P in the ecosystem, by the repo that holds each one down, with the smallest change that would close it and keep it extensible:

| Audit | Held down by | Points to P | Smallest change |
|---|---|---|---|
| T1.1 | Nexus | 4 | A documented one-call first run that needs no Effect plumbing (for example, a helper that runs an `Application` definition and prints), or a judgment that `examples/hello` is one documented command. §6 keeps it ◐ |
| T1.2 | Port | 3 | None proposed: C-2 decided against a default table. It moves only if the vocabulary is accepted as the essential input (see above) |
| I1 | Nexus, Mesh | 2.5 | The 1.0 renames: `Render` (Mesh), the Nexus identity fields. Aliases are refused |
| M2 | Valance, Nexus, Mesh | 2.5 | Mesh: drop the deprecated `instance` aliases in the release after 0.18 (Mesh then P). Valance and Nexus: the 1.0 renames of `start`, `Host`, `scope`, `command`, the identity fields and Nexus "unit". The ecosystem moves only when all three are P |

Every with-pack reading is at or above 85. For the Good band (90) on the ruling reading, one of these is enough: T1.1 alone gives 92, and I1 or M2 alone gives 90.5, so 91. On strict H2, T1.1 alone gives 91, but I1 or M2 alone gives only 89.

### Arithmetic after Phase C

**Valance** (divisor 100: C2 now applies). T1: 20. Encapsulation: 20. Intention: 15. Mental model: 5 + 2.5 = 7.5. Data: 6 + 4 = 10. Context: 7 + 3 = 10. Tier 2: 8. Tier 3: 4 + 3 = 7. Sum 97.5, so **98**.
- H2 ◐: 96, so 96.
- C2 ◐: 96, so 96.
- Without the packs (I2 ◐, H2 ◐, C1 F, C2 N/A, divisor 97): 83.5 ÷ 97 = 0.861, so 86.

**Nexus** (divisor 71). Unchanged: 62 ÷ 71 = 0.873, so **87**.

**Mesh** (divisor 89: C2 now applies). T1: 20. Encapsulation: 20. Intention: 2.5 + 5 + 5 = 12.5. Mental model: 7.5. Data: 6. Context: 7 + 3 = 10. Tier 2: 8. Sum 84. 84 ÷ 89 = 0.944, so **94**.
- M2 P: 86.5 ÷ 89 = 0.972, so 97.

**Port** (divisor 86). Unchanged: 83 ÷ 86 = 0.965, so **97**.
- H2 ◐: 95.
- Without the pack: 92. Without the pack and with strict H2: 91.
- T1.2 P: 86 ÷ 86, so 100.

**Ecosystem** (divisor 100). T1: 4 + 3 + 6 = 13. Encapsulation: 20. Intention: 2.5 + 5 + 5 = 12.5. Mental model: 7.5. Data: 6 + 4 = 10. Context: 7 + 3 = 10. Tier 2: 8. Tier 3: 7. Sum 88, so **88**.
- H2 ◐: 86.5, so 87.
- Valance C2 ◐: 86.5, so 87. With strict H2 as well: 85.0, so 85.
- Port T1.2 P: 91 (strict 89.5, so 90).
- Without the packs (E2 ◐, I2 ◐, H2 ◐, C1 F, C2 P through Mesh): 13 + 16.5 + 10 + 7.5 + 10 + 3 + 8 + 5.5 = 73.5, so 74.

### By category after Phase C

| Category | Weight | Ecosystem | Valance | Nexus | Mesh | Port |
|---|---|---|---|---|---|---|
| Tier 1: minimal surface | 20 | 65 | 100 | 80 | 100 | 85 |
| Encapsulation | 20 | 100 | 100 | 100 | 100 | 100 |
| Intention and contracts | 15 | 83 | 100 | 83 | 83 | 100 |
| Mental model | 10 | 75 | 75 | 75 | 75 | 100 |
| Data boundary | 10 | 100 | 100 | 100 | 100 | 100 |
| Context | 10 | 100 | 100 | n/a | 100 | n/a |
| Tier 2: opt-in tuning | 8 | 100 | 100 | n/a | 100 | 100 |
| Tier 3: hatches | 7 | 100 | 100 | n/a | n/a | 100 |

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
