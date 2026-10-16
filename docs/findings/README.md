# Findings register

One place to find every findings, friction and decision record in this repository, and to check later whether each gap in them is covered. **No existing document was moved**: `FINDINGS.md`, `CONSTRAINTS.md` and `V1_CONTRACT.md` are cited by name from source, tests and releases, so this register points at them instead.

Written 2026-10-16. Statuses below are **as recorded in each source document**; unless a row says "checked", they were not re-verified against the current code.

## 1. Documents

| Document | Scope | Kind | Item IDs | Size |
|---|---|---|---|---|
| [`2026-10-16-web-authoring-model.md`](2026-10-16-web-authoring-model.md) | Authoring a web app with `vlx`: styles, rendering mode, routes, dynamic pages, forms, dev paint | Investigation (code reading, nothing run) | WA-1 to WA-7 | 7 items |
| [`2026-10-16-gap-analysis-and-proposed-work.md`](2026-10-16-gap-analysis-and-proposed-work.md) | Triage of every gap in this register against the ecosystem direction; proposed work packages WP-1 to WP-17; coverage cross-check; decisions Q1 to Q7 | Analysis (reading only) | DP1 to DP10, WP-n, Q-n | |
| [`2026-10-16-orders-app.md`](2026-10-16-orders-app.md) | A master-detail screen over a backend on nested routes with loaded data, scored; WA-12, WA-13, RF-12, RF-13 and the second case for RF-4 to RF-6 | Investigation (built and tested) | WP-18 |
| [`2026-10-16-reference-form.md`](2026-10-16-reference-form.md) | A real sign-up form on a declared route, scored; gaps RF-1 to RF-10 and what they justify | Investigation (built and tested) | RF-1 to RF-10 | 10 items |
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
| WA-1 | Component-scoped styles | 2 / FW | **Fixed for the web (tier 1)**; portable style language (tier 2) deliberately not built | `application-model/STYLING.md`; `cli/src/styles.ts` |
| WA-2 | Rendering mode not visible or settable; dev vs build differ | 2 / FW | **Fixed**: visible in `valance.web.json`; `client` per route and per site (slice 6b); `server` refused | ROUTING R1 (`delivery`) |
| WA-3 | Routes undiscoverable, no listing command | 2 / FW | **Fixed**: `vlx info` (WP-3) | ROUTING (model note) |
| WA-4 | `defineApp({ routes })`; custom pages, params, query, per-route guard/delivery | 3 / FW | **Fixed**: slices 6a to 6g (WP-6) | ROUTING R1, items 6 and 8; v0.12 "Deferred" |
| WA-5 | Form primitives, validation recipe, missing tags in docs | 2 / FW | **Fixed** except select/radio: tags generated (WP-7), form primitives (RF-1 to RF-3), reference form (WP-8); the rest is RF-4 | application-model D1 (partly) |
| WA-6 | Dev HTML has no stylesheet link: unstyled first paint | 2 / FW | **Fixed and measured** (WP-1a; `first-paint.test.ts`: layout shift 0 in dev and built under 250 ms of added latency; measuring found WA-9) | verifier F22 (related) |
| WA-7 | Components inside Markdown | 2 / FW | Open → WP-13 (decision Q4) | application-model D4 (related) |
| WA-8 | The browser removed and re-inserted the stylesheet `<link>` in the head on **every** state change: the page lost its styles until the browser applied the new link, and the layout jumped (found as RF-11) | 3 / FW | **Fixed**: `applyHead` keeps a tag that has not changed | reference form (RF-11); WA-6 (related: first paint) |
| WA-9 | An image with no width and height moved the page when it loaded (layout shift 0.0077 on the scaffold, found by measuring WA-6) | 2 / FW | **Fixed**: content images carry the size their file says (PNG, GIF, JPEG, WebP, SVG); the first-paint test pins a shift of 0 | WA-6 |
| WA-10 | The desktop host never reports the window's width, so `viewport` stays `expanded` in a window (found re-baselining NATIVE-PARITY #9) | 2 / FW | **Fixed** (the `resize` message; unreleased in the Port; not driven in a real window) | NATIVE-PARITY #9 |
| WA-11 | A child route's `enter` and `title` receive every level's parameters at run time but are typed with only their own; a redirect cannot name a content page | 2 / FW **Fixed** (typed `children`, address redirects; ROUTES.md amendments) | ROUTES.md 6g, 6f |
| WA-12 | Entering a child route reloaded its parent's data and reset the parent's state to loading (found building the orders app) | 3 / FW | **Fixed**: a level a move stays inside is not entered | `2026-10-16-orders-app.md` |
| WA-13 | A route guard sees the state's fields and not the derived values, so a rule used by both is written twice | 1 / FW **Fixed** (guards see derived values) | `2026-10-16-orders-app.md` |
| WA-14 | No `label` element: a control's visible name cannot be tied to it (a radio's or checkbox's `label` is only the accessible name; the reference apps draw it with CSS) | 2 / FW, PORT | Open → WP-27 | CHOICE-GROUP.md |
| WA-15 | The Desktop PORT's `button` has a `label` (its accessible name) and the web's does not, so a portable template cannot name a button without text; found by the parity check against a Port checkout | 1 / FW, PORT | Open → WP-27 | CHOICE-GROUP.md |

### 3.1b From the reference form (this folder)

| ID | Gap | Sev / layer | Status |
|---|---|---|---|
| RF-1 | Text field cannot be a password / email / number (no `type`) | 3 / FW, PORT | **Fixed** (web: Valance; desktop: Port, unreleased) |
| RF-2 | No `aria-invalid` / `aria-describedby` / `id` on messages | 3 / FW, PORT | **Fixed** (same) |
| RF-3 | No `blur` / `focus` events | 2 / PORT | **Fixed** (same) |
| RF-11 | A click that follows leaving a field could be lost | 2 / FW | **Fixed**: not a controlled-control race; the stylesheet was re-inserted on every state change (WA-8) |
| RF-4 | No radio group / select | 2 / FW, PORT **Fixed** on the web (`radiogroup`, `radio`; CHOICE-GROUP.md) and in the Desktop PORT (unreleased) |
| RF-5 | A waiting command cannot read the state it starts from | 3 / FW **Fixed**: `work` receives the state after `begin` (COMMAND-SURFACE.md C-1) |
| RF-6 | A failed request carries no body (server field messages unreachable) | 2 / FW **Fixed**: `request({ errors: Schema })` (COMMAND-SURFACE.md C-4) |
| RF-7 | Content cannot link to a declared route | 2 / FW | **Fixed** (slice 6c) |
| RF-8, RF-9 | Long screen contract; a Schema message ignored by some combinators | 1 | Document / no change |
| RF-10 | Can a success navigate from `settle`? | ? **Accepted**: not needed in two applications; no change (COMMAND-SURFACE.md C-8) |
| RF-12 | No table (rows and columns with their meaning) | 2 / FW | Open → WP-24 |
| RF-13 | The space between two interpolations in a template is dropped (`{a} {b}` reads `ab`) | 1 / Eng | Open → WP-26 |

WA-5 (form building blocks) is answered by this: no helper; RF-1 to RF-3, RF-5 and RF-6 first.

### 3.2 From `application-model/FINDINGS.md`

| ID | Gap | Recorded status | Note |
|---|---|---|---|
| F1 to F8 | Tracer implementation failures | Fixed (source) | |
| D1 | Every primitive prop required | Blocker in source | **Checked, closed for the web vocabulary** (`webVocabulary.optional`; `MULTI-TARGET-PLAN.md` Phase 2 gap 3). Form-specific part is WA-5 |
| D2 | `mesh-case` cannot contain `mesh-if`/`mesh-switch`/`mesh-slot` | Blocker (MESH language) | Not re-checked |
| D3 | No string concatenation in MPRX (layout cannot build base-aware addresses) | Blocker (MESH language) | **Checked:** still true and an explicit non-goal (`MPRX-SPEC.md` §9.4). **Worked around by the framework**: literal site addresses in a template get the base put in front at build (`cli/src/addresses.ts`) |
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
| F12 | Boolean cannot be passed to a text attribute (`aria-pressed`) | **Fixed for any prop that asks**: the web vocabulary's `types` rule retypes it (used for `invalid`); `pressed` is left a string for compatibility |
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
| Declared routes (WA-4) | **Slices 6a to 6g all done** (6a routes, 6b client delivery, 6c links, 6d screens, 6e `load`, 6f guards/redirects/leaving, 6g nested routes and the outlet). **Slice 6a**: `routes` in `defineApp` with params, query, `enter`, static enumeration; checked against the design note, differences recorded | `docs/application-model/ROUTES.md` (Implementation status) |
| Rendering mode visible (WA-2) | **Fixed (visibility)**: `rendering` in `valance.web.json`, written by `vlx init`, reported by `vlx build`; `client` and `server` refused with the reason. Per-route modes wait for WP-6 | `cli/src/config.ts`, `cli/test/config.test.ts` |
| Routes and project listing (WA-3) | **Fixed**: `vlx info` (routes with their files, styles, components, settings, tags) | `cli/src/info.ts`, `cli/test/info.test.ts` |
| Dev first paint (WA-6) | **Fixed for `vlx dev`** (head carries the styles). The built site was not measured | `cli/src/dev.ts`; tests in `cli/test/dev.test.ts` and `examples/docs-app/test/dev.test.ts` |
| Tag documentation drift (WA-5, docs part) | **Fixed**: the guide's table is generated and tested | `cli/src/tags.ts`, `cli/test/tags.test.ts` |
| F18 `mesh-if`/`mesh-each` directly under `mesh-each` | **Superseded by the block syntax**: `{#each}` containing `{#if}` compiles (probe in a scaffolded layout; the only diagnostic was an unrelated missing prop, with file, line and column) | `vlx check` probe 2026-10-16 |
| D2 `mesh-case`/`mesh-switch` nesting | Likely superseded: `mesh-switch`, `mesh-if` and `mesh-each` are retired and rejected in favour of `{#if}`/`{#each}` blocks (CLI guide) | Not probed for `{#if}` chains inside slots |
| F12, NATIVE-PARITY rows | Still not re-checked | |

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
