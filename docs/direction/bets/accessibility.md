# Bet 7: Accessibility as types

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. Resumed on the maintainer's direction after being deferred. The gaps under "Why" were measured on 2026-10-17 on the checkouts and in Chromium, and re-checked in the consistency pass. The decisions are in [decisions](../decisions.md) (A1 to A10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 1](primitive-specification.md) (the specification carries role, name rule and keyboard table). [Bet 4](variant-types.md) (a new `ref` kind). [Bet 2](conformance-kit.md) (`observe` gains roles and names) |

## Question

Can the primitive specification make a control with no accessible name a compile error, bind every role to the keyboard behavior it promises, and let the same facts be checked on the web and on the Desktop?

## Why, and who is hurt

### What the two targets do today (measured)

Both targets map accessibility per primitive, by hand, with no shared model.

| Fact | Web | Desktop |
|---|---|---|
| How a name is supplied | `label` becomes `aria-label` | `label` goes to AccessKit's label |
| Is the name required? | **No.** `checkbox` and `textfield` list `label` as optional | **No.** `required: false` in `vocabulary.json` |
| `invalid` and `describedby` | **Not in the vocabulary** | Present on `checkbox`, `textfield` and `radiogroup`; tested on `textfield` and `checkbox` |
| Radio group, table | Not in the vocabulary | Present |
| Roles | Implied by the element (`input`, `button`, `h2`) | Mostly egui's own per-widget roles; `view.rs` sets them itself only for `radiogroup` and the table family |
| Keyboard | The browser's own | egui's. `keyboard.rs` tests only text-field submit and cancel and back/forward navigation |

Chromium's accessibility tree for the elements the web table produces (read through the browser's debugging protocol, not a test library's own computation):

| Element | Role and name exposed |
|---|---|
| `checkbox` with `label` | `checkbox "Done"` |
| `checkbox` without `label` (compiles today) | `checkbox ""` |
| `textfield` with only `placeholder` | `textbox "Your name"` (the placeholder is used as a name) |
| `textfield` with nothing | `textbox ""` |
| `button` with no text (an icon only) | `button ""` |
| `link` with no text | `link ""` |
| `image` with no `alt` | `image ""` |
| `image` with `alt=""` | not exposed (decorative, correctly) |
| Field with `aria-invalid` and `aria-describedby` | `textbox "Name"`, description "Enter your name" |

So **an unnamed checkbox, textfield, button or link compiles on both targets and reaches a screen reader as an unlabeled control.** An `image` must write `alt` (web) or `label` (Desktop) but may write it empty, and an empty `alt` is a decorative image, so the gap there is a missing choice, not a missing prop. The mechanism for the right result (an invalid field described by its error text) exists on the Desktop and works in the browser, but the web vocabulary cannot express it.

One thing I checked and found *not* to be a bug: Playwright's role-and-level lookup reported the `heading` primitive's `level` as ignored on a native `h2`, but the browser's own tree gives the `aria-level` value. The library's computation differs from the browser's; the browser is the authority.

### Why this is more than a lint

- A name is a fact about a component's contract, not about one file. A library's `labeled-field` ([Bet 12](reference-library.md)) is right or wrong for everyone who uses it, so the check has to follow the contract.
- Without a role-to-keyboard binding, a new primitive (tabs, a radio group) can be drawn with the right role and the wrong keys. The authoring guide says so plainly: "A role is a promise" that the author also provides the keyboard behavior.
- The Desktop draws its own pixels, so every semantic must be supplied. The same is true of the web the day a PORT draws to a canvas.

### Who is hurt

- **People using assistive technology**: a screen is silent or wrong where a name is missing.
- **Library authors**: nothing tells them a component can produce an unnamed control.
- **PORT authors**: no table says which keys a role must handle.
- **The reference-library gate**: it cannot say "accessible" in any checkable way.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** from general knowledge, not read in this session; **Repo** this ecosystem's own record; **M** measured in this session. See [prior art](../prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| WAI-ARIA Authoring Practices (**P**, [read-me-first](https://raw.githubusercontent.com/w3c/aria-practices/main/content/practices/read-me-first/read-me-first-practice.html)) | "No ARIA is better than Bad ARIA." "A role is a promise" that the author provides the keyboard behavior. "ARIA roles do not cause browsers to provide keyboard behaviors or styling" | Authors never write roles. The primitive owns the role and its keys |
| APG patterns (**P**, [radio group](https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/radio/radio-group-pattern.html), [tabs](https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/tabs/tabs-pattern.html), [disclosure](https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/disclosure/disclosure-pattern.html)) | Each pattern lists keys, roles and states and how the name is supplied. Radio: arrow keys move and check, wrapping; the checked button takes focus on entry. Tabs: Left and Right move, Home and End optional, `aria-selected`, `aria-controls`, the panel named by its tab. Disclosure: Enter and Space toggle, `aria-expanded` | The keyboard table can be data. The three patterns are the first three tables |
| Svelte compiler (**P**, [warnings list](https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/98-reference/.generated/compile-warnings.md)) | 42 `a11y_*` compile warnings (suppressed per block with a `svelte-ignore` comment, per the Svelte syntax docs), including `a11y_missing_attribute` (`<img>` alt and others), `a11y_consider_explicit_label` ("Buttons and links should either contain text or have an `aria-label`, `aria-labelledby` or `title` attribute"), `a11y_label_has_associated_control`, `a11y_click_events_have_key_events`. Severity: warnings | A framework has checked names in templates for years. Ours can go further because the manifest says which props are names, so it is not a list of tag rules |
| eslint-plugin-jsx-a11y (**P**, [README](https://raw.githubusercontent.com/jsx-eslint/eslint-plugin-jsx-a11y/main/README.md)) | 39 listed (36 not deprecated), `recommended` and `strict` presets. "Because it only catches errors in static code, use it in combination with @axe-core/react"; "always test your apps with assistive technology" | Static checks have a ceiling. Say what ours cannot check |
| AccessKit (**P**, [README](https://raw.githubusercontent.com/AccessKit/accesskit/main/README.md)) | A toolkit supplies a tree: each node has an integer ID, a role and optional attributes; adapters for Windows, macOS, Linux, Android and iOS; web "Planned". No stage label; adapters "don't yet support all types of UI elements or all of the properties in the schema" | The Desktop already feeds it. The role set we specify must stay inside what it supports |
| Flutter on the web (**S**) | Semantics are off by default because of "noticeable performance costs" | Keep semantics always on and budget the cost ([Bet 3](budgets.md)) |
| React `useId` (**P**, listed in [prior art](../prior-art.md)) | A counter cannot give stable ids under streaming | Do not make authors write ids to relate nodes |

## Constraints

- **Fixed points 4 and 5, and [Bet 1](primitive-specification.md).** Meaning belongs to the specification and realization to the PORT: roles, name rules and keys live in the primitive specification, and neither PORT keeps its own.
- **The render tree carries no accessibility today** ("Accessibility semantics … (render-v1 carries none)"). The PORT derives them from the component name and its props. That stays true: the tree gets no `role` field.
- **Fail closed** for what can be decided statically with no false positives; **advise** for the rest. Advice is not a build warning by default.
- **Fixed point 9 and the build-mode rule.** Checks that need run-time values run in development builds only.

## Design

### 1. The specification carries the facts

Each primitive declares, in the [Bet 1](primitive-specification.md) schema:

```json
"checkbox": {
  "role": "checkbox",
  "name": { "from": "prop", "prop": "label" },
  "keyboard": [{ "key": "Space", "raises": "change" }],
  "states": { "checked": "checked", "invalid": "invalid", "disabled": "disabled" },
  "relations": { "describedby": "ref" }
}
```

| Field | Values | Meaning |
|---|---|---|
| `role` | A closed set, the intersection of what the web and AccessKit support | What the primitive is to assistive technology. **Authors cannot set it** |
| `name.from` | `content`, `prop`, `either`, `none` | `content`: the name is the text inside (a button). `prop`: a required prop (a checkbox's `label`). `either`: a prop or text content. `none`: the primitive is not named (layout, text) |
| `keyboard` | Rows of `{ key, raises \| moves }` | The keys the role promises. A PORT must realize each row |
| `states` | A map from state to prop | Which props are exposed as states |
| `relations` | Props of the new kind `ref` | `describedby`, `labelledby` |

### 2. The compiler decides names

MESH's component manifest gains the `name` field. A template is an **error** (`unnamed-control`) when a use of a primitive whose `name.from` is `prop` omits the prop, or whose `name.from` is `content` has no text-bearing child: a text run, an interpolation, or a child component whose own name rule is met. It is a compile-time error with a span, like an unknown prop, and `label` stops being optional on `checkbox` and `textfield` in both targets.

A name that is present but empty at run time (`label={name}` where `name` is `""`) cannot be known by the compiler. In development builds the runtime reports it as a diagnostic naming the node; a production build carries no such check.

`image` takes `alt`, or `decorative` (a boolean literal), but not neither. `alt=""` is not the way to say decorative; it is `decorative`.

### 3. Names follow component contracts

A composite component ([Bet 12](reference-library.md)) declares which of its props supply its name, in its `component()` contract, with the same `name` field. A use of `labeled-field` is checked as a use of a named control. The check follows the declaration, not the template body, so a library need not be compiled by its consumer for the rule to apply. A composite whose body does not satisfy its own declaration is an error in the library's own build.

### 4. Relations are references, not ids

An author never writes an `id` to relate two nodes. A node can be marked `ref="error"` (sketch syntax) and a relation prop takes `ref`, resolved to a node in the same template instance **at compile time**. A reference to nothing is `unknown-ref`. The PORT turns a reference into a key-derived id on the web and a node id for AccessKit. This avoids the duplicate and unstable ids a counter or a fixed string gives inside lists and composites. `describedby` and `invalid` join the web vocabulary at the same time, so the two targets match.

### 5. Keyboard contracts are tables

`keyboard` tables for `button`, `checkbox`, `textfield`, `radiogroup`, `tabs` and the disclosure pattern are written from the APG pages above. The conformance kit ([Bet 2](conformance-kit.md)) generates from each row: send the key through the adapter's `interact`, expect the stated event or focus move. A PORT that draws a role without the keys fails the kit.

### 6. Observation gains roles, names and descriptions

`observe` returns `role`, `name`, `description` and the states, besides text and value. On the web the observation comes from the browser's accessibility tree through its debugging protocol (not from the element's attributes). On the Desktop it comes from the AccessKit update the PORT already produces. The structure snapshots in the gallery then include role and name, so a regression in either is a diff.

### 7. Lists and tables

A windowed `{#each}` ([Bet 10](collections.md)) exposes `total` and `start`. The PORT realizes them as set size and position for the list's items, so a screen reader reports "item 4 of 10,000" for a window of 50. Tables follow the APG table pattern when [Bet 1](primitive-specification.md) lands them on the web.

### 8. Themes and contrast

A theme ([Bet 6](style-contract.md)) declares pairs of tokens that are used together (text on its surface). `vlx theme check` computes the WCAG contrast ratio of each declared pair. It gates the reference themes and advises elsewhere.

### 9. What this does not check

Said once, here, so nobody reads "compiles" as "accessible": reading order, focus order across a page, the quality of a name ("click here"), heading structure, motion, timing, cognitive load, and anything that depends on a run-time value. These need people and assistive technology. The Reference Gate adds one run of a screen reader on the web and one on the Desktop per release candidate, recorded as a short written report.

### Alternatives considered

| Option | Why not |
|---|---|
| Let authors write `role` and `aria-*` | "No ARIA is better than Bad ARIA". Every author becomes responsible for keys and states, and a PORT that is not the web cannot interpret ARIA |
| Warnings, as Svelte's list does | A warning is skipped. For the one rule that has no false positives (a control has no name source), an error is the point |
| Lint rules by tag, as jsx-a11y does | Cannot follow a component's contract through a library |
| Put roles in the render tree | Adds a field every PORT must handle; the component name already determines the role |
| Wait for a third PORT before choosing the role set | The intersection of the web and AccessKit is enough to start, and the third target (terminal) is the test of it |

## Experiment

1. **Specification fields** for the seven portable-core primitives plus `link`, `image` and `radiogroup`, checked against both vocabularies. The diff lists exactly what changes.
2. **`unnamed-control`** in MESH, run over every template in the four repositories and the reference library. Count the true and false positives.
3. **Keyboard vectors** generated for button, checkbox, textfield and radiogroup. Run on the web (a real browser) and the Desktop (egui's test harness).
4. **`observe` with roles** on both targets and the identical-structure snapshot test across them.
5. **Cost.** AccessKit updates for a 1,000-node tree on the Desktop, and the browser's tree size on the web, as [Bet 3](budgets.md) metrics.
6. **An outside review.** Two people who use a screen reader daily run the reference build and write down what is wrong. This is not optional for the Reference Gate.

## Success

- No template in the four repositories or the reference library can produce a nameless control, by the compiler.
- The `unnamed-control` check has no false positive on the true examples, and every false negative is a run-time case that the development check catches.
- Both targets pass the generated keyboard vectors for the four patterns in the experiment (button, checkbox, textfield, radiogroup); tabs and disclosure follow when their primitives land.
- `observe` reports the same role and name for the same tree on both targets for all portable-core primitives.
- The screen-reader runs find no blocker in the reference build.

## Kill

- If the closed role set cannot be the intersection of what the targets support without dropping a role the reference library needs, add the role to the specification with a realization on each target before adding it to the set; never let one target define it alone.
- If `unnamed-control` has false positives in real templates, narrow it to props only (`name.from: prop`) and move content checks to the development runtime.
- If AccessKit's gaps (rich text, hypertext) block a pattern, mark the pattern as web-only in the specification, with the reason, until AccessKit supports it.
- If the `ref` kind makes templates awkward, fall back to a `describedby` that takes the key path of a child, scoped to the component.

## Breaks (allowed in the free window)

- `label` is required on `checkbox`, `textfield` and anything with `name.from: prop`; existing templates that omit it stop compiling.
- The web vocabulary gains `invalid`, `describedby`, `radiogroup` and `radio` (the Desktop's `radiogroup` has no value or events of its own; its `radio` children carry them).
- MESH gains a `ref` kind and two diagnostic codes (`unnamed-control`, `unknown-ref`).
- `placeholder` stops counting as a name in documentation; the web PORT does not rely on it.

## Open questions for stage 3

- **The exact role set** and its mapping to AccessKit roles.
- **`ref` syntax** and whether a relation may reach a node in a child component.
- **Live regions** (announcements) as a primitive or a command.
- **Focus** movement after an update, which [Bet 9](interaction-state.md) takes up.
- **Whether `either`** (a prop or text) should exist or be split.
- **The screen readers** the gate names, and who owns the report.
