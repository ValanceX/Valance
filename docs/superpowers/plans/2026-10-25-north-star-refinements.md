# North star refinements: implementation plan

Spec: `valance/docs/direction/north-star-refinements.md` (the "refinements doc"; its §-numbers and item IDs A1…C-4 are binding). Scorecard: `valance/docs/NORTH_STAR_SCORECARD.md`. North star: `valance/docs/DESIGN_NORTH_STAR.md`.

Workspace root: `/home/jackmiller/Projects/@Valance` with four git repos: `valance/`, `nexus/`, `mesh/`, `port/`. Every repo works on branch `north-star-refinements` (already created from `main`).

## Global constraints

- Follow each repo's `CLAUDE.md` and existing doc voice: plain, dated, evidence-cited prose; tables where the repo uses tables. Match surrounding code idiom (Nexus: do-notation over `Effect.gen`, `.js` import extensions).
- Every public-API change names its north-star tier and states the scorecard audits it touches, before and after, in its release notes or changelog entry ("Unreleased" section of that repo's release/changelog convention).
- Additive only in Phase A and B: existing code and tests keep compiling and passing. No published API removed.
- Verification per repo (run the ones the task touches, report output):
  - valance: `pnpm typecheck && pnpm test && pnpm lint` (from `valance/`)
  - nexus: `pnpm typecheck && pnpm test && pnpm build`
  - port: `pnpm typecheck && pnpm test`
  - mesh: `cargo test --workspace` and, in `mesh/packages`, the package tests (`npm test` per package that the task touches)
- Commit on the branch with the repo's message style, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never publish, never merge.
- Do not edit `NORTH_STAR_SCORECARD.md` or `DESIGN_NORTH_STAR.md` (locked).
- When a document disagrees with the change, record the disagreement (in `valance/docs/direction/decisions.md` for design, or the task report); do not silently resolve it.
- Mesh 0.15 IS published to npm (versions 0.15.0, 0.16.0, 0.17.0 exist). Downstream repos consume Mesh from npm; a downstream task that needs unreleased Mesh changes uses local packs in a separate commit titled `DO NOT MERGE BEFORE THE RELEASES: …` (the repo's existing convention, see valance commit ffb896b / d3fc15e).

---

## Phase 0

### Task 1: Record the 2026-10-25 measurement (valance)

Create `valance/docs/north-star-validation-2026-10-25.md` modeled on `north-star-validation-2026-10-19.md`: method and limits, scores table, by-category table, full 19-row audit table (Eco, Valance, Nexus, Mesh, Port), evidence per audit. Source the results and evidence from refinements doc §1 and verify each cited `file:line` still holds. Per-repo results as of 10-25:

- Valance: as baseline except X1 P (judgment, `admit`/`budgets`/`Target.patch`/`ledger`), H1 ◐ (CSS hatch `use/themes.md:28-30`), H2 P; M1 P at risk (units).
- Nexus: as baseline except E3 P (`nexus/docs/stability.md:16-24`).
- Mesh: as baseline except M2 ◐ ("instance" overload).
- Port: as baseline except H1 ◐ (`inspect`, `port-web/src/port.ts:131-137`), H2 ◐.

Compute scores with the scorecard formula and show the arithmetic in an appendix. Link it from `north-star-validation-2026-10-19.md` ("Next measurement") and from `docs/README.md` if that page lists the baseline.

---

## Phase A: docs only (goal: ecosystem ≥ 66)

### Task 2: Valance docs A3–A9 (valance)

Implement refinements doc items A3, A4, A5, A6, A7, A8, A9 exactly as described there (§3 table). Specifics:
- A3: rows in `docs/stability.md` for every untiered export listed in refinements doc §1 (verify the export list against the actual entry files first; tier brands and `derivedOf` Internal, the rest Provisional with "since" version).
- A4: `docs/learn/first-application.md` derives the manifest with `manifest()` first; hand-written `components.json` becomes an aside. Keep every code sample runnable as written.
- A5: `docs/V1_CONTRACT.md` §3 sentence on unit state.
- A6: error-identity rule in `V1_CONTRACT.md` §10 and `stability.md`.
- A7: embedded-state note in `docs/learn/mounting-and-hydration.md` and contract §17.
- A8: new `docs/use/performance.md` (Tier 2), linked from `docs/use/` index.
- A9: new `docs/use/platform.md` (Tier 3), from `FINDINGS.md` Stage 55 (around lines 2373-2390); linked from `docs/use/` index.
Verification: `pnpm lint` plus any docs link check the repo has.

### Task 3: Nexus docs A1–A2 (nexus)

A1: README opens with a "first app" using only `Schema.Struct`, `State`, `Command`, `Runtime` (no Service/Layer/Resource). The snippet must compile: add it as a test (`tests/readme-first-app.test.ts` or the repo's existing docs-snippet test pattern) that runs the same code. Pitch and existing Effect example move below.
A2: fix the drift in refinements doc §1 (version 0.16.0, peer range from package.json, shutdown wording in README:18 and `docs/semantic.md:358` to match the grace-then-interrupt behavior in stability.md:18, "optional peer" wording in `docs/stability.md:21` to say it is a required peer loaded by the root entry, "nine primitives" count).
Verification: nexus full.

### Task 4: Port docs A10 (port)

README section "Leaving the portable layer" in `packages/port-web/README.md` listing `inspect`, `payload(event, element)`, user-implemented targets, each with its tier from `docs/stability.md`. Mark `docs/ARCHITECTURE.md:50` escape-hatch bullet "(direction, not built)" linking to that section. Rename README:49's "Tier 3" for `layer` table entries to a term that does not collide (e.g. "author level 3" → use "advanced entry"; pick a term and use it consistently in that file). Verification: port typecheck+test.

### Task 5: Mesh docs A11 (mesh)

Settle units status: Mesh 0.15.0 is published on npm, so units are released. Make `docs/manual/stability.md:21`, `README.md:122`, `docs/releases/v0.15.md:3` agree: units are released in 0.15.0 and tiered **Provisional** ("its first use is outside this repository (VALANCE), so it may change before it is called stable; a change is named in the release notes"). Add one paragraph in `docs/manual/runtime.md` (near the `release()` section) stating that keeping a render, its version, `release()` and unit state are Tier 2 host duties and that Tier 1 authors meet them through Valance. Verification: `cargo test --workspace` not required (docs only); run any docs check script in the repo.

### Task 6: Shared glossary A12 (all four repos)

Create `valance/docs/understand/glossary.md`: one entry per term — `scope` (each sense), `start`, `Host`, identity fields (`id`/`name`/`_tag`/`code`), unit, occurrence, instance (MPRX senses), `Render`, Tier 1/2/3 (north star sense only). Each entry: the meaning in each repo, the file where it is defined, and which name is canonical going forward (renames are deferred to 1.0; say so). Link it from `valance/docs/understand/README.md`, and add a one-line "Glossary" pointer to `nexus/docs/ARCHITECTURE.md`, `mesh/docs/manual/README.md` (or the manual index), `port/docs/ARCHITECTURE.md`. Verification: link targets exist.

### Task 7: Phase A audit (valance)

Re-score every audit Phase A touched (T1.3, E3, M1, M2, I1, I2, D2, X1, H1, E2) for every repo, against the scorecard definitions, with evidence. Update `docs/north-star-validation-2026-10-25.md` with a "After Phase A" table and recomputed scores. Goal: ecosystem ≥ 66. If below, list exactly which audit results block the goal.

---

## Phase B: additive API (goal: ecosystem ≥ 77)

### Task 8: B1 — `define` without `view` (valance)

`packages/valance/src/index.ts` (around line 69): type overloads so `view` may be omitted when `views` has exactly one key; it then defaults to that key. With more than one key, `view` stays required (type error). Tests for both cases (runtime default + `expectTypeOf`/`@ts-expect-error` for the multi-key case). Update `docs/stability.md` row and the docs page that documents `define`. Release-note entry with tier (Tier 1) and audits (T1.2 ◐→P with A4).

### Task 9: B5 — stability coverage test (valance)

A test (extend `packages/valance/test/tree-shaking.test.ts` or a sibling that uses its export-list mechanism) that fails when any public entry of any published Valance package exports a name not mentioned in `docs/stability.md`. It must pass after Task 2's rows; if it finds more untiered names, add their rows (Provisional unless obviously internal).

### Task 10: B3 — typed `invoke`, check warning, `resolve` union (valance)

- `ApplicationHandle<S, E, K extends string = string>` (around `index.ts:363-385`) with `K` inferred from the command table keys so `invoke` keys are typed; default keeps existing code compiling. Type tests.
- `vlx check` warning (new stable code, e.g. `command-argument-order`) when an event's parameter names differ in name or order from the bare command's input struct fields. Positional binding is unchanged. Test in the CLI package; document in the check-codes doc.
- Generated `.valance/types` gains a `package/name` union used by `resolve`. Test.
Release notes: Tier 1 (invoke) / tooling; audit I2.

### Task 11: B2 — Nexus defaults and hello example (nexus)

- `Runtime.make(layer = Layer.empty, …)` (`src/runtime/index.ts:39`).
- `Application.define` input may omit `runtime`; the stored definition record keeps `runtime` required (filled with `Layer.empty`).
- `examples/hello` (smallest runnable app, no Service/Layer/Resource), wired into tests the way `examples/basic-app` is. README first-app (Task 3) can now drop any layer argument; update it.
Tests for both defaults. Release notes (Tier 1; T1.1, T1.2).

### Task 12: B4 — Nexus schema widening, validated subscribe, structured cause (nexus)

- `Command.define` and `Event.define` accept `Schema.Schema<A, I, never>` via a defaulted type parameter on `Command`/`EventDef` so existing type references compile. `State` unchanged.
- `Event.subscribe(def, { validate: true })` decodes each payload with the def's schema; default unchanged.
- Validation failures carry a structured `cause` (the parse error) next to `issues`.
Tests for a transforming schema (e.g. `Schema.NumberFromString`), for validate on/off, and for `cause`. Update `docs/primitives/*.md` and `docs/stability.md`. Release notes (Tier 2 for validate; I2).

### Task 13: B6a — Port native hatch (port)

Implement refinements doc §4 "B6 design" in `packages/port-web`:
- New subpath export `@valancex/port-web/native` exporting the `native` option type and helper(s); the option itself is `native?: { [component: string]: (element: Element, info: { key: string }) => (() => void) | void }` on the web PORT options.
- Lifetime exactly as specified (after element exists on draw/insert/hydration adoption; cleanup before replacement/remove/draw/unmount, after focus hand-off). Server rendering ignores it.
- No dispatch/report handed to the callback. Port re-asserts owned slots on its next write: test that mutates an owned attribute in the callback and asserts the next update restores it.
- `opaque` marker on a primitive table entry: refused if the tree gives it children (stable error code); hydration skips its contents. `layer` primitives cannot be opaque (refused).
- Tests (jsdom) for each lifetime point, slot re-assertion, opaque refusal, hydration skip.
- Tier Provisional, Web only, not in contract v1: `docs/stability.md` row, README "Leaving the portable layer" (Task 4) gains it, `ARCHITECTURE.md:50` mark updated to "built (Provisional, Web)". CHANGELOG entry with audits H1, H2.

### Task 14: B6b — Valance passes the hatch through (valance)

- The Valance web entry (`packages/valance/src/web.ts`, `Web.run` around 428-450) accepts `native` and passes it to the web PORT, and accepts `target?: (base) => TargetFactory` so a wrapper keeps run's reporting duties.
- Port's new option exists only on the branch: build port-web locally and wire it in a separate `DO NOT MERGE BEFORE THE RELEASES: …` commit (local pack), keep the feature commit itself clean.
- Update `docs/use/platform.md` (Task 2) to show `native` and `target`. Tests. Boundary test still passes (Valance core entries name no DOM type: the option's type must live in the web entry only).

### Task 15: Phase B audit (valance)

As Task 7 for audits touched by Phase B (T1.1, T1.2, I2, E3, H1, H2). "After Phase B" table and scores in the 10-25 validation file. Goal ecosystem ≥ 77; list blockers if below.

---

## Phase C: decisions (goal: ecosystem ≥ 85)

### Task 16: Record decisions (valance)

In `valance/docs/direction/decisions.md`, add K-decisions in the file's existing format (next free K numbers) for:
- C-1 context channel, superseding the "context or provide/inject" row of Bet 8 (`bets/state-units.md:199`); annotate that row with a pointer to the decision (do not delete it).
- C-3 masking via `Schema.Redacted`, restating resumable start's invariant as "server and client render the same tree" (annotate `bets/resumable-start.md` near line 104).
- C-4 the instance → occurrence rename (deprecated aliases for one release; the old diagnostic code is retired, not reused).
- C-2 opt-in web vocabulary, not a default.
Each with the rationale and sources from refinements doc §5/§7.

### Task 17: C-4 — Mesh "occurrence" rename (mesh)

Rename the units API "instance" → "occurrence" across spec, manual, Rust crates, WebAssembly, JS runtime package, conformance vectors: `render.instances` → `render.occurrences`, `intent.instance` → `intent.occurrence`, diagnostic `runtime-unknown-instance` → new code `runtime-unknown-occurrence`. For one release the runtime still accepts the old input/property names as deprecated aliases (documented, tested); the old diagnostic code is retired, never reused. MPRX "instance" meanings (element of a component, repeat key) are unchanged. Version Mesh to 0.18.0 in the repo's release-prep way (bump, changelog, `docs/releases/v0.18.md` started, stability rows) without publishing. Tests in both runtimes.

### Task 18: C-1 — Mesh context channel (mesh)

Implement refinements doc §5 C-1 in Mesh:
- Spec: amend `docs/MPRX-SPEC.md` §9.1 (~line 445) wording to "no implicit names: a context name is in scope only where the manifest says the component uses it"; add the context section.
- Manifest: top-level `"context": { name: Type }`; component `"uses": [names]`; names join the component's scope read-only; clash diagnostic (`manifest-context-clash`, modeled on `manifest-unit-clash`); unknown name in `uses` diagnostic; older-MESH behavior already refuses unknown property.
- Runtime (Rust + WASM + JS): context values are an input beside the snapshot (like units); `updateChanges` path root `{ context: name }`; snippets/slots read context where declared.
- Conformance: vectors for check errors, render with context, and an update that re-evaluates a node whose context changed.
- Manual pages (manifest, runtime, templates) and stability row (Provisional, 0.18.0). Tests in both runtimes.

### Task 19: Downstream adoption of Mesh 0.18 (nexus, valance)

Against local packs of the Mesh branch (separate DO-NOT-MERGE commits):
- Nexus adapter: rename unit fields to occurrence, pass a `context` input through `Mesh.host`; tests.
- Valance: `define`/`defineApp` gain an optional `context: (state) => values` projection beside `scope`; the manifest generator emits `context` and component `uses` from `component()` contracts (`uses` option); docs page `docs/use/context.md` carrying React's guidance (props or children first; context for widely needed values like theme, locale, current user); rename unit-occurrence fields. Tests.

### Task 20: C-3 — masking via `Schema.Redacted` (valance)

- `renderToHtml` (`common/src/server.ts:40`, `web-server.ts:18-25`) omits fields whose schema is `Schema.Redacted` from the embedded state.
- `vlx check` errors when a Redacted field has no default, and when a view `scope` or `context` projection reads a Redacted field (stable codes).
- Hydrate restores omitted fields to their declared default.
- Tests: secret not present in HTML; hydrated tree equals server tree; both check errors.
- Update `learn/mounting-and-hydration.md` (replace the A7 interim note) and contract §17. Release notes (Tier 1; D2 ◐→P).

### Task 21: C-2 — opt-in Port web vocabulary (port)

`@valancex/port-web/vocabulary`: a data table plus its manifest mirroring `port-desktop-vocabulary`, covering at least the portable core (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`) with the same realizations Valance's core web vocabulary uses today (read `valance/packages/common` to match). `primitives` stays required. README first example imports it in one line. Stability row Provisional. Tests that the table is accepted by `createWebPort` and renders each primitive. Note in the task report the follow-up (Valance sourcing its table from here) without doing it.

### Task 22: Phase C audit and final measurement (valance)

Re-score all 19 audits for all four repos with evidence. Write the "After Phase C" section and final scores into `docs/north-star-validation-2026-10-25.md`. Goal ecosystem ≥ 85. Update the refinements doc status line to "implemented on branch `north-star-refinements`, not released".

---

## Phase B iteration (added 2026-10-26: Phase B audit scored 72 against the goal 77)

Targets the two Phase B audits worth most without trading extensibility: E2 (Mesh, Port; 3.5) and I2 (Valance, Nexus; 2.5). Port T1.2 via a default table is excluded (decided against in refinements doc C-2). All additive; every change states tier and audits before and after.

### Task 23: Mesh host helper (mesh) — E2 ◐→P

Add a Tier 1 helper to `@valancex/mesh-runtime` (and the Rust crate if the runtime's public surface is mirrored there; follow the repo's two-runtime convention) that owns the render lifecycle a host does by hand today: keeps the current `Render`, releases the previous one after its patches are taken, tracks `version`, holds unit state and routes unit intents. Shape (name chosen against `docs/understand/glossary.md` in valance and Mesh's own vocabulary; `Session` and `Host` are taken, so pick a non-colliding name and justify it): created from a compiled program and manifest; `show(snapshot)` returns what a renderer needs (the first tree, then patches); `dispatch(event)` returns the intent; `close()` releases everything (and `[Symbol.dispose]`). Existing `render`/`update`/`release()` unchanged (Tier 2 now). Tests in both runtimes where applicable; manual page (runtime.md) leads with the helper and moves the manual lifecycle under Tier 2; stability row Provisional; release notes for the next Mesh version (prepared, not published).

### Task 24: Port Web composer helper (port) — E2 ◐→P

Add a Tier 1 helper in `@valancex/port-web` that drives a PORT from a Mesh program without the caller choosing draw vs update or releasing renders: it uses the Mesh runtime (Port Web may depend only on `@valancex/mesh-runtime`; the boundary test must still pass) — if Task 23's helper is available on the Mesh branch, use it through a DO-NOT-MERGE local pack commit; otherwise build on `render`/`update` directly and note the follow-up. `show(snapshot)` draws first, then updates; events from the PORT come back as intents to a callback. Existing `draw`/`update`/report contract unchanged (Tier 2). Tests (jsdom); README Tier 1 example leads with it; stability row Provisional; CHANGELOG with audits.

### Task 25: Valance strict command keys (valance) — I2 ◐→P (with Task 26)

Additive, opt-in: (1) a typed accessor for commands on the application handle keyed by the command table (e.g. `handle.command("app/select")` or a `commands` object — choose to match the handle's existing idiom) whose key is checked (typo = type error) and whose arguments are typed from the command's input schema where it is a struct; `invoke(key: string)` is unchanged. (2) Named binding for bare commands: when every event parameter name matches a field of the command's input struct, bind by name; otherwise positional as today (the `command-argument-order` warning stays for the positional case). This changes behavior only where names match but order differs — a case already warned as wrong; name it under "behavior" in the release notes. Tests, docs (`docs/use/` page that documents invoke and command binding), stability rows, `docs/releases/v0.16.md`.

### Task 26: Nexus event identity (nexus) — I2 ◐→P (with Task 25)

Close the `_tag` cross-delivery hazard (docs/primitives/event.md ~88) additively: the runtime refuses, with a typed defect (stable code, following the repo's error identity), a second distinct `EventDef` using a tag already registered in the same runtime (detected at first publish/subscribe of a def). Subscriptions to a def then can only receive that def's payloads, so the cast is sound; document why. Name the change under "behavior" in `docs/releases/v0.17.md` (it refuses only programs that already have the documented hazard). Tests: two defs same tag → defect; same def used twice → fine; distinct tags → fine.

### Task 27: Phase B iteration audit (valance)

As Task 15, for E2 and I2 across all repos, appending "After Phase B iteration" to the 10-25 validation file. Goal ecosystem ≥ 77.
