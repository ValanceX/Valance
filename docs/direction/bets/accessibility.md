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

The accessible name and role the **specifications** give for the elements the web table produces (Accessible Name and Description Computation 1.2 with HTML-AAM, computed in the consistency pass with `dom-accessibility-api`; a browser's accessibility tree was read earlier and agreed on every row except the placeholder, where the library omits a step that HTML-AAM 4.1.1 contains):

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

So **an unnamed checkbox, textfield, button or link compiles on both targets and has no accessible name under the specifications.** An `image` must write `alt` (web) or `label` (Desktop) but may write it empty, and an empty `alt` is a decorative image, so the gap there is a missing choice, not a missing prop. The mechanism for the right result (an invalid field described by its error text) exists on the Desktop and works in the browser, but the web vocabulary cannot express it.

One earlier worry turned out to be no concern of ours: a test library's role-and-level lookup disagreed with a browser's tree about the `heading` level. Our output is an `h2` with `aria-level`, which the HTML and ARIA specifications define; how a given tool reads it is that tool's concern.

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
| `role` | A closed set of ARIA role names (or none) that AccessKit also has | What the primitive is to assistive technology. **Authors cannot set it** |
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

`observe` returns `role`, `name`, `description` and the states, besides text and value. **On the web they are computed from the emitted markup by the specifications' own algorithms** (the accessible name and description computation with HTML-AAM, and the ARIA role mappings), not read from a browser. On the Desktop they come from the AccessKit `TreeUpdate` the PORT already produces. The structure snapshots in the gallery then include role and name, so a regression in either is a diff.

### 7. Lists and tables

A windowed `{#each}` ([Bet 10](collections.md)) exposes `total` and `start`. The PORT realizes them as set size and position for the list's items, so a screen reader reports "item 4 of 10,000" for a window of 50. Tables follow the APG table pattern when [Bet 1](primitive-specification.md) lands them on the web.

### 8. Themes and contrast

A theme ([Bet 6](style-contract.md)) declares pairs of tokens that are used together (text on its surface). `vlx theme check` computes the WCAG contrast ratio of each declared pair. It gates the reference themes and advises elsewhere.

### 9. What this does not check

Said once, here, so nobody reads "compiles" as "accessible": reading order, focus order across a page, the quality of a name ("click here"), heading structure, motion, timing, cognitive load, and anything that depends on a run-time value. The checks in this bet verify that our **output conforms to the specifications** (see "Verifying the output" below). How a screen reader, a browser or an operating system then presents it is that software's concern, and no release gate depends on it.

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
6. **A spec-conformance run** of the generated reference-build output through the verifiers in "Verifying the output", with the report committed beside the release tag.

## Success

- No template in the four repositories or the reference library can produce a nameless control, by the compiler.
- The `unnamed-control` check has no false positive on the true examples, and every false negative is a run-time case that the development check catches.
- Both targets pass the generated keyboard vectors for the four patterns in the experiment (button, checkbox, textfield, radiogroup); tabs and disclosure follow when their primitives land.
- `observe` reports the same role and name for the same tree on both targets for all portable-core primitives.
- The verifiers report no error on the reference build's output on either target, and every remaining finding is recorded as a decision.

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

## Answered by research (2026-10-17)

These were the open questions. Sources and measurements are in [decisions](../decisions.md) A11 to A15 and in [prior art](../prior-art.md).

**The version-1 role set (22 names).** Pinned to AccessKit 0.17.1, the version egui 0.31.1 and the Desktop PORT use (the enum has 186 roles in 0.17.1 and 182 in 0.25.1 and differs between them). The mapping from egui is in its `response.rs`: it emits Label, Link, TextInput, Button, Image, CheckBox, RadioButton, RadioGroup, ComboBox, Slider, SpinButton, ProgressIndicator and Window, and **never** Heading, List, ListItem, Paragraph, Table, Status, Alert or Dialog.

| Role | Web | AccessKit `Role` | Desktop provider |
|---|---|---|---|
| none (`column`, `row`) | custom elements with no ARIA role | GenericContainer, or no node | none needed |
| generic (`text`) | `span`, which maps to `generic` | Label | egui (the text is in `value`, not `label`) |
| heading | `h2` with `aria-level` | Heading with a level | **the PORT must set it**: today the Desktop `heading` is drawn as a styled horizontal label, so it exposes Label and drops `level` |
| paragraph | `p` | Paragraph | the PORT |
| list, listitem | `ul`/`ol`, `li` | List, ListItem | the PORT |
| link | `a` | Link | egui |
| img (`image`) | `img`, role `img` | Image | egui |
| button | `button` | Button | egui |
| checkbox | `input` checkbox | CheckBox | egui |
| textfield | `input` | TextInput | egui |
| radiogroup, radio | radiogroup, `input` radio | RadioGroup, RadioButton | the PORT sets the group (it does); egui sets the radio |
| table, row, cell, columnheader, rowheader | same | Table, Row, Cell, ColumnHeader, RowHeader | the PORT (it does) |
| rowgroup (`tablehead`, `tablebody`) | `thead`, `tbody` | RowGroup | the PORT (not set today) |
| status, alert | `role=status`, `role=alert` | Status, Alert with a live setting | the PORT |
| dialog | `dialog` | Dialog (not egui's Window) | the PORT |

No role is needed that AccessKit lacks. Landmarks (`nav`, `main`) are not in version 1: AccessKit has them, but the Desktop vocabulary has no such primitives. `Window`, `Pane` and `TitleBar` are desktop-only and the web does not need them.

**References.** A node is marked `ref="name"` and a relation prop takes a `ref`. A bare reference resolves inside one template instance, checked at compile time. A reference crosses a component boundary only downward, as the value of a declared `ref`-typed prop on a child; a child's inner nodes are never reachable from the parent, and a child cannot export one upward in version 1. **This follows the HTML Standard's ID rule: an ID reference resolves only when "candidate's root is the same as element's root", and an element reference set through the reflection API must be a descendant of a shadow-including ancestor of the element.** So our output must not rely on a reference that crosses a shadow root, and the web PORT emits composed components in the light DOM; that is checkable from the emitted markup. (A browser measurement agreed: id references failed across shadow boundaries in both directions. That agreement is incidental.) MDN: ids "are only valid in the scope in which they are declared". Every precedent passes ids or references down as props (Angular Material generates ids; Svelte's `$props.id()`, "unique to the current component instance" and "consistent between server and client", exists for `aria-labelledby`; React's `useId`) and none reaches into a child's template.

**Live regions.** `status` and `alert` are declarative primitives with fixed roles and no name; their text content is the message. There is no `announce` command in version 1. The ARIA specification defines the values: `role=status` implies a polite, atomic live region and `role=alert` an assertive, atomic one, and a `div` with neither has no live properties. The APG alert pattern says alerts present before page load completes are not announced, so a region must exist **before** its text changes (spec guidance on authoring, which our primitives follow by rendering the region ahead of its text). AccessKit 0.17.1 has `Live` (Off, Polite, Assertive), `LiveAtomic` and `Busy`, so the Desktop `status` and `alert` nodes set them; egui sets none today. A `TreeUpdate` must carry the live setting and the text; what an adapter or screen reader then does with it is theirs. Angular CDK's announcer and React Aria's use hidden regions with a short delay for the reasons of those tools; they are precedent only.

**Name sources.** Keep exactly four values: `content`, `prop`, `either`, `none`. `either` means a non-empty prop or text content, the prop winning, and is used by `button` and `link` only (icon-only controls). `heading` is `content`; `checkbox`, `textfield`, `radiogroup` and `table` are `prop`; `image` is `prop` (alt) or `decorative`. **`title` and `placeholder` do not count as names. That is our contract being stricter than the specification:** HTML-AAM 4.1.1 lists, in order, `aria-labelledby`, `aria-label`, the label, `title`, and then, "if the accessible name is still empty", the `placeholder`. The ARIA specification (via `aria-query`'s role data, which matched exactly) lists name-from-contents for button, link, checkbox, radio and heading, author-only for textbox, radiogroup, status, alert, dialog and table, and prohibits naming on `generic` and `paragraph`. The two vocabularies disagree today: the Desktop `button` has an optional `label` prop and takes its text from content, while the web `button` has no `label` prop; the Desktop also has a `label` component that names the one control inside it, which the web has no equivalent of. That wrapper is a composition feature, not a `name.from` value.

**Verifying the output (a proposal, run in the consistency pass on real output).** Under the project's tenth fixed point the gate is conformance to the specifications, by verifiers that are runnable offline:

| Output | Specification | Verifier | Result on a sample |
|---|---|---|---|
| Web HTML and ARIA | HTML Standard content model, ARIA in HTML | the Nu HTML Checker (`vnu-jar`, needs Java) | 0 errors on the 7-primitive sample; 11 of 11 deliberate faults caught; **it does not check names** |
| Web names | Accessible Name and Description Computation 1.2, HTML-AAM | `dom-accessibility-api` (checked against the W3C web-platform-tests accname cases) plus a name-presence rule from the spec's name-source table | unnamed checkbox, button and link flagged; the library omits the placeholder step, so our stricter rule is ours to state |
| Web roles | HTML-AAM, ARIA | `aria-query` `elementRoles` and `roles`, and the web-platform-tests `html-aam` cases | 20 of 21 declared mappings match; the 21st was the check's own error |
| Web rules from WCAG | WCAG, ARIA | `axe-core` (third-party, but its rules encode the specifications) | 3 genuine violations on the sample; passes a placeholder-only field |
| CSS | CSS specifications | `stylelint` core rules (`css-tree` only for parsing) | 6 of 6 injected errors caught; `var()` values cannot be validated statically |
| Tokens | Design Tokens 2025.10 | the official JSON Schema and test suite in `design-tokens/community-group`, with Ajv | 190 of 220 fixtures agree; 30 are graph-level (circular `$extends` and references) and need a second pass; Style Dictionary does not validate |
| Desktop tree | the AccessKit `TreeUpdate` documentation | `accesskit_consumer` (panics on structural errors) and an invariant checker of our own (ids, parents, role rules) | on a real egui update it reported exactly the unnamed checkbox |

Two findings from the run belong in the specification: **a `list`'s children must be `item`** (the HTML content model rejects a custom element as a child of `ul`), and **`text` and `image` are not ARIA roles** (the web realizations are `generic` and `img`; `column` and `row` have no role). The report is regenerated per release candidate, committed with the tag, and signed by an accessibility maintainer (a named role) who can block the release. Screen-reader runs by individuals are welcome as dated community notes and gate nothing. In the accessibility practice of other projects, spec-based checks are the part that is gated: Carbon runs automated checks on every change and keeps the report per release, and no project publishes a per-release, named screen-reader report as a hard gate.

## Open questions for stage 3

- **Landmarks and `rowgroup`** in version 1 or later.
- **Heading on the Desktop**: a test that the PORT exposes Heading with a level (needs code).
- **The MESH parser** for `ref`, and whether a child may ever export a reference upward.
- **Whether an imperative `announce` is ever needed** beyond the declarative `status` and `alert`.
- **The graph-level pass for tokens** (circular `$extends` and references) and the name-presence rule's home (a check in `vlx`).
- **Who the accessibility maintainer is** (a named role; a people decision for the maintainer).
- **Focus** movement after an update, which [Bet 9](interaction-state.md) takes up.
