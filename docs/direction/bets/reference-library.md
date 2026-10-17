# Bet 12: The reference library, the themes and a third target

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The measurement under "What exists" is a stage-3 result from a scratch project, not from the repository. The decisions are in [decisions](../decisions.md) (K1 to K10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | It exercises [Bet 1](primitive-specification.md), [3](budgets.md), [4](variant-types.md), [5](template-values.md), [6](style-contract.md), [8](state-units.md), [10](collections.md) and [14](resumable-start.md). It is the **Reference Gate** |

## Question

Can an author outside these repositories build a component library and a theme using public seams only, and have them work on every target? And what has to be built for the answer to be yes?

## Why, and who is hurt

Every bet so far was designed by the people who will build it, for a customer who does not exist yet. The [stage table](../README.md#bets-and-their-stages) already says what fixes that: a bet is **proven** only when "two targets realize it and the reference library uses it from outside". This bet is that library, and the gate that decides whether the foundation is solid.

### What exists

Before designing anything, the seam was tested. With the published `@valancex/cli` 0.13.0 a project was created, and a small package, `acme-ui`, was written, packed with `npm pack` and installed from the tarball, as any consumer would install it. It ships a template (`disclosure.mprx`), a `component()` contract, and a second component written with only the portable core. Results:

| Check | Result |
|---|---|
| A package ships a template and its contract, as TypeScript source, and the application lists it in `components` | **Works.** `vlx check` finds it and `vlx build` builds it and renders it on the server |
| The library's contract is enforced at the use site | **Works.** `type-mismatch: the prop "open" of component "disclosure" needs boolean, found string`, and `unknown-prop`, with line and column |
| CSS the library ships | **Works only as a side effect.** `import "./disclosure.css"` in the library's entry lands in the application's stylesheet. Nothing orders it, layers it or lets a theme replace it |
| A library component written with only the portable core, used by both targets | **Works.** `vlx check` passes and `vlx build` writes `dist/web` and `dist/desktop` |
| A web-only library component used on the Desktop | **Rejected, badly.** Four errors, located inside the library's own file (`node_modules/acme-ui/disclosure.mprx:1:2 unknown-component "div"`), where the consumer cannot act on them. Nothing says "this component is web-only" |
| The library shipped as **compiled JavaScript**, the normal way | **Fails.** `Unknown file extension ".mprx"`, and the same for `.css` |
| The library installed as a symlink (`npm install ../acme-ui`, the natural development loop) | **Fails.** `Cannot find module '@valancex/common'`, because the library resolves its peers from its real path |
| Types for a compiled library | None, until the author generates declarations (`TS7016`) |
| A template using a web tag such as `para` | Needs a `class`, because the web table has no notion of optional (finding D1 in `FINDINGS.md`) |
| Not tested | `vlx dev` and hot reload, the editor's features through a package, `override` of a library component, running the Desktop window, hydrating in a browser |

Two of these are decisive. The compiled-library failure follows from how Vite treats dependencies (see the prior art): they are loaded as Node externals unless a build says otherwise, and Node cannot load `.mprx`. And there is no way for a library to say which targets it supports.

**Two earlier claims are superseded.** The older finding D4 in `docs/application-model/FINDINGS.md` says there is "no way to ship templates or tags as a reusable unit". That was written before the explicit component tree, and for templates it is no longer true. A Direction-page row repeating it was corrected in this change. For *primitives* (new tags) it still holds: a plugin can contribute web primitives, but `defineApp` has no field for plugins.

### Who is hurt

- A would-be library author finds that the documented route (publish compiled JavaScript) does not work, and that the one that does (ship source) is not written down.
- A consumer gets errors inside `node_modules` with no sign they come from a target mismatch.
- Nobody outside these repositories has tried any of it, so the designs are untested by a stranger.

## Prior art

Reliability: **P** primary source read through a fetch agent; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they decided and why | Lesson here |
|---|---|---|
| Svelte, packaging (**P**, [SvelteKit docs](https://raw.githubusercontent.com/sveltejs/kit/main/documentation/docs/30-advanced/70-packaging.md)) | "Svelte components will be preprocessed, TypeScript files will be transpiled to JavaScript"; the library is marked by an export condition: "Svelte-aware tooling sees the `svelte` condition and knows this is a Svelte component library". Declare `"sideEffects": ["**/*.css"]`. Types are generated, and "we strongly recommend against" disabling them. "If you remove any paths from `exports` ... that should be regarded as a breaking change" | The closest precedent. Ship templates as source, mark the package so tooling processes it, declare CSS as a side effect, generate types, and treat removed exports as breaking |
| Angular, library format (**P**, [package format](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/tools/libraries/angular-package-format.md), [creating libraries](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/tools/libraries/creating-libraries.md)) | Libraries "must be published in 'partial compilation' mode", "not tied to a specific Angular runtime version", then "converted to fully compiled code during the application build process" by a linker. "The Angular version used to build an application should always be the same or greater than the Angular versions used to build any of its dependent libraries" | The other answer to the same problem: ship half-compiled output and finish it in the consumer's build. It needs a linker and a version rule. Here the consumer already has the compiler, so Svelte's route is simpler |
| Vite, SSR externals (**P**, [guide](https://raw.githubusercontent.com/vitejs/vite/main/docs/guide/ssr.md)) | "Dependencies are 'externalized' ... by default"; if a dependency "needs to be transformed by Vite's pipeline" it goes in `ssr.noExternal`; "linked dependencies ... are not externalized by default" | Explains the measured failures exactly: a compiled package is externalized and Node meets `.mprx`; a linked package is processed and cannot find its peers |
| React Spectrum, Radix, Base UI (**P**, earlier) | Behavior, state and theme as separate layers; unstyled primitives with a composition rule | The shape of the library: components that take their look from a theme, and their state from a unit |
| This ecosystem, MESH known limitation (**Repo**) | "Every template must be recompiled after any change of meaning to the component model" | A library cannot ship compiled templates. A model change would stale them. Templates ship as source |
| This ecosystem, boundary tripwires (**Repo**, `packages/valance/test/boundaries.test.ts`) | Tests that fail when a package imports across a boundary | The pattern for enforcing "public seams only" instead of promising it |
| This ecosystem, the friction log (**Repo**, `COGNITIVE_LOAD.md`) | Severity 0 to 3, by layer | The format for recording what outside authors hit |
| shadcn-style copy-in components, Vue single-file-component libraries | Other distribution models | **Not researched in this session** |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 4, 5 and 7, and by two rules of this bet:

- **Public seams only.** The reference build may use what a stranger can install and read, and nothing else.
- **No edits to the core to make the library work.** A needed change is filed as a friction report first and made in an ordinary change, so the log of what outsiders will hit is complete.
- Accessibility work is deferred by direction. Nothing here claims it, and nothing blocks it.

## Design

### 1. What is built, and where

A separate repository, built as an outsider would build it:

| Artifact | What it is |
|---|---|
| **The kit** | Six components, each chosen because it needs one seam |
| **Two themes** | `plain` (light) and `contrast` (dark, higher contrast), as tokens and recipes |
| **A terminal target** | A minimal third PORT, TypeScript on Node |
| **A playground application** | Consumes the kit and the themes, on all three targets |

### 2. The six components

| Component | What it is | Seam it exercises |
|---|---|---|
| `labeled-field` | A caption and a text field, portable core only | Typed events, defaults. **Already works** (see above) |
| `badge` | A small label with `intent` and `size` | Closed variant sets ([Bet 4](variant-types.md)); recipes ([Bet 6](style-contract.md)) |
| `disclosure` | A trigger and a panel | Unit state, and a controlled `open` ([Bet 8](state-units.md)) |
| `tabs` | A tab strip and panels | A unit plus snippet parameters ([Bet 5](template-values.md), Bet 8) |
| `data-list` | A list whose rows the caller supplies | Typed snippets ([Bet 5](template-values.md)) |
| `virtual-list` | A long list | The window clause and the scroller ([Bet 10](collections.md)) |

### 3. The two themes

`plain` and `contrast` are token documents plus recipes for the badge, button, text field and tabs. Swapping one for the other is one import and no template change. Each target reports what it could not apply. The terminal target is the hard case for the style contract: with fewer capabilities than the Desktop it shows whether "report, do not widen" holds.

### 4. The third target

A terminal PORT in TypeScript, drawing the portable core as text cells with colors from tokens, and reporting key activations. It starts from what exists: the repository already has two test-only text targets (`packages/cli/test/text-target.ts`, 46 lines, and `examples/tracer-web/test/non-dom-target.ts`) that draw a render tree as indented text. It is not a product. It exists to answer one question the evidence rule asks: is the contract, and the vocabulary we designed for two targets, secretly shaped like the web and the Desktop? Its findings are a list of what it cannot realize.

### 5. The library seam, version 1

The missing piece. What the CLI and the format need, from the measurements:

| Need | Design | Fixes |
|---|---|---|
| **A library says what it is** | An export condition `valance` in `package.json`, as Svelte's `svelte`, and a `valance` field with `targets` (which vocabularies the library supports) | The build can recognize libraries |
| **The build processes libraries** | Packages with the marker are bundled by the build (Vite's `ssr.noExternal`), not loaded by Node | `Unknown file extension ".mprx"` and `".css"` |
| **One diagnostic at the use site** | If a component's declared targets exclude a target the application builds for, one error at the use says so, instead of four inside `node_modules` | The misleading errors |
| **Styles are declared** | The library lists its stylesheets in the field. The build collects them into the library cascade layer ([Bet 6](style-contract.md)), below the theme and the application. Guidance: `"sideEffects": ["**/*.css"]` | Side-effect-only CSS that nothing can order or replace |
| **Types** | `vlx library build` emits JavaScript, declarations and the contract types | `TS7016` |
| **Templates ship as source** | The consumer compiles them | A model change would stale compiled templates |
| **A development loop that works** | `vlx init library` scaffolds a workspace with a playground. Symlinked `file:` installs are documented as unsupported | The peer-resolution failure |
| **A breaking-change rule** | Removing an export, a component, a prop or an event is breaking. A library declares `@valancex/common` as a peer | Silent breakage |
| **Overriding** | `override` by component name works on library components. To be tested | Theming a component's structure |

New primitives are not part of version 1. A library composes the existing primitives; a new primitive goes through the [specification process](primitive-specification.md).

### 6. "Public seams only" is enforced

- The kit repository has a boundary test, on the pattern of `packages/valance/test/boundaries.test.ts`, that fails on any import outside an allowlist of published entry points, any `internal` subpath, and any path into another repository.
- Its CI installs published or prerelease packages from the registry. No workspace link to a Valance repository is allowed.
- When the kit needs a core change, a friction report is filed first, in the cognitive-load format. The change is then an ordinary change.

### 7. Design partners

| | |
|---|---|
| **Who** | Three to five authors outside the maintainers |
| **What each builds** | One thing, from the documentation and the published packages alone: a component, a theme, or a small application using the kit |
| **What they get** | The packages, the docs, and an honest account of the free window: anything may break, and every break is explained |
| **What we record** | Friction in the cognitive-load format (severity 0 to 3, by layer), the time to a first working result, and a short exit interview |
| **When** | After the pilot. The maintainers' own build goes first, because its friction is cheaper to collect and fixes the worst problems before a stranger meets them |

### 8. The Reference Gate

The gate passes when all of these hold:

1. The kit builds and runs on the web and the Desktop. Its portable part runs on the terminal target. A component that does not support a target says so through its declared targets, never through errors.
2. The two themes swap with no template change, and each target reports its coverage.
3. The boundary test is green and CI uses published packages only.
4. The [Bet 3](budgets.md) ceilings hold for a page that uses all six components. The allowance for the kit is set from the pilot's own measurement.
5. At least **two outsiders** have published a working component or theme using only the documentation, and every severity-3 friction they logged is fixed or recorded as a decision.
6. Each design the kit exercises (Bets 1, 4, 5, 6, 8, 10 and 14) has reached stage 4 or has an explicit decision to defer.

A screen-reader run is part of the gate once accessibility work resumes. It is deferred by direction.

### 9. Order

| Phase | Work | Can start |
|---|---|---|
| R0 | The library seam (section 5), `labeled-field`, the terminal target skeleton, the boundary test | **Now.** Nothing here waits on another bet |
| R1 | `badge` and the two themes | With the stage-3 prototypes of Bets 4 and 6 |
| R2 | `disclosure`, `tabs`, `data-list` | With Bets 5 and 8 |
| R3 | `virtual-list` | With Bet 10 |
| R4 | Design partners | After the pilot has run |
| R5 | The gate review | When the criteria above are met |

### Alternatives considered

| Alternative | Why not |
|---|---|
| Build the library inside the Valance repository | It cannot show that public seams suffice, which is the point |
| Wait for every bet to reach stage 4 first | The library is how they reach stage 4 |
| Skip the third target | Two targets that we designed together are the weakest evidence the contract is not web-shaped |
| Adapt an existing open-source design system | Large, and not ours to change. The six components are the smallest set that touches each seam |
| Ship compiled templates, as Angular does | A model change would stale them, and the consumer already has the compiler |
| Let libraries add primitives in version 1 | There is no plugin field in `defineApp`, and a primitive is a cross-target decision that belongs in the specification process |

## Experiment

1. **The seam.** Implement section 5 in the CLI, with the scratch project from "What exists" as the first test case, then `vlx init library`.
2. **The boundary test and the kit repository**, with `labeled-field` and the terminal target skeleton.
3. **Each component as its bet's prototype lands**, logging friction as it is met.
4. **The pilot's measurements**: the time from nothing to a first working component, the number of private seams reached for, and the bytes the kit adds.
5. **Partners.** Recruit, run the protocol, triage the logs.

## Success

- The gate criteria in section 8.
- The pilot needs **zero** private seams. Any it reaches for is a bug in the seam or the docs, recorded and fixed.
- The scratch project's four failures (compiled library, target mismatch, side-effect CSS, symlinked install) each have a passing test.

## Kill

- If the kit cannot be written without private seams after three honest attempts to fix the seam, the seam design is wrong. Stop adding components and fix it.
- If the partners cannot reach a first working result in a day from the docs, the documentation or the authoring experience is the gap. Pause new features and fix that.
- If the terminal target needs core changes for reasons that are not about the terminal, the contract is web-shaped. Record each as a finding and decide what to change.

## Breaks (allowed in the free window)

- The CLI treats marked packages differently from other dependencies.
- `package.json` gains the `valance` condition and field.
- New commands: `vlx init library`, `vlx library build`, `vlx library check`.

## Open questions for stage 3

- The kit repository's name and home.
- **Condition or field.** Whether the marker is the export condition, the field, or both. Svelte keeps a legacy field beside its condition for older tooling.
- **How a theme is distributed.** Probably the same marker, with tokens and recipes instead of components.
- **Recruitment.** Who the first partners are, and what they are offered.
- **Editor support** through a package: definitions, hover and completion into `node_modules`.
- **Whether `override` should work on library components by name**, or by explicit slot.
