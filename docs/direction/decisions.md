# Decisions

The open questions in the [bet briefs](bets/README.md), decided. Each decision gives the choice, the reason from this ecosystem's own code and records, and what it costs to undo.

*Decided 2026-10-17 under authority delegated by the maintainer, who sets direction and gives permission and leaves design and analysis to the author of these documents. The maintainer has not reviewed the text, so every decision here can be vetoed or changed. Briefs move to stage 2 (Design) on that basis, and the delegation is recorded here so the stage means what it says.*

## In one minute

Five decisions reach beyond these documents. If you read nothing else, read these.

1. **The primitive specifications live in Valance**, as a data package. The Desktop PORT keeps owning what it can draw. (P1)
2. **Web tags get ARIA's names** (`para` becomes `paragraph`, and so on), and the old names become diagnostics that name the replacement. (P7)
3. **Interaction state (tabs, menus, dialogs) is a Valance concern, not NEXUS's**, and is built only when the reference library needs it. (X1)
4. **Overlays are in-window layers.** The portable vocabulary has no OS windows. (X2)
5. **`class` leaves the portable core.** It stays on the web as a marked escape hatch, and styling goes through a contract of tokens, states and variants. (S8)

## Primitive specification ([Bet 1](bets/primitive-specification.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| P1 | Where do the format and the portable specifications live? | **In Valance**, as a private data package, `@valancex/primitives`, until the Spec Gate. Each PORT keeps owning what it can realize: the Desktop's `vocabulary.json` stays authoritative for the Desktop. Valance generates the **web** manifest and table from the specifications, and **checks** the Desktop's data against them with a generated parity report | The Desktop's JSON is compiled into the window (`vocabulary.rs` includes it), so it cannot be generated from above. PORT depends on neither NEXUS nor the MESH runtime, and Valance depends on PORT, so the check has to run from Valance. The Desktop designs were already written first in Valance and built in PORT, which worked. The multi-target plan already requires "a generated parity table so portability is never claimed beyond what is tested" | Low. Move the schema to MESH if MESH's editor tooling needs to read it |
| P2 | How are web-only primitives marked? | A **status** on the specification. **No namespace.** Portability is enforced by what already exists: a template in `src/shared/` is compiled against every target, and `vlx check` checks it against all of them | `examples/todo-multi/src/shared/` is proof that a shared template fails when it uses a tag one target lacks. The multi-target plan already decided to keep the web's extras "as web-only" | Low |
| P3 | Who owns states and parts? | **Semantic states** (checked, invalid, disabled, busy, selected) belong to the specification. **Interaction states** (hovered, pressed, focus-visible) are defined once by the style contract for every interactive primitive. **Parts:** a primitive has one, `root`, until a realization shows it needs another | Semantic states are facts about the primitive. Interaction states are the same everywhere, so defining them per primitive repeats them. The evidence rule says a part enters only when a target demonstrates it, and a one-node-per-primitive rule keeps the realization simple | Low |
| P4 | How are relationships typed? | **Naming is containment**: the `label` component wraps its control, as the Desktop already does. **Describing is a reference** to a node's `id`, as `describedby` already does. The compiler checks that a literal reference resolves within the program. Generated ids derive from declared keys (Bet 7) | Both mechanisms exist and work on the Desktop (`label`, and `describedby` naming the `id` of a `text`). The only gap is that a reference is an unchecked string | Medium |
| P5 | What is `text.id` for? | It is the **target of `describedby`**. It is portable, and the web gains it | Found in the Desktop PORT's `view.rs` and README | Low |
| P6 | How are the web and Desktop differences closed? | See the table below | Each row's reason | Medium |
| P7 | Do the web's short tag names follow ARIA's names? | **Yes, now.** `para` becomes `paragraph`, `item` becomes `listitem`, `quote` becomes `blockquote`, `em` becomes `emphasis`, `olist` becomes `list` with `ordered`. The old names stay as diagnostics that name their replacement | The maintainer chose ARIA's names for the shared content layer on 2026-10-14 and deferred only the migration. The free window is the cheapest time for it, and MESH has done the same with `retired-element` | Medium. Touches templates, examples and docs |

### P6: closing the differences

| Difference | Decision | Reason |
|---|---|---|
| `text.id` | Add to the web | P5 |
| `button.label` | Add to the web, as `aria-label` | It is the accessible name; a button's name is its content unless `label` says otherwise |
| `button.class` | Leaves the portable core | S8 |
| `button.pressed` | Removed from `button`. A new portable **`toggle`** primitive (a button that stays pressed) replaces it | The docs-verifier example already invents its own `toggle` tag with `pressed`, `label` and `class`. Two toolkits the investigation read call this a toggle or a switch |
| `checkbox.invalid`, `describedby` | Add to the web (`aria-invalid`, `aria-describedby`) | The Desktop has them |
| `textfield.kind`, `invalid`, `describedby`, `focus`, `blur` | Add to the web | The Desktop has them. `kind` becomes a closed set when Bet 4 lands; until then a string |
| `image` | Portable props are `src` and `label`. The web realization maps `label` to `alt` | `label` is the accessible-name prop everywhere else |
| `list`, `olist` | One portable `list` with `ordered`. PORT Web gains a small feature: an element chosen by a closed prop | The web table maps a primitive to one fixed element today, so this is a dependency on PORT Web, not a template change |
| `link` | `href` is portable. `current` stays web-only | Matches the Desktop's content layer |
| `label` (a wrapper) | Add to the web as `<label>` | Implicit labeling by containment is how HTML already works |

## Style contract ([Bet 6](bets/style-contract.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| S1 | What is in the contract? | **Tokens, the `root` part, states, variants and conditions.** More parts only when a realization demonstrates one | P3 | Low |
| S2 | Per-instance dynamic values? | **No arbitrary style values.** A visual that depends on data (a progress bar's width) is a typed prop that the primitive's realization applies | Realization already treats props as typed slots. The PORT roadmap listed inline styles only as something to evaluate, and an arbitrary style prop would reopen the escape hatch S8 closes | Low |
| S3 | Who owns portable style semantics? | **Defined and checked in Valance, beside the specifications**, and realized by each PORT. Promote to MESH when MESH's tooling must check recipes | MESH's architecture note says portable style semantics "may" be analyzed there, and the PORT roadmap says PORT adds none. Staging resolves both, and matches the design-in-Valance pattern | Low |
| S4 | Who owns variants? | **The core defines small closed sets and every theme maps them.** A library may later add private variants inside its own components. First sets: `intent` (`neutral`, `primary`, `danger`) and `size` (`sm`, `md`, `lg`) | Swapping a theme must never change what a template can say. `intent` was already proposed from SwiftUI's `ButtonRole` (NATIVE-VOCABULARY D7). No consumer yet needs `emphasis`, so it waits | Medium |
| S5 | Which conditions? | `viewport` (`compact`, `medium`, `expanded`), `scheme`, `contrast: more`, `forced-colors`, `reduced-motion` and `target`. The Desktop honors `viewport` and `scheme` first and reports the rest as unsupported in the coverage report | `viewport` and `scheme` already reach the Desktop (`resize`, `appearance`). The others are cheap on the web and cannot be added later without a theme noticing | Low |
| S6 | Is component CSS scoped? | **No scoping is assumed.** The PORT roadmap says "VALANCE scopes component CSS for the web", but no scoping exists in the CLI or common sources, only per-target stylesheets. The contract emits static CSS keyed to data attributes, in cascade layers, so it does not depend on scoping | I searched the CLI, common and valance sources and found none. The roadmap sentence should be corrected | Low |
| S7 | Token format and delivery? | **Design Tokens Community Group 2025.10** documents. Web: CSS custom properties at build time. Desktop: a typed map through the existing `appearance` message | The format reached its first stable version on 2025-10-28 and is not a W3C standard. The message already exists | Low |
| S8 | What happens to `class`? | **It leaves the portable core.** It stays on the web as a marked escape hatch that tools can warn about | Six of the seven portable names cannot take one today, and the Desktop has no equivalent | Medium |

## Types and template values ([Bet 4](bets/variant-types.md), [Bet 5](bets/template-values.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| T1 | How do we name a closed set of variants? | **One new type kind, `enum`: a closed set of strings** (non-empty, distinct, at most 256). Strings only. No general unions | The original MESH design predicted that strict absence and no unions would push models to `any`, and deferred the question. Design-system variants are strings, and `boolean` already has two values | Medium |
| T2 | How does an enum relate to other types? | Enum is assignable to `string`. Enum A is assignable to enum B when A's values are a subset of B's. `string` is assignable to an enum **only at a literal site**. The join of two enums is the enum of both value sets; the join of an enum and `string` is `string` | The spec already accepts subtyping where it is sound (list covariance, "sound because MPRX values are never mutated"). A subset of immutable strings is sound for the same reason | Low |
| T3 | Where are literals checked? | A string literal is checked for membership wherever the expected type is an enum: attribute values, `==` and `!=` against an enum, the branches of `?:`, list elements. A non-member is `unknown-variant` with the closest member suggested. **No other narrowing** | The checker already pushes an expected type into object literals. Narrowing is a stated non-goal and stays one | Low |
| T4 | What does the runtime do? | It validates enum-typed values where they cross the host boundary and fails closed with a diagnostic. **`render-v1` and the patch format are unchanged**: a variant is still a string | Keeps every PORT, and every existing program, untouched | Low |
| T5 | How does a template handle absence? | **`has(x)`** (a boolean) and **`x ?? y`** (the value, or `y`; the result is never optional). Still no narrowing. `len`, subscripts and `?.` wait for a consumer | A presence test alone is nearly useless without narrowing, and the default operator makes absence usable. The M3 milestone's other forms have no consumer yet | Low |
| T6 | Do props have defaults? | **Composites: yes.** A prop declaration may carry a `default`, and an omitted prop binds it, so the scope type is `T`, not `T?`. In Valance it is written `field(schema, default)`, as state already is. **Primitives: no.** An absent prop stays absent and the realization decides | Assembly rule 4b already forces an optional composite prop to be an optional scope name, which makes it unusable. The PORT contract about absent props stays as it is | Medium |
| T7 | What about Effect Schema unions? | String-literal unions become an `enum`. Any other union with no MESH type becomes a diagnostic at the field's line in `main.ts`, not a raw error with a stack | TEMPLATE-TYPES recorded the crash as a defect | Low |
| T8 | String joining? | **`string + string` only**, with no coercion. It can be cut without affecting the rest | The non-goal's reason is that producing text from other values needs formatting. Joining two strings needs none. Least certain of the group | Low |
| T9 | Is this a new manifest version? | **No.** A new kind is a compatible addition to `manifest-v1`, and an older MESH rejects it with `manifest-unknown-kind` | The manifest manual says a change that only allows something new, such as a new kind, may not need a new version | Low |
| U1 | What is the syntax, and what is it called? | **`{#snippet name(params)}...{/snippet}` and `{@render name(args)}`**, called snippets | MPRX's blocks already mirror Svelte's, and Svelte's snippets are the closest primary-source precedent. Renaming is cheap in the free window | Low |
| U2 | What kind is it, and where may it appear? | A manifest kind `snippet` with ordered `params`. It may be a **composite's prop or scope name** only. Never in a primitive's prop, record, list, named type, event payload, command parameter or root scope, and never in an expression except as a whole attribute value, a `{@render}` argument, or a name passed along | This is what keeps function types a non-goal in every way that matters: a snippet cannot be applied, returned, stored or compared, and nothing crosses the PORT boundary | Medium |
| U3 | Whose scope does a snippet see? | **The declaring template's**, plus its parameters. Handlers name the declaring template's commands and events | It is the rule for children today ("the children are the caller's") | Low |
| U4 | How are parameters typed? | From the prop's declared `snippet<...>` when passed; **inferred from render sites** when local, as composite props are inferred. Parameters are compared **contravariantly**, with exact arity | Reuses inference the checker already does | Low |
| U5 | Is recursion allowed? | **Yes, with a runtime depth limit** (proposed 100) that fails closed as `runtime-snippet-depth`. The composite cycle rule is unchanged | Values are finite and acyclic, so recursion over data terminates. Only a snippet re-rendering itself with the same argument loops, and the limit stops that | Low |
| U6 | How does identity work? | A `{@render}` adds a **render step** (proposed `0x07`) to the identity path, like the slot step (`0x06`). Vectors are written before any implementation | Slots already established the pattern, and the slot build found the memoization hazard this must test for | Medium |
| U7 | What happens to slots? | They become **sugar** over snippets (`children` and named props) and are retired after the Language Gate, with diagnostics that name the replacement | MESH 0.11 retired `mesh-if` the same way. Snippets also remove the limits on where a slot may sit | Medium |
| U8 | Does the template format change? | **Yes: bump to `template-v2`** while there are no outside consumers, instead of stretching "optional properties only" | A new child kind is more than an optional property, and the bump is free now | Low |
| U9 | What do the Markdown views do? | The private helpers can fold into local snippets. **The public override points stay**: `runs` and `heading-block` are documented as replaceable, so they remain composites or thin wrappers | `packages/cli/README.md` documents `override` on those names | Low |

## State units ([Bet 8](bets/state-units.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| V1 | How does unit state reach a pure render? | **As an explicit input beside the snapshot**: `render(program, model, snapshot, units)`. Not held by the runtime, and not a field of the snapshot | Render stays a function of its inputs, so replay and the update equivalence law survive. Records are exact and instances are dynamic, so the snapshot cannot hold them | Medium |
| V2 | What is a unit's lifetime? | **The lifetime of its node's identity, exactly as spec §9.10.6 defines it**: reordering keeps it, hiding and showing resets it, a key change is a new unit. **Units are not persisted** | The spec already says a returning identity "inherits nothing". State that must persist is application state | Low |
| V3 | How is a unit declared? | An optional `unit` property on a composite's manifest entry: state fields with defaults, and commands. State names join the template's scope read-only, and commands join its commands. A clash is an assembly error | Additive to `manifest-v1`. Uses the defaults from decision T6 | Low |
| V4 | How are transitions written? | **Pure `(state, args) => state` in TypeScript**, defined with a `unit()` helper in `@valancex/common` (provisional). Effects with capabilities wait for a component that needs them | Disclosure and tabs need nothing more. Smallest surface | Low |
| V5 | How do controlled units work? | A field may be `controllable`. If the caller passes a prop of that name, **the prop is the value** and the unit's change to it is not applied. The intent lists the controlled fields, so the suppression is computed by the runtime. A transition may notify by raising a declared composite event through a new runtime operation, `raise` | One copy of any value, and "the control reports and the app owns it" is already the ecosystem's rule | Medium |
| V6 | Unit or application state? | **Application state** if a command reads it, the URL or router drives it, it must persist, or another screen reads it. **Unit** if only the component's own template reads it and losing it on reload is fine | LiveView's guidance not to use stateful components for organization. In `todo-multi`, `entry` stays (because `add()` reads it) and `navigation` moves | Low |
| V7 | Where does the lifecycle live? | **In Valance**: a registry with a NEXUS `State` in a `Scope` per instance, closed when the instance is absent. **The NEXUS adapter gains one optional pass-through, `units`**, with no logic. This amends X1, which said NEXUS is unchanged | The adapter's own rule is that it has no component lifecycle; NEXUS's `State` and `Scope` are the machinery | Low |
| V8 | Server rendering and hydration? | The server and the client both start with an **empty unit map**, so every instance has its defaults and hydration verification sees identical trees | The simplest way to make the first render agree | Low |
| V9 | Is there a context mechanism? | **No.** Inside one composite the unit's scope is available to the whole template. Parts the caller supplies receive the unit's values as snippet parameters | Dependencies stay visible as props and parameters | Medium |
| V10 | What about template edits? | Units **reset**, because keys are not stable across programs. Recorded as a known limit; revisit if state-preserving reload becomes a goal | Honest about a real cost, and avoids unkeyed-sibling collisions | Low |

## Budgets ([Bet 3](bets/budgets.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| W1 | What is budgeted? | **Six kinds: footprint, start-up, update, wire, installability, and authoring cost.** Authoring cost (the cognitive-load log) is logged and reviewed, not gated by a number | Each is a place the ecosystem already had a problem or a claim. A number for authoring cost would be false precision | Low |
| W2 | Which metric? | **Compressed (brotli) bytes, not raw. Deterministic counters before clocks.** Allowances are measured as a paired comparison in one run | `wasm-opt -Oz` shrank the WebAssembly 22 percent raw and grew it 9.9 percent in brotli. Wall-clock moved up to 16 percent between runs on one machine. The reactivity design already counts evaluations | Low |
| W3 | How are limits set? | **Ceiling = baseline plus 5 percent, rounded up, then ratcheted down.** Targets are separate and soft. **Raising a ceiling is a recorded decision** | A ceiling that moves silently is not a ceiling | Low |
| W4 | How are wall-clock numbers gated? | As **ratios against the previous release on the same machine**: 2x for start-up, 1.5x for `update`. Everything else is reported | The absolute number depends on the machine, and the observed noise (up to 16 percent) must sit well inside the gate | Low |
| W5 | Where does the measurement come from? | **`scripts/measure-footprint.mjs`**, which installs the published packages into a temporary directory. Baselines are **dated files** under `docs/direction/baselines/` and are never edited | Anyone can reproduce it, and it cannot measure the working tree by accident | Low |
| W6 | Where does it run? | On the **release dry run** and **weekly**, not on every push. The deterministic parts join `pnpm test` later. **Decided, not yet wired** | It needs the network and a browser and takes minutes | Low |
| W7 | How are other bets held to it? | **Every brief states an allowance**, and a bet cannot reach stage 4 over it without a recorded decision | The 10 percent (Bet 5) and 1.2x (Bet 8) figures already exist and need numbers to mean something | Low |
| W8 | What if a budget is already failing? | **Accept three known reds at the start, each with an owner:** wire bytes (the Desktop protocol needs patches), installability (`mesh-runtime` and `port-web` are behind), and `fast-check` in the bundle (a target, not a ceiling) | A gate that is red on day one is honest, and it tells us what to fix first | Low |
| W9 | Do development builds warn about size? | **No.** `vlx dev` prints no size warnings, runs no budget checks and prints no chunk-size messages. Size reports and budgets are a production-build feature (`vlx build` and the release dry run) | webpack's hints default to `warning` in production and `false` in development; Vite's size options "only apply to build". Development should be fast and quiet | Low |
| W10 | What does a production build optimize for? | **The smallest, fastest-starting output possible.** Minify, tree-shake and strip development-only code, import Effect through subpaths and leave out `fast-check`, and minify the Desktop engine unless a measurement shows no start-up benefit | Direction set by the maintainer. The measured savings are in the baseline | Low |
| W11 | What ships in the first requests? | **Only what start-up needs.** The page's server-rendered HTML and CSS paint first. The entry chunk and the WebAssembly runtime start downloading with the document, in parallel, the WebAssembly compiled while it streams, and hydration waits for those two alone. **The necessity test: a thing is in the start-up set only if hydration cannot run without it** | Today the WebAssembly fetch starts after the JavaScript has run. The prototype made a working counter 6 to 22 percent faster across six network and CPU profiles | Low |
| W12 | What happens to everything else? | **It is deferred and loads in parallel, as soon as the application has started**: at low priority in idle time (with a timeout), never blocking paint, hydration or the first interaction. Rare or heavy things load on interaction or visibility instead. Content the first view shows is never deferred | Angular's deferrable views (idle by default, with prefetch separate from render) are the model; first-click latency is the reason to start loading at once rather than on first use | Medium |
| W13 | How is a deferred load treated? | **As async work: loading and failure are state**, not a crash. A route whose code has not arrived shows the busy state. A failed chunk is a typed failure, and a stale tab after a deploy becomes a "new version available" state. The server still renders the complete page, because deferral is about code, not content | The ecosystem already treats async work this way ("a failure is state") | Medium |
| W14 | Who sets the budgets? | **Defaults are the framework's start-up ceilings** (Bet 3, section 3), checked on the start-up set. A project may set its own in `valance.json` in Angular's shape (a type, a warning and an error threshold, in bytes, kB or percent). The raised `chunkSizeWarningLimit` values (1,500 web, 4,000 Desktop) are removed | Hiding the warning is not a budget. Angular's `initial` budget is the model | Low |

## Collections ([Bet 10](bets/collections.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| L1 | Where does windowing live? | **A clause on the repeat**: `{#each rows as row (row.id) window start, count}` renders only the items at those indices, clamped, with their declared keys unchanged. An invalid window is a diagnostic. The spelling is a sketch | Evaluating a 50-row window of 10,000 rows took 30 ms against 443 ms, and the tree 9 KB against 1.88 MB. Renderer-only virtualization cannot do that | Medium |
| L2 | How does the PORT learn the sizes? | **A `scroller` primitive** with props `total`, `start` and `itemSize`, and an event `window` carrying the visible range. **`render-v1` gains nothing** | Ordinary props and events keep the contract unchanged, and a PORT without a realization surfaces the primitive visibly | Low |
| L3 | What does the template need? | **`len(list)`**, a number. Subscripts, `?.` and string length stay deferred | It is the consumer T5 was waiting for | Low |
| L4 | Who holds the window? | **A unit of the library component**, or application state when the application wants control. **The runtime has no host input for it** | The window is data in the template's scope, so there is nothing new to thread | Low |
| L5 | Row sizes? | **A uniform declared `itemSize`.** Measured variable sizes wait for a need | Angular's fixed-size strategy and egui's `show_rows` both assume it, and Angular's variable-size strategy is "not ready for production use yet" | Low |
| L6 | Key uniqueness? | **Whole list in development, tests and verify mode; within the window in production** | The whole-list check would cost an estimated 70 ms at 10,000 rows and give back the saving. It mirrors the changes form's verify mode | Medium |
| L7 | Pinning and what scrolling out means? | **A contiguous window only, no pinning in v1.** A row outside the window has ended, so its unit state resets and browser find does not see it. Durable state is application state | Matches spec §9.10.6 and the Bet 8 litmus test. Pinning is the first open question | Medium |
| L8 | Server rendering? | Server and client **render the initial window from the unit's defaults**, so hydration sees identical trees | Same rule as units (V8) | Low |
| L9 | Is this paging? | **No.** Windowing the view is for the range where the data fits. About 3 ms per 1,000 rows of snapshot remains, so past tens of thousands of rows the application slices in its scope function or pages its data, and that stays a supported pattern | The measured floor | Low |
| L10 | What about moderate lists? | **`content-visibility: auto` on rows is an optional web realization** for lists up to a few thousand rows. It is web-only and does not reduce the engine, tree or wire cost | A cheap tier with no script. Its browser support must be checked on MDN and Baseline | Low |

## Starting from what the server did ([Bet 14](bets/resumable-start.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| H1 | Do we start from the render tree without re-evaluating it? | **Parked for ordinary pages**, with a trigger: revisit if a page, after windowing bounds it, still spends over a third of "interactive at" on rows (about 1,000 rows at 4x CPU). Try verifying in idle slices before skipping verification | Rows are about 10 percent of "interactive at" at 100 rows and within noise at 4x. The fixed cost dominates. Skipping verification would give up the fail-closed hydration | Low |
| H2 | What happens to an early tap? | **Build an early-input shell.** It records trusted discrete events only (click or tap on a control, submit, Enter and Escape in a text field), with the event types generated from the primitives table | Measured: 7 of 9 taps in the dead zone were lost. The prototype is 389 bytes (258 gzipped) and replayed all 6 | Low |
| H3 | How is it replayed? | After hydration has verified and adopted the DOM, by dispatching a new event at the same adopted node, **in order, one at a time, waiting for each command to settle.** At most 20 events and none older than 10 seconds. Dropped if the node is gone, and entirely if hydration fell back to a fresh draw. **Links are never captured** | Hydration keeps every server node, so the target is live. Links already navigate natively | Medium |
| H4 | What about typed text? | **The last value of each field is kept** and replayed as an input event after hydration | Hydration otherwise writes the application's value over what the person typed | Medium |
| H5 | Does the person see that the page is not ready? | **Yes.** The root carries `data-vlx="starting"` until ready, and the shipped stylesheet gives controls a busy cursor and `aria-busy`. The shell is generated, with no configuration | Stops repeated taps, which replay would otherwise apply more than once | Low |
| H6 | Does the PORT contract change? | **No.** "Interactions before hydration are not replayed" stays true of the PORT. Replay is the composer's feature (Valance's), done by dispatching ordinary events | Keeps PORTs simple and the contract stable | Low |
| H7 | Does the WebAssembly leave the start-up set? | **No.** Compiled in parallel it costs 1 to 10 ms in `init`. This corrects the note in Bet 3 | Measured | Low |
| H8 | What is the next lever? | **Bytes and the fixed start cost.** Profile the start sequence, and add "interactive at" and "dead zone" to the Bet 3 metrics | About 60 percent of "interactive at" at 4x is the script arriving, and the start work is about 400 ms of the rest | Low |

## The reference build ([Bet 12](bets/reference-library.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| K1 | Where is the reference build, and how is it kept honest? | **A separate repository, built as an outsider.** A boundary test fails on any import outside the published entry points, any `internal` subpath and any path into another repository. CI installs published or prerelease packages only. A needed core change is filed as a friction report first | The point is to show public seams suffice. The repository already uses boundary tripwire tests | Low |
| K2 | What is built? | **Six components, each needing one seam** (`labeled-field`, `badge`, `disclosure`, `tabs`, `data-list`, `virtual-list`), **two themes** (`plain`, `contrast`) and **a minimal terminal PORT** | The smallest set that touches every bet. A third target is the cheapest test that the contract is not shaped like the web and the Desktop | Low |
| K3 | Do libraries ship compiled templates? | **No: templates ship as source and the consumer compiles them**, as Svelte does. Not Angular's partial compilation | MESH's known limitation: every template must be recompiled after a model change. The consumer already has the compiler, so no linker is needed | Medium |
| K4 | How does a library declare itself? | **An export condition `valance`** in `package.json` and a **`valance` field** with `targets`. The build processes marked packages instead of loading them in Node | The measured failure (`Unknown file extension ".mprx"`) is Vite externalizing dependencies. Svelte's `svelte` condition is the precedent | Medium |
| K5 | What if a library does not support a target? | **One diagnostic at the use site** that says so, not several inside `node_modules` | Measured: four errors in the library's file, where the consumer cannot act | Low |
| K6 | How does a library ship CSS? | **It declares its stylesheets.** The build collects them into the library layer, below the theme and the application. `"sideEffects": ["**/*.css"]` is the guidance | Today CSS arrives only through a side-effect import, and nothing can order or replace it | Medium |
| K7 | What is the author's tooling and loop? | **`vlx init library`** (a workspace with a playground), **`vlx library build`** (JavaScript, declarations and contract types), **`vlx library check`**. Symlinked `file:` installs are documented as unsupported | Measured: a symlinked library cannot find its peers; a compiled one has no types | Low |
| K8 | What counts as breaking for a library? | **Removing an export, a component, a prop or an event.** A library declares `@valancex/common` as a peer | Svelte's rule, for the same reason | Low |
| K9 | Can libraries add primitives in version 1? | **No.** They compose existing primitives. A new primitive goes through the specification process | `defineApp` has no plugin field, and a primitive is a decision for every target | Medium |
| K10 | Who tries it, and what proves it? | **The maintainers' own build is the pilot, then three to five design partners** with a friction-log protocol. **The Reference Gate needs at least two outsiders to publish a working component or theme from the documentation alone**, and the pilot must need zero private seams | Insiders cannot test the docs. The pilot goes first because its friction is cheap to collect | Medium |

## The conformance kit and the gallery ([Bet 2](bets/conformance-kit.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| Q1 | How many layers does verification have? | **Three: semantics, primitives, libraries.** Semantics are MESH's vectors; primitive cases are generated from the specifications; library checks come from fixtures and types | Each layer has a different owner and a different source of cases | Low |
| Q2 | How do PORTs get the vectors? | **MESH publishes `@valancex/mesh-conformance` (data only); PORTs depend on it and never copy.** A check fails on a copy in tree or an installed version older than the one claimed | Measured: the Web PORT's copy is at v0.6 and lacks `identity/` | Low |
| Q3 | How does a PORT plug in? | **A five-operation line-JSON adapter** (`load`, `update`, `observe`, `interact`, `unmount`), run as a child process | A Rust or any-language PORT needs no JavaScript; the Desktop host protocol already has this shape | Medium |
| Q4 | What does `observe` return? | **Meaning, not structure:** text, value, enabled, checked, child order. Roles and names join when accessibility resumes | Angular's harness reasoning: tests survive internal change. Unifies each PORT's private `inspect` | Medium |
| Q5 | How are primitive cases made? | **Generated from the specifications** (presence, each closed-set member, each event, controlled change, hostile value), plus hand-written edges | Adding a variant adds a case with no one writing it | Low |
| Q6 | What does a PORT's report say? | **Data against a JSON schema.** `unsupported` counts only when declared in the PORT's own realization data; otherwise it is a `fail`. Reports generate the parity table | Keeps gaps visible and documentation true | Low |
| Q7 | What is the gallery? | **A generated application.** Stories are data (props plus an optional script); closed sets are enumerated; every theme is a dimension | The ecosystem dogfoods its own build | Medium |
| Q8 | What gates? | **Vectors, primitive cases and structure snapshots gate. Pixel screenshots advise, per machine, and are never committed** | Playwright and `docs-verifier` both found rendering varies by host | Low |
| Q9 | Where does it live? | **`@valancex/conformance` in Valance**, beside `@valancex/primitives`; `vlx library check` runs it | Same home as the specifications it generates from | Low |

## Replay ([Bet 15](bets/replay.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| R1 | Is replay a requirement? | **Yes for every MESH runtime**: it must replay the published logs and give the recorded tree hashes. PORTs are not asked to replay trees; they pass the interaction script derived from a log | The runtimes already agree byte for byte. A PORT draws a screen, which observation checks | Low |
| R2 | What is the format? | **Line-JSON**: header, `changes`, `event`, `result`, `tree`. Appendable, readable after a crash, the same shape as Bet 2's protocol | One tool reads both | Low |
| R3 | What is recorded? | **Inputs and tree hashes**; whole trees only at every 50th line and at the end | Small logs, and a divergence still shows a tree | Low |
| R4 | Are render versions recorded? | **No.** `base` is process-local (versions 2 to 5 in one run, 22 to 25 in another, with identical trees); the player supplies its own | Measured | Low |
| R5 | Do commands re-run on replay? | **No.** A command's outcome is recorded as data. Time and randomness are therefore never needed by the player | Exact, and needs no fakes. Nexus's injectable clock stays for whole-application tests | Medium |
| R6 | What counts as equal? | **SHA-256 of the runtime's compact JSON of the tree**, and the same hashes by three routes: an `updateChanges` chain, an `update` chain and a `render` of each snapshot | The equivalence law at session scale. Measured equal on a 5-tree sample | Low |
| R7 | What is published? | **At least six logs in `@valancex/mesh-conformance/replay/`**, run by both runtimes | A requirement needs a check | Low |
| R8 | Who records, and when? | **Valance, in development only** (`vlx dev --record`), to a local file, never uploaded. A production build contains none of it | The build-mode rule and fixed point 9. Logs hold user data | Low |
| R9 | Sensitive data? | **A `sensitive` marker on manifest fields**; the recorder substitutes a typed placeholder, and hashes are taken over the redacted snapshot | Replay stays structural and the log is safe to share | Medium |
| R10 | Versions? | **Exact within a runtime minor version.** Across versions the player reports the first divergent step as information. Goldens are regenerated on purpose, with a changelog note. A new format sits beside the old for one release | Deliberate changes must not look like failures | Low |

## Safe generated UI ([Bet 13](bets/safe-generated-ui.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| G1 | What may a model use? | **A profile: a named subset of the manifest** (components, props, events, commands). The checker runs against it; the model's prompt text is generated from it | The checker and the prompt cannot disagree. A2UI's catalog is the same idea | Low |
| G2 | How is a partial file checked? | **Repair the prefix** (cut to the last complete token, close what is open) and check that. The checker does the repair, not the host | Measured: raw prefixes give a syntax error 275 times in 276; repaired prefixes were clean 233 of 271 and reported planted mistakes 8 to 13 bytes after them | Low |
| G3 | What is drawn while streaming? | **Only checked, complete elements and their open ancestors**, as ordinary `update` patches. Unknown components are never drawn, even in a preview | Fail closed. This differs from A2UI's graceful fallback on purpose | Low |
| G4 | What is the session contract? | **`open`, `push`, `close`.** `close()` equals the batch check of the whole text. A later chunk only appends | A property that can be tested | Low |
| G5 | What limits apply? | **64 KB source, 5,000 elements, 64 attributes per element, the existing depth cap, 50 ms of checker time per push**, each with a diagnostic code | Measured: 20,000 siblings gave no answer in 40 seconds; 10,000 attributes took 15 seconds | Low |
| G6 | What about the quadratic checker? | **Fix it, with or without streaming.** Sibling and attribute paths become linear, and a session checks only from its last stable point | 1,000 siblings 131 ms, 8,000 siblings 7 s | Low |
| G7 | How does correction work? | **At most 3 rounds; a diagnostic is sent once; match on `code`**; the host chooses to continue or restart | Keeps the loop finite and the guide's rules | Low |
| G8 | Do commands from generated UI need a new path? | **No.** The same Nexus handler, with the manifest's typed arguments. A command that needs consent says so in its own contract | Generation must add no way to act | Medium |
| G9 | Who stops `javascript:` in a link? | **The primitive's specification types the value, and the PORT refuses what it does not allow.** The checker only knows strings | Measured: a string prop accepts it, correctly. Meaning belongs to the primitive | Medium |
| G10 | Where does it live? | **MESH: session, limits, incremental check. Valance: profile, prompt text, loop helper.** Nothing in a PORT. It loads only when a page uses generation | The build-mode rule and fixed point 9 | Low |

## Accessibility as types ([Bet 7](bets/accessibility.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| A1 | Who sets a role? | **The primitive, never the author.** The specification carries `role` from a closed set, the intersection of what the web and AccessKit support. Templates have no `role` or `aria-*` | "No ARIA is better than Bad ARIA" (APG). A target that is not the web cannot interpret ARIA | Medium |
| A2 | How is a name required? | **A `name` field on each primitive**: `content`, `prop`, `either` or `none`. A use with no source of a name is the error `unnamed-control` | Measured: an unnamed checkbox, textfield, button, link and image all compile on both targets and reach a screen reader as `""` | Low |
| A3 | Is `label` still optional on `checkbox` and `textfield`? | **No: required on both targets.** `placeholder` is not a name | Both vocabularies list `label` as optional today. Chromium uses a placeholder as a name, which is not a label | Low |
| A4 | What about names known only at run time? | **A development-build diagnostic naming the node** when a name is empty. Production builds carry no check | The compiler cannot know a value. The build-mode rule | Low |
| A5 | How does a name pass through a library component? | **A component's contract declares which prop supplies its name**, with the same field. The check follows the contract, not the body | A library is right or wrong for everyone who uses it | Medium |
| A6 | How are two nodes related? | **By node reference, resolved at compile time**, not by an id the author writes. A reference to nothing is `unknown-ref`. The PORT derives an id from the node key | Counter and fixed ids break in lists and under streaming (React `useId`) | Medium |
| A7 | How are keys bound to roles? | **A `keyboard` table in the specification**, written from the APG patterns, and generated vectors in the kit that send each key and check the result | "A role is a promise" that the keys work. A PORT that draws the role without them fails | Low |
| A8 | What does `observe` gain? | **Role, name, description and states.** On the web it reads the browser's accessibility tree (through its debugging protocol), on the Desktop the AccessKit update | Measured: a test library's own computation of the heading level disagreed with the browser's | Low |
| A9 | Contrast? | **Themes declare token pairs; `vlx theme check` computes the contrast ratio.** It gates the reference themes and advises elsewhere | The one visual rule that is checkable from data | Low |
| A10 | What does "accessible" mean here? | **Only what is checked.** The brief lists what compiling does not check. The Reference Gate adds one screen-reader run on the web and one on the Desktop per release candidate, and two outside reviewers who use one daily | Static checks have a ceiling (jsx-a11y says so) | Low |

## Interaction state, focus and layers ([Bet 9](bets/interaction-state.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| D1 | Are hover, pressed and focus-visible in the tree? | **No.** They are the target's presentation, exposed to themes as the state hooks. A target that cannot tell the input modality treats focus as visible | The tree would change on every pointer move. Measured: `:focus-visible` is false after a click and true after Tab | Low |
| D2 | What happens to focus when the tree changes? | **Focus follows node identity.** After patching, the PORT restores focus and selection by key; if the node is gone, focus goes to the next sibling, else the previous, else the nearest focus scope | Measured: a keyed row that moves loses focus on the web (`insertBefore`), and the removed case lands on the body | Low |
| D3 | How are rows moved? | **With `moveBefore` where it exists, and by restoring otherwise** | Present in Chromium 141 and kept focus (but reset the selection in that build) | Low |
| D4 | What are the layer primitives? | **`dialog` (modal) and `popover` (non-modal, anchored)**, both with a controlled `open` and a `dismiss` event with a reason. Tooltips, menus, selects and comboboxes are not in version 1 | APG and the platform treat them separately. The rest need the keyboard tables first | Medium |
| D5 | Is a modal ever "not inert"? | **No.** A `dialog` is always inert behind it and always draws a backdrop | APG: modal only when both conditions hold | Low |
| D6 | Can the application refuse a dismissal? | **Yes, but the browser may close the native dialog anyway.** The PORT reports `dismiss`, then draws the dialog again if `open` is still true | Measured: a second Escape in a row closes a dialog whose `cancel` was prevented | Medium |
| D7 | Server-rendered overlays? | **Written open and non-modal so they paint, then upgraded at hydration** (close, then show as modal). `dialog[open]` is not modal and `popover[open]` is not open | Measured. One focus move at hydration is the cost | Medium |
| D8 | Who restores focus on close? | **The PORT, by key, to the node that had focus before the layer opened.** Not the browser | With the invoker removed the browser's result was unreliable in the test | Low |
| D9 | Who holds `open`? | **The application (NEXUS state) or a state unit**, through the same controlled prop and event | A library's disclosure and popover need units; an application's confirm dialog needs state | Low |
| D10 | The Desktop? | **A layer drawn above the content in the same window that consumes other input, cycles Tab inside and returns focus.** Whether egui's own support does the cycling is unknown and is the first experiment | X2. The egui documentation was unreachable, so its overlay behavior is unverified | Medium |

## Forms from the schema ([Bet 11](bets/forms.md))

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| F1 | What is the source of validity? | **The command's input schema.** The form reads it; the command validates again; UI validation is never trusted | One description of valid cannot drift from itself | Low |
| F2 | Do constraints go into MESH types? | **No.** The host reads them from the schema annotations; the template does not need them. The `enum` kind (Bet 4) recovers the closed sets | `web-manifest.ts` drops refinements; measured: `minLength`, `pattern`, `minimum`, `maximum` survive as annotations | Low |
| F3 | What does a field hold? | **The encoded value** (text), with `touched`, `dirty` and one `errors` message. `pending` is reserved | `NumberFromString` shows the text and the number differ | Low |
| F4 | Where does the draft live? | **In a state unit keyed by the form's identity**, or in an application `State` handle that is passed in | Rows keep their own drafts when a list re-sorts | Medium |
| F5 | When do errors show? | **When invalid and (touched or a submit was tried); then they update as the person types.** A failed submit marks every field touched and focuses the first invalid one | Angular's dirty-or-touched rule and Phoenix's `used_input?` | Low |
| F6 | One message per field? | **Yes: decode with `errors: "all"`, fold by path, prefer the author's `message` annotation.** A field with only a default message gets a development diagnostic | Measured: the default reports the first issue only; literal unions give two issues per field; default text is for developers | Low |
| F7 | Does a form need a `title` on each field? | **Yes.** A missing `title` is a startup error in development builds that names the field | Feeds the name rule ([Bet 7](bets/accessibility.md)) | Low |
| F8 | Server-side and async checks? | **The command may fail with `FieldErrors` (path to message), shown as if validated.** Client-side async validators are not in version 1 | Covers "already taken" without a second mechanism; Angular's async rule comes later | Medium |
| F9 | Is there a `form` primitive? | **No.** A host model plus ordinary primitives; the library ships `labeled-field`. A scaffold can generate a template once | Nothing about a form is target-specific | Low |
| F10 | Standard Schema? | **Adopt when Effect provides it.** `standardSchemaV1` is absent in Effect 3.10.19 | Same issue shape, so little changes | Low |

## Cross-cutting

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| X1 | Where does interaction state live? | **In Valance, as the UI runtime**, built from NEXUS's `Scope` and `State` bound to a node's identity. NEXUS's primitives are unchanged; its Mesh adapter gains one pass-through (V7). Built only when a first consumer needs it; the first is a library's disclosure, which Bet 8 specifies | NEXUS's own state document says it holds application state, "never UI state, which belongs to the component/UI runtime, not NEXUS". The multi-target plan's rule is "do not add a concept without a consumer that needs it" (D3) | Low |
| X2 | Overlays on the Desktop? | **In-window layers only.** No OS windows in the portable vocabulary. A second OS window is a host feature, not a primitive | The window is the host's (NATIVE-VOCABULARY D5), and egui, which the Desktop uses, draws popups and areas inside its one window | Medium |
| X3 | Where does the edition live? | **A project setting in `valance.json`**, numbered. Documents keep their format `version`. The compiler chooses rules by the project's edition. Introduced at the Edition Gate | Rust makes the edition a per-crate opt-in, and MESH documents already separate the format version from the project | Low |
| X4 | Are breaking changes in the free window allowed? | **Yes**, for everything in P6, P7 and S8, with a diagnostic naming the replacement | The window exists for this | n/a |
| X5 | What does stage 2 mean here? | A maintainer may delegate the review. The delegation is recorded at the top of this page | The rule in the bets index asks for a reviewer other than the author | n/a |

## What I am least sure of

These are the decisions most likely to be wrong, in order, and what would tell us.

1. **P1, the home of the specification.** If MESH's editor tooling ends up needing roles and keyboard contracts from the specifications, the schema belongs in MESH. Watch for the language server needing to import it.
2. **S4, a small closed variant set.** If the reference library needs variants the core does not define, the set is too small. Watch the outside-author experiment.
3. **S3 and the parts rule (P3).** If a real theme cannot be written with `root` only, add parts one at a time, each with a realization that demonstrates it.
4. **X1, interaction state in Valance.** If the first two components (disclosure and tabs) need state that cannot be a NEXUS `State` per identity, this decision is wrong.
5. **T8, joining strings.** It is the part of Bet 4 least certain to belong there. If the base-address problem is better solved by the framework supplying computed addresses, drop it.
6. **U5, recursion with a depth limit.** If the limit is hit in ordinary use, or hides a real mistake, a stricter rule (recursion only inside a repeat over the argument's own list) is the fallback.
7. **V5, the `raise` operation.** If it forces an exception to "one interaction reaches at most one binding", ship uncontrolled units and treat notification as a separate bet.
8. **V1, a separate `units` input.** If the NEXUS adapter or the changes form make it awkward, the fallback is a reserved snapshot entry with a special case in the runtime.
9. **W4, the wall-clock thresholds (2x and 1.5x).** They come from one machine. If the CI machine is noisier, the gate widens or becomes a report.
10. **W12, loading at once after start.** If idle-time prefetch competes with the user's first interactions on slow devices, defer the prefetch until after the first interaction or a short delay.
11. **W6, running only on release and weekly.** If regressions are found late, the deterministic subset moves into every push sooner.
12. **L7, no pinning.** If a focused or selected row far from the window is common, a pin list becomes necessary and the window stops being contiguous.
13. **H3, the caps and the one-at-a-time replay.** Real applications will show whether 20 events and 10 seconds are right, and whether waiting for each command to settle makes replay feel slow.
14. **H2, replaying trusted events only.** It is the right safety rule, and it means the shell can never be tested with synthetic clicks, so the conformance harness must drive real input.
15. **L6, checking keys only in the window in production.** If duplicate-key bugs reach production, check the whole list there too.
16. **K4, the marker.** A condition and a field may both be needed, as Svelte keeps a legacy field beside its condition. If tools disagree about reading the condition, use the field.
17. **K9, no new primitives from libraries.** If the first partners all want one, the specification process is too slow and a plugin seam is needed.
18. **K10, recruiting outsiders.** The gate depends on people who are not on the team. If none can be found, the gate cannot pass, and that is itself a finding about adoption.
19. **U8, bumping the template format.** If an outside consumer appears before the Language Gate, the bump becomes a compatibility cost and the extension rule should be revisited.
20. **Q3, the adapter's size.** If a new PORT needs more than about 300 lines or a day to implement it, the interface is too wide.
21. **Q4, `observe` without roles.** If libraries need role checks before accessibility work resumes, `observe` grows early and Q4 is revisited.
22. **R5, never re-running commands.** A replay then cannot catch a bug in a command. If that is the bugs people report, add the second tier: re-run under a recorded clock and random source, advisory.
23. **R9, redaction.** A value that decides control flow changes the tree when redacted. If that is common, redact by field and warn when the placeholder changes a branch.
24. **G2, repairing the prefix.** If the repair hides real errors (a mistake reported late or not at all in over 5 percent of random cases), report fewer prefixes as acceptable.
25. **G3, never drawing an unknown component.** If assistants need a placeholder to feel responsive, draw a labeled placeholder that is not the component, never the component.
26. **G8, no new path for commands.** If consent for data-changing commands needs its own protocol, it becomes a separate bet.
27. **A2 and A3, a required name.** If real templates need unnamed controls (a decorative checkbox), add a `decorative` form as for images rather than relaxing the rule.
28. **A6, references instead of ids.** If a relation must reach into another component, references need to cross a component boundary, and the fallback is a key path scoped to the component.
29. **D2, focus by key.** If the restore step is visible (a flicker, a scroll jump) on slow devices, restrict it to moves of the focused subtree.
30. **D6, redrawing a refused dialog.** If the flicker is noticeable, accept the platform's close and report it, and make the application state follow.
31. **D10, the Desktop layer.** Not measured. If egui cannot hold an inert layer cheaply, the Desktop ships `dialog` and `popover` later than the web and the Reference Gate waits.
32. **F4, drafts in units.** If a draft must survive a remount or a reload, it moves to NEXUS state and units keep `touched` only.
33. **F5, the timing rule.** Taken from two frameworks' guidance, not from a study. If testers miss errors, show them on blur only for fields that were changed.
