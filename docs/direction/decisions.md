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

## Cross-cutting

| # | Question | Decision | Why | Undo |
|---|---|---|---|---|
| X1 | Where does interaction state live? | **In Valance, as the UI runtime**, built from NEXUS's `Scope` and `State` bound to a node's identity. **NEXUS is unchanged.** It is built only when the reference library (Bet 12) needs a first consumer | NEXUS's own state document says it holds application state, "never UI state, which belongs to the component/UI runtime, not NEXUS". The multi-target plan's rule is "do not add a concept without a consumer that needs it" (D3) | Low |
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
7. **U8, bumping the template format.** If an outside consumer appears before the Language Gate, the bump becomes a compatibility cost and the extension rule should be revisited.
