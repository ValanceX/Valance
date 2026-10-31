# Bet 9: Interaction state, focus and layers

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The web behavior under "Why" was measured in Chromium 141 on 2026-10-17. The Desktop side was not run; egui 0.31.1's `Modal` was read from its source (see "The Desktop has no layers"). The decisions are in [decisions](../direction/decisions.md) (I1 to I10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 7](accessibility.md) (names, roles and the keyboard tables). [Bet 8](state-units.md) (who holds an overlay's open state). [Bet 1](primitive-specification.md) (the controlled-slot kinds). [Bet 6](style-contract.md) (states as hooks) |

## Question

Can hover, press, focus, focus scopes and overlays be part of the primitive vocabulary, realized natively on each target, without putting transient state in the render tree and without losing the person's place when the tree changes?

## Why, and who is hurt

### Three different things are called "interaction state"

| Kind | Examples | Who should own it |
|---|---|---|
| **Presentation** | hover, pressed, focus-visible | The target. It is styling, not meaning ([Bet 6](style-contract.md) gives it hooks) |
| **Place** | which node has focus, where the caret is | The target, but it must follow node identity across updates |
| **Layers** | a dialog is open, a popover is open | The application or a state unit ([Bet 8](state-units.md)), as a controlled value |

The decision [X1](../direction/decisions.md) already puts interaction state in Valance and not in NEXUS; this bet decides which of the three needs a contract.

### Place: the web PORT can drop the person's place (measured)

The Web PORT keeps the keyed DOM in the new order by touching only nodes that are out of place (`insertBefore`). In Chromium 141, with an input in a row that is moved:

| Operation | After two animation frames |
|---|---|
| `insertBefore` of the row holding the focused input (what the PORT does) | Focus lost: the active element is the page body, one `blur` fired. The typed value stays; the selection range stays |
| `moveBefore` (present in this build) | `activeElement` stays on the input and no `blur` fires, **but the selection resets to 0,0 and typing inserts nothing** (no `beforeinput` or `input` event) until the selection is set again or the field is re-focused. Re-run twice with the same result (Chromium 141) |
| The focused row is removed | The active element is the page body |

The PORT already preserves a focused field's selection when it writes a controlled value (`port.ts`, a comment saying so), so someone has met this class of bug. The reorder case is not covered. A person typing in a row that the PORT has to move loses their place (the PORT moves only out-of-place rows, `port.ts:538-545`; this was confirmed on raw DOM with `insertBefore`, and the real PORT was not driven).

### Layers: what the web gives for free, and where it stops (measured)

| Behavior | Result in a reference browser (Chromium 141), illustrating the specification |
|---|---|
| `dialog.showModal()` | Focus moves inside; Tab stays within the dialog (the rest of the document is inert, per the HTML Standard); the background cannot take focus; Escape closes it and **focus returns to the opener** |
| A `dialog` with the `open` attribute (what a server would write) | **Not modal**: `:modal` does not match and the background is focusable |
| `close()` then `showModal()` on that server-rendered dialog (an upgrade) | Modal, focus moves inside |
| `cancel` event with `preventDefault()` (a controlled dialog refusing Escape) | The first Escape is refused. **A second close request with no user activation between them closes it anyway**; that `cancel` is not cancelable. A click or typing in between re-arms the refusal; waiting a second does not. (This is the HTML Standard's close-watcher rule: the request computes `canPreventClose`, which is false when a close is requested twice without intervening user activation, and the dialog's `cancel` event is `cancelable` only when it is true. Reproduced twice.) |
| Two nested modal dialogs, one Escape | Only the inner closes; focus returns to the outer dialog's control |
| `popover` (auto state) | Opens from its invoker; an outside click closes it (light dismiss) |
| `popover` with an `open` attribute | **Not open**: it has no initial open state in markup |
| `inert` | Focus cannot enter an inert subtree |
| `:focus-visible` | False after a mouse click; true after Tab |
| CSS anchor positioning | Supported in this build |

Three consequences. A server-rendered open overlay cannot be expressed as an attribute and needs a method call after hydration. A "controlled" modal cannot be forced to stay open: the browser decides a repeated Escape. And focus handling that the platform does for free on the web must be written by hand on the Desktop.

### The Desktop has no layers

`port-desktop` draws one window with egui 0.31 (`Cargo.lock`). A search of its source finds no popup, modal or area code, and `request_focus` appears only for text fields. [X2](../direction/decisions.md) already says overlays on the Desktop are in-window layers only. What egui 0.31.1 offers, read from its source in the consistency pass: `Modal` exists (`containers/mod.rs` re-exports it); its backdrop blocks input behind it, focus is limited to the modal layer and above (`memory/mod.rs`), and `ModalResponse::should_close` is true on a backdrop click or on Escape for the topmost modal, with stacked modals supported. It has no code that restores focus on close, and no `Popup` type (that exists only on the main branch; 0.31.1 has `popup_below_widget`). So the PORT supplies the return of focus and the invoker. Whether Tab wraps inside a modal is not verified.

### Who is hurt

- **Library authors** cannot build a dialog, a menu or a combobox from the primitives: there is no layer, no focus scope and no way to say where focus goes.
- **People using keyboards or assistive technology** lose their place when a keyed list re-sorts, and have no guaranteed focus behavior in an overlay.
- **The Desktop target** cannot show anything above the page.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** from general knowledge, not read in this session; **M** measured in this session. See [prior art](../direction/prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| WAI-ARIA Authoring Practices, modal dialog (**P**, [pattern](https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/dialog-modal/dialog-modal-pattern.html)) | Tab and Shift+Tab cycle inside, Escape closes. "When a dialog opens, focus moves to an element inside the dialog." On close, focus returns to the invoker unless it no longer exists. "Windows under a modal dialog are inert." A dialog should be marked modal "only when both" the code prevents interaction behind it and the styling obscures it | The behavior is a table. A modal is inert behind it and returns focus. The two-part condition becomes a rule below |
| MDN, Popover API (**P**, [guide](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/popover_api/using/index.md)) | `auto` state is light-dismissed by an outside click and usually one is open at a time; `manual` is not, and several may show; `hint` falls back to `manual` where unsupported. A shown popover is in the top layer. Closing by keyboard "focus is shifted back to the invoker". The guide gives no browser support table | Two kinds of popover with different dismissal. The platform supplies stacking. Support must be checked before relying on it |
| Chromium behavior (**M**) | Table above | The platform differs from the markup: state is methods, not attributes |
| React Spectrum and Radix (**P**, listed in [prior art](../direction/prior-art.md)) | Separate behavior and state from the themed component; a single component renders a single element | The primitives hold behavior; libraries compose them |
| React `useId` and Bet 7's references (**P**) | Ids from counters break under streaming | Invoker and anchor are referenced by node reference, not by id |

## Constraints

- **The render tree carries only what the application rendered.** Hover, pressed and focus are not in it ([Bet 6](style-contract.md): the render tree carries no style).
- **The PORT contract operations stay draw, update, patch, unmount and report** ([Bet 1](primitive-specification.md)). Focus follows identity as part of patch application, not a new operation.
- **X2: in-window layers only.** No operating-system windows in the portable vocabulary.
- **Controlled values.** The slot holds exactly what the application last rendered, as the controlled-value rule already says for fields.

## Design

### 1. Presentation state is the target's, with hooks

`hovered`, `pressed` and `focus-visible` stay out of the tree and out of state units. They are the hooks of [Bet 6](style-contract.md). The web gets them from CSS. The Desktop and any other target compute them from their own input and expose them to the theme the same way. **Modality matters**: `focus-visible` is true after the keyboard and false after the mouse, as measured. A target that cannot tell must treat focus as visible.

### 2. Focus follows identity

After applying patches, the PORT does this:

1. Before the patch, remember the focused node's key (and, for a text field, its selection).
2. After the patch, if that key still exists and the platform no longer has focus on it, focus it again and restore the selection.
3. If the key is gone, focus goes to the **next sibling by key**, else the previous, else the nearest ancestor that is a focus scope (a dialog, a `main`, or the root). The default exists because a list row that deletes itself is the commonest case.
4. Where `moveBefore` exists the PORT may use it, behind feature detection: the DOM Standard says it preserves the moved node's state, so a conforming implementation keeps focus and selection. The PORT still restores by step 2 after any move, because the same code must also run where only `insertBefore` exists, and the HTML Standard's focus fixup makes a removed focused node lose focus.

This is a conformance requirement in the kit ([Bet 2](conformance-kit.md)): a program that reorders a list with the focus in a row must observe focus on the same row.

### 3. Layers are two primitives

| Primitive | Meaning | Key props and events |
|---|---|---|
| `dialog` | A modal layer: inert behind it, focus inside, closed by Escape | `open` (controlled), `label` (required, [Bet 7](accessibility.md)), `initial` (a node reference to take focus; default the first focusable), event `dismiss` with a reason (`escape`, `outside`) |
| `popover` | A non-modal layer anchored to a node. For `kind` `auto`, an outside click or Escape closes it and the platform reports it; a `manual` popover is never closed by the platform and only the application closes it (measured) | `open` (controlled), `anchor` (a node reference), `placement` (a closed set: `top`, `bottom`, `start`, `end`), `kind` (`auto` or `manual`), event `dismiss` |

Both are **controlled**: the application (or a unit) holds `open`; the layer asks to close with `dismiss`; if the application does not set `open` to false, the layer stays open. This is the rule for fields, applied to layers.

Not in version 1: tooltips (hover content has accessibility problems of its own), menus, selects and comboboxes (a roving focus and typeahead that need [Bet 7](accessibility.md)'s keyboard tables first). A library can build a menu from `popover` and a list.

### 4. Rules that follow from the measurements

- **Modal is declared only when both conditions hold** (APG): a `dialog` is always inert behind it and always draws a backdrop. There is no "modal without inert" setting.
- **The browser may close a modal despite the application.** If a second Escape closes the native dialog, the PORT reports `dismiss` and then, if the application's `open` is still true, draws it again as modal. The person sees a flicker at worst and the contract holds.
- **Server rendering.** An overlay open at server time is written as an open, non-modal `dialog`/`popover` so it paints; hydration upgrades it by closing and showing it as modal, which moves focus inside. A page with an overlay open at first paint therefore has one focus move at hydration. ([Bet 14](resumable-start.md) does not yet say how its early-input shell treats an overlay that is open at first paint.)
- **Return of focus.** When a layer closes, focus returns to the node that had it before the layer opened, by key. If that node is gone, the rule in section 2 applies; the browser's own behavior is not relied on, because with the invoker removed the browser restores nothing: focus ends on the body after the browser's focus fix-up, and a read taken immediately can still show a control inside the closed dialog.
- **Stacking** is tree order: later layers are on top, and Escape closes the top one only.

### 5. The Desktop

The Desktop PORT draws a layer above the content in the same window, consumes pointer and key input that is not for the layer (the inert rule), keeps Tab inside it, and returns focus on close. It reports the same events. If egui's own modal support does the cycling, the PORT uses it; if not, the PORT keeps its own list of focusable controls per layer, which it needs anyway for the `observe` of [Bet 2](conformance-kit.md). The open question is how much egui gives.

### 6. Who holds `open`

An application that cares about the layer (a confirm dialog) holds it in NEXUS state. A library's disclosure or popover holds it in a state unit ([Bet 8](state-units.md)), which is why units have stable identity. Both use the same controlled prop and event.

### Alternatives considered

| Option | Why not |
|---|---|
| Hover, pressed and focus as tree data | The tree would change on every pointer move. It is also a styling concern |
| One `overlay` primitive with a `modal` flag | The two have different dismissal, different focus rules and different semantics for assistive technology. APG treats them separately |
| Leave layers to libraries | A library cannot make the background inert or return focus on the Desktop; only the PORT can |
| Rely on the platform for focus after a patch | Measured: a moved row loses focus |
| A focus-management command in NEXUS | Focus is not application state, and an effect that runs after render is timing-dependent |

## Experiment

1. **Focus follows identity.** Add the restore step to the Web PORT, with a test that reorders a list of fields with focus in one and types. Re-run the measurement above with and without `moveBefore`.
2. **The web layers.** Build `dialog` and `popover` on the native elements; run the APG keyboard behavior as vectors in a real browser, including the second-Escape case, nested layers and the server-rendered upgrade.
3. **The Desktop.** Prototype a modal layer in the egui window. Record whether egui's own support gives the cycle and the inert behavior, and how much the PORT must write.
4. **Terminal target** ([Bet 12](reference-library.md)): can the same contract be met with a character grid, where focus visibility is the only presentation?
5. **Cost.** Time added to a patch by the focus step on a 1,000-row keyed list ([Bet 3](budgets.md)).

## Success

- A keyed reorder with focus in a moved row keeps focus on the web and the Desktop; the kit checks it.
- The APG modal dialog behavior passes as generated vectors on both targets: Tab staying inside, Escape, focus in and focus return, as the APG and HTML Standard describe them.
- A controlled dialog whose application ignores `dismiss` stays open on both targets, including after a repeated Escape on the web.
- The reference library builds a disclosure, a dialog and a popover-based menu with no private seam ([Bet 12](reference-library.md)).
- The focus step adds under 1 ms to a 1,000-row patch.

## Kill

- If `moveBefore` is not available or not feature-detectable, use `insertBefore` plus step 2; whether a given browser implements `moveBefore` correctly is that browser's concern.
- If egui cannot support an inert layer without large code, draw the layer as a second `egui` area over a full-window input blocker and document the limits.
- If server-rendered overlays cause visible focus jumps, require overlays to start closed in server output.
- If the platform's native top layer is unsupported where we ship, fall back to a positioned element with `inert` on the rest of the page.

## Breaks (allowed in the free window)

- The Web PORT's patch application gains a focus step.
- New primitives `dialog` and `popover` on all targets, with `dismiss` events.
- The kit gains focus and keyboard vectors.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../direction/decisions.md) I11 to I15. Under the project's tenth fixed point we emit what the specifications define and verify that; how a browser implements those specifications is the browser's concern. Measurements below were taken in Chromium 141 and are cited as illustrations, and where one disagreed with a specification the specification wins.

**Features and their specification status, not browser versions.** The web realization uses `dialog` (with `showModal`), `inert`, `popover`, `:focus-visible`, `:modal` and the core of CSS anchor positioning (`anchor-name`, `position-area`, `position-try-fallbacks` with `flip-block` and `flip-inline`), and nothing newer: `moveBefore`, `closedby`, `popover=hint`, CloseWatcher and `position-visibility` are optional enhancements behind feature detection. Wherever anchor positioning is absent (`@supports not (position-area: top)`) the popover falls back to the top layer's default placement. Which browsers ship which feature is data from the `web-features` package (anchor positioning as a whole is not yet Baseline; `popover` is newly available since 2025-01-27; `dialog`, `inert` and `:focus-visible` are widely available) and is those browsers' concern; the project does not publish a supported-browser list. Anchored-popover flipping with `position-try-fallbacks: flip-block` was exercised once in a reference browser: the popover flipped above its anchor near the bottom edge and, with room neither way, overflowed, so give it a `max-height` or a third fallback (that is CSS Anchor Positioning behavior, the author's to handle).

**Moving a focused field.** The HTML Standard says removing the focused element runs the focus fixup, and the DOM Standard's `moveBefore` algorithm "preserves state associated with" the moved node, with no focus fixup in its moving steps. So with `insertBefore` (a remove and an insert) a focused field loses focus **by specification**, and the PORT restoring it is our contract; a conforming `moveBefore` keeps focus and selection. In Chromium 141 `moveBefore` kept focus but reset the selection to 0,0 and typing inserted nothing until the selection was set again; the specification's own web-platform-tests case ("preserves focus and a backward selection in a text input", in `dom/nodes/moveBefore/focus-preserve.html`) fails there, so **that is a browser defect, not a design input**. The PORT recipe stays what the specification needs: before applying patches save the focused node's key and its selection range and direction; afterwards, if the key exists and is not the active element, focus it and restore the range; use `moveBefore` only behind feature detection.

**Scroll locking.** The HTML Standard makes the rest of the document inert while a modal dialog is open; it does not lock the document's scrolling, so the web realization states it in CSS: `html:has(dialog:modal) { overflow: hidden }`, `scrollbar-gutter: stable` (without it the page shifts when the scrollbar disappears) and `overscroll-behavior: contain` on a scrollable dialog. Validity of those declarations is checked against the CSS specifications; how consistently a browser implements `overscroll-behavior` is its concern. On the Desktop the layer already blocks input behind it; the PORT only has to stop forwarding scroll deltas to areas behind the layer.

**Hover and press.** Media Queries Level 4 defines `hover`, `any-hover`, `pointer` and `any-pointer` (MDN: `hover` is about "the primary input mechanism" and `any-hover` about "one or more available input mechanisms"). The rule for the style contract's hooks follows from those definitions: `hovered` styling applies only inside `@media (any-hover: hover)`; `pressed` is `:active` and gets feedback that needs no hover; no meaning is conveyed by hover alone. (In a touch-emulated reference browser `:hover` stayed on a tapped button until the next tap; that is the browser's hover emulation and is not designed around.)

**A host request to focus a node by key is a call on the PORT, not a command.** Focus is not application state (section 2 already restores it after a patch in the same place), and an effect that runs after render is timing-dependent, so [Bet 8](state-units.md)'s Effect form is not used for it. The PORT offers `focus(key)`, which the host (Valance's `connect`) calls after it has applied the patch that created or kept the node; the PORT focuses the node if the key exists and reports nothing if it does not. [Bet 11](forms.md) uses it for the first invalid field. This is a design decision, not a research result.

## Open questions for stage 3

- **The web-platform-tests subset** that corresponds to the behaviors the PORT relies on (dialog, popover, focus fixup, `moveBefore`, close watchers), run in a reference browser as a check on the reference implementation, not as a gate on it ([Bet 2](conformance-kit.md)).
- **A testdriver shim** so the input-driven tests can run headlessly.
- **Tooltips and menus** after the keyboard tables exist.
