# Bet 6: The style contract

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The open questions are decided in [decisions](../decisions.md) (S1 to S8); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 1](primitive-specification.md) (primitives declare parts and states) and Bet 4 (variants need literal sets) |

## Question

Can the core define what a theme or style library may depend on, so that a third party can restyle every primitive on every target without editing a template and without depending on DOM structure, and can it do so without becoming a style engine?

The question is about a **contract**: the small set of things a theme can rely on. It is not about inventing a way to compute styles.

## Why, and who is hurt

### What exists

| Fact | Source |
|---|---|
| The render tree carries no style. "Accessibility semantics and styling (render-v1 carries none)" is listed under "Not in version 1" | [PORT contract](https://github.com/ValanceX/Port/blob/main/docs/CONTRACT.md) |
| PORT adds no style mechanism: "Do not invent a universal styling abstraction unless the Web implementation demonstrates that one is actually required" | [PORT roadmap, V0.4](https://github.com/ValanceX/Port/blob/main/docs/ROADMAP.md) |
| MESH records the direction but builds nothing: portable style semantics (`padding`, `display: flex`) belong in MESH, and target-specific behavior is explicit, "as a rule condition like `@target linux { … }` alongside `@media (width < 600px) { … }`, never by pretending every target styles alike". "None of this is implemented yet beyond templates and render trees" | [MESH architecture](https://github.com/ValanceX/Mesh/blob/main/docs/ARCHITECTURE.md#direction-semantics-not-implementations) |
| On the web, `class` is a prop on 15 of the 32 tags (`shell`, `div`, `header`, `footer`, `nav`, `aside`, `para`, `quote`, `list`, `olist`, `pre`, `span`, `image`, `link`, `button`). Of the seven portable names, only `button` has it. `theme` (`data-theme`) exists on `shell` only | `packages/common/src/primitives.ts` |
| `column` and `row` are custom elements with a generated `core.css` | `packages/cli/src/emit.ts` |
| A target's stylesheets are the ones under its own directory. The Desktop target loads none | [`MULTI-TARGET-PLAN.md`](../../application-model/MULTI-TARGET-PLAN.md), row 8 |
| Desktop styling is "not built (the to-do app has no styling at all)", and CSS "does not carry over": it needs "a small style language (spacing, emphasis, intent) in the vocabulary" | [`NATIVE-PARITY.md`](../../application-model/NATIVE-PARITY.md), row 7 |
| The Desktop does receive an `appearance` (light, dark, system) and reports its `scheme`, and the web has `viewport` classes (`compact`, `medium`, `expanded`) fed by `resize` | [Desktop PORT architecture](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-10-14-port-desktop.md), `NATIVE-PARITY.md` row 9 |
| An `intent` (`primary`, `danger`) for buttons was proposed from SwiftUI's `ButtonRole`, as tier 2 | D7 in [`NATIVE-VOCABULARY.md`](../../application-model/NATIVE-VOCABULARY.md) |

One claim did not hold up: the PORT roadmap said "VALANCE scopes component CSS for the web". The CLI, common and valance sources contain per-target stylesheet loading and no scoping mechanism. The roadmap was corrected on 2026-10-17 (Port `ROADMAP.md`, V0.4 status). The contract does not assume scoping (decision S6).

### The condition in the PORT roadmap has been met

The PORT roadmap allows a style abstraction if the Web implementation shows one is needed. The evidence is now broader than the web:

- A second target exists, and it has no styling at all.
- The web's own hooks are inconsistent. Six of the seven portable names (`column`, `row`, `heading`, `text`, `checkbox`, `textfield`) cannot take a `class`, so a stylesheet can only reach them by element name.
- A multi-target application keeps a separate stylesheet per target and shares none of it.

### Who is hurt

- A theme author cannot restyle `checkbox` or `textfield` through a stable hook on either target.
- An application author cannot change the look of a whole application across targets.
- A component library author, later, would have to hard-code appearance or depend on DOM structure.

## Prior art

Reliability: **P** is a primary source read through a fetch agent; **S** is a secondary summary; **Repo** is this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What happened and the stated reasoning | Architecture or patch | Lesson here |
|---|---|---|---|
| React (**P**, [WG discussion 110](https://github.com/reactwg/react-18/discussions/110)) | Inserting style rules during render "effectively causes a recalculation of all CSS rules against all DOM nodes every frame while React is rendering. This is VERY slow." React added `useInsertionEffect`, "not really meant to be used by anything else other than these CSS libraries", and said "we don't have plans for adding any solutions upstream to handle this in React" | A patch, plus a decision to stay silent on styling | When the core is silent, style libraries bind to internals (render-time insertion) and are exposed when the rendering model changes |
| Stitches (**S**, its repository) | Marked no longer actively maintained. A maintainer comment said it is a runtime library, "not currently a lib that the React team would recommend" and not compatible with React 18 streaming; a static version had been explored, not shipped | A casualty of the rendering model changing under it | A runtime style engine is coupled to the renderer. Static style data is not |
| Runtime CSS-in-JS cost (**S**, a single-codebase comparison) | One team reported render time nearly doubling with Emotion versus Sass modules (27.7 ms versus 54 ms) in their application (**unverified**: no source was recorded for this figure) | Anecdote | Measure our own; do not rely on this figure |
| Angular Material MDC migration (**S**) | DOM and CSS class names changed, with "style-related issues" for many consumers | A rewrite that broke styles tied to internals | Do not let themes depend on structure. Expose parts and states |
| Radix (**P**, [philosophy](https://raw.githubusercontent.com/radix-ui/primitives/main/philosophy.md)) and Base UI (**P**, [README](https://github.com/mui/base-ui)) | "Zero presentational styles applied by default"; Base UI describes itself as "an unstyled UI component library" | Architecture | Behavior and appearance can be separate packages. A contract is what lets them stay separate |
| React Spectrum (**P**, [v3 RFC](https://raw.githubusercontent.com/adobe/react-spectrum/main/rfcs/2019-v3-architecture.md)) | "Theme agnostic behavior" and "themed components" as separate layers | Architecture | Same cut, between behavior and theme |
| W3C Design Tokens Community Group (**S**, [announcement](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)) | First stable format, 2025.10, published 2025-10-28 as a Final Community Group Report. It is "not a W3C Standard" | Interchange format | Adopt it for tokens; do not claim it is a standard |
| SwiftUI `ButtonRole` (**Repo**, quoted in NATIVE-VOCABULARY D7) | "The system uses the button's role to style the button appropriately" | Platform design | Say what a thing means (`intent`), let the target decide how it looks |
| Flutter and others that draw their own pixels (**S**) | Need their own semantics and theming layers | | The Desktop PORT is in this class (egui). It must carry its own theme model |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 1, 3, 4, 7 and 8, and by the stated refusal of a browser-side style engine:

- Styles are static data. Nothing computes a style at runtime beyond what MPRX already evaluates (props and tokens).
- A theme depends on parts, states, variants, tokens and conditions. It does not depend on elements, class names, or structure.
- The portable set is small and honest. Target-specific styling is explicit and marked.
- Variants are typed (Bet 4). A misspelled variant is a compile error.

## Design (a sketch, not accepted)

### The contract has five things

| Thing | Meaning | Declared by |
|---|---|---|
| **Token** | A named design decision: a color role, a space step, a type role, a radius | The theme, in the Design Tokens format |
| **Part** | A named region of a primitive. Only `root` exists for now (P3); others are added one at a time | The style contract names the part; the primitive specification lists which a primitive offers |
| **State** | A condition a primitive can be in. Semantic states (`checked`, `invalid`, `disabled`, `busy`) are declared by the primitive specification; interaction states (`focus-visible`, `hovered`, `pressed`) are defined once by this contract (P3) | Both, as stated |
| **Variant** | A semantic choice an author makes in a template: `intent`, `size` | The primitive specification, as typed props |
| **Condition** | A circumstance a rule applies in: viewport class, color scheme, contrast preference, reduced motion, target | The style system |

Everything else (the element, its class, the order of wrappers) is **not** part of the contract. A library that depends on it is outside the contract.

### Tokens

Themes are Design Tokens documents with named modes (light, dark, high contrast). The web compiles them to CSS custom properties at build time. The Desktop receives the resolved values, extending the `appearance` message it already has, and keeps them as a typed map.

### Parts and states

A primitive's specification lists its semantic states; the interaction states and the single `root` part come from this contract (P3). A realization says how each is reachable: on the web, a part is an element or a documented pseudo-element, and a state is an attribute the PORT keeps current (the PORT already keeps controlled values current; this is the same kind of work). A realization may leave a part unrealized, and a theme that styles one gets a warning. Decided (S1, P3): a primitive has one part, `root`, until a realization shows it needs another.

### Variants

Variants are props with closed literal sets, declared in the specification. The core defines a deliberately small set (candidates: `intent`, `size`, `emphasis`), and every theme must map them. Alternatives:

| Option | For | Against |
|---|---|---|
| **A. The core defines a small set of semantic variants; every theme maps them** | Swapping a theme never changes what a template may say. Matches SwiftUI's role approach and NATIVE-VOCABULARY D7 | A theme cannot add a variant for its own use |
| B. A theme declares the variants it adds | Maximum freedom | A template then depends on its theme; swapping breaks it |
| C. A and, inside a library's own components, private variants | A theme is swappable; a library keeps its own vocabulary | Needs template values (Bet 5) to stay checkable |

Decided (S4): C, built from A first. The first sets are `intent` (`neutral`, `primary`, `danger`) and `size` (`sm`, `md`, `lg`).

### Recipes

A recipe is static data that maps a part, a variant combination, a state and a condition to style declarations from a closed portable set.

```json
{
  "version": 1,
  "target": { "primitive": "button", "part": "root" },
  "base": { "padding": ["space.2", "space.4"], "radius": "radius.2", "type": "type.label" },
  "variants": {
    "intent": {
      "neutral": { "background": "color.surface", "text": "color.text" },
      "primary": { "background": "color.accent", "text": "color.on-accent" },
      "danger":  { "background": "color.danger",  "text": "color.on-danger" }
    },
    "size": { "sm": { "padding": ["space.1", "space.3"] }, "lg": { "padding": ["space.3", "space.6"] } }
  },
  "states": {
    "hovered": { "opacity": 0.92 },
    "disabled": { "opacity": 0.5 },
    "focus-visible": { "outline": { "width": "border.2", "color": "color.focus" } }
  },
  "when": { "viewport:compact": { "padding": ["space.2", "space.3"] } },
  "escape": { "web": { "css": "text-transform: none" } }
}
```

The portable property set is closed and small: spacing, size, color roles, type roles, radius, border, elevation, alignment and gap. A value is a token reference or a literal. The `escape` block is the explicit, marked way out, named by target, as the MESH architecture note requires.

### How each target realizes it

- **Web.** Recipes compile at build time to a static stylesheet. The stylesheet is the same on the server and in the browser, so there is no runtime insertion and no hydration difference. It is emitted into named cascade layers so that a library's styles lose to a theme's, and a theme's to the application's own, without `!important`. Cascade-layer support has **not been verified** against MDN/Baseline (expected to be widely available; unchecked).
- **Desktop.** Tokens become a typed map applied to the immediate-mode style. The Desktop will express less than the web. A theme's coverage report says exactly what is not applied on a target, instead of silently ignoring it.

### What the tools check

| Check | Where |
|---|---|
| A recipe names a part, state or variant the primitive does not declare | Error, with a suggestion |
| A recipe uses a property outside the portable set without an `escape` | Error |
| A token reference does not resolve | Error |
| A recipe removes the focus indicator without replacing it | Error (it is detectable in static data) |
| A theme leaves a primitive or state unstyled on a target | Coverage report |
| Text and surface roles whose contrast is below a threshold | Warning (stretch goal; the data is static) |

### Alternatives considered

| Alternative | Why not |
|---|---|
| Leave styling to the community, as React did | The evidence above. A silent core gets render-time insertion hacks and libraries tied to internals |
| Ship a runtime style engine | Coupled to the renderer (Stitches), costly in render, and against fixed point 4 |
| Utility classes as the core | Ties templates to class names, and does not carry to the Desktop |
| Tokens only | A theme could not restyle structure or states, so it is not enough for a component library |

## Experiment

1. **Web spike.** One tokens document, one recipe for `button` (intent and size) and one for `textfield` (invalid state), compiled into a layered stylesheet. Swap the theme and render the gallery with no template change. Verify the server HTML and the hydrated DOM are identical, and record the CSS size.
2. **Desktop spike.** The same two recipes through the extended `appearance` message. Record what the Desktop could not express, as a list.
3. **Outside author.** Someone not on the team writes a theme from the documentation alone. Record every question they had to ask.

## Success

- A theme restyles every primitive in the gallery on the web without a template change.
- The Desktop applies the tokens and the recipes that fit, and the coverage report lists the rest.
- The outside author succeeds without asking about structure or class names.
- The static stylesheet adds no runtime work to render or hydrate.

## Kill

- If the Desktop can express too little for a theme to mean anything, shrink the portable set to what both targets honor, and make the rest explicitly web-only. Do not widen the abstraction to cover the gap.
- If parts cannot be reached without changing the one-primitive-one-node rule, drop parts from the contract and keep states and variants only.
- If the outside author needs DOM knowledge, the contract is leaking structure.

## Breaks (allowed in the free window)

- `class` leaves the portable core. It stays on the web as a marked escape hatch.
- The `theme` attribute on `shell` is replaced by token modes.
- `core.css` and the example stylesheets (`docs-app`, `todo-multi`, the `vlx init` templates) are rewritten as recipes.
- The Desktop gains styling, which changes how existing applications look there.

## Decided

The open questions in the first draft are answered in [decisions](../decisions.md):

| Question | Decision |
|---|---|
| Parts on native elements | `root` only until a realization demonstrates another (S1) |
| Per-instance dynamic values | None; a typed prop the realization applies (S2) |
| Who owns portable style semantics | Valance first, MESH when its tooling must check recipes (S3) |
| Variant ownership | Option C, built from A (S4) |
| Forced colors and high contrast | Conditions from day one; the Desktop reports them unsupported until it can honor them (S5) |
| The scoping claim | Not assumed; the roadmap sentence needs correcting (S6) |

## Still open for stage 3

- The exact portable property names and the token naming scheme.
- Where a project keeps its theme and recipe files, and how `vlx check` reports theme coverage per target.
- How the Desktop's `egui` styling is driven from tokens, and which recipes it cannot express.

## What would change our minds

Evidence that tokens plus the application's own stylesheet are enough for a real component library to be built and themed on both targets would make parts, states and recipes unnecessary. The outside-author experiment is designed to produce that evidence either way.
