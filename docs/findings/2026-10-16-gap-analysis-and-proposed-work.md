# Gap analysis and proposed work

Written 2026-10-16. Inputs: every document in the [register](README.md), the roadmaps and architecture notes of the four repositories (`Nexus/docs/ROADMAP.md`, `Port/docs/ROADMAP.md`, `Mesh/docs/ARCHITECTURE.md` "Direction", `Valance/docs/CONSTRAINTS.md`), and the web-authoring findings [WA-1 to WA-7](2026-10-16-web-authoring-model.md).

**Method and limits.** This is a reading exercise; nothing was built or run. Each disposition carries an evidence tag:

- **[V]** checked against current code or specs while writing this;
- **[S]** taken from the source document's own later status (a later stage, a plan's "done" row, a release note);
- **[?]** not re-checked: it needs a person or a later pass to confirm before work is scheduled.

The proposed work is a recommendation, not a decision. Section 6 lists what needs a maintainer's call.

## 1. The direction the ecosystem has set

Each gap is judged against these. They are quoted or paraphrased from the documents named, not invented here.

| # | Direction | Where it is stated | What it means for a gap |
|---|---|---|---|
| DP1 | **Semantics, not implementations.** MESH and NEXUS say what the UI and the application mean; PORT decides how each target realizes it. | `Mesh/docs/ARCHITECTURE.md` "Direction"; `Port/docs/ROADMAP.md` Purpose | A feature that is only meaningful on the web (CSS scoping, a `<form>` element) belongs in the web target, not in the portable contract |
| DP2 | **Evidence before abstraction.** No universal styling, renderer or capability catalogue until a second concrete case shows the need. | `Port/docs/ROADMAP.md` V0.4 ("Do not invent a universal styling abstraction unless the Web implementation demonstrates…"); `Nexus/docs/ROADMAP.md` §8 | Prefer a worked reference application that exposes the friction, then extract. Do not design a form or style framework first |
| DP3 | **A rendering mode is a composition, not a framework mode.** SSR, prerendering, streaming are NEXUS + platform + MESH + PORT + tooling. | `Nexus/docs/ROADMAP.md` §12, §13 | "Make the app SSR" is a build and target setting plus a server platform, never `Nexus.ssr()`. The project can surface the choice, but a `server` mode needs a server platform to exist first |
| DP4 | **Tooling composes; it is not a semantic owner.** Dev server, HMR, build, SSG, deployment live outside the core packages. | `Nexus/docs/ROADMAP.md` §16, §15; `CONSTRAINTS.md` C45 | Visibility and configuration of delivery (WA-2, WA-3, WA-6) are CLI work. Routing semantics are `@valancex/router`'s, not core's |
| DP5 | **Environment access is a capability**, supplied per platform (`Http`, `Store`, `Open`, a navigation stack). | `Nexus/docs/ROADMAP.md` §3.3, §17; `NATIVE-PARITY.md` | Features that need a platform (storage, back stack, opening links) are capabilities with a web and a native implementation |
| DP6 | **Target specifics are explicit.** `@target` rule conditions, `override`, escape hatches visibly leave the portable layer. | `Mesh/docs/ARCHITECTURE.md` "Styling follows the same split", "Escape hatches are explicit" | Per-target directories (`src/web/`, `src/desktop/`) and explicit overrides are the idiom for anything not portable |
| DP7 | **Inspectable and traceable.** A developer can follow an element from MPRX through MESH output to what a PORT made of it. | `Mesh/docs/ARCHITECTURE.md` "Inspectable" | Settings, routes, tags and styles should be listable from the project, not only discoverable by reading source |
| DP8 | **Progressive disclosure, fewest concepts for the common task.** Measured by the cognitive-load scale. | `Mesh/docs/standards/api-design-principles.md` §2; `COGNITIVE_LOAD.md` | The user's expectation that it be "obvious where to see and modify" a setting is this principle. Defaults stay; the knob is visible |
| DP9 | **MPRX is deliberately small.** No code, no side effects; string building in a prop is an explicit non-goal. | `Mesh/docs/MPRX-SPEC.md` §9.4 and its non-goals list (line 997) | Do not fix template limits by adding language features that the spec has ruled out; supply values from the framework instead |
| DP10 | **Secure by default**; changing a Stable surface is a minor release's decision. | `PRINCIPLES.md` §11; `stability.md` | Dev/build parity must not weaken defaults (WA-6, dev headers) |

## 2. Triage of every recorded gap

"Closed" and "Superseded" need no work; they are listed so the register can be read as complete. "Live" rows are mapped to a work package (WP) in §4; the cross-check is §5.

### 2.1 `application-model/FINDINGS.md`

| ID | Disposition | Evidence | Note |
|---|---|---|---|
| F1 to F8 | Closed | [S] | Tracer implementation failures, all fixed |
| D1 required props | **Closed** for the web vocabulary | [V] `webVocabulary.optional` in `packages/common/src/vocabulary.ts`; [S] `MULTI-TARGET-PLAN.md` Phase 2 gap 3 "done" | A general mechanism exists; the form-specific part is WA-5 |
| D2 `mesh-case` cannot contain `mesh-if`/`mesh-switch`/`mesh-slot` | Live | [?] | MESH language. Related: verifier F18 |
| D3 no string concatenation in MPRX | **Live, and a non-goal to fix in the language** | [V] `MPRX-SPEC.md` §9.4 "`+` is numeric only", non-goal at line 997 | Fix by supplying computed addresses from the framework (WP-12), not by changing MPRX (DP9) |
| D4 no reusable kit of templates/tags | Live | [S] | Needs a design decision; blocks third-party kits and Markdown islands (WP-9, WP-13) |
| D5 state has no URL fragment | Worked around | [S] | `onNavigated` restores it; no work |
| D6 no hot swap of compiled templates | Live | [V] README "Limits": updates are reloads | WP-14; NEXUS-side question is "what state survives replacement" (`Nexus/docs/ROADMAP.md` §15) |

### 2.2 `NEXT-CYCLE.md`

D1 to D6 are recorded done [S] (authoring API split into `@valancex/common`, `generate`/`help`, inferred uses, outline). One item inside it is **not** done: §3 proposal 4, co-locating a component's files for generation and CSS scoping. It is undecided and is WA-1 (WP-5).

### 2.3 `ROUTING-AND-INTERCEPTORS.md` (v0.12/0.13 outcome)

| Item | Disposition | Evidence |
|---|---|---|
| CLI `defineApp({ routes })` | Live (= WA-4) | [V] `defineApp` has no `routes`; WP-6 |
| `go` normalization bug in the CLI framework `go` | Possibly closed | [?] `app.ts` imports `normalize` for `go`; confirm |
| `Navigation` capability (back/forward stack) | **Closed for `vlx` apps** | [V] framework commands `back`/`forward`, state `canGoBack`/`canGoForward`, `persist: ["navigation"]` (README) |
| `beforeunload` guard | Live | [V] only a comment in `packages/router/src/router.ts:556`; desktop has `mayLeave` [S] |
| Typed `Transport` interceptors, `defineApp({ platform })` | Live [?] | `PLATFORMS-HTTP-TITLES.md`; not re-checked |
| Nested routes | Live, deferred | [S] |
| Client-route rewrite rule from `vlx build`; link checking against declared routes | Live | [S] work item 8; WP-6 |

### 2.4 `examples/docs-verifier/docs/FINDINGS.md`

| ID | Disposition | Evidence | Note |
|---|---|---|---|
| F1 to F7, F17, F19 to F20, F27, F29 | Closed or by design | [S] | |
| F8 clipboard | Live | [S] | PORT capability (DP5); only when an app needs it. No WP until a requirement exists |
| F9 on-page TOC | **Partly closed** | [V] `scope.ts` provides `hasToc`/`toc` | Scroll-spy ("which heading am I at") is still F21 |
| F12 boolean to text attribute | Live | [?] | PORT realization or MESH coercion (WP-12) |
| F13 required `class` | Closed | = D1 | |
| F15 unknown in-app path rewrites the address | Live [?] | | Re-check against the `vlx` route table (`known`); likely closed by the not-found page. WP-6 verifies |
| F16 `BoundaryValue` not re-exported | Live [?] | | Tiny; WP-16 |
| F18 diagnostic names no place for `mesh-each` children | Live | [?] | WP-12 |
| F21 scroll is not a nameable event | Live | [S] | PORT page-level events; WP-11 |
| F22 stored theme read after take-over: flash of system theme | Live | [S] | Same pattern in the scaffold (`theme` default `"light"`, persisted state read after start). WP-1b |
| F23 no "presentation drawn" signal; focus/scroll poll | Live | [S] | Valance signal; WP-11 |
| F24, F25, F28 map and render cost | Accepted, measured | [S] | Scale gap for `vlx`: the whole content ships in the bundle (README "Limits"). WP-15 |
| F26, F30, F32, F33 | Accepted or by design | [S] | |
| F31 code-group keyboard pattern | **Partly closed** | [V] `Port/CHANGELOG.md` and `port-web/README.md`: events can be realized by one key (`submit` on Enter, `cancel` on Escape) | Arrow-key tab pattern is now expressible; the verifier's kit has not adopted it. Verifier-local |
| "Still to build: bounded recursion (F4)" | Live | [S] | MESH; nested lists/nav trees. WP-12 |

### 2.5 `PRINCIPLES.md`

P1 closed (port-web 0.4.1) [S]. P2 **closed**: the start-failure log carries identity only and `StartOptions.onStartFailure` gets the cause [S] `PLATFORMS-HTTP-TITLES.md` row H3. P3 rides the next MESH release [S]. O1 closed [S]. O2 to O4 informational.

### 2.6 Multi-target and native parity (`MULTI-TARGET*.md`, `NATIVE-*.md`)

`MULTI-TARGET.md` gaps 1 to 13 are mostly closed [S] by `MULTI-TARGET-PLAN.md`: shared core names, optional props, per-target stylesheets (gap 8; `src/desktop/` CSS is not loaded by the web [V] `emit.ts:49`), derived values, `generate target`, `dist/<target>/`, editors, `label` on controls. Remaining from that plan [S]: vendored vocabulary copies (needs the Port to publish its vocabulary as data), the window keeping its process when the engine restarts, a `vlx check` warning for an unnamed control.

`NATIVE-PARITY.md` was written before several things shipped and its matrix is **stale** [?]. Rows that look closed from the README: Store (`persist`), Open (`Open` capability), back stack (#17), title (#21), viewport (#9), `go` over a wire. Rows still open per the document: the portable vocabulary decision (#4) and styling (#7, "CSS does not carry over"), keyboard on the desktop (#11), images (#13), accessibility mapping (#10), macOS (#31), `vlx dev` window reconnect (#28), external link and deep link (#16, #18). WP-10 re-baselines this matrix before any native work is scheduled.

`PLATFORMS-HTTP-TITLES.md` open: window capability and webview shell (item 9, "large"); several root layouts chosen by state (item 8); the dev server sends no security headers [S].

### 2.7 `docs/FINDINGS.md` (core staged log, Stages 1 to 56)

The log is a chronology; most "Unresolved" lists were answered by a later stage. Triage of the groups:

| Group (lines) | Disposition | Evidence |
|---|---|---|
| URL sync, links as buttons, unknown paths, query strings, hashes, base path, trailing slash, canonicalization (157 to 404) | **Superseded** | [S] Stage 7 (`Web.history` contract), C39 (a link is a destination), base path in `valance.web.json`, router 0.12. What remains is WA-4 (query as state in `vlx`) and scroll/focus restoration on Back/Forward, which is left to the browser by design [V] `routes.ts` |
| `Running.nexus`, early end, public Application API, `Mounted`/`DispatchExit` packaging (699 to 986) | **Decided** | [S] Stages 38 to 43 |
| Command-lifetime probes (Stages 20 to 28 "Next probe") | **Superseded** | [S] Stage 29 adopted the contract |
| Stale results (Stage 31/32 "unresolved") | **Closed** | [S] `command.waiting` with `wanted` and supersession (verifier F20; `learn/async-work.md`) |
| Event-exit ledger reader (Stages 34 and 40) | Decided: diagnostic facility | [S] Stage 40 |
| Checkpoint "still unproven" (line 57 onward) | Mixed, see below | |

Checkpoint "still unproven":

| Item | Disposition |
|---|---|
| A second target | **Closed in part**: Desktop PORT and the text target exist [S]; no mobile |
| A real async resource in a real page (network, storage) | Closed in part: `Http` capability with tests against a real backend [S]; storage across bfcache unexercised [?] |
| Data that ages after a restore | Live, untriggered; take up only with a requirement |
| Long-lived pages (ledger growth) | Live, untriggered |
| Several mounts in a real browser page | Live, untriggered |
| **Other browsers (Firefox, WebKit)** | **Live**: only Chromium is driven; WP-17 |
| Published-package consumption | **Closed** [S] published from 0.1.0; the stability of `./internal` remains untested |
| Server-side commands | Outside the model by design ([V] README "Limits": "server rendering of a command that waits is not" part of the model); revisit only with DP3's server platform |
| Async or chunked target realization; incremental MESH rendering | Live, untriggered |

### 2.8 The seven web-authoring findings

Live, mapped in §4: WA-1 (WP-5), WA-2 (WP-2), WA-3 (WP-3), WA-4 (WP-6), WA-5 (WP-7, WP-8), WA-6 (WP-1), WA-7 (WP-13).

## 3. Cross-cutting observations

1. **The portable/web split decides most of the answers.** Styling (WA-1), forms (WA-5) and links/islands (WA-7) look like CSS or HTML problems but sit on the line between the portable core and the web target. The ecosystem's rule (DP1, DP6) is: the portable contract names intent; the web target spells it. So scoped CSS should be a web-target feature, and form tags should join the portable core only if the desktop target can realize them.
2. **Visibility is a different problem from capability.** For rendering mode, routes, stylesheets and tags, the capability mostly exists (`delivery`, route table, `primitives.ts`) but nothing in the project shows it. These are the cheapest wins and answer the "where do I see and change it" complaint directly (DP7, DP8).
3. **One large item gates several others.** `defineApp({ routes })` (WP-6) is the prerequisite for custom pages, params, query, per-route delivery and guards, and it is the right home for the rendering setting. It is decided and sized "large" in `ROUTING-AND-INTERCEPTORS.md`.
4. **Several recorded gaps have been fixed without the record saying so** (D1, F13, F31, F9, P2, stale results, much of NATIVE-PARITY). The register should be re-baselined, not just extended. That is WP-10.
5. **Docs drift is itself a gap.** The CLI guide's tag list omits `textfield` and `checkbox`, which exist [V]. The tag table in `primitives.ts` should generate the documentation (WP-7).

## 4. Proposed work

Sizes: **S** under a day, **M** days, **L** weeks. "Fits" names the directions in §1 it follows. Every WP lists an acceptance test so it can be checked later.

### Theme A: delivery and visibility (Valance CLI and `@valancex/common`)

| WP | Work | Closes | Size | Fits | Acceptance |
|---|---|---|---|---|---|
| **WP-1** | **Dev first paint.** (a) In `vlx dev`, write `<link rel="stylesheet">` for the project's CSS in the server-rendered head (pass the stylesheet list instead of `styles: []`, `dev.ts:133`), keeping Vite's in-place update. (b) Decide the theme-flash fix (F22): a tiny head script that sets the theme attribute before paint, or accept it. | WA-6, F22 | S (a), S–M (b) | DP4, DP10 | Test: dev HTML contains the link; a trace of first paint in dev and in a built site shows no layout shift. Measure both before claiming a fix |
| **WP-2** | **Make the rendering mode visible and settable.** Add `rendering` to `valance.web.json` (default `"static"`; reserve `"client"`), write the file in the scaffold with its `$schema`, print the mode per page in the `vlx build` summary, add a README section "How pages are delivered" stating that `vlx dev` renders on demand and `vlx build` pre-renders. Do **not** add an `ssr` value until a server platform exists. | WA-2 | S–M | DP3, DP7, DP8 | `vlx init` output contains the setting; `vlx build` lists `path  mode`; a test pins that an unknown value is a diagnostic |
| **WP-3** | **A project X-ray command.** `vlx info` (or `vlx routes`, `vlx tags`) printing: targets, rendering mode, base path, routes (address, file, section, order), stylesheets loaded in order, registered components, the tag vocabulary per target. `--json` for editors. Add a comment block at the top of the scaffolded `main.ts` saying routes come from `content/`. | WA-3, part of WA-1 and WA-5 | M | DP7, DP8 | Output on the scaffold matches the files; `--json` schema documented; the same data feeds `.valance/editor.json` |

### Theme B: styling

| WP | Work | Closes | Size | Fits | Acceptance |
|---|---|---|---|---|---|
| **WP-4** | **Decision note: style direction in three tiers.** Tier 1 (now, web-only): component-colocated CSS. Tier 2 (later, when a second target needs it): a small portable style vocabulary (spacing, emphasis, intent), per `NATIVE-PARITY.md` #7 and `Mesh/docs/ARCHITECTURE.md`. Tier 3: explicit per-target overrides (`@target`). Record it so tier 1 is not mistaken for the portable answer. | frames WA-1 | S | DP1, DP2, DP6 | One page in `docs/application-model/`, linked from `NEXT-CYCLE.md` §3 |
| **WP-5** | **Tier 1 implementation: component-scoped web CSS.** A stylesheet named after a component and placed beside it (`theme-toggle.css`) is picked up automatically and scoped (`@scope (<root>)`, or a generated class prefix) so a rule cannot leak; a stylesheet with no component, or a component name that does not exist, is a `vlx check` diagnostic. In a multi-target project it lives under `src/web/` (the established idiom). It is **not** a field on the portable `component(...)` contract. Resolve the open question of components whose template root is a `mesh-fragment` (no element to scope to). | WA-1; `NEXT-CYCLE.md` §3.4 | M | DP1, DP6 | Deleting a component flags its orphan CSS; two components using the same class name do not collide (browser test); the desktop build ignores it |

### Theme C: routing and pages

| WP | Work | Closes | Size | Fits | Acceptance |
|---|---|---|---|---|---|
| **WP-6** | **`defineApp({ routes })`** (decision R1, `ROUTING-AND-INTERCEPTORS.md`). Split: **6a** declare routes with Schema'd params and query, an `enter` command that copies them to state, content pages remaining one route kind; **6b** per-route `delivery` and `staticParams`, the build writes the client-route rewrite beside `_headers`; **6c** `vlx check` verifies internal links against declared routes (with params), including the query-link build error; **6d** bind a route to a layout screen or component so a custom page needs neither a Markdown stub nor a layout `{#if}`; **6e** list declared routes in `vlx info`. Route declaration stays target-neutral (it is state); only URL realization is web. | WA-4, WA-2 (per-route), F15 verification, deferred router items | L (6a to 6e) | DP1, DP3, DP4, DP8 | The to-do app's route set (`examples/todo/src/routes.ts`) can be expressed in a `vlx` project and builds; a page with a `:id` param is generated for each `staticParams` entry; `canActivate`/`canDeactivate` run in the project |
| **WP-6f** | Follow-ons already recorded as deferred: `beforeunload` guard on the web (the desktop has `mayLeave`), nested routes. | router backlog | M each | DP5 | Only when a requirement exists; keep as tracked items |

### Theme D: forms, input and accessibility

| WP | Work | Closes | Size | Fits | Acceptance |
|---|---|---|---|---|---|
| **WP-7** | **Generate the tag reference from `primitives.ts`**, one table per target, into the CLI guide (or `vlx info --tags`). Immediately add `textfield` and `checkbox`. | WA-5 (docs part) | S | DP7 | The README table is produced by a script; a test fails when a tag is added without regeneration |
| **WP-8** | **Reference form, then extract.** Build one realistic form in `examples/` (text, checkbox, select, textarea, validation errors from a Schema, async submit with `command.waiting`, server-error mapping, keyboard Enter/Escape). Score it on the cognitive-load scale. Only after that, decide additions: portable core names (`select`, `textarea`, `label`, input types) realized on web **and** desktop, and web-only accessibility hooks (`aria-invalid`, `aria-describedby`, `required`) as optional props. Write the validation recipe (fields in state, Schema for the submit command, errors in `derived`) in the learning path. | WA-5 | M | DP2, DP1 | Example builds on both targets or documents why a field is web-only; recipe page exists; a list of any score-2 or 3 rows becomes the input to new PORT table entries |

### Theme E: template language and kits (MESH and Valance)

| WP | Work | Closes | Size | Fits | Acceptance |
|---|---|---|---|---|---|
| **WP-9** | **Library mechanism design note**: how a package contributes templates and tags (what `Plugin` lacks today). Needed by kits, third-party components and islands. Design only. | D4 | M | DP1, DP4 | A note with the smallest package-contributed component working in a spike |
| **WP-12** | **Template-limit fixes that stay inside the language's rules.** (i) **D3**: let `image src` and `link href` accept project-relative addresses and resolve them against `base` in the primitive's realization, so a layout needs no concatenation (keeps DP9). (ii) **F18/D2**: give assembly diagnostics a template and location first (small), then decide whether to relax the nesting rules. (iii) **F12**: realize enumerated or boolean-as-text attributes in PORT Web's table (or let the compiler convert a boolean for a text slot). (iv) **F4**: bounded recursion for nested lists and navigation trees. | D2, D3, F12, F18, F4 | S (i, ii-diagnostic), M–L (rest) | DP9, DP7 | A layout can reference `public/logo.svg` under a non-root `base`; an assembly diagnostic names file and line |
| **WP-13** | **Markdown islands** (WA-7), after WP-6d. Recommended shape: a directive in Markdown resolved against registered `components`, checked at build time like links, producing a `component` block in the content model so the desktop target can draw it as well. Alternative: say no, and point to custom pages. Decide first (Q4). | WA-7 | M | DP1, DP6 | Content with one island builds on both targets or is a diagnostic naming the target that cannot draw it |

### Theme F: tooling, scale and quality

| WP | Work | Closes | Size | Fits | Acceptance |
|---|---|---|---|---|---|
| **WP-14** | **Template hot swap**, designed in NEXUS terms: what state survives replacement, what resources recreate, what is disposed (`Nexus/docs/ROADMAP.md` §15). Dev server also sends the security headers a build writes, where the bundler allows. | D6, dev headers | L | DP4, DP10 | A template edit keeps state in the open page in `vlx dev` |
| **WP-15** | **Per-page content payload** for sites beyond a few hundred pages; wire the verifier's `test:budget` idea into a `vlx` CI check. Take up only when a measured site needs it. | README "Limits", F24, F25, F28 | L | DP2 | A 500-page fixture meets a documented size and build-time budget |
| **WP-16** | **Small API hygiene**: re-export `BoundaryValue` (F16); a `vlx check` warning for an unnamed control (MULTI-TARGET-PLAN); verify the `go` normalization item and F15. | F16, misc | S | DP8 | Typed `invoke` in a test without importing from the runtime package |
| **WP-17** | **Cross-browser CI**: Firefox and WebKit for history, bfcache and hydration. | checkpoint "other browsers" | M | DP10 | Playwright matrix green, or findings recorded |
| **WP-11** | **PORT page-level events and a "drawn" signal** (scroll, presentation drawn). Only when scroll-spy or focus-after-draw is a real requirement; today each is a documented adapter. | F21, F23 | M | DP2, DP5 | The adapter in the verifier is deleted |

### Theme G: multi-target upkeep

| WP | Work | Closes | Size | Fits | Acceptance |
|---|---|---|---|---|---|
| **WP-10** | **Re-baseline the register and `NATIVE-PARITY.md`.** Re-check every [?] row in §2 against the code and mark Fixed / Still open with file and line. Add a CI check: every Open row in the register names a WP or a roadmap entry. | register hygiene; closes the many [?] | S–M | DP7 | No [?] left in §2; the check runs |

Not scheduled, but recorded: window capability and webview shell, several root layouts chosen by state, macOS packaging, editor marketplace publisher (G9, already being worked), mobile.

## 5. Coverage cross-check

Every live gap and where it goes. A blank in "Work" would be an untracked gap.

| Gap | Work | Gap | Work |
|---|---|---|---|
| WA-1 | WP-4, WP-5 | D2, F18 | WP-12 |
| WA-2 | WP-2, WP-6b | D3 | WP-12 |
| WA-3 | WP-3 | D4 | WP-9 |
| WA-4 | WP-6 | D6 | WP-14 |
| WA-5 | WP-7, WP-8 | F4 recursion | WP-12 |
| WA-6 | WP-1 | F8 clipboard | none by design (no requirement; DP2) |
| WA-7 | WP-13 (after WP-9, WP-6d) | F12 | WP-12 |
| F15 | WP-6c, WP-16 | F16 | WP-16 |
| F21, F23 | WP-11 | F22 | WP-1b |
| beforeunload, nested routes | WP-6f | Transport interceptors, `defineApp({ platform })` | WP-10 (verify), then schedule |
| Other browsers | WP-17 | Per-page payload | WP-15 |
| Window capability, macOS, mobile | unscheduled (recorded) | Untriggered core items (aging data, long-lived pages, several mounts) | none by design (take up with a requirement) |

## 6. Decisions needed from a maintainer

| # | Question | Recommendation |
|---|---|---|
| Q1 | Is component-scoped CSS a **web-target** feature (tier 1) with the portable style language deferred? | Yes; frame it so (WP-4), implement tier 1 (WP-5) |
| Q2 | Should the scaffold write an explicit `valance.web.json` with `rendering`? It adds a file to a project that today needs none. | Yes: discoverability outweighs one file, and the CLI already writes it when a base or URL is given |
| Q3 | Is `server` rendering a goal? It needs a server platform and a server command that do not exist (README "Limits"). | Not now; reserve the word, ship `static` and `client` |
| Q4 | Are Markdown islands a goal, or is a custom page (WP-6d) the answer? | Decide after WP-6d is designed; islands only if content-with-one-widget proves common |
| Q5 | Do form tags (`select`, `textarea`, `label`) join the **portable** core (needs desktop realization) or stay web-only? | Portable names where the desktop toolkit has an equivalent; decide from WP-8's example |
| Q6 | Is `vlx info` one command or three (`routes`, `tags`, `info`)? | One command with subcommands; same data source |
| Q7 | WP-6 is large. Which slice first? | 6a then 6d; they unlock custom pages, the thing the dynamic-form question needed |

## 7. Suggested order

1. **Now (small, independent, high value):** WP-1a, WP-7, WP-16, WP-10, the `main.ts` comment from WP-3, WP-4.
2. **Next:** WP-2, WP-3, WP-5, WP-12(i, ii-diagnostic).
3. **Then:** WP-6a, WP-6d, WP-8 together (a custom route and a reference form are the same exercise), then WP-6b, 6c, 6e.
4. **Later, on evidence:** WP-13, WP-9, WP-11, WP-14, WP-15, WP-17, WP-6f, remaining WP-12.

## 8. What not to do

- **No universal styling API now** (DP2). The Port roadmap lists "cross-platform styling API" as a non-goal until a second target shows the need; tier 1 is web CSS, labelled as such.
- **No `ssr` flag without a server platform** (DP3). It would promise behavior no command delivers.
- **No string concatenation in MPRX** (DP9). Supply the value from the framework.
- **No router in `@valancex/valance` core** (`CONSTRAINTS.md`). Routing integration belongs to `@valancex/router` and the CLI.
- **No form helper before a reference form exists** (DP2).
- **No hot swap before the lifecycle question is answered in NEXUS terms** (DP4).

## 9. Progress

Started 2026-10-16, in the order of §7. Each row is a commit on `claude/inspiring-ptolemy-fssz6c` in `Valance`; "tests" means the CLI suite (186 tests) and the example smoke suites were green at that commit.

| WP | Result | Where |
|---|---|---|
| WP-1a | **Done.** `vlx dev` writes the project's styles into the server-rendered head as `<style>` tags with the bundler's id, so the first paint is styled and an edit still replaces the tag in place. Chromium test: with scripts off the page is styled. **Not measured**: a built site's first paint (WA-6 said to confirm both) | `cli/src/dev.ts` |
| WP-7 | **Done.** The CLI guide's tag reference is generated from the vocabularies (both targets) and a test fails when it drifts. The hand-written list had omitted `textfield`, `checkbox`, `column`, `row`, `heading`, `text` | `cli/src/tags.ts`, `pnpm docs:tags` |
| WP-16 | **Done.** `BoundaryValue` is exported from `@valancex/valance`. The `go` normalization bug (a trailing slash showed "Not found") was real and is fixed | `valance/src/index.ts`, `common/src/routes.ts` |
| WP-10 | **First pass done**: the register records what was re-checked (§3.7). Still to do: the NATIVE-PARITY matrix, and the CI check that every Open row names a WP | `docs/findings/README.md` |
| WP-3 (comment) | **Done.** The scaffold's `main.ts` says where routes come from | `cli/templates/web/src/main.ts` |
| WP-4 | **Done.** The three-tier styling note | `docs/application-model/STYLING.md` |
| WP-2 | **Done.** `rendering` in `valance.web.json` (`static` only; `client` and `server` are refused with the reason), always written by `vlx init`, reported by `vlx build`, documented. Q2 resolved as recommended | `cli/src/config.ts` |
| WP-3 | **Done.** `vlx info` (`--json`, `--tags`): targets, settings, routes with their files, styles (scoped or global), components per target, tag counts | `cli/src/info.ts` |
| WP-5 | **Done.** `X.css` beside `X.mprx` is built inside `@scope (.X)`; `style-scope` and `style-global` checks; web only. Browser test: styled inside the component, not outside. The scaffold, docs-app and todo-multi use it for the theme toggle. Not done: fragment-rooted components, a generated stylesheet in `vlx generate component`, old-browser fallback | `cli/src/styles.ts` |
| WP-12(i) | **Done.** A literal `/…` on an `image` `src` or `a`/`link` `href` in a template gets the base, as Markdown does (D3 without changing MPRX) | `cli/src/addresses.ts` |
| WP-12(ii) | **No work needed.** F18/D2 are superseded by the `{#if}`/`{#each}` block syntax (probe) | register §3.7 |

| WP-6a | **Done**, with a design note written first (`docs/application-model/ROUTES.md`) and a statement-by-statement check after: 14 match, 6 match with a note, 1 differs (address bar not canonicalized), 1 not exercised (desktop). The check found and fixed a crash (a bad `staticParams` entry). D-1 and D-3 decided as recommended after researching other routers (`trailingSlash` policy with start-up canonicalization; `route` stays in `@valancex/common`) | `common/src/routing*.ts`, `cli/test/routes.test.ts` |

| WP-6d | **Done**, note first and check after: `screen:` on a route and `<screen />` in the layout, the screen's use written from its contract (props by state name, events by command name). One design correction found while building it (`<screen />` is a marker the framework expands in the layout, not a component, because a component reads only its props) and one difference from the note (a type mismatch is MESH's diagnostic at the `<screen />` line) | `cli/src/screens.ts`, `cli/test/screens.test.ts`, ROUTES.md "Implementation status, slice 6d" |
| WP-8 | **Done.** `examples/forms-app` (210 authored lines, ten browser tests), scored: 15 rows, gaps RF-1 to RF-10. **No form helper is justified**; what is: a portable `kind` on the text field, `aria-invalid`/`aria-describedby`/`id`, `blur`/`focus` (small PORT work), `work` reading the state after `begin`, and an opt-in decoded error body | `docs/findings/2026-10-16-reference-form.md` |

| RF-1 to RF-3 | **Done**, note first and check after (`FORM-PRIMITIVES.md`): `kind`, `invalid`, `describedby`, `id`, `blur`, `focus`. Web in Valance; the Desktop PORT in the Port repository, unreleased. `invalid` needed a `types` rule in the vocabulary, not a PORT Web release (closing F12); the check found that the first mechanism (a DOM property) fails server rendering, and a race (RF-11) that `blur` exposes | `common/src/primitives.ts`, Port `view.rs` |

| RF-11 | **Fixed, with a different cause than assumed**: the stylesheet `<link>` was removed and re-inserted on every state change (the page lost its styles for a moment, the layout shifted under the pointer). `applyHead` now keeps unchanged tags in place. A new finding, WA-8, with a regression test that fails without the fix | `valance/src/web-plugin.ts`, `examples/forms-app/test/form.test.ts`, FORM-PRIMITIVES.md D-3 |
| Outlet | **Investigated, then built as 6g** (below). An outlet is a MESH slot; nested screens keep the parent element only if the generated switch follows the route tree (tested in Chromium: nested keeps it, one case per page loses it) | `ROUTES.md` "Nested routes and the outlet", `cli/test/outlet.test.ts` |
| WP-6c | **Done**, design first and check after: Markdown links and a template's literal `href` are checked against pages, declared routes and `public/` (`link-broken` with file, line and column); the sitemap lists the pages a build writes. The definition is now loaded before the content in `build`, `check`, `dev` and `info` | `cli/src/content.ts`, `cli/src/addresses.ts`, ROUTES.md "Implementation status, slice 6c" |
| WP-6b | **Done**, design first and check after: `delivery: "client"` per route and `rendering: "client"` for the site; the build writes `__app-shell.html` and `_redirects`, the shell draws (not hydrates) from the address bar, `vlx dev` serves the shell as a host would. Tested in Chromium against a host that applies `_redirects`. Closes the per-route half of WA-2 | `common/src/{server,client}.ts`, `cli/src/build.ts`, ROUTES.md "Implementation status, slice 6b" |
| WP-6e | **Done**, design first and check after: `load: { begin, work, settle }` on a route; `begin` is part of the entry (built pages and first states show "loading", nothing runs on the server), `work` runs after `go`/Back/Forward and at start-up, dropped when the address was left, failure is state. `command.waiting`'s run was shared, not copied | ROUTES.md "Implementation status, slices 6e and 6f", `cli/test/load-guards.test.ts` |
| WP-6f | **Done**, design first and check after: the router's `canActivate`/`canDeactivate`/`redirectTo` on a declared route (levels respected), `redirect` exported, aliases as `_redirects` 301 and a dev 302, `beforeunload` on the web (only an immediate answer can hold a closing page) and `mayClose` on the desktop (wired, not driven in a window) | same |
| WP-6g | **Done**, design first (with the fine-grained constraint) and check after: `children`, `index`, dotted names, the outlet as `<mesh-slot />`, `outlet-missing`, a generated tree with one condition per level on its own `at.lN`, the tree flattened once. Ancestors are the same elements across three levels with no mutation recorded; the engine reads no tree at run time. One shape difference from the note (`at` per level) and one thing not measured (MESH's skipped re-evaluation) | ROUTES.md "Implementation status, slice 6g", `cli/test/nested.test.ts`, `common/test/routing.test.ts` |

Not started, as ordered: the "later, on evidence" group; plus the work WP-8 proposes (see its table).

## 10. After the routes work (analysis of 2026-10-16, with what was done on it)

Slices 6a to 6g are built. This section is what remains, ranked by the directions in §1, and what has been done on it since. New work packages continue the numbering.

| WP | Work | Why now | Status |
|---|---|---|---|
| **WP-1 (measure)** | Measure first paint and layout shift in dev and in a built site under added latency | WP-1's own acceptance said to measure before claiming a fix | **Done**: `cli/test/first-paint.test.ts`. The scaffold had a shift of 0.0077 caused by an image with no size (WA-9), now fixed; shift is 0 in both |
| **WP-10 (rest)** | Register rows current; a check that every Open row names a work package; NATIVE-PARITY re-baselined | DP7: the register is part of what must be inspectable | **Done in part**: five stale rows fixed, `cli/test/register.test.ts` added, NATIVE-PARITY re-baselined for the rows that were checked (it found two real gaps: the desktop never reports `viewport`, and the close guard is untested in a window). Unchecked rows are marked as such |
| **WP-19** | Review the new routing surfaces for security: aliases, `_redirects` lines, `load`'s work, the close guard | DP10 | **Done**: no vulnerability found; the surfaces and the accepted residuals are in `ROUTES.md` "Security review of the routing surfaces"; `cli/test/routing-security.test.ts` pins them |
| **WP-18** | A second reference app (data loading, a table, a select, a server error) scored on the cognitive-load scale | DP2: RF-4, RF-5, RF-6, RF-10 wait for it | **Done**: `examples/orders-app` (224 authored lines, six browser tests), scored in `2026-10-16-orders-app.md`. It found a framework defect (WA-12, fixed) and made RF-4, RF-5 and RF-6 two-case findings. New work: WP-23 to WP-26 below |
| **WP-20** | Desktop parity: report `viewport` from the window; drive `mayClose`, a nested route and a screen in a window; the Port release that carries the form primitives | DP1, DP6: the portable contract is only proven where it has been run | **Done in part**: the window's width (`resize`, both repositories), the choice group on the desktop, the close guard and a nested route through the protocol with a stand-in window, and a parity check against a Port checkout. **Not done**: driving a real window; the release itself |
| **WP-21** | Types for a child route's `enter` and `title` across the levels; a redirect that names a content page | DP8: both are a cast or a surprise in the common case | **Done**: typed `children`, address redirects, derived values in guards (ROUTES.md "Amendments from the second reference application") |
| **WP-22** | `load` ergonomics: caching, invalidation, reload | DP2: only when WP-18 shows the need | Open, on evidence |
| **WP-23** | A portable choice group (radio group) with a design note first | RF-4: two applications chose one of a few with pressed buttons | **Web done**, desktop with WP-20; `CHOICE-GROUP.md` |
| **WP-24** | A table (`table`, rows, headers), web first or portable | RF-12: one application | Open, wants one more case |
| **WP-25** | Maintainer decisions on the core command and request surface: the state in `work` (RF-5), a decoded error body (RF-6), a success that navigates (RF-10) | each is two cases now | **Done**: RF-5 and RF-6 built as recommended, RF-10 accepted; `COMMAND-SURFACE.md` |
| **WP-26** | MPRX whitespace between interpolations (MESH repository) | RF-13 | Open |
| **WP-27** | A `label` primitive that names a control and activates it, on both targets (WA-14) | found implementing WP-23: a radio's name is invisible without CSS | Open |

**The Port release (blocks WP-20).** The Desktop PORT's form primitives (`kind`, `invalid`, `describedby`, `id`, `blur`, `focus`) are committed and pushed on `claude/inspiring-ptolemy-fssz6c` in the Port repository and are **not released**. Valance builds and tests against the published `@valancex/port-desktop-vocabulary ^0.6.0`, so the permanent parity test (`cli/test/form-primitives.test.ts`, "name the same props…") stays skipped until a release carries them and Valance's range is raised. Releasing is a maintainer's act and was not done here.

**What to do next, in order**, given everything above: (1) the maintainer decisions in WP-25 (RF-5 and RF-6 each have two cases and a recommendation); (2) WP-23, the design note for a portable choice group; (3) the Port release and WP-20, so that the portable claims are run on both targets; (4) WP-21 (child route types, redirects to content pages, derived values in guards). WP-13, WP-9, WP-14, WP-15, WP-17 and the rest stay "on evidence".

**What a Port release needs (for the maintainer; not done here).** The Port repository's `release-desktop.yml` publishes the crate on a pushed `desktop-v<version>` tag, where `<version>` is `version` in `packages/port-desktop/Cargo.toml`; `release.yml` publishes the npm packages (`@valancex/port-desktop-vocabulary` among them). The branch `claude/inspiring-ptolemy-fssz6c` carries the unreleased work (form primitives, the choice group, `resize`) with a CHANGELOG entry under `[Unreleased]`. After the release, Valance raises `@valancex/port-desktop-vocabulary` to the version that carries it, and the parity test in `cli/test/form-primitives.test.ts` (skipped until then) runs by itself; the checkout-based check in `cli/test/choice-group.test.ts` already covers the same ground now.

**Where this leaves the list (end of 2026-10-16).** Done since §10 was written: WP-18 (second reference app), WP-19 (security review), WP-20 in part (desktop width, choice group, close guard and nested route through the protocol), WP-21, WP-23 (web and desktop, the latter unreleased), WP-25. Open, in the order the principles favour: **WP-27** (a `label` primitive, WA-14, and the `button` label gap, WA-15: both found by building and checking parity); **the Port release** and driving a **real window** (the rest of WP-20); **WP-24** (a table, wants one more case); **WP-26** (MPRX whitespace, a MESH decision). The "on evidence" group (WP-9, WP-11, WP-13, WP-14, WP-15, WP-17, WP-22) is unchanged.
