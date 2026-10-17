# Prior art

What other projects decided, in their own words where we could read them, and what we take from it. This is the evidence log behind the [bets](bets/README.md). A decision here is not a recommendation to copy it: each row says what problem the authors had, whether the answer was designed in or added after, and what it means for us.

*Compiled 2026-10-17. Sources were read through fetch agents in a sandbox that could reach only GitHub, so each quote should be checked against its URL before it is relied on.*

## How to read the sources

| Mark | Meaning |
|---|---|
| **P** | A primary source: the project's own RFC, discussion, documentation or source, fetched and read. Quotes are the authors' |
| **P\*** | Primary, but the fetch tool truncated the page and part of what was reported came from a model summary of the unseen rest. Quotes marked verbatim are from the part that was read |
| **S** | A secondary source: a search-result summary or article about the project. Treat the claim as a lead, not a fact |
| **Repo** | This ecosystem's own record |

Not read at all, because the hosts did not resolve from the sandbox: the Svelte blog, the Elm guide, Airbnb's own post, the React Native site (its docs source on GitHub was read instead), A2UI's site, MDN and web.dev, and w3.org (the authoring-practices source on GitHub was read instead). Nothing below relies on Elm's position on components. The exact current status of platform features such as cascade layers, popovers and anchor positioning should be checked on MDN and Baseline.

## Reactivity, identity and composition

| Source | Mark | The authors' reasoning | Designed in, or added after | Lesson | Feeds |
|---|---|---|---|---|---|
| React, [`useId`](https://github.com/reactwg/react-18/discussions/111) | P | "Solutions that may have worked previously, like using a counter to generate IDs, don't work in 18.0 because you can't rely on a consistent sequence." Streaming delivers HTML out of order. An earlier hook was dropped because it "was too limiting" and hook rules meant ids could not be created dynamically. A reply calls tree-path hashing "not very efficient" | Added after: streaming made counters unsound | Identity has to exist before streaming and server rendering. Our node identity is declared and stable from the start; ids for accessibility should derive from the declared keys, not from a hash of the whole path | 7, 8 |
| Svelte 5, [migration guide](https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/07-misc/07-v5-migration-guide.md) | P | Implicit top-level reactivity "worked great, but it meant that reactivity was constrained"; it "forced you to resort to using stores when refactoring code out of the top level of components for reuse". `$:` "wasn't as easy to reason about", with dependencies "determined through static analysis". The migration tool will not convert some cases because "it's too risky" | Added after, by a redesign with breaking changes | A reactivity model that cannot leave the component does not compose into libraries. Static analysis of dependencies is a source of gotchas, so keep `reads` conservative | 5, 8 |
| Svelte 5, [snippets](https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/03-template-syntax/06-snippet.md) and the guide | P | Slots became "more involved and confusing" as use cases grew; `let:` "creates a variable whereas all other `:` directives receive a variable"; snippets "allow you to define sections of UI that you can render anywhere, not just passing them as props to a component". They can be passed, recursed and typed | Added after, as a generalization | A template that is a typed value is more useful than a special syntax at component boundaries. Pure templates make it compatible with our purity rule | 5 |
| Angular, [Signals RFC](https://github.com/angular/angular/discussions/49685) | P\* | zone.js "become a source of performance issues and developer-facing complexity"; Angular "does not have any information as to what specific changes have occurred". "Backward-compatibility is non-negotiable... a gradual, opt-in change." Forms, hydration and testing were left open ("We haven't yet decided exactly what path we want to take" for forms) | Added after, under an installed base | A retrofit is slow and constrained. We have the change information (MESH's changes form) and no installed base. Forms are where models strain, so design them early | 11 |
| Angular, [sub-RFC 1](https://github.com/angular/angular/discussions/49684) | P\* | Considered: improving zone.js, setState-style APIs, signals, RxJS, compiler-based reactivity, proxies. Requirements: synchronous access, side-effect-free reads, glitch-freedom, ergonomic dependency tracking. RxJS is "a poor fit for template rendering specifically"; "Zones are the root cause of many common pain points" | Added after | Those four requirements are properties of MPRX evaluation by construction (pure, one evaluator, synchronous). That supports keeping reactivity in MESH's runtime | 4 |
| TC39, [Signals proposal](https://github.com/tc39/proposal-signals) | P\* | "A goal of this proposal is to fully decouple the reactive model from the rendering view." Libraries "tend to come with a false coupling to their view engine". Effects and async are left out for lack of consensus | A design goal from the start | Validates separating the state model from the renderer (NEXUS and MESH). Even a standards body left effects and async out | 8 |
| Phoenix, [LiveComponent](https://raw.githubusercontent.com/phoenixframework/phoenix_live_view/main/lib/phoenix_live_component.ex) | P | A live component is for when you "encapsulate both event handling and additional state". "Prefer function components over live components." "Avoid using LiveComponents merely for code organization purposes." Avoid "both the parent LiveView and the LiveComponent working on two different copies of the state". Costs: assigns kept in memory per component, N+1 data loading, a single root tag | Designed in, with explicit guidance to use it rarely | Stateless by default, stateful by exception, keyed by identity, never two copies of one state. DOM behavior is a poor reason for a stateful component, which argues for native-first primitives | 8, 9 |
| React Spectrum, [v3 architecture RFC](https://raw.githubusercontent.com/adobe/react-spectrum/main/rfcs/2019-v3-architecture.md) | P | Split each component into "platform agnostic state management, theme agnostic behavior, and themed components"; "the underlying implementation should be swappable per platform". Higher-order components and render props "generally cause a lot of boilerplate code" | Designed in (2019) | The closest prior art for a library foundation. Ours would be typed units usable from any PORT rather than hooks that need React | 1, 6, 8 |
| Radix, [philosophy](https://raw.githubusercontent.com/radix-ui/primitives/main/philosophy.md) | P | "A single component only renders a single DOM element"; "Composition is preferred over configuration"; "zero presentational styles applied by default"; the platform's own implementations are "inadequate" | Designed in | A clean rule for a primitive specification. The "inadequate" premise is weakening as the platform adds popovers and dialogs, so design primitives so a native element can replace script | 1, 9 |
| WAI-ARIA, [authoring practices](https://raw.githubusercontent.com/w3c/aria-practices/main/content/practices/read-me-first/read-me-first-practice.html) | P | "No ARIA is better than Bad ARIA." "A role is a promise" that the author also provides the keyboard behavior. "ARIA roles do not cause browsers to provide keyboard behaviors or styling." The page cites no statistics | Guidance | Bind each role to its keyboard contract in the specification, and prefer native elements | 1, 7 |

## Styling

| Source | Mark | The authors' reasoning | Designed in, or added after | Lesson | Feeds |
|---|---|---|---|---|---|
| React, [CSS libraries guide](https://github.com/reactwg/react-18/discussions/110) | P | Inserting styles during render "effectively causes a recalculation of all CSS rules against all DOM nodes every frame while React is rendering". `useInsertionEffect` is "not really meant to be used by anything else other than these CSS libraries". "We don't have plans for adding any solutions upstream" | A patch, and a decision to stay silent | Silence in the core pushes styling onto internals. Define the contract, not an engine | 6 |
| Stitches, its repository | S | No longer actively maintained; a maintainer said it is a runtime library, "not currently a lib that the React team would recommend" and not compatible with React 18 streaming; a static version was explored | A casualty of the rendering model changing | Runtime style engines are coupled to the renderer | 6 |
| Angular Material MDC migration | S | DOM and CSS class structure changed, with "style-related issues" for many consumers | A rewrite | Themes must not depend on structure | 6 |
| Design Tokens Community Group, [2025.10](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) | S | First stable format, published 2025-10-28 as a Final Community Group Report; "not a W3C Standard" | Interchange format | Adopt it for tokens; do not call it a standard | 6 |

## Shipping libraries

| Source | Mark | The authors' reasoning | Lesson | Feeds |
|---|---|---|---|---|
| Svelte, [packaging](https://raw.githubusercontent.com/sveltejs/kit/main/documentation/docs/30-advanced/70-packaging.md) | P | "Svelte components will be preprocessed, TypeScript files will be transpiled to JavaScript." The `svelte` export condition tells tooling "this is a Svelte component library". Declare `"sideEffects": ["**/*.css"]`. Types are generated and disabling them is discouraged. Removing an export is "a breaking change" | Ship templates as source, mark the package, generate types, treat removals as breaking | 12 |
| Angular, [package format](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/tools/libraries/angular-package-format.md) and [creating libraries](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/tools/libraries/creating-libraries.md) | P | Libraries are published in "partial compilation" mode, "not tied to a specific Angular runtime version", and "converted to fully compiled code during the application build". The application's Angular version must be "the same or greater" than its libraries'. Packages should set `sideEffects` to `false` | The other route: half-compile and link in the consumer. It needs a linker and a version rule | 12 |
| Vite, [SSR externals](https://raw.githubusercontent.com/vitejs/vite/main/docs/guide/ssr.md) | P | Dependencies are externalized by default; one that "needs to be transformed by Vite's pipeline" goes in `ssr.noExternal`; linked dependencies are not externalized | Explains why a compiled Valance library fails to load and a symlinked one cannot find its peers | 12 |

## Conformance and verification

| Source | Mark | The authors' reasoning | Lesson | Feeds |
|---|---|---|---|---|
| Test262, [README](https://raw.githubusercontent.com/tc39/test262/main/README.md) | P | A suite of tests with metadata that each implementation runs through its own harness | Data plus a small per-implementation harness | 2 |
| Web Platform Tests, [README](https://raw.githubusercontent.com/web-platform-tests/wpt/master/README.md) | P | The same tests in all browsers; results archived on wpt.fyi | One suite, results kept as data | 2 |
| Storybook CSF, [docs](https://github.com/storybookjs/storybook/blob/next/docs/api/csf/index.mdx) | P | Stories as portable data with args and `play` functions | States as named data with scripts | 2 |
| Angular, [component harnesses](https://github.com/angular/components/blob/main/guides/using-component-harnesses.md) | P | Tests insulate themselves from internal DOM changes | Ask about meaning, not structure | 2 |
| egui_kittest, [README](https://raw.githubusercontent.com/emilk/egui/main/crates/egui_kittest/README.md) | P | AccessKit-based UI tests; snapshots need `wgpu` | A Desktop route with a renderer caveat | 2 |
| Playwright, [snapshots](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/test-snapshots-js.md) | P | Rendering varies by host; baselines belong to one environment | Pixels advise, never gate | 2 |

## Replay and time travel

| Source | Mark | The authors' reasoning | Lesson | Feeds |
|---|---|---|---|---|
| MESH design, [Part C](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md) | Repo | Render is pure and state changes only through commands, so a session is a log | The premise; the format was never built | 15 |
| `parity.test.mjs` and `number-text-differences.json` in MESH | Repo | The WebAssembly and native runtimes give byte-identical results; number text has a reviewed table | Byte equality is already the standard | 15 |
| Nexus reference platform (`tests/platform/reference.ts`) | Repo | A platform may supply a clock (`Layer.setClock`) | Time is injectable at the host | 15 |
| Elm debugger, Redux DevTools, rr and Replay.io | S | Replay pure updates; record at the nondeterminism boundary | Not read in this session. Verify before quoting | 15 |

## Generated UI

| Source | Mark | The authors' reasoning | Lesson | Feeds |
|---|---|---|---|---|
| A2UI, [README](https://raw.githubusercontent.com/google/A2UI/main/README.md), [catalogs](https://raw.githubusercontent.com/google/A2UI/main/docs/public/concepts/catalogs.md), [protocol v0.9.1](https://raw.githubusercontent.com/google/A2UI/main/specification/v0_9_1/docs/a2ui_protocol.md) | P | "A declarative data format, not executable code"; a client "catalog" of approved components; all JSON "validated against the chosen catalog"; components may reference children not yet sent and clients render placeholders; unknown components degrade gracefully; errors return to the agent with `code`, `path`, `message`. "Early stage public preview" at v0.9.1. The overview, transports and actions pages and the v1.0 candidate were not read | The catalog and the error loop match our profile and diagnostics. We differ on unknown components (fail closed) | 13 |
| MESH, [Repairing generated UI](https://github.com/ValanceX/Mesh/blob/main/docs/guides/checking-against-a-component-model.md) | Repo | Diagnostics as data: stable codes, spans, suggestions, one per mistake | The loop's wire format exists for finished files | 13 |

## Cross-process and wire formats

| Source | Mark | The authors' reasoning | Lesson | Feeds |
|---|---|---|---|---|
| React Native, [architecture](https://raw.githubusercontent.com/facebook/react-native-website/main/website/architecture/landing-page.md) and the [2024 post](https://raw.githubusercontent.com/facebook/react-native-website/main/website/blog/2024-10-23-the-new-architecture-is-here.mdx) | P | "Serializing function calls over the bridge quickly became a bottleneck, especially for frequent updates or large objects." Async-only meant "we needed to rewrite it to allow for both asynchronous and synchronous updates". The redesign has been under way "since 2018"; it became the default in 0.76 | A process or serialization boundary is a cost to budget. The Desktop PORT's boundary is intrinsic (a Node engine cannot ship in a mobile app), so keep it narrow: patches, not whole trees | 3 |
| React Server Components protocol vulnerability (CVE-2025-55182) | S | A deserialization flaw in the Flight protocol, rated CVSS 10.0, affecting any app with RSC enabled | A rich wire format that revives references is attack surface. Keep every format here data-only | 3 |
| Flutter on the web, accessibility | S | Draws to a canvas, so it builds a separate semantics layer, off by default for performance; the team wants it on by default but cites "noticeable performance costs" | The Desktop PORT draws its own pixels. Semantics must be always on and its cost measured | 7 |

## Platform

| Source | Mark | Claim | Caution | Feeds |
|---|---|---|---|---|
| Popover API, CSS anchor positioning, invoker commands | S | Reported as Baseline by early 2026 | Sources disagree on dates and versions. Check MDN and Baseline | 9 |
| Customizable `<select>` (`appearance: base-select`) | S | A Chrome intent-to-ship from January 2025; at WHATWG stage 2 then | Dated; check the current status | 9 |

## Process

| Source | Mark | What it shows | Lesson |
|---|---|---|---|
| Rust, [editions RFC](https://raw.githubusercontent.com/rust-lang/rfcs/master/text/2052-epochs.md) | P | "Warning-free code on edition N must compile on edition N+1 and have the same behavior." Compilers support all editions at once, so "editions do not split the ecosystem". Costs: it "risks muddying our story about stability" and "new editions can invalidate existing blog posts and documentation" | Install an edition mechanism before the first stable promise |
| Rust, [API evolution RFC](https://raw.githubusercontent.com/rust-lang/rfcs/master/text/1105-api-evolution.md) | P | "All major changes are breaking, but not all breaking changes are major." Adding a public item is minor; renaming or removing is major | Write the vocabulary evolution policy in this form |
| TC39, [process](https://tc39.es/process-document/) | P | Six stages with entry criteria; stage 2 "may still change significantly" and "the feature may never be included"; stage 4 needs two implementations passing the acceptance tests | The model for our [stages](README.md#bets-and-their-stages) |
| React, [Labs posts](https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/blog/2023/03/22/react-labs-what-we-have-been-working-on-march-2023.md) | P | Describes "projects in active research and development", including ones "currently on hold" | Say what is research and what is shipped |
| Angular, [roadmap](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/reference/roadmap.md) | P | Active work carries no dates and hedged verbs ("We plan to..."); dates appear only on completed items. No explicit no-commitment disclaimer was found | Dates only on shipped work, and say plainly that the rest is not a commitment |

## Leads not yet followed

| Lead | Mark | Why it matters |
|---|---|---|
| Qwik's argument that hydration repeats work the server did, and its resumability design (author's own writing, vendor performance claims) | S | Our render tree is serializable data. [Bet 14](bets/README.md) tests whether that gives resumable-style start-up |
| Airbnb's server-driven UI (sections, screens, actions) and Google's A2UI (a declarative component catalog, described as covering only UI description) | S | The same family as the manifest plus render tree. The questions are how clients treat unknown components and how versions skew; neither was read in a primary source |
| An optimizer for arbitrary JavaScript, as in the NEXUS [future direction](https://github.com/ValanceX/Nexus/blob/main/docs/FUTURE_DIRECTION.md) | S | A comparable effort, Prepack, is marked archived with the note that the team "temporarily set down work". No post-mortem was found, so the evidence is thin; we keep the vision off the critical path |
| Radix and Base UI maintenance after changes of ownership | S | A community depends on someone owning the behavior layer long term. Blogs report both a slowdown and a dedicated team; no primary source |

## Repo records this relies on

- [`NATIVE-VOCABULARY.md`](../application-model/NATIVE-VOCABULARY.md): the method we try to match. It re-did itself from primary sources and corrected three of its own recommendations.
- [PORT integration audit](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-09-27-port-integration-audit.md): facts separated from decisions.
- [MESH fine-grained reactivity and composition](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md): a design with a recorded "what building it changed".
- [Ecosystem API design review](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-09-api-design-review.md): a written standard applied across all four repositories, with the findings it did not act on.
