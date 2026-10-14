# The native vocabulary: what a screen is made of, for someone new to native apps

Written 2026-10-14. The question: **what should a template be allowed to say when the target is a native window, so that a developer who has never written a native app can pick it up?** It is judged by the ecosystem's own measure: the [API design principles](https://github.com/ValanceX/Mesh/blob/main/docs/standards/api-design-principles.md) (fewest concepts for the task, names people already know, one mental model, progressive disclosure) and the severity and layer scale of the [cognitive-load log](../../examples/tracer-web/src/docs-benchmark/COGNITIVE_LOAD.md) (0 natural, 1 minor friction, 2 framework knowledge, 3 abstraction failure; App, FW or Eng).

**Evidence** is marked: **run** (a test or run on this machine), **read** (read from the code), **general** (knowledge of other toolkits, from memory and not looked up: check before quoting). The vocabulary this note recommends is built: it is the Desktop PORT's own ([`valancex-port-desktop`](https://github.com/ValanceX/Port/tree/main/packages/port-desktop), [its architecture note](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-10-14-port-desktop.md)), and [`examples/todo`](../../examples/todo/README.md) is written against it.

## The criteria, from the principles

| # | Criterion | Principle | What it asks of a vocabulary |
|---|---|---|---|
| C1 | Few concepts | §1.1, §2 | A first application needs as few components as possible, and no setting before the first screen works |
| C2 | Names people already know | §3.2 "prefer established domain terminology over invented terminology" | A name that most toolkits already use for the thing |
| C3 | Name behavior, not implementation | §3.5 | `button`, not `div role=button`; no names that describe how it is drawn |
| C4 | One mental model | §2.2 | One way to lay things out; the same concept has the same name everywhere it appears |
| C5 | Progressive disclosure | §2.1 | Basic, advanced, deep control, in that order, and advanced never makes basic harder to find |
| C6 | Required and optional | §4.3 | What a component must be told is small; the rest has a default |
| C7 | Secure and accessible by default | §10 | Text is text; an unlabeled control is not the easy path |
| C8 | Discoverable and documented in layers | §12, §13 | One table to find everything; Learn, Use, Understand; examples that run |

## What a newcomer already knows

The same ten things in the toolkits a developer is likely to have met (**general**; the names are from memory):

| Thing | SwiftUI | Compose | Flutter | WPF | GTK 4 | Qt | React Native | HTML | Valance Desktop |
|---|---|---|---|---|---|---|---|---|---|
| the top of a screen | Window | Window | Scaffold | Window | Window | Window | (App) | body | `window` |
| children stacked down | VStack | Column | Column | StackPanel | Box | VBoxLayout / Column | View | div | `column` |
| children side by side | HStack | Row | Row | StackPanel (horizontal) | Box (horizontal) | HBoxLayout / Row | View (row) | div | `row` |
| text | Text | Text | Text | TextBlock | Label | Label / Text | Text | p, span | `text` |
| a title for what follows | Text (a style) | Text (a style) | Text (a style) | TextBlock (a style) | Label (a style) | Label (a style) | Text (a style) | h1 | `heading` |
| a button | Button | Button | ElevatedButton | Button | Button | Button | Button / Pressable | button | `button` |
| a box to tick | Toggle | Checkbox | Checkbox | CheckBox | CheckButton | CheckBox | Switch | input | `checkbox` |
| a line of text to edit | TextField | TextField | TextField | TextBox | Entry | LineEdit / TextField | TextInput | input | `textfield` |
| what a person does to a button | action | onClick | onPressed | Click | clicked | clicked | onPress | click | `press` |

Read down the first column and the agreement is wide: where toolkits name a thing at all they name it alike, which is what C2 asks a vocabulary to exploit. Where they disagree is mostly the layout container (a stack with a direction, or two names) and the event (click, press, action).

## Candidates

| | Idea | C1 few | C2 known | C3 behavior | C4 one model | C5 layers | Verdict |
|---|---|---|---|---|---|---|---|
| **A** | Reuse the web's tag table (26 tags: `shell`, `div`, `nav`, `para`, `h1`, `list`, `link`…) | no: 26 | partly (HTML's) | no (`div`, `span`, `shell`) | no: web hooks (`class`, `theme`, `tabindex`, `id`, `label`, `current`, `pressed`, `loading`) | no | **Rejected.** A second vocabulary built without those eight props rejects the scaffolded project at 33 places (**run**, `packages/cli/test/second-target.test.ts`) |
| **B** | A small vocabulary of intent, owned by each PORT as data | yes: 8 | yes (table above) | yes | yes: one layout model, one event per intent | yes (below) | **Recommended; built** |
| **C** | Pass the toolkit's widgets through (egui's, Qt's) | no: hundreds | only to that toolkit's users | partly | no: a different model per target | no | **Rejected.** It is "Valance API to platform API", the wrong mental model (PORT architecture) |
| **D** | One semantic core shared by every PORT, as code | yes | yes | yes | yes | yes | **Rejected for now.** PORT's rule is to generalize from evidence, and two PORTs share a contract and no code. The *names* are shared by convention instead (decision D1) |

## Evidence

### One. The application was written against B (**run**)

`examples/todo` has eight components and five screens, all in 5 template files. It runs on a text target, in a DOM, and in a native window, from the same compiled screens. The Desktop PORT's [contract tests](https://github.com/ValanceX/Port/blob/main/packages/port-desktop/tests/contract.rs) run on trees MESH produced from it.

### Two. The same vocabulary on the web (**run**, `examples/todo/test/web-realization.test.ts`)

A table of **eight entries** realizes the whole vocabulary with PORT Web's own mechanism, and the application then runs in a DOM: typing, pressing, the unsaved-edit guard. So a vocabulary of intent is not native-only; the same templates can serve both targets, which is what C4 wants. What the experiment could not do, and what it needs:

| Could not | Why | What it needs |
|---|---|---|
| a real checkbox | the table cannot give an element a fixed attribute (`type="checkbox"`), so `checkbox` realizes as a text box | PORT Web needs element constants: a small addition |
| a column and a row | they are `div`s with no layout; CSS does that on the web | a stylesheet shipped with the vocabulary's web realization |
| the window's title | `title` has no home on a page; it was put in `aria-label` | the web realization would set the document title |

### Three. The web's table on native (**read**, **run**)

26 tags, eight of whose props (`class`, `theme`, `id`, `tabindex`, `label`, `current`, `pressed`, `loading`) are web hooks. The scaffolded project's pages render with no DOM and navigate with their own `go` command (**run**), but their links carry an address and no event, and every tag is a web name (`shell`, `nav`, `para`). It cannot be the vocabulary of a native app without a second vocabulary beside it.

### Four. Building the application, scored on the cognitive-load scale (my own experience of this build, **not** a user study)

| # | What a newcomer has to do | What it took | Layer | Sev | What was done |
|---|---|---|---|---|---|
| 1 | Say which components exist | a 60-line manifest object, written by hand: every prop, event and type | FW/Eng (MESH) | **2** | **Fixed**: the PORT ships its components as data (`vocabulary.json`, a MESH manifest); the application only adds its screens |
| 2 | Name the text box | I wrote `field`; every toolkit above says `TextField`, and Valance's own `Web.textField` is the same word | FW | 1 | **Fixed**: `textfield` (C2, C4) |
| 3 | Give a button an address to go to | a template cannot build a string, so each row's scope carries its own `href` | FW | 1 | Open (#5 in the [parity matrix](./NATIVE-PARITY.md)) |
| 4 | Change state from an event | two ways to define a command (`Valance.command` with `entry`, or `Nexus.Command.define`), and the key names that connect them | FW/Eng | **2** | Open; the to-do app used the second, which exposes Effect |
| 5 | Start the application on a window | I wrote `serve` (stdin, stdout, Scope, `Effect.async`) | FW | **3** | Open: needs a `Native.run`, the way `Web.run` is for a page |
| 6 | Package it | I wrote a bundler step, a blob step and a download | tooling | **3** | Open: a `vlx` target |
| 7 | Type into a field | a keystroke was lost when the engine answered late | PORT | **3** for a PORT author, 0 for an app author | **Fixed** in the PORT (`Field`) |
| 8 | Know which components do what | one table, one page of docs | | 0 | the [Learn page](../learn/desktop-application.md) and the [reference](../use/desktop-vocabulary.md) |

Three of the Sev 3 or 2 rows are not the vocabulary: they are the host (#5), the packaging (#6) and the command authoring (#4). **The vocabulary is the part that is now at Sev 0 to 1; the work that would stop a newcomer is around it.**

## Decisions

| # | Decision | Chosen | Alternatives | Why | Status |
|---|---|---|---|---|---|
| D1 | One vocabulary for all targets, or one per PORT | **One per PORT, as data, with names kept aligned by convention** (a component both have has the same name, props and events) | a shared core as code (candidate D) | Two PORTs now share a contract and no code; a template that stays inside the shared names can serve both (evidence two). The rule to keep: a new component starts in one PORT, and moves to a shared name only when a second PORT realizes it | Decided in code |
| D2 | The names | `window`, `column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield` | `VStack`/`HStack`; `label`, `input` | C2, from the table; `column` and `row` are two words in three toolkits and say direction without a property | Decided in code |
| D3 | The events | `press`, `toggle`, `change` | `click`, `tap`, `input` | They say what a person does and not the device: a mouse, a finger, a key and a voice command can all press. `click` is the web's and a phone has none | **Open for you.** The cost: the web's `button` event is `click` today, so a shared template needs the web realization to map `press` to it (it can: evidence two) |
| D4 | The root of a screen | `window` | `screen`, `page` | Desktop developers expect a window; a title belongs to it. On a device with no windows the same component is the screen | **Open for you** (mobile) |
| D5 | Layout | `column` and `row` only; spacing and alignment are the PORT's defaults | flex properties, grid, absolute position | C4 and C5: one model for the first hour. Advanced use adds enumerated props (`gap`, `align`) later, never free-form CSS-like values | Decided for tier 1 |
| D6 | Styling | none in tier 1; tier 2 adds an `intent` (`primary`, `danger`) and the OS theme | style props, a theme file | A native screen with no styling looks like the platform's own, which is correct for a first app | Proposal |
| D7 | Accessibility | roles come from the names (`heading`, `button`, `checkbox`, `textfield` are already semantic); tier 2 makes a `label` **required** on a control with no text | optional `label` | C7: the unlabeled path must not be the easy one | Proposal |
| D8 | Escape hatch | an extra, clearly marked component in the PORT's own vocabulary, never a toolkit widget passed through | a `native` pass-through | PORT's architecture: escape hatches exist and are marked as leaving the portable layer | Proposal |

## Tiers

| Tier | Components and props | Built | Justified by |
|---|---|---|---|
| **1: first hour** | `window` (`title`), `column`, `row`, `heading`, `text`, `button` (`disabled`, `press`), `checkbox` (`checked`, `toggle`), `textfield` (`value`, `placeholder`, `change`) | yes | the to-do app |
| **2: next** | `image` (`src`, required `label`), `link` (`href`; a link is an address, [parity](./NATIVE-PARITY.md) #15), `divider`, a `submit` event on `textfield`, `intent` on `button` and `text`, `gap` and `align` on `column` and `row` | no | parity matrix #7, #10, #11, #13, #15 |
| **3: deep** | a list with many rows (virtualized), tables, menus, dialogs, drag and drop | no | not planned; D8 |

## How the documentation reflects this

The principles ask for three layers (§13.1) and examples that run (§13.2):

| Layer | Where | What it is |
|---|---|---|
| **Learn** | [Your first desktop application](../learn/desktop-application.md) | the to-do app in six steps, from a window with a heading to a guarded edit, in the vocabulary and nothing else; every code block is checked against the real file by a test |
| **Use** | [The desktop vocabulary](../use/desktop-vocabulary.md) | one table: each component, its props, its events, and what it is |
| **Understand** | the PORT's [architecture note](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-10-14-port-desktop.md) and this note | why the names, why the protocol, what is not yet |

## Open questions for you

1. **D3, the event names.** `press` (intent) or `click` (the web's, and desktop's most common). It decides whether a template is portable to the web without a mapping.
2. **D4, the root.** `window` or `screen`. It decides how natural mobile will be.
3. **The three Sev 3 rows (#5, #6, #4)** are what would stop a newcomer, not the vocabulary: a `Native.run` for a window, a `vlx` desktop target, and one way to define a command. Which first?
