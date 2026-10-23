# Themes: the style contract

A theme is data. It says what a primitive looks like; VALANCE turns it into a static stylesheet for the web and into resolved values for the Desktop. Nothing in the data names a renderer.

## Tier 1: nothing to write

A project with no `theme/` directory gets the default theme: tokens, light and dark, a higher-contrast mode, and recipes for the seven portable-core primitives (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`). The web build writes `theme.css` (about 7.5 KB, 1.4 KB gzipped); the Desktop build writes `theme.desktop.json` and the host sends it once with the first `appearance` message.

## Tier 2: your own theme, and the closed variants

Put a `theme/` directory in the project:

```
theme/theme.json          base token document, modes (light required; dark, contrast optional), recipes, contrast pairs
theme/tokens/*.tokens.json   Design Tokens Community Group 2025.10 documents
theme/recipes/*.json      one recipe per primitive
```

- Tokens are DTCG 2025.10 documents. Modes are laid over `base`; every mode must define the same tokens as `light`.
- A recipe maps the part (`root`), a variant, a state or a condition to declarations from a closed set: `background`, `text`, `border`, `radius`, `padding`, `gap`, `min-size`, `type`, `elevation`, `opacity`, `outline`, `align`.
- Variants are closed sets with defaults: `intent` (`neutral`, `primary`, `danger`) and `size` (`sm`, `md`, `lg`) on `button`. Use them as props: `<button intent="primary">`.
- States are the interaction states (`hovered`, `pressed`, `focus-visible`) and the semantic states a primitive's specification declares (`disabled`, `checked`, `invalid`, ...).
- Conditions: `viewport` (`compact` below 600, `medium` 600 to 839, `expanded` from 840), `scheme`, `contrast`, `forced-colors`, `reduced-motion`, `target`.
- `"recipes": []` in `theme.json` opts out of the library recipes entirely.

`vlx theme check` prints the contrast of every declared pair (WCAG 2.2 ratio), what each target applies and what it ignores, and the diagnostics (with a suggestion for a misspelled name). `--json` for tools. A theme with a failing pair or a recipe that breaks the contract does not build.

## Tier 3: the marked escape hatch

`escape.web.css` in a recipe, or your own CSS in the `vlx-app` layer, reaches the web only. It is outside the contract, is not checked for the Desktop and is reported as such in the coverage table.

## What the layers are

The stylesheet declares `@layer vlx-library, vlx-theme, vlx-app;`. Rules reach a primitive only through its `data-vlx` hook, never through a tag, class or id, so application CSS in `vlx-app` wins without specificity games.

## Hover, press, focus

`hovered` rules are written inside `@media (any-hover: hover)`, so a touch screen's sticky `:hover` never paints them (I15); `pressed` is `:active` and needs no hover. `focus-visible` is `:focus-visible` (after Tab, not after a click). While a modal layer is open the page behind it is locked against scrolling (see [Layers](layers.md)).

## What the Desktop applies

Fill, text color, border, radius, padding, gap, minimum size, type size, the button's `intent` and `size`, its `hovered` and `pressed` states (the pointer over it, and held down; with the properties above), the textfield's invalid state and the viewport class. The window draws its own focus ring, so `focus-visible` is web only. Other declarations are reported as ignored in `vlx theme check`.
