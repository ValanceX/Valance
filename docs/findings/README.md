# Findings register

One place to find every findings, friction and decision record in this repository, and to check later whether each gap in them is covered. **No existing document was moved**: `FINDINGS.md`, `CONSTRAINTS.md` and `V1_CONTRACT.md` are cited by name from source, tests and releases, so this register points at them instead.

Written 2026-10-16. Statuses below are **as recorded in each source document**; unless a row says "checked", they were not re-verified against the current code.

## 1. Documents

| Document | Scope | Kind | Item IDs | Size |
|---|---|---|---|---|
| [`2026-10-16-web-authoring-model.md`](2026-10-16-web-authoring-model.md) | Authoring a web app with `vlx`: styles, rendering mode, routes, dynamic pages, forms, dev paint | Investigation (code reading, nothing run) | WA-1 to WA-7 | 7 items |
| [`2026-10-16-gap-analysis-and-proposed-work.md`](2026-10-16-gap-analysis-and-proposed-work.md) | Triage of every gap in this register against the ecosystem direction; proposed work packages WP-1 to WP-17; coverage cross-check; decisions Q1 to Q7 | Analysis (reading only) | DP1 to DP10, WP-n, Q-n | |
| [`../FINDINGS.md`](../FINDINGS.md) | `@valancex/valance` core: lifecycle, history/URLs, application model, async, mounts, hydration | Staged tracer log (Stages 1 to 56+) | Stage numbers; Confirmed / Likely / Unresolved / Open / Deferred subsections | ~2,400 lines |
| [`../application-model/FINDINGS.md`](../application-model/FINDINGS.md) | First `vlx` tracer (`examples/docs-app`) | Failures, blockers, answers, measurements | F1 to F8 (fixed), D1 to D6 (blockers) | 50 lines |
| [`../application-model/NEXT-CYCLE.md`](../application-model/NEXT-CYCLE.md) | Authoring API location, CLI-first README, component anatomy | Investigation + decisions + outcome | D1 to D6 (all recorded done) | 148 lines |
| [`../application-model/ROUTING-AND-INTERCEPTORS.md`](../application-model/ROUTING-AND-INTERCEPTORS.md) | Route titles, guards, programmatic navigation, route params, interceptors | Investigation + decisions + outcome | R1, R2, T1, work items 1 to 8 | 193 lines |
| [`../application-model/PLATFORMS-HTTP-TITLES.md`](../application-model/PLATFORMS-HTTP-TITLES.md) | Platforms, HTTP capability, titles | Investigation | not itemised | 220 lines |
| [`../application-model/MULTI-TARGET-PLAN.md`](../application-model/MULTI-TARGET-PLAN.md), [`MULTI-TARGET.md`](../application-model/MULTI-TARGET.md), [`NAVIGATION.md`](../application-model/NAVIGATION.md) | Several targets from one app; navigation per target | Plan + scored friction | cognitive-load scores | 161 / 46 / 45 lines |
| [`../application-model/NATIVE-VOCABULARY.md`](../application-model/NATIVE-VOCABULARY.md), [`NATIVE-PARITY.md`](../application-model/NATIVE-PARITY.md), [`NATIVE-TARGET.md`](../application-model/NATIVE-TARGET.md) | Desktop vocabulary and parity | Investigation + scoring | not itemised | 189 / 77 / 51 lines |
| [`../application-model/TEMPLATE-TYPES.md`](../application-model/TEMPLATE-TYPES.md), [`EDITOR*.md`](../application-model/EDITOR.md) | Typed template imports; editor | Investigation | not itemised | |
| [`../application-model/REPORT.md`](../application-model/REPORT.md), [`HANDOFF.md`](../application-model/HANDOFF.md), [`BASELINE.md`](../application-model/BASELINE.md), [`CANDIDATES.md`](../application-model/CANDIDATES.md) | The application-model cycle | Report, decision log, baseline, options | phases 0 to n | |
| [`examples/docs-verifier/docs/FINDINGS.md`](../../examples/docs-verifier/docs/FINDINGS.md) | A real documentation site on the released packages | Friction log | F1 to F31 | |
| [`examples/docs-verifier/docs/PRINCIPLES.md`](../../examples/docs-verifier/docs/PRINCIPLES.md) | Released packages against the API design principles | Probes with severity | P1 to P3, O1 to O4 | |
| [`examples/tracer-web/src/docs-benchmark/COGNITIVE_LOAD.md`](../../examples/tracer-web/src/docs-benchmark/COGNITIVE_LOAD.md) | The cognitive-load scale and first scoring | Scored log | rows 1 to n | |

**Not yet indexed** (other repositories, not read for this register): `Mesh/docs/superpowers/specs` (e.g. `2026-10-09-api-design-review.md`), `Mesh/docs/standards/api-design-principles.md`, `Nexus/docs/{ROADMAP,FUTURE_DIRECTION,stability}.md` and `superpowers`, `Port/docs/{ROADMAP,stability}.md` and `superpowers`. Add them here when audited.

## 2. The scale every new finding uses

From `COGNITIVE_LOAD.md`: severity **0** natural, **1** minor friction, **2** framework knowledge, **3** abstraction failure; layer **App** (belongs to the problem), **FW** (Valance's own model), **Eng** (NEXUS, MESH, PORT, Effect). Status words: **Open**, **Open (decided, deferred)**, **Worked around**, **Fixed**, **Accepted**, **Not a defect**.

## 3. Gap register

Every open or deferred gap known from the documents above, with a pointer to where it is tracked. "Checked" means verified against the current code while writing this register; everything else is the source document's own status.

### 3.1 From the web authoring investigation (this folder)

| ID | Gap | Sev / layer | Status | Also in |
|---|---|---|---|---|
| WA-1 | Component-scoped styles | 2 / FW | Open | NEXT-CYCLE §3 proposal 4 (undecided) |
| WA-2 | Rendering mode not visible or settable; dev vs build differ | 2 / FW | Open | ROUTING R1 (`delivery`) |
| WA-3 | Routes undiscoverable, no listing command | 2 / FW | Open | ROUTING (model note) |
| WA-4 | `defineApp({ routes })`; custom pages, params, query, per-route guard/delivery | 3 / FW | Open (decided, deferred) | ROUTING R1, items 6 and 8; v0.12 "Deferred" |
| WA-5 | Form primitives, validation recipe, missing tags in docs | 2 / FW | Open | application-model D1 (partly) |
| WA-6 | Dev HTML has no stylesheet link: unstyled first paint | 2 / FW | Open (cause read, not measured) | verifier F22 (related) |
| WA-7 | Components inside Markdown | 2 / FW | Open | application-model D4 (related) |

### 3.2 From `application-model/FINDINGS.md`

| ID | Gap | Recorded status | Note |
|---|---|---|---|
| F1 to F8 | Tracer implementation failures | Fixed (source) | |
| D1 | Every primitive prop required | Blocker in source | **Checked, closed for the web vocabulary** (`webVocabulary.optional`; `MULTI-TARGET-PLAN.md` Phase 2 gap 3). Form-specific part is WA-5 |
| D2 | `mesh-case` cannot contain `mesh-if`/`mesh-switch`/`mesh-slot` | Blocker (MESH language) | Not re-checked |
| D3 | No string concatenation in MPRX (layout cannot build base-aware addresses) | Blocker (MESH language) | **Checked:** still true and an explicit non-goal (`MPRX-SPEC.md` §9.4); fix by framework-supplied addresses (WP-12) |
| D4 | No reusable kit of templates/tags | Blocker (design decision) | Overlaps WA-7 |
| D5 | State has no URL fragment | Worked around | `onNavigated` restores it |
| D6 | No hot swap of compiled templates | Blocker (MESH runtime) | README "Limits": updates are reloads |

### 3.3 From `application-model/ROUTING-AND-INTERCEPTORS.md` (v0.12 outcome)

| Gap | Recorded status |
|---|---|
| CLI `defineApp({ routes })` integration | Deferred (= WA-4) |
| `go` normalization bug in the CLI framework `go` | Deferred (not re-checked) |
| `Navigation` capability for back/forward | Deferred |
| Typed `Transport` interceptors and `defineApp({ platform })` | Deferred |
| `beforeunload` guard | Deferred |
| Nested routes | Deferred |
| Client-route rewrite rule from `vlx build`; link checking against declared routes | Work item 8, not built |

### 3.4 From `examples/docs-verifier/docs/FINDINGS.md` (rows recorded Open)

| ID | Gap (short) | Layer owner in source |
|---|---|---|
| F8 | Copy-to-clipboard needs a platform capability | PORT capability design |
| F9 | No on-page TOC (no anchor/scroll support) | PORT capability design. **Checked: partly closed**, `toc`/`hasToc` are in the layout scope; scroll-spy remains F21 |
| F12 | Boolean cannot be passed to a text attribute (`aria-pressed`) | PORT realization or MESH coercion |
| F13 | Required `class` prop on every use | = application-model D1 |
| F15 | Unknown in-app path rewrites the address bar | stand-in router; phase E |
| F18 | `mesh-if`/`mesh-each` directly under `mesh-each`: diagnostic names no place | MESH |
| F21 | Scrolling is not a nameable event | PORT |
| F22 | Stored theme read after take-over: flash of system theme | Valance/Port; phase E |
| F23 | No "presentation drawn" signal; focus/scroll polls | Valance |
| F31 | Code-group keyboard pattern | verifier. **Checked: partly closed**, PORT Web now realizes events by one key (Enter, Escape); the verifier has not adopted it |
| F16 | `BoundaryValue` not re-exported | `@valancex/valance` |

### 3.5 From `docs/FINDINGS.md` (core staged log)

Not itemised. Each stage ends with Confirmed / Likely / Unresolved (or OPEN / NEXT / DEFERRED). The open sections are at these lines of `docs/FINDINGS.md`: Unresolved 157, 226, 297, 354, 397, 841; OPEN 699, 740, 777; DEFERRED 937, 986; Next probe 1034, 1093, 1149, 1224, 1273, 1321, 1374, 1440, 1484. Itemising them, and marking which later stages closed them, is the largest remaining audit task.

### 3.6 From `PRINCIPLES.md`

P1 and O1 recorded fixed in follow-up releases; P2 (whole cause logged unredacted) was an open `it.fails` probe and is recorded fixed later (`PLATFORMS-HTTP-TITLES.md` row H3: identity only, `onStartFailure` gets the cause); P3 rides the next MESH release; O2 to O4 informational.

### 3.7 Re-baseline, 2026-10-16 (work package WP-10, first pass)

Checked against current code; each row replaces a "not re-checked" above.

| Item | Result | Evidence |
|---|---|---|
| `go` normalization (ROUTING deferred) | **Was open, now fixed** by this pass: `go("/a/")`, `go("a")`, `go("//")` reach `/a`, `/a`, `/` | `common/src/routes.ts` `tidy`, `app.ts`; test in `cli/test/navigation.test.ts` |
| F15 unknown in-app path rewrites the address bar | **Closed for `vlx`**: `urlOf` writes the page as given and the not-found page is shown; the address is kept | `common/src/routes.ts` |
| F16 `BoundaryValue` not re-exported | **Fixed** by this pass | `valance/src/index.ts`; `valance/test/boundary-value.test.ts` |
| Typed `Transport` interceptors | **Closed**: `defineApp({ http: { interceptors } })`, `withInterceptors` | `common/src/index.ts:189` |
| `defineApp({ platform })` | Still absent; interceptors cover the HTTP case | `common/src/index.ts` |
| Dev first paint (WA-6) | **Fixed for `vlx dev`** (head carries the styles). The built site was not measured | `cli/src/dev.ts`; tests in `cli/test/dev.test.ts` and `examples/docs-app/test/dev.test.ts` |
| Tag documentation drift (WA-5, docs part) | **Fixed**: the guide's table is generated and tested | `cli/src/tags.ts`, `cli/test/tags.test.ts` |
| D2, F12, F18, NATIVE-PARITY rows | Still not re-checked | |

## 4. How to audit coverage later

1. For each source document in §1 marked "not itemised", read its Open/Deferred/Unresolved sections and add its rows to §3 with the source's own wording and status.
2. For each row marked "not re-checked", search the current code for the behavior and change the status to **Checked: fixed / still open** with the file and line.
3. For each Open row, confirm it has a tracking entry in a plan or roadmap (`ROADMAP.md` in each repository, or `docs/application-model/*`). A row with none is an untracked gap; list it in §5.
4. Do not edit the original findings to match; add a dated line in the register instead.

## 5. Untracked gaps (no plan or roadmap entry found)

Starting list. The [gap analysis](2026-10-16-gap-analysis-and-proposed-work.md) §5 maps every live gap in §3 to a work package; rows marked [?] there still need step 2 of §4.

- WA-1, WA-3, WA-5, WA-6, WA-7: no entry in a roadmap or plan, other than the partial overlaps listed in §3.1.
- D2 and D3 (MESH language limits): not checked against `Mesh/docs` roadmaps.

## 6. Adding a finding

New file in this folder, named `YYYY-MM-DD-<topic>.md`. Start with date, method (what was run, what was only read), the scale in §2, a summary table with `ID | Finding | Layer | Sev | Status | Already recorded in`, one section per ID, a "Relationship to existing records" table and a "Not covered" list. Add a row to §1 and rows to §3.
