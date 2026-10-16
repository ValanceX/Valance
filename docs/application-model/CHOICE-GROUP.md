# A portable choice group: choose one of a few (WP-23, RF-4)

Written 2026-10-16, before the implementation. Finding RF-4, now met twice: the sign-up form's plan (two options) and the orders screen's status (three) were both written as buttons with `aria-pressed`. They work and look right, but a set of pressed buttons is not a **radio group**: assistive technology reads N independent toggles, not "one of N, 2 of 3 selected", and the keyboard has no group (each button is a Tab stop; the arrow keys do nothing). DP2 asked for a second case; there are two. DP1 asks that the portable core name the intent and each target spell it.

## What other toolkits agree on

HTML has `<input type="radio">` sharing a `name`, grouped by an element with `role="radiogroup"` (or `<fieldset>`/`<legend>`); the browser gives one Tab stop per group and the arrow keys move and select. ARIA's radio group pattern says the same. React Aria, Radix and Material each ship a *group* part and an *option* part, controlled by the group's value. egui has `radio_value` for one option; AccessKit has `RadioGroup` and `RadioButton` roles. So: two parts, a group and an option, the selection owned by the application.

## Decisions

- **CG-1 Two portable primitives, `radiogroup` and `radio`.** The group is a container with an accessible name; an option is a single radio. They are in the portable core (`vocabulary.json` of the Desktop PORT and the web's table), beside `checkbox` and `textfield`.
- **CG-2 `radio` props.** `checked` (boolean, required: whether this option is the selected one, controlled like `checkbox`), `value` (string, required: what selecting it reports), `label` (string, optional: the accessible name, like `checkbox`), `disabled` (optional). Web-only optional hooks: `name` (the group's name, so the browser gives the group its arrow keys and one Tab stop; the author writes the same `name` on the options of a group) and `class`.
- **CG-3 `radio` raises `select`** with the option's `value` (a string), when the person selects it. Selecting the option already selected raises nothing. The application answers by setting its own state; what is shown is always the state (`checked` is controlled), so a declined selection snaps back.
- **CG-4 `radiogroup` props.** `label` (the group's accessible name, required in practice), `invalid` and `describedby` (as on the other controls); web-only `class`. It has no events: the options raise them.
- **CG-5 The options are written with what MPRX already has.** `{#each options as o}<radio … checked={choice == o.value} value={o.value} />{/each}`, or three `radio` tags written out. No new language feature (DP9); a choice's options are the application's data like anything else.
- **CG-6 Web realization.** `radiogroup` is `div role="radiogroup"` with `aria-label`, `aria-invalid`, `aria-describedby`; `radio` is `<input type="radio">` with `checked` as the controlled boolean (a content attribute and a property, as the checkbox's), `value`, `name`, `aria-label`. The browser's own behavior supplies the single Tab stop and the arrow keys; the framework adds none.
- **CG-7 Desktop realization (the Desktop PORT, a separate repository and release).** `radiogroup` draws its options in a group named by `label`; `radio` is egui's radio widget (a click or Space selects); accessibility roles `RadioGroup`/`RadioButton` with the selected state. Arrow-key movement inside a group is **not promised** on the desktop in the first version (Tab reaches each option); it is recorded as a difference, as `blur` on Enter was (D-2 of FORM-PRIMITIVES.md).
- **CG-8 What it is not.** Not a `select`/drop-down (a long list needs a popup and a type-ahead; a case will say), not a checkbox group (several selected is a list of checkboxes today), not a styling decision (a row of pills is CSS on the radios; the semantics stay a radio group).
- **CG-9 Existing applications.** `pressed` buttons remain valid; `forms-app` and `orders-app` change their choosers to this, as the check of the design.

## Acceptance

| Test | Statement |
|---|---|
| Web table: the elements and attributes in the built HTML; `getByRole("radiogroup")` and `getByRole("radio", { checked })` find them; `checked` is server-rendered and live | CG-1, CG-2, CG-4, CG-6 |
| Chromium: one Tab stop for the group; ArrowDown/ArrowRight selects the next option and the application's state follows; a selection the application declines snaps back | CG-3, CG-6 |
| `select` carries the value; re-selecting the selected option raises nothing | CG-3 |
| `forms-app` and `orders-app` use it and their tests pass, with the plan and status asserted as radios | CG-9 |
| Desktop: the Port's vocabulary and content name the same props and event; a click selects; the accessibility tree has the group and the radios (in the Port repository) | CG-7 |
| A neutral target refuses the web-only hooks (`name`, `class`) as it does the others | CG-2 |

## Implementation status (the web half), 2026-10-16

| Statement | Status | Evidence |
|---|---|---|
| CG-1, CG-2, CG-4 primitives and props | Matches on the web | `common/src/primitives.ts`, `vocabulary.ts`; `cli/test/choice-group.test.ts` (role, name, value, checked, disabled, aria-label, aria-invalid, aria-describedby in the built HTML) |
| CG-3 `select` | Matches | `forms-app` and `orders-app` tests: selecting by role (`getByRole("radio").check()`), and the value reaches the command |
| CG-5 options with what MPRX has | Matches | the apps write the options out; `{#each}` works the same way |
| CG-6 web realization | Matches | Chromium: one Tab stop for the group, the arrow key chooses the next option and the state follows (`forms-app` "the plan is a radio group") |
| CG-9 the apps use it | Matches | both reference applications now use radios; 13 and 6 tests |
| CG-7 desktop | Matches in the Port repository (unreleased): `radiogroup` and `radio` in `vocabulary.json`, drawn with egui's radio widget; `select` reports the value and nothing for the selected or a disabled option; the accessibility tree has `RadioGroup` and `RadioButton` with name and state (`tests/choice.rs`). **Arrow keys inside a group are not provided** (Tab reaches each option). Checked against the web table by `cli/test/choice-group.test.ts` when a Port checkout is beside this repository (or `PORT_REPO`) | Port `tests/choice.rs`, `tests/vocabulary.rs` |

**Differences found while implementing**
- **The visible label.** `label` on a radio (as on `checkbox`) is the **accessible name**, drawn nowhere by the web table; there is no `label` element in the table, so a visible caption cannot be tied to the control by `for`. The reference applications draw the name with CSS (`appearance: none` and `::after { content: attr(aria-label) }`), which Chromium, Firefox and Safari support on radios. This is a real gap shared with `checkbox` (its tests find it by `aria-label`), recorded as WA-14: a `label` primitive (a text that names a control and activates it) is the proper answer, and on the desktop the radio's `label` is drawn by the widget itself, so the two targets differ here until it exists.
- A selection the application declines (state not changed) does not re-render, so the browser's own checked radio stays; the same is true of the checkbox today. **Not tested**, and not promised by this note's CG-3 wording ("snaps back" holds when the application changes some state; a no-op leaves the DOM as the person left it).
