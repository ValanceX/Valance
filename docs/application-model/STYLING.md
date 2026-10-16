# Styling: the direction, in three tiers

Written 2026-10-16. Decision note for finding WA-1 ([`../findings/2026-10-16-web-authoring-model.md`](../findings/2026-10-16-web-authoring-model.md)). It records what a stylesheet is today, what it is not, and the order in which that changes. Nothing here is built except where it says so.

## Where things stand

- Every `src/**/*.css` outside another target's directory (`src/desktop/`) is loaded by the web, in path order, as one global sheet (`packages/cli/src/emit.ts`). `vlx dev` writes the same sheets into the server-rendered head, so the first paint is styled.
- A component is a template and a stated contract. It has no style of its own; its look is whatever global class names the sheet defines for it.
- The desktop target does not use CSS: "CSS does not carry over" ([`NATIVE-PARITY.md`](./NATIVE-PARITY.md) #7).

## What the ecosystem has said

- MESH may analyze **portable style semantics** (`padding`, `display: flex`); target-specific behavior is explicit (`@target linux { … }` beside `@media (width < 600px) { … }`), "never by pretending every target styles alike". PORT realizes the result (`Mesh/docs/ARCHITECTURE.md`, "Direction").
- PORT: "Do not invent a universal styling abstraction unless the Web implementation demonstrates that one is actually required"; a "cross-platform styling API" is an explicit non-goal until a second target exposes the incompatibility (`Port/docs/ROADMAP.md`, V0.4 and non-goals).

## The three tiers

| Tier | What | When | Where it lives |
|---|---|---|---|
| **1. Web CSS, owned by a component** | A stylesheet named after a component and kept beside it is loaded for the web only and scoped to that component, so a rule cannot leak | **Built** (finding WP-5; `packages/cli/src/styles.ts`; CLI guide, "A component's style") | The web target: `src/web/` in a multi-target project, beside the template in a web-only one. **Not** a field of the portable `component(...)` contract |
| **2. A portable style vocabulary** | A small language of intent (spacing, emphasis, tone) that each target maps to its own toolkit | When a second target's real screens need it and tier 1 cannot say it | MESH/PORT, per the two quotes above. Designed from the Desktop PORT's needs, not from CSS |
| **3. Per-target overrides** | A target-qualified rule for what only one target can say | With tier 2 | The `@target` condition MESH describes; `override` for built-in views today |

Tier 1 is deliberately web-only so that nobody mistakes it for the portable answer. A component written for both targets keeps its portable template; its web look is a separate file the desktop never reads.

## What tier 1 became

- **Pairing is by file name**: `X.css` beside `X.mprx`. No registration, no field on `component(...)`.
- **The scope is a class**: the component's name, written by the template on its root element. Rules are wrapped in `@scope (.name)`; `:scope` is the root. The alternatives (a generated attribute or class prefix) would need the template or the renderer to add a hook the author did not write; this one is visible in both files.
- **Checked**: `style-scope` (the root lacks the class) and `style-global` (a rule for `html`, `body` or `:root`) in `vlx check` and `vlx build`.
- **Not done**: a `mesh-fragment` root has no element, so such a component cannot have a component stylesheet (the check says so); `vlx generate component` does not write a stylesheet; browsers older than `@scope` (Chrome 118, Safari 17.4, Firefox 128) are not served a fallback.

## Open questions for tier 1 (original)

1. **What does a rule scope to?** A component whose template root is an element can be scoped with `@scope (<tag>)` or a generated class. A component whose root is a `mesh-fragment` has no element. Options: refuse scoping and say so in `vlx check`; or scope to the component's tag when the web wraps it.
2. **Naming.** `theme-toggle.css` beside `theme-toggle.mprx` is the least to learn. In a multi-target project it moves to `src/web/` with the web template, which already holds the web's layout.
3. **Tokens.** The scaffold's custom properties (`--bg`, `--fg`, `--accent`) stay global in the one sheet that is not a component's. Scoping applies to component sheets only.
4. **The theme flash** (verifier F22): a stored theme is read after the page takes over. Separate from scoping; decided with the dev-paint work.

## What this does not decide

Whether tier 2 is ever built. It follows evidence from a second target, which today (a Desktop PORT with no styling at all in its to-do example) has not yet asked for it.
