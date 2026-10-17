# Bet 2: The conformance kit and the gallery

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The inventory and the drift under "Why" are measured on the checkouts. The decisions are in [decisions](../decisions.md) (Q1 to Q9); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 1](primitive-specification.md) (the primitive vectors are generated from the specifications). [Bet 12](reference-library.md) supplies the pilot adapter and the first library to check. Bets 5, 6, 8 and 10 each add vectors as they land |

## Question

Can every primitive and every library be verified against its specification, and shown in every state, from data, with one runnable kit that a new PORT or a new library can pass or fail in a day?

## Why, and who is hurt

### What verification exists

| Where | What | Notes |
|---|---|---|
| MESH `examples/conformance/` | Language-neutral cases for MESH's semantics at the render tree: `values/` (20 cases), `events/` (14), `identity/` (4). Each directory is a real program (`program.json`, `.mprx` sources, `snapshot.json`, `expected.tree.json`, `cases.json`), checked by `crates/mesh-runtime/tests/conformance.rs` in Rust and `packages/mesh-runtime/test/conformance.test.mjs` through the WebAssembly package | The best thing in the ecosystem's testing. It needs "no target, no browser and none of MESH's code" |
| Web PORT | About 236 test cases in `packages/port-web/test` (a text count), including `conformance.test.ts`, which runs MESH's vectors through a real DOM | Strong, and specific to one PORT |
| Desktop PORT | `tests/contract.rs` and eleven other test files, driven by fixtures captured from the to-do application (`todo-list.json`, `reader-index.json`) and by `inspect::readable` and `inspect::buttons` | Real MESH output, but not MESH's vectors |
| Valance | The `tracer-web` contract suite and, in the `docs-verifier` example, visual regression that keeps its photographs outside the repository because "photographs depend on the machine's fonts" | Per example and per machine |
| A gallery | None | |
| A way for a new PORT or a library to ask "am I conformant?" | None | |

### The vectors are copied, and the copy has drifted

The Web PORT does not consume MESH's vectors. It holds "a verbatim copy" in `fixtures/mesh-conformance`, taken when it adopted MESH v0.6 (commit "deps: adopt MESH v0.6"). Compared today:

| | MESH | Web PORT's copy |
|---|---:|---:|
| `events/` | 14 | 14 |
| `values/` | 20 | 20 |
| `identity/` | 4 | **absent** |

MESH added the identity vectors in a later commit ("lock repeated identity (spec §9.10) with a static key rule and C11-C22 vectors"). So the Web PORT's keyed-update behavior is covered by its own tests, and **nothing checks it against the vectors MESH wrote for exactly that contract.** The Desktop PORT runs none of the vectors. This is how a copied file goes stale without anyone deciding to let it.

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

Reliability: **P** primary source read through a fetch agent; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| Test262 (**P**, [README](https://raw.githubusercontent.com/tc39/test262/main/README.md), [INTERPRETING](https://raw.githubusercontent.com/tc39/test262/main/INTERPRETING.md)) | "The implementation conformance test suite" for the language standards, aiming to "cover every observable behavior specified". Tests carry metadata (`flags`, `includes`, `negative`) and an implementation consumes them with a harness: a test that throws no exception "must be interpreted as 'passing'" | A suite of data plus a small harness each implementation provides. Our vectors are the data, and the adapter below is the harness |
| Web Platform Tests (**P**, [README](https://raw.githubusercontent.com/web-platform-tests/wpt/master/README.md)) | A "cross-browser test suite", so that running the same tests in all browsers "gives browser projects confidence that they are shipping software that is compatible". wpt.fyi is "an archive of test results collected from an array of web browsers on a regular basis" | The same suite for every implementation, and the results kept as data |
| Storybook CSF (**P**, [docs](https://github.com/storybookjs/storybook/blob/next/docs/api/csf/index.mdx)) | "An open standard ... portable beyond Storybook"; "args are dynamic data"; `play` functions "help you test use cases that otherwise weren't possible or required user intervention"; stable story ids are "helpful for integration with third-party tools" | A component's states as named data, with scripted interactions. The idea transfers; the tool does not (it assumes components that are code) |
| Angular component harnesses (**P**, [guide](https://github.com/angular/components/blob/main/guides/using-component-harnesses.md)) | "By using the harness API, a test insulates itself against updates to the internals of a component, such as changing its DOM structure" | The observation interface below does the same: tests ask about meaning, not structure |
| egui_kittest (**P**, [README](https://raw.githubusercontent.com/emilk/egui/main/crates/egui_kittest/README.md)) | "Ui testing library for egui, based on kittest (an AccessKit based testing library)". Snapshot tests need the `snapshot` and `wgpu` features; the images "should be checked in"; prefer regular tests "whenever possible" | A route to Desktop snapshots, with a caveat: the Desktop PORT's `eframe` uses the `glow` renderer, so snapshots would add a renderer dependency |
| Playwright snapshots (**P**, [docs](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md)) | Snapshot names carry the browser and platform. "Browser rendering can vary based on the host OS, version, settings, hardware ... headless mode, and other factors." Run tests "in the same environment where the baseline screenshots were generated" | Pixels are a per-environment signal. They cannot be the gate |
| This ecosystem, the vectors (**Repo**) | Real programs, no target needed, checked in two languages | The model to extend, not replace |
| Visual regression in `docs-verifier` (**Repo**) | Photographs are not kept in the repository, because of fonts | The same conclusion, reached independently |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 3, 4, 6 and 7:

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
| Pixel screenshots, per target, per theme | **Advisory**, per machine, **never committed** | Rendering varies by host, as Playwright and the `docs-verifier` both found |
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

## Open questions for stage 3

- **The observation vocabulary** beyond text, value, enabled, checked and order: when roles, names and relationships join ([Bet 7](accessibility.md) specifies them).
- **Forced states** on the Desktop and the terminal, where there is no stylesheet.
- **Interaction kinds** the adapter must support: activate, type, key, scroll (for [Bet 10](collections.md)).
- **How units and replay fit**: a unit's behavior is a script of interactions with expected observations, which is also what [Bet 15](replay.md) wants for replay.
- **Sharding and runtime** of the full kit in CI.
- **Whether the Desktop adopts `wgpu` snapshots** or stays on structure snapshots only.
