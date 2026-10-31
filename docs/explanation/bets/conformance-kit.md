# Bet 2: The conformance kit and the gallery

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The inventory and the drift under "Why" are measured on the checkouts. The decisions are in [decisions](../direction/decisions.md) (Q1 to Q9); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 1](primitive-specification.md) (the primitive vectors are generated from the specifications). [Bet 12](reference-library.md) supplies the pilot adapter and the first library to check. Bets 5, 6, 8 and 10 each add vectors as they land |

## Question

Can every primitive and every library be verified against its specification, and shown in every state, from data, with one runnable kit that a new PORT or a new library can pass or fail in a day?

## Why, and who is hurt

### What verification exists

| Where | What | Notes |
|---|---|---|
| MESH `examples/conformance/` | Language-neutral cases for MESH's semantics at the render tree: `values/` (20 cases), `events/` (14), `identity/` (22: C1 to C10, and C11 to C22 under `repeat/`). `values/` and `events/` are real programs (`program.json`, `.mprx` sources, `snapshot.json`, `expected.tree.json`, `cases.json`), checked by `crates/mesh-runtime/tests/conformance.rs` in Rust and `packages/mesh-runtime/test/conformance.test.mjs` through the WebAssembly package | The best thing in the ecosystem's testing. It needs "no target, no browser and none of MESH's code" |
| Web PORT | 349 tests in 18 files in `packages/port-web/test` (re-counted in the consistency pass; an earlier text count gave about 236) (a text count), including `conformance.test.ts`, which runs MESH's vectors through a real DOM | Strong, and specific to one PORT |
| Desktop PORT | `tests/contract.rs` and ten other test files, driven by fixtures captured from the to-do application (`todo-list.json`, `reader-index.json`) and by `inspect::readable` and `inspect::buttons` | Real MESH output, but not MESH's vectors |
| Valance | The `tracer-web` contract suite and, in the `docs-verifier` example, visual regression that keeps its photographs outside the repository because "photographs depend on the machine's fonts" | Per example and per machine |
| A gallery | None | |
| A way for a new PORT or a library to ask "am I conformant?" | None | |

### The vectors are copied, and the copy has drifted

The Web PORT does not consume MESH's vectors. It holds "a verbatim copy" in `fixtures/mesh-conformance`, taken when it adopted MESH v0.6 (commit "deps: adopt MESH v0.6"). Compared today:

| | MESH | Web PORT's copy |
|---|---:|---:|
| `events/` | 14 | 14 |
| `values/` | 20 | 20 |
| `identity/` | 22 | **absent** |

*(Fixed 2026-10-18: see "WP1 result" below.)* MESH added the identity vectors in a later commit ("lock repeated identity (spec §9.10) with a static key rule and C11-C22 vectors"). So the Web PORT's keyed-update behavior is covered by its own tests, and **nothing checks it against the vectors MESH wrote for exactly that contract.** The Desktop PORT runs none of the vectors. This is how a copied file goes stale without anyone deciding to let it.

### Why it matters now

- A new PORT (the terminal target in [Bet 12](reference-library.md)) has no definition of "passing".
- The primitive specification ([Bet 1](primitive-specification.md)) makes promises about each primitive, and nothing tests them across targets.
- A library author cannot ask whether the library is done. `vlx library check` is a name until there is something for it to run.
- A reviewer cannot see what a component looks like in each of its states without building an application.

### Who is hurt

- A PORT author, who cannot tell whether the contract is met.
- A library author and a design partner, who have no "done" signal.
- A maintainer, who learns about drift only when a user finds it.

## Prior art

Reliability: **P** primary source read through a fetch agent; **Repo** this ecosystem's own record. See [prior art](../direction/prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| Test262 (**P**, [README](https://raw.githubusercontent.com/tc39/test262/main/README.md), [INTERPRETING](https://raw.githubusercontent.com/tc39/test262/main/INTERPRETING.md)) | "The implementation conformance test suite" for the language standards, aiming to "cover every observable behavior specified". Tests carry metadata (`flags`, `includes`, `negative`) and an implementation consumes them with a harness: a test that throws no exception "must be interpreted as 'passing'" | A suite of data plus a small harness each implementation provides. Our vectors are the data, and the adapter below is the harness |
| Web Platform Tests (**P**, [README](https://raw.githubusercontent.com/web-platform-tests/wpt/master/README.md)) | A "cross-browser test suite", so that running the same tests in all browsers "gives browser projects confidence that they are shipping software that is compatible". wpt.fyi is "an archive of test results collected from an array of web browsers on a regular basis" | The same suite for every implementation, and the results kept as data |
| Storybook CSF (**P**, [docs](https://github.com/storybookjs/storybook/blob/next/docs/api/csf/index.mdx)) | "An open standard ... portable beyond Storybook"; "args are dynamic data"; `play` functions "help you test use cases that otherwise weren't possible or required user intervention"; stable story ids are "helpful for integration with third-party tools" | A component's states as named data, with scripted interactions. The idea transfers; the tool does not (it assumes components that are code) |
| Angular component harnesses (**P**, [guide](https://github.com/angular/components/blob/main/guides/using-component-harnesses.md)) | "By using the harness API, a test insulates itself against updates to the internals of a component, such as changing its DOM structure" | The observation interface below does the same: tests ask about meaning, not structure |
| egui_kittest (**P**, [README](https://raw.githubusercontent.com/emilk/egui/main/crates/egui_kittest/README.md)) | "Ui testing library for egui, based on kittest (an AccessKit based testing library)". Snapshot tests need the `snapshot` and `wgpu` features; the images "should be checked in or otherwise be available" (egui uses git LFS); prefer regular tests "whenever possible" | A route to Desktop snapshots, with a caveat: the Desktop PORT's `eframe` uses the `glow` renderer, so snapshots would add a renderer dependency |
| Playwright snapshots (**P**, [docs](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md)) | Snapshot names carry the browser and platform. "Browser rendering can vary based on the host OS, version, settings, hardware ... headless mode, and other factors." Run tests "in the same environment where the baseline screenshots were generated" | Pixels are a per-environment signal. They cannot be the gate |
| This ecosystem, the vectors (**Repo**) | Real programs, no target needed, checked in two languages | The model to extend, not replace |
| Visual regression in `docs-verifier` (**Repo**) | Photographs are not kept in the repository, because of fonts | The same conclusion, reached independently |

## Constraints

Bounded by [fixed points](../direction/README.md#what-we-hold-fixed) 3, 4, 6 and 7:

- **Language-neutral data.** A PORT in Rust and a PORT in TypeScript run the same kit.
- **The kit knows no target.** The target-specific part is the adapter.
- **Nothing is dropped silently.** A PORT that cannot realize something must say so in its own data. Silence is a failure.
- **No copies.** A file is consumed from a published, versioned package, never copied.
- Accessibility has resumed ([Bet 7](accessibility.md)), so `observe` gains roles, names and descriptions as soon as that bet's specification fields exist; the first version still needs none.

## Design

### 1. Three layers

| Layer | What it checks | Source of the cases | State |
|---|---|---|---|
| **Semantics** | What MESH promises at the render tree: values and their text, event resolution, node identity, and (as they land) patches, units, windows and snippets | MESH's `examples/conformance/` | Exists. To be published, not copied |
| **Primitives** | What each primitive promises on a target: the props it realizes, the events it reports, what it does when a value is absent or controlled | **Generated** from the [primitive specifications](primitive-specification.md), plus hand-written edge cases | New |
| **Libraries** | What a component library promises: its contracts hold, every combination of variant and state renders on every declared target, units behave, themes cover it | The library's fixtures and its types | New |

### 2. Publish the vectors, never copy them

MESH publishes its vectors as a data-only package, `@valancex/mesh-conformance`, versioned with MESH and containing exactly `examples/conformance/`. The PORT repositories depend on it as a development dependency. The Rust crate keeps reading the in-tree files. A check in each consumer fails if a copy of the vectors exists in its tree or if the installed version is older than the one the PORT claims to support. The Web PORT's v0.6 copy is replaced first, and the vectors it has been missing run on that day.

### 3. The adapter: one small interface, any language

A PORT passes the kit by implementing a five-operation adapter and running as a child process that speaks one JSON message per line (the same shape as the Desktop host protocol, so a Rust PORT already has the machinery):

| Operation | Does |
|---|---|
| `load(tree)` | Draw a render tree afresh |
| `update(tree)` | Present the next tree of the same program |
| `observe(key)` | Return what a person or tool can observe at a node: its text, value, enabled and checked state, and the order of its children |
| `interact(key, kind, payload?)` | Do what a person would (activate, type, press a key) and return the reports the PORT made, as `(handler, payload)` pairs |
| `unmount()` | Tear down |

`observe` is what each PORT already has under another name: `inspect::readable` and `inspect::buttons` in the Desktop PORT, and `inspect` in the Web PORT. The kit names it, so the two stop being private. It asks about meaning and not structure, for the reason Angular's harnesses give: a test then survives a change to the internals.

Roles, accessible names and descriptions are added to `observe` by [Bet 7](accessibility.md). The first version needs none of them.

### 4. Primitive vectors, generated

For each primitive specification, the kit generates cases from its types: each required prop present and absent where the type allows, each member of a closed set (so adding a variant adds a case), each event interacted with, a controlled value changed by the person and then by the application, and a hostile value (a list where text is expected) that must be refused. Each case is a small render tree and the observations and reports a conforming PORT gives. Hand-written vectors add what generation cannot.

The report is data:

```json
{
  "port": "port-web", "version": "0.9.0", "spec": "primitives@1",
  "results": [
    { "primitive": "checkbox", "case": "controlled-change", "result": "pass" },
    { "primitive": "checkbox", "case": "invalid-prop", "result": "unsupported", "declared": true },
    { "primitive": "textfield", "case": "kind-password", "result": "fail", "detail": "…" }
  ]
}
```

`unsupported` counts only if the PORT declared it in its own realization data. An undeclared gap is a `fail`. The reports from all PORTs generate the parity table that [Bet 1](primitive-specification.md) needs, and the vocabulary tables in the documentation.

### 5. The gallery

The gallery is an application, generated and checked like any other (the ecosystem dogfoods its own build):

- It is produced from the specifications, the libraries' fixtures and the types. For each component it renders every combination of variants and every named state, with stable keys.
- **Stories are data.** A fixture is a named set of props, plus an optional script of interactions, kept beside the component and borrowing Storybook's idea of args and a `play` function. A closed set from [Bet 4](variant-types.md) is enumerated automatically, so **adding a variant adds a gallery cell and a test without anyone writing one**.
- States that are not props (hovered, pressed, focus-visible) are forced through the state hooks of [Bet 6](style-contract.md) on the web, and by the PORT's test mode elsewhere.
- Each theme is a dimension. The gallery renders every component in every theme on every target.
- Outputs: a browsable static site (for design partners and reviewers), the structure snapshots below, and screenshots.

### 6. What gates and what advises

| Check | Role | Why |
|---|---|---|
| Vectors and primitive cases | **Gate** | Deterministic, language-neutral |
| Structure snapshots: the observed tree and text of every gallery cell | **Gate** | Stable across machines. They contain no pixels and no fonts |
| Specification verifiers on the emitted output (HTML and ARIA, names and roles, CSS, tokens, the Desktop tree; see [Bet 7](accessibility.md)) | **Gate** | The output is ours to check against the specifications; browsers and screen readers are not |
| Pixel screenshots, per target, per theme | **Advisory, not a conformance check**, per machine, **never committed** | Rendering varies by host, as Playwright and the `docs-verifier` both found |
| Desktop pixel snapshots | Optional, if a renderer for them is accepted | `egui_kittest` snapshots need `wgpu`, and the PORT uses `glow` |

### 7. Where it lives

`@valancex/conformance` in Valance (the runner, the adapter protocol, the report schema and the primitive-vector generator) beside `@valancex/primitives`. MESH remains the source of truth for the semantics vectors and publishes them. Libraries run the kit through `vlx library check` ([Bet 12](reference-library.md)).

### Alternatives considered

| Alternative | Why not |
|---|---|
| Keep per-repository tests | The measured drift. Fine for a PORT's own behavior, wrong for a shared contract |
| Keep copying vectors in | That is the drift |
| A visual-only gallery as the gate | Machine-dependent. Both prior art and the repository's own `docs-verifier` say photographs cannot gate |
| Adopt Storybook | It assumes components that are code in a JavaScript framework. The idea transfers; the tool does not. Not evaluated beyond that |
| One test library per language | Duplicates the cases. Data plus a thin adapter does not |
| Hand-written stories only | They miss the variant someone adds next week |

## Experiment

1. **Publish and consume.** Publish the vectors as a package, replace the Web PORT's copy, and record what fails on the first run (the identity vectors have never run there).
2. **The adapter.** Write the protocol and the runner. Implement the adapter for the terminal target skeleton ([Bet 12](reference-library.md)) and for the Web PORT in jsdom. Count the lines.
3. **Primitive vectors** for the seven portable-core primitives, once [Bet 1](primitive-specification.md) phase 2 exists, run on the web and the Desktop. The parity report falls out.
4. **The gallery** for `labeled-field` and `badge`: structure snapshots on three targets, screenshots on the web.
5. **`vlx library check`** runs the library layer for the reference kit.

## Success

- No copy of the vectors exists in any repository, and a check enforces it.
- The Web PORT runs the identity vectors, and what it finds is recorded and fixed.
- A new PORT passes the kit with an adapter of at most 300 lines, in at most a day. The terminal target is the measurement.
- The seven portable-core primitives have generated cases on the web and the Desktop, and the parity table is generated from the reports.
- Adding a member to a closed set adds a gallery cell and a test with no other edit.
- Structure snapshots are identical on two operating systems.

## Kill

- If the Desktop PORT cannot answer `observe` without test-only hooks beyond what `inspect` offers, use its accessibility tree (the AccessKit nodes it already builds) as the observation source.
- If the adapter protocol makes the kit slow (more than ten seconds for a thousand interactions), batch operations or add an in-process mode for languages that can host the runner.
- If more than 2 percent of structure snapshots flake across runs, find the nondeterminism (clocks, ordering, ids) before trusting any gate.
- If screenshots drift so much that they are ignored, drop them and keep the structure snapshots.

## Breaks (allowed in the free window)

- MESH publishes a new data package.
- The PORT repositories change how they get the vectors and gain a conformance run.
- `inspect` in each PORT becomes a stated interface instead of a private one.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../direction/decisions.md) Q10 to Q13. Suites were run in copies.

**Forced states: a `force(key, state)` operation in the adapter**, with `state` one of hover, pressed, focus, focus-visible, implemented by each PORT with its own mechanism. On the web, the DevTools protocol's `CSS.forcePseudoState` "ensures that the given node will have specified pseudo-classes whenever its style is computed by the browser"; Storybook's pseudo-states addon instead rewrites stylesheets to add class selectors, so it "won't render any of the default user agent styles" and offers no JavaScript API to toggle real pseudo-states. In egui 0.31.1 `egui_kittest` maps simulated events to egui events (`CursorMoved` to `PointerMoved`; `MouseInput` pressed or released to `PointerButton`; key input to `Key` with tracked modifiers; AccessKit action requests through), so there is no "force hover": the harness moves the cursor over the node and steps one frame, and a press without a release is a held "pressed". For the terminal target a forced state is the skeleton's state flag.

**Interaction kinds: `activate`, `type` (text), `key` (name and modifiers), `focus` and `pointer-hover`**, derived from the keyboard tables in [Bet 7](accessibility.md), which use Space, Enter, Escape and the arrow keys. Add `scroll` only when the `scroller` primitive lands: `egui_kittest` has no scroll event among its simulated ones, so a scroll test there would use the AccessKit scroll action, which was not tried.

**Runtime and sharding: unsharded and in-process.** Measured: `cargo test -p mesh-runtime --test conformance` passed 6 tests (33 s cold compile, 0.03 to 0.05 s to run); the Web PORT's suite is **349 tests in 18 files** (not about 236), all passing, 6.6 to 7.6 s in three runs, about 14.5 ms per test. If the generated primitive vectors give about 7 primitives times 30 cases, about 210 cases per target, that is about 3 s per target in process (an assumption). A child-process adapter adds process start time per process (not measured), so keep one persistent process and shard only if the protocol runs one process per case. The MESH JavaScript conformance test needs `dist` for the runtime and compiler, which are not in a checkout; with the published 0.13.0 `dist` copied in, 3 conformance tests passed in 0.37 s, and the full JavaScript suite ran 90 tests in 16 s with 16 failures I did not investigate (likely the substitution).

**Desktop snapshots: not with `wgpu` for the gate now.** Add `egui_kittest` with no features (structure and AccessKit only) as a development dependency: 3 more packages and about 12.6 s to build in a scratch crate. With `snapshot` and `wgpu` it brings 313 resolved packages against the PORT's current 269 (+44, including wgpu 24, naga, ash, egui-wgpu, dify and pollster) and about 35.5 s to build (cold, 4 cores, debug, including downloads). The PORT uses `eframe` with `glow`, so a `wgpu` snapshot is of a different pipeline than users see. Whether a GPU or software Vulkan adapter exists in CI was not tested and could block a gate.

## WP1 result (2026-10-18): the vectors are shared, and the first run

**What was built.** `@valancex/mesh-conformance` in MESH (`packages/mesh-conformance`): exactly `examples/conformance/`, copied into the git-ignored `conformance/` by `prepack`, versioned with MESH (0.13.0), not published. `npm pack` gives 20 files (17.5 kB packed): the 17 files of `examples/conformance/` byte for byte, plus `package.json`, `README.md` and `LICENSE`; a test checks that against the tree. The Web PORT's copy (`fixtures/mesh-conformance`, v0.6) is deleted. Until the package is published the Port workspace depends on it as a git dependency pinned to a MESH commit, which pnpm packs (running `prepack`); the Port README says what changes on publication. `scripts/check-conformance.mjs` (Port) is the check of Q2: it fails on a copy anywhere in the tree (a file whose path ends with one of the package's nested vector files, identical or drifted) and on an installed package older than `conformance.json`'s `supports`. It was shown failing on a planted copy of one vector, on a drifted copy, on a whole copy, on an older package and on a missing package, and passing on the tree.

**The Web PORT, all 22 identity vectors (C1 to C22): no failure.** Nineteen have trees and run through `draw` and `update` on a DOM: a kept identity is the same DOM node afterwards (a text run with its node), a created one is a new node (also when it was present earlier: C8, C21), a removed one is disposed and no longer inspectable, the DOM's child order is the tree's (which is what "moved" means for the Web: the node is carried, not recreated), and an event reports the handler identifier of the drawn tree (`same`, `new`, `gone`, `sameAsEarlier`). C6, C16 and C17 have no tree, because MESH rejects the render; the test checks that and that the PORT refuses a tree with a repeated key (`duplicate-key`). Nothing was weakened and no vector is marked as failing. The test was checked to be capable of failing: with `update` replaced by `draw`, 19 of 23 fail. So the drift this bet measured (a missing contract that nothing ran) hid no defect in the Web PORT's keyed update; what it hid was the absence of the check.

**The Desktop PORT: what it can answer, and what it cannot.**

- Its reader accepts all 42 trees of the values, events and identity vectors, and `Port::draw` and `update` take them. The `values` text-run case is readable on the screen.
- The `values` prop cases are about a text-only slot (the Web PORT's attribute). The Desktop has no such slot and does not read `propText`: nothing to compare.
- The `events` vectors resolve an interaction from a node to the nearest ancestor binding the primitive's applicable event. The Desktop does not resolve on the tree (each egui widget reports its own handler), and the vectors' components and events (`card`, `row`, `press`, `select`, `dismiss`) are not in its vocabulary. There is nothing to run them against, and none is faked.
- **The identity vectors need a keyed update, and the Desktop does not have one.** Run where it draws (each node with a handler as a button named by its key; two frames in one egui context; a kept identity must keep its accessibility node id), **14 of the 19 vectors fail**: C2, C3, C4, C5, C7, C8, C9, C10, C12, C13, C14, C15, C18 and C22. egui's widget ids follow position, so a kept node's id changes when a sibling is inserted, removed or reordered; focus follows the position, not the key (a text field's typed text is kept by key, in the PORT's own map, but its egui id is not; only the heading, paragraph, list, blockquote and table nodes derive their ids from keys). The five that pass (C1, C11, C19, C20, C21) are those in which nothing before a kept node changes. This is the Desktop's side of the focus-follows-identity problem of [Bet 9](interaction-state.md); the vectors now state it as data. The test asserts the list exactly, so fixing the Desktop turns it red until the list is shortened.

**Ruled on:** Q2 is implemented. Q3 (the adapter) is not started; the Web PORT's identity test is the shape its `load`, `update` and `observe` take (draw, update, inspect by key), and the Desktop's lack of a keyed update is what its `observe` would have to report as `unsupported` (declared) or `fail`.

## Open questions for stage 3

- **How units and replay fit**: a unit's behavior is a script of interactions with expected observations, which is the same artifact [Bet 15](replay.md) derives from a log (decided in R1; the script format is the log's `event` lines).
- **The AccessKit scroll action** in `egui_kittest`.
- **The 16 failing MESH JavaScript tests** seen with the substituted `dist` (likely the substitution).
