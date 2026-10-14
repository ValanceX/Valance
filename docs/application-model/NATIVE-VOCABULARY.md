# The native vocabulary: what a screen is made of, for someone new to native apps

Written 2026-10-14. The question: **what should a template be allowed to say when the target is a native window, so that a developer who has never written a native app can pick it up?** It is judged by the ecosystem's own measure: the [API design principles](https://github.com/ValanceX/Mesh/blob/main/docs/standards/api-design-principles.md) (fewest concepts for the task, names people already know, one mental model, progressive disclosure) and the severity and layer scale of the [cognitive-load log](../../examples/tracer-web/src/docs-benchmark/COGNITIVE_LOAD.md) (0 natural, 1 minor friction, 2 framework knowledge, 3 abstraction failure; App, FW or Eng).

**Evidence.** The first version of this note quoted other toolkits from memory. It was then re-done from primary sources (listed at the end, read on 2026-10-14), and **it corrected three of its own recommendations** (marked *corrected* below). Every claim about another toolkit now cites a source; the one toolkit that could not be read in full (WPF) is marked. Claims about this repository are **run** (a test or a run on this machine) or **read** (read from the code). The vocabulary this note recommends is built: it is the Desktop PORT's own ([`valancex-port-desktop`](https://github.com/ValanceX/Port/tree/main/packages/port-desktop), [its architecture note](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-10-14-port-desktop.md)), and [`examples/todo`](../../examples/todo/README.md) is written against it.

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

## What a newcomer already knows (from the toolkits' own sources)

Each cell is a name found in the toolkit's documentation or source; the numbers are the sources at the end.

| Thing | SwiftUI [1] | Compose [2] | Flutter [3] | GTK 4 [4] | Qt [5] | React Native [6] | DOM / ARIA [7, 8] | egui [9] | Valance Desktop |
|---|---|---|---|---|---|---|---|---|---|
| children stacked down | `VStack` | `Column` | `Column` | `Box` (orientation) | `QVBoxLayout` | `View` (`flexDirection`) | block layout | `ui.vertical` | `column` |
| children side by side | `HStack` | `Row` | `Row` | `Box` (orientation) | `QHBoxLayout` | `View` (`flexDirection: row`) | flex | `ui.horizontal` | `row` |
| text | `Text` | `Text` | `Text` | `Label` | `QLabel` | `Text` | (text) | `label` | `text` |
| a title for what follows | `Text` with a header trait | semantics | `Semantics(header: true)` | `Label` | `QLabel` | `accessibilityRole="header"` | role `heading` (with a level) | `heading` | `heading` |
| a button | `Button` | `Button` | `ElevatedButton` | `Button` | `QPushButton` | `Button` | `button` | `Button` | `button` |
| activating it | `action` | `onClick` | `onPressed` | `clicked` | `clicked` | `onPress` | `click` | `.clicked()` | `click` |
| a box to tick | `Toggle` | `Checkbox` | `Checkbox` | `CheckButton` | `QCheckBox` | `Switch` | `checkbox` | `checkbox` | `checkbox` |
| a tick changing | `isOn` (a binding) | `onCheckedChange` | `onChanged` | `toggled` | `stateChanged` | `onValueChange` | `change` | `.changed()` | `change` |
| a line of text to edit | `TextField` | `TextField` | `TextField` | `Entry` | `QLineEdit` | `TextInput` | `textbox` / `input` | `TextEdit` | `textfield` |
| the text changing | a binding | `onValueChange` | `onChanged` | `changed` | `textChanged` | `onChangeText` | `input` / `change` | `.changed()` | `change` |

What the evidence says, thing by thing:

- **Activating a button is "click" in five of the eight sources, "press" in two (Flutter, React Native), "action" in one** (SwiftUI); a sixth, WPF's `Click`, was seen only in search snippets (`learn.microsoft.com` could not be read). The DOM's `click` is stated to be device-independent: "The event is a device-independent event — meaning it can be activated by touch, keyboard, mouse, and any other mechanism provided by assistive technology" [7]. Qt's `clicked` is also emitted "when the shortcut key is typed" [5]; Compose, an Android toolkit, names its callback `onClick` and describes it as "when the user presses the button" [2]; SwiftUI says "a method or closure property that does something when a user clicks or taps the button ... How the user activates the button varies by platform" [1]. **So "click" is the established word, and it is already device-independent; the first version of this note was wrong that it is mouse-only.** *Corrected: `click`, not `press`.*
- **A value changing is "change" almost everywhere, and it carries the new value.** Flutter `onChanged(bool?)` and `onChanged(String)` [3], Compose `onCheckedChange` ("the function that the app calls when the user taps the checkbox", the new value is `it`) and `onValueChange` [2], React Native `onValueChange` and `onChangeText` ("Changed text is passed as a single string argument") [6], Qt `textChanged` and `stateChanged` [5], the DOM `change` and `input` [7]. The toolkits that bind instead of calling (SwiftUI's `isOn`) are saying the same thing: **the control reports its value and the app owns it.** React Native states it as a rule ("a controlled component that requires an `onValueChange` callback that updates the `value` prop in order for the component to reflect user actions") [6] and so does Compose ("You are responsible for updating the `value` in your own state based on the changes reported by `onValueChange`") [2]. That is Valance's rule too. A value, unlike a "toggle", is also **idempotent**: the same report twice is the same state. *Corrected: a checkbox's event is `change` with a boolean, not `toggle`.*
- **`textfield` is `TextField` in three of the eight sources** (SwiftUI [1], Compose [2], Flutter [3]); the others are `TextInput`, `QLineEdit`, `Entry`, `TextEdit` and the DOM's `input`, each used once. It is also Valance's own word (`Web.textField`). **`checkbox`** is `Checkbox` or `CheckBox` in five, and `Toggle` or `Switch` in two (SwiftUI, React Native, whose core has no checkbox [6]).
- **`column` and `row`** are Compose's and Flutter's names, and the values of `flexDirection` in React Native and CSS; `VStack`/`HStack`, `QVBoxLayout`/`QHBoxLayout` and `ui.vertical`/`ui.horizontal` are the other family. Both are direction words; neither family needs a property.
- **A heading is not a widget in any native toolkit read.** It is text with a role: Flutter `Semantics.header` ("A header is typically the top element of a page or section, such as a page title or app bar title") [3], React Native `accessibilityRole` `header`/`heading` ("an element acts as a header for a content section") [6], and the cross-platform accessibility layer's `Role::Heading` [10]. On the web it is `heading` with a required level [8].

Where the evidence does not decide, it is said: `column`/`row` against `vertical`/`horizontal` is a tie.

## The content layer: a closed set that already has names

Valance's content model is **closed**: `packages/common/src/model.ts` (**read**) has six block kinds, `heading` (level 1 to 3), `paragraph`, `list` (ordered or not), `code`, `quote`, `image`, and five inline kinds, `text`, `strong`, `emphasis`, `code`, `link`. Every one has a role of the same meaning in WAI-ARIA [8], and AccessKit, the accessibility layer egui (and so the Desktop PORT) uses for UI Automation, AT-SPI and NSAccessibility, says "the majority of these roles come from the ARIA specification" and has the same names [10]:

| Content model | ARIA role [8] | AccessKit `Role` [10] |
|---|---|---|
| `heading` (level) | `heading` ("authors MUST use the aria-level attribute") | `Heading` |
| `paragraph` | `paragraph` | `Paragraph` |
| `list`, an item | `list`, `listitem` | `List`, `ListItem` |
| `code` | `code` | `Code` |
| `quote` | `blockquote` | `Blockquote` |
| `image` | `img` | `Image` |
| `strong`, `emphasis` | `strong`, `emphasis` | `Strong`, `Emphasis` |
| `link` | `link` ("an interactive reference to an internal or external resource") | `Link` |

And the structure around a page (the web table's `header`, `footer`, `main`, `nav`, `aside`, `section`) is ARIA's landmarks (`banner`, `contentinfo`, `main`, `navigation`, `complementary`, `region`) [8], which AccessKit also has (`Banner`, `ContentInfo`, `Main`, `Navigation`, `Complementary`, `Region`) [10]. A native toolkit has no widget for any of them; they exist for assistive technology. **The web's 26 tags are therefore three different things**: the content layer (above), landmarks, and controls and layout (`div`, `shell`, `button`).

This is the evidence for the layering below. It is also an argument about names: the web table's `para`, `quote`, `item`, `olist` and `em` are not HTML's (`p`, `blockquote`, `li`, `ol`, `em`) and not ARIA's (`paragraph`, `blockquote`, `listitem`, `list`, `emphasis`); they are Valance's own short forms. §3.2 prefers established terminology, so the content layer, if it becomes shared, should use the ARIA names. (Renaming the web's published, Provisional names is a separate decision, below.)

## Candidates

| | Idea | C1 few | C2 known | C3 behavior | C4 one model | C5 layers | Verdict |
|---|---|---|---|---|---|---|---|
| **A** | Reuse the web's tag table (26 tags: `shell`, `div`, `nav`, `para`, `h1`, `list`, `link`…) | no: 26 | partly (HTML's, and Valance's own short forms) | no (`div`, `span`, `shell`) | no: web hooks (`class`, `theme`, `tabindex`, `id`, `label`, `current`, `pressed`, `loading`) | no | **Rejected.** A second vocabulary built without those eight props rejects the scaffolded project at 33 places (**run**, `packages/cli/test/second-target.test.ts`) |
| **B** | A small vocabulary of intent for controls and layout, owned by each PORT as data | yes: 7 | yes (the table above) | yes | yes: one layout model, two events | yes | **Recommended; built** |
| **B+** | B, plus a **content layer** named by ARIA, for what Markdown produces | yes: +10 names | yes (a W3C standard that every accessibility API maps to) | yes | yes | yes | **Recommended; tested below** |
| **C** | Pass the toolkit's widgets through (egui's, Qt's) | no: hundreds | only to that toolkit's users | partly | no: a different model per target | no | **Rejected.** It is "Valance API to platform API", the wrong mental model (PORT architecture) |
| **D** | One semantic core shared by every PORT, as code | yes | yes | yes | yes | yes | **Rejected for now.** PORT's rule is to generalize from evidence, and two PORTs share a contract and no code. The *names* are shared by convention instead (D1) |

## Evidence from this repository

### One. The application was written against B (**run**)

`examples/todo` has seven components and five screens, in five template files. It runs on a text target, in a DOM, and in a native window, from the same compiled screens. The Desktop PORT's [contract tests](https://github.com/ValanceX/Port/blob/main/packages/port-desktop/tests/contract.rs) run on trees MESH produced from it.

### Two. The same vocabulary on the web (**run**, `examples/todo/test/web-realization.test.ts`)

A table of **seven entries** realizes the whole vocabulary with PORT Web's own mechanism, and the application then runs in a DOM: typing, clicking, the unsaved-edit guard. So a vocabulary of intent is not native-only; the same templates can serve both targets, which is what C4 wants. The names pay off here: `button`'s event is `click` on both, so the realization maps nothing. What the experiment could not do:

| Could not | Why | What it needs |
|---|---|---|
| a real checkbox | the table cannot give an element a fixed attribute (`type="checkbox"`), so `checkbox` realizes as a text box | PORT Web needs element constants: a small addition |
| a column and a row | they are `div`s with no layout; CSS does that on the web | a stylesheet shipped with the vocabulary's web realization |

### Three. The web's table on native (**read**, **run**)

26 tags, eight of whose props (`class`, `theme`, `id`, `tabindex`, `label`, `current`, `pressed`, `loading`) are web hooks. The scaffolded project's pages render with no DOM and navigate with their own `go` command (**run**), but their links carry an address and no event, and every tag is a web name (`shell`, `nav`, `para`). It cannot be the vocabulary of a native app without a second vocabulary beside it.

### Four. Building the application, scored on the cognitive-load scale (my own experience of this build, **not** a user study)

| # | What a newcomer has to do | What it took | Layer | Sev | What was done |
|---|---|---|---|---|---|
| 1 | Say which components exist | a 60-line manifest object, written by hand: every prop, event and type | FW/Eng (MESH) | **2** | **Fixed**: the PORT ships its components as data (`vocabulary.json`, a MESH manifest); the application only adds its screens |
| 2 | Name the text box | I wrote `field`; three toolkits say `TextField`, and Valance's own `Web.textField` is the same word | FW | 1 | **Fixed**: `textfield` (C2, C4) |
| 3 | Name the checkbox's event | I wrote `toggle`, which flips: a repeated or late report flips twice | FW | **2** | **Fixed**: `change` with the new value, as the toolkits do; the command is `setDone`, not `toggleItem` |
| 4 | Say what the window is called | a `window` component with a `title` prop, which no toolkit read does | FW | 1 | **Fixed**: the application's `titleOf(state)`, sent by the host |
| 5 | Give a button an address to go to | a template cannot build a string, so each row's scope carries its own `href` | FW | 1 | Open (#5 in the [parity matrix](./NATIVE-PARITY.md)) |
| 6 | Change state from an event | two ways to define a command (`Valance.command` with `entry`, or `Nexus.Command.define`), and the key names that connect them | FW/Eng | **2** | Open; the to-do app used the second, which exposes Effect |
| 7 | Start the application on a window | I wrote `serve` (stdin, stdout, Scope, `Effect.async`) | FW | **3** | **Fixed**: `Native.run(app, options)`, one call, the way `Web.run` is for a page (contract §20) |
| 8 | Package it | I wrote a bundler step, a blob step and a download | tooling | **3** | Open: a `vlx` target |
| 9 | Type into a field | a keystroke was lost when the engine answered late | PORT | **3** for a PORT author, 0 for an app author | **Fixed** in the PORT (`Field`) |
| 10 | Know which components do what | one table, one page of docs | | 0 | the [Learn page](../learn/desktop-application.md) and the [reference](../use/desktop-vocabulary.md) |

Rows 3 and 4 were found by checking the vocabulary against the toolkits' sources, not by building: they were my own inventions. Rows 6 to 8 are not the vocabulary at all. **The vocabulary is the part that is now at Sev 0 to 1; the work that would stop a newcomer is around it.**

### Five. The content layer, tested (**run**)

The hypothesis: what Markdown produces is a closed set with ARIA names, so a `vlx`-style project can draw a whole content site from the controls vocabulary plus ten content components, with the application model unchanged.

| What was done | Result |
|---|---|
| A project built the way `vlx` builds one (`packages/cli/test/native-content.test.ts`): its own layout and the six built-in views overridden by native templates (seven `.mprx` files), compiled against a native vocabulary, started with no DOM and no PORT Web | **Held.** Every block and inline kind the content model has was drawn, by **13 distinct components**: four controls-and-layout (`column`, `row`, `text`, and `heading`) and nine content words. No web tag reached the screen |
| The application's own `go` command, given the address a link carries (`routes(content).stateOf`) | **Held.** The page changed; its headings came back as levels 1 and 2 |
| A link in the tree | It carries an address and **no event**: nothing to report but the address, so the PORT reports it as `{"op":"link","href"}` and the engine turns it into `go` (`examples/todo/src/reader-main.ts`) |
| The Desktop PORT drawing it | The window draws a whole content page from real MESH output without a display (a test in the PORT), and in a real window under a virtual display it showed the heading, a paragraph with strong, emphasis, inline code and a link, both kinds of list, a quotation, a code block and the navigation; **clicking a link moved to the next page and the title followed** (by hand: a screenshot before and after, not a test) |

What it found, none of which the hypothesis predicted:

1. **A built-in view's name collided with a content word.** The framework's `heading` view (the thing that draws a heading block) and the vocabulary's `heading` are one name in one namespace. The result was eleven diagnostics inside `heading.mprx`, a file the author did not write. The built-ins were already inconsistent (`list-block` is the list's block, `heading` was the heading's); the view is now `heading-block`. This breaks anyone who overrides `heading` (0.11 documented it); it is in the 0.12 notes.
2. **`Vocabulary.tags` is PORT Web's realization table.** The experiment had to write a stand-in with `element` names nobody uses, only so the build could derive a manifest. A native vocabulary is a MESH manifest (`vocabulary.json`, `content.json`); the build should take one as data.
3. **Images are not drawn.** The window shows their description. Decoding needs an image loader and files shipped with the app.
4. **What a web layout carries and a native one does not.** `class`, `theme`, `current`, and the landmarks (`header`, `nav`, `main`). On the web the landmarks are what a screen reader navigates by; natively that is the accessibility layer's job (`Banner`, `Navigation`, `Main` in AccessKit [10]) and is not built.
5. **An address that is not on the site does nothing.** Opening `https:` or `mailto:` addresses needs a capability ([parity](./NATIVE-PARITY.md) #16).
6. **Heading anchors are dropped**, so `#fragment` links do not scroll.

This is the evidence for D1's second layer and for D10, and the maintainer decided on it: the content layer is part of what the Desktop PORT promises, under ARIA's names.

## Decisions

| # | Decision | Chosen | Evidence | Status |
|---|---|---|---|---|
| D1 | Layers, by purpose | **Controls and layout** (7 components, owned by each PORT as data), a **content layer** (what Markdown produces, named by ARIA), and a PORT's own extras. Names are aligned by convention across PORTs; no shared code | the toolkits have no widgets for content, and ARIA and AccessKit name it alike (above); two PORTs share a contract and no code (PORT ROADMAP) | Built: controls and layout, and the content layer (promoted 2026-10-14 after the experiment above) |
| D2 | The names | `column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield` | the table above | Built |
| D3 | The event of a button | **`click`** | five of eight sources; the DOM defines it as device-independent; Compose uses it on touch; the first version's `press` was an invention (*corrected*) | Built |
| D4 | The event of a control with a value | **`change`**, carrying the new value (`string` for a textfield, `boolean` for a checkbox) | every toolkit that reports calls it a change and passes the value; React Native and Compose state the controlled rule; a value is idempotent where a toggle is not (*corrected*) | Built |
| D5 | The root, the window | **No component.** The window's title, size and close are the host's | SwiftUI: a `Window` scene takes the title, and `navigationTitle` makes it follow the navigation state; GTK: `gtk_window_set_title`, "a good title might include the application name and current document" [1, 4]. Valance already works this way on the web (`defineApp({ title })` is applied to `document.title`) (**read**) (*corrected*: the first version proposed `window`, then `screen`) | Built (`title` message; `router.mayLeave` guards close) |
| D6 | Layout | `column` and `row` only; spacing and alignment are the PORT's defaults; later, enumerated `gap` and `align` | SwiftUI's `VStack(alignment:spacing:)` and Compose's `horizontalArrangement`/`verticalAlignment` [1, 2] put exactly two things on a stack, how its children line up and how far apart they are, and nothing like CSS | Tier 1 built |
| D7 | Styling | none in tier 1; tier 2 an **`intent`** (`primary`, `danger`) and the OS theme | SwiftUI `ButtonRole` (`.destructive`): "The system uses the button's role to style the button appropriately" [1]. (SwiftUI calls it a role; ARIA's `role` means something else, so `intent`.) | Proposal |
| D8 | Accessibility | roles come from the names; tier 2 makes a **`label` required** on a control with no text | SwiftUI: "Avoid labels that only use images or exclusively visual components without an accessibility label" [1]; React Native: "It is recommended to set accessibilityLabel" [6]. Both recommend; the principles (§10) say the unlabeled path must not be the easy one | Proposal |
| D9 | Escape hatch | a clearly marked component in the PORT's own vocabulary, never a toolkit widget passed through | PORT's architecture: escape hatches exist and are marked as leaving the portable layer | Proposal |
| D10 | The content layer's names | **ARIA's**: `heading` (with `level`), `paragraph`, `list`, `listitem`, `code`, `blockquote`, `image`, `strong`, `emphasis`, `link` | the content model has exactly these meanings, ARIA defines them, AccessKit has them; the web table's `para`, `item`, `olist`, `quote`, `em` are Valance's own short forms | **Decided (2026-10-14, by the maintainer): ARIA's names for the shared content layer.** The web's published, Provisional table keeps its own short forms until a migration is decided |

## Tiers

| Tier | Components and props | Built | Justified by |
|---|---|---|---|
| **1: first hour** | `column`, `row`, `heading`, `text`, `button` (`disabled`, `click`), `checkbox` (`checked`, `change`), `textfield` (`value`, `placeholder`, `change`) | yes | the to-do app |
| **content** | `heading` (`level`), `paragraph`, `list` (`ordered`), `listitem`, `code`, `blockquote`, `image`, `strong`, `emphasis`, `link` | yes: `content.json` in the Desktop PORT, part of what it promises | the content model is exactly this |
| **2: next** | a `submit` event on `textfield`, `intent` on `button` and `text`, `gap` and `align` on `column` and `row`, required `label` | no | parity matrix #7, #10, #11; D7, D8 |
| **3: deep** | a list with many rows (virtualized), tables, menus, dialogs, drag and drop | no | not planned; D9 |

## How the documentation reflects this

The principles ask for three layers (§13.1) and examples that run (§13.2):

| Layer | Where | What it is |
|---|---|---|
| **Learn** | [Your first desktop application](../learn/desktop-application.md) | the to-do app in six steps, in the vocabulary and nothing else; every code block is checked against the real file by a test |
| **Use** | [The desktop vocabulary](../use/desktop-vocabulary.md) | one table: each component, its props, its events, and what it is |
| **Understand** | the PORT's [architecture note](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-10-14-port-desktop.md) and this note | why the names, why the protocol, what is not yet |

## Sources

Read on 2026-10-14. `learn.microsoft.com`, `docs.flutter.dev`, `doc.qt.io`, `docs.gtk.org`, `reactnative.dev`, `developer.mozilla.org` and `www.w3.org` could not be reached from the environment this was written in, so those toolkits were read from the repositories that hold their documentation and API comments, at the default branch on that date; for Apple and Android the official documentation pages were read. **WPF could not be read** and appears only through search snippets, so it is left out of the table.

1. Apple, SwiftUI: `developer.apple.com/documentation/swiftui/` `vstack.md`, `hstack.md`, `button.md`, `toggle.md`, `window.md`, `view/navigationtitle(_:).md`.
2. Android, Jetpack Compose: `developer.android.com/develop/ui/compose/` `layouts/basics`, `components/button`, `components/checkbox`, `text/user-input`.
3. Flutter: `flutter/flutter` `packages/flutter/lib/src/` `material/elevated_button.dart`, `material/checkbox.dart`, `material/text_field.dart`, `widgets/basic.dart` (`Row`, `Column`), `semantics/semantics.dart` (`header`).
4. GTK 4: `GNOME/gtk` `gtk/` `gtkbutton.c` ("clicked: Emitted when the button has been activated (pressed and released)"), `gtkbox.c`, `gtkcheckbutton.c`, `gtkentry.c`, `gtkwindow.c` (`gtk_window_set_title`).
5. Qt: `qt/qtbase` `src/widgets/` `widgets/qabstractbutton.cpp` (`clicked`), `widgets/qcheckbox.cpp`, `widgets/qlineedit.cpp`, `kernel/qboxlayout.cpp`.
6. React Native: `facebook/react-native-website` `docs/` `button.md`, `switch.md`, `textinput.md`, `view.md`, `accessibility.md`.
7. MDN: `mdn/content` `files/en-us/web/api/element/click_event/index.md`.
8. WAI-ARIA 1.2: `w3c/aria` `index.html` (roles `button`, `checkbox`, `textbox`, `heading`, `paragraph`, `list`, `listitem`, `blockquote`, `code`, `strong`, `emphasis`, `img`, `link` and the landmarks).
9. egui: `emilk/egui` `crates/egui/src/` `widgets/button.rs`, `ui.rs` (`vertical`, `horizontal`).
10. AccessKit 0.25.1: `accesskit` crate, `src/lib.rs` (`Role`): "The majority of these roles come from the ARIA specification."

## Decided, and what is next

Decided on 2026-10-14, after this note:

1. **ARIA's names** (`paragraph`, `listitem`, `blockquote`, `emphasis`, and the rest) are the shared content layer's. The web's published table is not renamed for now.
2. **The content layer is promoted** to part of what the Desktop PORT promises (`content.json`; images draw as their description until the PORT carries an image loader, and that limit is documented, not hidden).
3. **The order of the gaps that would stop a newcomer** (rows 6 to 8 above): the host first, then the `vlx` desktop target, then one way to define commands. The host is built: `Native.run` ([contract §20](../V1_CONTRACT.md#20-the-native-host-nativerun)).
