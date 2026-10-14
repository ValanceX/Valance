# Plan: closing the gaps the multi-target experiment found

Written 2026-10-14. The gaps are the 13 in [MULTI-TARGET.md](./MULTI-TARGET.md). This plan orders them, ties each to the standard it falls under, and says how each is proved. **Nothing here is built.** Decisions the plan needs from a person are in "Decisions".

## 1. The standards the plan is held to

**The ecosystem's own** ([API Design Principles](https://github.com/ValanceX/Mesh/blob/main/docs/standards/api-design-principles.md), adopted 2026-10-09). The ones that decide this plan:

| § | Rule | What it decides here |
|---|---|---|
| 16 | **Platform behavior.** MUST preserve shared public semantics across targets where feasible; MUST document meaningful target differences; MUST define what happens when a capability is unsupported; MUST NOT claim portability beyond the guarantees provided; MUST distinguish a shared API *shape* from identical runtime *behavior* | gap 1 (a shared vocabulary core), gaps 12 and 13 (what a target does with what it cannot draw), and a **generated parity table** so portability is never claimed beyond what is tested |
| 6.3 | **One source of truth.** MUST NOT require users to synchronize duplicate declarations the framework can derive | gap 1 (two layouts restating one UI), gap 4 (state fields per target), gap 8 (stylesheets), and the vendored copies of the Port's vocabulary (derive, do not copy) |
| 4.3 | **Required and optional inputs.** Optional inputs MUST have documented defaults or explicit absence | gap 3 (`pressed="false"` is a required input with no meaning) |
| 2.1, 6.4 | **Progressive disclosure; common tasks work with minimal configuration** | a one-target project stays exactly as simple as it is; `targets` appears only when a second target does (gap 6) |
| 15 | **Compatibility, additive changes, deprecation in three stages, stability tiers** | gap 7 (output directory), gap 1 (new web tag names are additive; none removed) |
| 18, 20 | **Validate through a real consumer; the smallest representative application first; change the model, not add exceptions, when evidence says so** | every step below has a consumer test; the model change in Phase 2 is chosen *because* gaps 1 to 3 are one cause, not three exceptions |

**The ecosystem's native findings** ([NATIVE-PARITY.md](./NATIVE-PARITY.md), 31 rows, each marked run/read/reasoned). The gaps map onto it: #4 vocabulary (gap 1), #7 styling, #8 theme, #10 accessibility (gap 13), #13 images (gap 12), #26 and #31 signing, packaging, updates (gap 11), #28 dev (gap 10), #29 editor (gap 9), #24 store. Where the matrix marked a row **reasoned**, this plan makes its first step a run that verifies it.

**External standards** (what could and could not be checked from this environment, 2026-10-14):

| Standard | What is established | Used for |
|---|---|---|
| W3C Accessible Name and Description Computation 1.1 | found by search: a control's accessible name is derived from a visible or invisible property of the element; platform accessibility APIs (UI Automation, the macOS protocol, AT-SPI) each carry a name. **The spec page itself was not reachable**, so the exact step order is unverified | gap 13: every interactive control has a name, and the name's source must be defined per target |
| Apple, *Notarizing macOS software before distribution* | found by search in Apple's documentation: software distributed outside the Mac App Store with a Developer ID must be notarized (macOS 10.15 and later); Developer ID certificate, hardened runtime and a secure timestamp are required; the ticket may be stapled | gap 11, macOS leg |
| Windows signing | one secondary source: unsigned installers draw SmartScreen warnings and reputation builds with downloads. **Microsoft's own MSIX/Authenticode documentation was not reached** | gap 11, Windows leg: verify before writing any signing step |
| Flatpak, AppImage, MSIX packaging | **not established** (the documentation hosts were unreachable) | gap 11: the first task is to read them, not to assume |
| Platform guidelines (Apple HIG, GNOME HIG, Windows) on windows, state restoration, keyboard | **not established**; only a WWDC session on window restoration was reached | gaps 4 and 10, and parity rows #11, #14, #25: read before deciding |

A plan item that rests on an unestablished standard says so, and its first task is to establish it.

## 2. The cause behind most of the gaps

Gaps 1, 2, 3 and 13 are one cause: **the web vocabulary is a hand-written table whose rules are PORT Web's (a prop is required, an element has no fixed attributes), while the desktop's is data (`vocabulary.json`) with optional props and its own names.** Two vocabularies that were designed separately cannot share a template. The evidence that the *model* is already shared is in the experiment: the five commands and `$event` payloads are written once and are identical on both targets. So the change is to the vocabulary, per §18 "revise the conceptual model before adding more exceptions": give the web the same **core** (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`, with the same props, events and payloads), keep its own extras (`link`, `nav`, `quote`...) as web-only, and let a component that uses only the core run on both.

That is not a promise of identical behavior (§16): the core is a shared *shape*; what each target does with it (a `column` is a flex `div` on the web and an egui layout on the desktop) is documented per target and tested per target.

## 3. Phases

Ordered by what unblocks what. A step is done when its **proof** passes in CI; each proof extends `examples/todo-multi` or the docs site, never a toy.

### Phase 0: decisions (no code)

Four, in "Decisions" below. Everything after Phase 1 depends on D1.

### Phase 1: stop duplicating and stop surprising (small, independent, Valance only)

| Gap | Change | Standard | Proof |
|---|---|---|---|
| 8 stylesheets | a target's stylesheets are the ones under its own directory (`src/web/`), or listed in `targets.web.styles`; the desktop target loads none | 6.3 | a `.css` in `src/desktop/` is not in the web bundle (test beside `multi-target.test.ts`) |
| 7 output directory | **deprecate** `dist/` for a one-target web project: announce in the release notes and print a note; `dist/<target>/` is what a project of more than one target already has. Remove the old layout only at the next breaking release (§15.3) | 15.3 | a one-target project still builds to `dist/`, with the note; both layouts documented |
| 9 editors | `editor.json` already lists every target; the VS Code extension and `mesh-lsp` read `targets[id]` and check a template against its own target's manifest (by which target's `layout` reaches it) | 17, 16 | an extension host test on `todo-multi`: a `<div>` in `src/desktop/` is flagged, in `src/web/` is not |
| 6 one to two targets | `vlx add target desktop`: moves `src/layout.mprx` to `src/web/`, writes the `targets` section and `valance.desktop.json` with a starter layout. Idempotent, refuses with a message when the layout has been hand-edited in a way it cannot move | 2.1, 6.4 | scaffold a web project, `vlx add target desktop`, `vlx check` and `vlx build` pass; the web output is unchanged |
| 10 dev | `vlx dev` with no flag in a multi-target project serves the web and opens the desktop window; the window **reconnects** to a restarted engine instead of closing (the Port side: the window keeps its window and re-handshakes on engine exit) | 18 (realistic use) | an engine test: kill and restart, the window (stand-in) keeps its process |

### Phase 2: the portable core (the model change)

| Gap | Change | Where | Standard | Proof |
|---|---|---|---|---|
| 3 required props | write the web vocabulary as **data** (a manifest, as the desktop's is), not as a hand-written table: the manifest can say a prop is optional, and PORT Web's realization table needs no entry for an optional prop that is never written. **First task: verify this against PORT Web's rule** ("a prop in the tree with no entry is an error": an absent optional prop is not in the tree, which is the expectation; run it before building on it) | Valance (`common/vocabulary`, `primitives`), possibly Port | 4.3, 6.3 | `<button on.click=...>` with no `class` and no `pressed` compiles and renders on the web |
| 2 fixed attributes | element constants in PORT Web's table (`type="checkbox"` once, in the table), released as a PORT Web minor; Valance depends on it. Until then `type` stays a prop the web `checkbox` requires | Port (`port-web`), then Valance | 6.3, 15.2 (additive) | `<checkbox checked=... on.change=...>` with no `type` on the web, in the hydration test |
| 1 shared names | the web gains the core: `column`, `row`, `heading` (`level` optional), `text`, `button`, `checkbox`, `textfield`, with the desktop's props, events and payloads. Additive: the web's own tags stay. The built-in views stay per target (the web's layout is a page; the desktop's a window) | Valance | 16, 6.3 | **one component, `todo-item`, written once in `src/shared/` and listed in `targets.web.components` and `targets.desktop.components`**; `todo-multi` loses its two copies of the item row and both targets' tests still pass |
| 13 names for controls | the desktop vocabulary gains an optional `label` on `checkbox`, `textfield` and `button` (the accessible name when there is no visible text), mapped to the platform accessibility name through AccessKit (egui has it); the web already has `label` (`aria-label`). **First task: read the accessible-name computation and the AccessKit node model** (neither was reached) so the order of sources is the standard's, not a guess | Port (`port-desktop`), Valance | 16; W3C accname | a Rust test that the accessibility tree has a name for each control; the `todo-multi` layouts give a name to each checkbox and the unnamed case is a `vlx check` warning |
| (supports 1) the vendored copies | stop copying the Port's vocabulary files into `packages/cli/vocabularies/`: `vlx` reads them from the installed `valancex-port-desktop` data or a published JSON package; the drift test becomes a version check | Port, Valance | 6.3 | the cli no longer carries a copy |

**Parity table (§16).** A generated page (`docs/use/target-parity.md`) lists each core component and what each target does with each prop and event, and what an unsupported one does (an image the desktop cannot draw is drawn as its description, as now, and `vlx check` says so). It is generated from the two vocabularies and the tests, so a claim of portability is never ahead of a test.

### Phase 3: state and derived values

| Gap | Change | Standard | Proof |
|---|---|---|---|
| 5 derived values | a `derived` section in `defineApp`: `derived: (state) => ({ open: state.items.filter((i) => !i.done).length })`; the results are names a template can read, beside the state's fields; computed per committed state, on every target. **Decision D2 first** | 2, 6.3 | `todo-multi` shows "2 of 5 open" in both targets from one definition |
| 4 presentation state | **Decision D3.** Recommended: keep it in the one state, and document it (a field only one target reads is harmless and the state is the application's); add `targets.<id>.state` only if a persisting `Store` makes the shared state visible to the person (it would persist `navigation` on the web, where it means nothing) | 6.3, 16 | decided with the `Store` capability (Phase 4), not before |

### Phase 4: the desktop target to the standard the matrix names

Each is a capability or a tool, in the order the matrix proposed (#17, #24, #16 first), and each has to be **run** on a real platform before it is called done.

| Gap | Change | Standard | Proof |
|---|---|---|---|
| 12 images and `public/` | a `public/` per target (the desktop's is its assets, shipped beside or inside the engine); the Desktop PORT decodes PNG and JPEG from a path the engine sends; an image it cannot decode is drawn as its description and reported | 16 (unsupported capability defined) | `logo.svg` or a PNG drawn in the desktop window in the `todo-multi` GUI test; the fallback tested |
| 11 packaging | `vlx package --desktop`: the single executable the to-do app's script makes (esbuild, Node SEA, postject), the engine and `vlx-window` together; per platform archives. Installer formats (MSIX, AppImage or Flatpak, DMG): **establish each format's requirements from its own documentation first** | 15, 16 | CI builds Linux and Windows archives from `todo-multi` and runs the engine through the wire (as the to-do's `smoke.mjs` does) |
| 11 signing, macOS | a `macos-latest` CI leg; signing with a Developer ID, hardened runtime and a timestamp, notarize, staple (Apple's documented path); Windows: Authenticode, after reading Microsoft's documentation. Secrets stay in CI, never in a project | 10 (security) | a notarized archive that Gatekeeper accepts, on a machine that is not the build one (needs a person with a Mac and a Developer ID: a decision, D4) |
| #24, #17, #16 | `Store`, `Navigation`, `Open` capabilities, each with the web's and the desktop's implementation, proved on `todo-multi` (persisting the items; Back; opening a link) | 5.4, 16 | the same capability test passes against both implementations |
| #8, #7 | a `theme` capability (the OS preference and an override) and a small style vocabulary (spacing, emphasis, intent) in the core, so `theme` is not a web-only state field | 16 | the theme state is a capability on both targets; the web's `theme` field and its toggle are a consumer of it |
| #10, #11, #14 | accessibility announcement on a page change, keyboard (`key` event, Enter to submit), scroll reset on a new screen | 16; platform guidelines (to be read) | per row, a GUI test in the desktop job |

### Phase 5: validate with a second consumer (§18)

Make `examples/docs-app` (the documentation site) a two-target project, with **no change to its content or state**. If the model is right, that is a layout and a `targets` section, not a rewrite. Then score both consumers with the existing criterion (`COGNITIVE_LOAD.md`: severity 0 to 3, by layer) and record what remains. The plan is finished when `todo-multi` and the docs site each have **no severity 2 or 3 item that is specific to having two targets**.

## 4. Decisions

| | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | The shared core: add the portable names to the **web** vocabulary (additive), or add web-flavoured aliases to the **desktop** one, or keep two vocabularies and share nothing | add the core to the web, additive | the desktop's names were chosen from eight toolkits and the ARIA roles (NATIVE-VOCABULARY.md D2); the web keeps its own tags; no removal, so §15 is met without a deprecation |
| D2 | Derived values: a function in `defineApp` (`derived`), or in the template (an expression language gains `.filter`/`.length`) | a function in `defineApp` | templates stay data and typed; one place per fact; the desktop to-do app's `scope` function is the precedent |
| D3 | A target's presentation state: in the shared state, or per-target | shared, until a `Store` makes it visible | smallest model; do not add a concept without a consumer that needs it |
| D4 | macOS and Windows signing | a person with a Developer ID and a Windows certificate provides them to CI as secrets; until then the legs build unsigned and say so | the plan cannot invent trust |

## 5. What the plan deliberately leaves out

Mobile (needs its own investigation: the engine is Node; NATIVE-PARITY.md, "What the matrix says", item 5); a second desktop renderer; a smaller engine than Node. Each is a product decision, not a gap of this experiment.
