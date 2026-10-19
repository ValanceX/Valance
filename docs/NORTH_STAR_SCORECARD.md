# North star scorecard: how compliance is scored

Status: **locked** (2026-10-19). Measures the [design north star](./DESIGN_NORTH_STAR.md). The first measurement, and the evidence behind it, is the [baseline](./north-star-validation-2026-10-19.md).

Like a Lighthouse report, the result is a number from 0 to 100, built from named audits that each score pass, partial or fail, grouped into weighted categories. The same audits score the ecosystem today and judge new work.

## Scale

| Score | Band |
|---|---|
| 90 to 100 | **Good** |
| 50 to 89 | **Needs improvement** |
| 0 to 49 | **Poor** |

**Audit result:** Pass = 1, Partial = 0.5, Fail = 0, **N/A** = the audit does not apply (excluded; the remaining weights are rescaled so the score is out of 100).

**Score** = 100 × (sum of weight × result) ÷ (sum of the weights of the audits that apply).

## Audits (19, total weight 100)

Each audit needs evidence: a file, a test, a document section or a command. No evidence, no Pass.

### Tier 1: minimal surface (20)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| T1.1 | 8 | A zero-config path to a working result | One documented command or call, no prior concepts | Works, but needs several concepts or hand-written files first | No such path |
| T1.2 | 6 | Nothing required that has a correct default (anti-pattern 4.1) | Every required input is essential to the task | Some required inputs have an obvious default | Basic use needs a pile of mandatory settings |
| T1.3 | 6 | Docs lead with the Tier 1 path | The first page a user meets is the simplest route | Simple route exists but is not first | Advanced material first |

### Encapsulation (20)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| E1 | 8 | Boundaries enforced by a test | A failing test if a layer imports across its boundary | Boundary stated and partly checked | Convention only |
| E2 | 7 | No lifecycle, flush, update or release step at Tier 1 (anti-pattern 4.2) | Tier 1 author never triggers one | Some step is left to the author, documented | Author must drive the mechanism |
| E3 | 5 | Every public export has a stated stability tier | Every export is tiered in a stability page or its docs | Page exists, some exports mixed or untiered | No tiers |

### Intention and contracts (15)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| I1 | 5 | Names say what, in domain terms | Names match behavior; no misleading process/entity naming | A few misleading or overloaded names | Names describe mechanism |
| I2 | 5 | Typed contracts; no stringly or positional coupling | Types or schemas carry meaning; failures have stable codes | Some untyped keys, casts or position-dependent mapping | Callers must read internals to call correctly |
| I3 | 5 | Commands and queries are separate; queries are side-effect free | Always | Exceptions, documented | Mixed |

### Mental model (10)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| M1 | 5 | One source of truth; `UI = f(state)` | Stated and held by the API | Held with documented exceptions | Not held |
| M2 | 5 | One term per concept, across the ecosystem | Consistent | A few collisions | Pervasive |

### Data boundary (10) (anti-pattern 4.3)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| D1 | 6 | Public contracts expose view models, not entities | A projection sits between internal state and what a consumer sees | Some raw shapes exposed | Internal shapes are the contract |
| D2 | 4 | Data that crosses a wire or process boundary can be masked | A masking or projection step exists | Whole state crosses; documented | Whole state crosses; undocumented |

### Context (10) (anti-pattern 4.4)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| C1 | 7 | A value can reach a deep component without threading it | An injection or inherited-scope channel exists | Workarounds only | Values must pass through every layer |
| C2 | 3 | That channel is explicit and checkable | Declared and type-checked ahead of run | Declared, checked at run time | Implicit lookup. **N/A while no channel exists** |

### Tier 2: opt-in tuning (8)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| X1 | 4 | Opt-in knobs exist for behavior and for performance | Both kinds | One kind | Neither |
| X2 | 4 | Every knob has a default that is correct without it | Always | Mostly | A knob is required |

### Tier 3: controlled hatches (7)

| ID | Wt | Audit | Pass | Partial | Fail |
|---|---|---|---|---|---|
| H1 | 4 | A documented way down to the platform | Exists and documented | Exists, undocumented or partial | None found |
| H2 | 3 | The hatch is marked and cannot corrupt framework state | Visibly leaves the portable layer; state stays authoritative | One of the two | Neither. **N/A while no hatch exists** |

## Scoring scope

- **Per repo:** score a repo on its own public surface. An audit that the repo's layer does not own is **N/A** (for example, Nexus owns no template language, so C1 is N/A for it).
- **Ecosystem (weakest link):** each audit takes the lowest result among the repos that own it; N/A only if every repo is N/A. This is what an author who crosses layers meets, so one weak layer lowers it.

## Validating new work

A change to a public surface is scored on the audits it touches, before and after, by the author, with the evidence for each.

1. **No regression:** no audit it touches may drop (Pass to Partial, Partial to Fail).
2. **No new Fail:** a new public API that fails an audit does not ship; report it to the owner as a finding.
3. **N/A flips:** if a change creates something that makes an N/A audit applicable (a context channel for C2, a hatch for H2), that audit is scored on it.
4. **State the result** in the change: the audits touched, their before and after, and the evidence. If the change raises an audit, say so; the baseline is updated when the change merges.
5. **Recompute** the repo and ecosystem scores when the baseline is updated.

An audit's definition changes only by a change to this file.
