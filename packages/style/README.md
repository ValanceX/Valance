# @valancex/style

The style contract of VALANCE (Bet 6; decisions S1 to S8): what a theme may depend on, as data, and what is generated or checked from it. You rarely import this package: `vlx` uses it. A project gets the default theme with nothing written.

## What a theme depends on

Five things, and nothing else (not an element, a class, or the order of wrappers):

| Thing | Meaning |
|---|---|
| **Token** | A named design decision (a color role, a space step, a type role, a radius), in the [Design Tokens](https://www.designtokens.org/) format (2025.10), one document per **mode** (`light`, `dark`, `contrast`) over a base document |
| **Part** | A named region of a primitive. Only `root` exists (S1) |
| **State** | `hovered`, `pressed`, `focus-visible` (every interactive primitive) and the semantic states a primitive's specification declares (`checked`, `invalid`, `disabled`) |
| **Variant** | A closed set a template chooses from: `intent` (`neutral`, `primary`, `danger`) and `size` (`sm`, `md`, `lg`) |
| **Condition** | `viewport` (compact, medium, expanded), `scheme`, `contrast`, `forced-colors`, `reduced-motion`, `target` |

A **recipe** (`recipes/<primitive>.json`) maps a part, a variant, a state and a condition to declarations from a closed set of properties: `background`, `text`, `border`, `radius`, `padding`, `gap`, `min-size`, `type`, `elevation`, `opacity`, `outline`, `align`. A value is a token path (or a keyword, or a number for `opacity`).

## How a project is styled

1. **With nothing written.** The default theme styles the seven primitives of the portable core on the web and on the desktop.
2. **With a theme of its own.** A `theme/` directory with a `theme.json` replaces the default, whole: your token documents and recipes. `vlx theme check` says what is wrong and what each target applies; `vlx check` and `vlx build` refuse a theme with a mistake in it. `intent` and `size` on a `button` choose a variant.
3. **With CSS outside the contract.** The marked way out: a recipe's `escape.web.css` holds CSS for a property outside the contract, for the web only; a project's own stylesheet, in no layer, wins over every layer.

## What is generated

- **Web:** one static stylesheet, the same on the server and in the browser, in cascade layers (`vlx-library`, `vlx-theme`, `vlx-app`, later layers winning). It reaches a primitive only by its hook `[data-vlx="button"]`, a variant's attribute, a state's selector and a media query.
- **Desktop:** the theme resolved (colors as hex, lengths in points, only what the window applies), given to the window once with `appearance`.

## What is checked

The tokens against the Design Tokens Community Group's own schemas and test suite (vendored unchanged in `schema/dtcg-2025.10/` and `test/fixtures/dtcg-2025.10/`) plus a graph pass (`$extends`, aliases, JSON Pointer references, cycles, the type of the target); every recipe against the contract and the primitives' specifications; the contrast of the pairs a theme declares, as WCAG 2.2 defines it; the compiled stylesheet with stylelint; and the default theme in Chromium against its tokens.

Private data in `contract/` and `schema/`; the code is `src/`.
