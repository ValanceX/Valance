# Bet 9: Interaction state, focus and layers

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The web behavior under "Why" was measured in Chromium 141 on 2026-10-17. The Desktop side was not run; egui 0.31.1's `Modal` was read from its source (see "The Desktop has no layers"). The decisions are in [decisions](../decisions.md) (I1 to I10); the maintainer has not reviewed the text |
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

The decision [X1](../decisions.md) already puts interaction state in Valance and not in NEXUS; this bet decides which of the three needs a contract.

### Place: the web PORT can drop the person's place (measured)

The Web PORT keeps the keyed DOM in the new order by touching only nodes that are out of place (`insertBefore`). In Chromium 141, with an input in a row that is moved:

| Operation | After two animation frames |
|---|---|
| `insertBefore` of the row holding the focused input (what the PORT does) | Focus lost: the active element is the page body, one `blur` fired. The typed value stays; the selection range stays |
| `moveBefore` (present in this build) | `activeElement` stays on the input and no `blur` fires, **but the selection resets to 0,0 and typing inserts nothing** (no `beforeinput` or `input` event) until the selection is set again or the field is re-focused. Re-run twice with the same result (Chromium 141) |
| The focused row is removed | The active element is the page body |

The PORT already preserves a focused field's selection when it writes a controlled value (`port.ts`, a comment saying so), so someone has met this class of bug. The reorder case is not covered. A person typing in a row that the PORT has to move loses their place (the PORT moves only out-of-place rows, `port.ts:538-545`; this was confirmed on raw DOM with `insertBefore`, and the real PORT was not driven).

### Layers: what the web gives for free, and where it stops (measured)

| Behavior | Result in Chromium 141 |
|---|---|
| `dialog.showModal()` | Focus moves inside; Tab wraps within the dialog but passes through the browser's own UI once per cycle (the active element was the page body between the last and first controls), so a PORT needs its own trap to meet the APG text; the background cannot take focus; Escape closes it and **focus returns to the opener** |
| A `dialog` with the `open` attribute (what a server would write) | **Not modal**: `:modal` does not match and the background is focusable |
| `close()` then `showModal()` on that server-rendered dialog (an upgrade) | Modal, focus moves inside |
| `cancel` event with `preventDefault()` (a controlled dialog refusing Escape) | The first Escape is refused. **A second close request with no user activation between them closes it anyway**; that `cancel` is not cancelable. A click or typing in between re-arms the refusal; waiting a second does not. (The platform's close-watcher rule against trapping the user; reproduced twice.) |
| Two nested modal dialogs, one Escape | Only the inner closes; focus returns to the outer dialog's control |
| `popover` (auto state) | Opens from its invoker; an outside click closes it (light dismiss) |
| `popover` with an `open` attribute | **Not open**: it has no initial open state in markup |
| `inert` | Focus cannot enter an inert subtree |
| `:focus-visible` | False after a mouse click; true after Tab |
| CSS anchor positioning | Supported in this build |

Three consequences. A server-rendered open overlay cannot be expressed as an attribute and needs a method call after hydration. A "controlled" modal cannot be forced to stay open: the browser decides a repeated Escape. And focus handling that the platform does for free on the web must be written by hand on the Desktop.

### The Desktop has no layers

`port-desktop` draws one window with egui 0.31 (`Cargo.lock`). A search of its source finds no popup, modal or area code, and `request_focus` appears only for text fields. [X2](../decisions.md) already says overlays on the Desktop are in-window layers only. What egui 0.31.1 offers, read from its source in the consistency pass: `Modal` exists (`containers/mod.rs` re-exports it); its backdrop blocks input behind it, focus is limited to the modal layer and above (`memory/mod.rs`), and `ModalResponse::should_close` is true on a backdrop click or on Escape for the topmost modal, with stacked modals supported. It has no code that restores focus on close, and no `Popup` type (that exists only on the main branch; 0.31.1 has `popup_below_widget`). So the PORT supplies the return of focus and the invoker. Whether Tab wraps inside a modal is not verified.

### Who is hurt

- **Library authors** cannot build a dialog, a menu or a combobox from the primitives: there is no layer, no focus scope and no way to say where focus goes.
- **People using keyboards or assistive technology** lose their place when a keyed list re-sorts, and have no guaranteed focus behavior in an overlay.
- **The Desktop target** cannot show anything above the page.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** from general knowledge, not read in this session; **M** measured in this session. See [prior art](../prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| WAI-ARIA Authoring Practices, modal dialog (**P**, [pattern](https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/dialog-modal/dialog-modal-pattern.html)) | Tab and Shift+Tab cycle inside, Escape closes. "When a dialog opens, focus moves to an element inside the dialog." On close, focus returns to the invoker unless it no longer exists. "Windows under a modal dialog are inert." A dialog should be marked modal "only when both" the code prevents interaction behind it and the styling obscures it | The behavior is a table. A modal is inert behind it and returns focus. The two-part condition becomes a rule below |
| MDN, Popover API (**P**, [guide](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/popover_api/using/index.md)) | `auto` state is light-dismissed by an outside click and usually one is open at a time; `manual` is not, and several may show; `hint` falls back to `manual` where unsupported. A shown popover is in the top layer. Closing by keyboard "focus is shifted back to the invoker". The guide gives no browser support table | Two kinds of popover with different dismissal. The platform supplies stacking. Support must be checked before relying on it |
| Chromium behavior (**M**) | Table above | The platform differs from the markup: state is methods, not attributes |
| React Spectrum and Radix (**P**, listed in [prior art](../prior-art.md)) | Separate behavior and state from the themed component; a single component renders a single element | The primitives hold behavior; libraries compose them |
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
4. Where `moveBefore` exists the PORT may use it to avoid the `blur`, but it must always re-assert focus and selection afterwards: in Chromium 141 a moved field keeps `activeElement` yet stops accepting typing until its selection is set. It is never a way to skip step 2.

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
- The APG modal dialog behavior passes as generated vectors on both targets: Tab wrapping (with the PORT's trap on the web), Escape, focus in and focus return.
- A controlled dialog whose application ignores `dismiss` stays open on both targets, including after a repeated Escape on the web.
- The reference library builds a disclosure, a dialog and a popover-based menu with no private seam ([Bet 12](reference-library.md)).
- The focus step adds under 1 ms to a 1,000-row patch.

## Kill

- If `moveBefore` keeps breaking typing in released browsers, drop it and use `insertBefore` plus step 2.
- If egui cannot support an inert layer without large code, draw the layer as a second `egui` area over a full-window input blocker and document the limits.
- If server-rendered overlays cause visible focus jumps, require overlays to start closed in server output.
- If the platform's native top layer is unsupported where we ship, fall back to a positioned element with `inert` on the rest of the page.

## Breaks (allowed in the free window)

- The Web PORT's patch application gains a focus step.
- New primitives `dialog` and `popover` on all targets, with `dismiss` events.
- The kit gains focus and keyboard vectors.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../decisions.md) I11 to I15. Measured in Chromium 141 only; Firefox and Safari were not run. Support data is from the `web-features` package (3.43.0, 2026-10-16).

**Browsers to name for the overlay primitives: Chrome and Edge 129 or later, Firefox 147 or later, Safari and iOS 26 or later.** That version floor covers `dialog` (Baseline since 2022-03-14, widely available 2024-09-14), `inert` (widely available 2025-10-11), `:focus-visible` (widely available 2024-09-14), `popover` (Baseline "newly available" since 2025-01-27, Chrome 114, Firefox 125, Safari 17, so not yet widely available) and the core of anchor positioning. Anchor positioning as a whole is **not Baseline**: the feature level needs Safari 27 because of `position-visibility` and the `position-anchor` keywords (Chrome 151, Firefox 151, Safari 27), while the core keys (`anchor-name`, `position-area`, `position-try-fallbacks` with `flip-block` and `flip-inline`) are in Chrome 125 to 129, Firefox 147 and Safari 26. Use only that core subset. Where `@supports not (position-area: top)` fails, fall back to the popover's default top-layer placement, or a one-shot script placement with no collision handling, and document it as a limit. `moveBefore` (Chrome 133, Firefox 144, no Safari), `closedby`, `popover=hint` and CloseWatcher are optional enhancements only. Measured: with `position-try-fallbacks: flip-block` an anchored popover near the bottom of a 400 px viewport flips above its anchor (top 188, bottom 340) and does not flip when there is room; `flip-inline` moves it to the left near the right edge; when there is no room either way, flipping does not help and the popover overflows, so give it a `max-height` or a third fallback.

**Typing after `moveBefore` is not a documented Chromium decision; it is a gap the DOM specification does not cover.** The `moveBefore` algorithm preserves "state associated with" the moved node and never mentions focus, selection, caret or editing; whatwg/dom issue 1255 lists "Handling things like focus/selection properly" as an unresolved item. Re-tested in Chromium 141: after moving the row that holds the focused input, `activeElement` stays but the selection reads 0,0 and typed keys insert nothing (`keydown` fires, no `beforeinput`). Recovery works with `setSelectionRange` (even to the same values, 0,0), with a click, or with `blur()` then `focus()`; **`focus()` on the already-focused element does not**. Textarea and contenteditable behave the same, and a number input (which has no selection API) is fixed by `blur()` then `focus()`. A second move kills typing again, and the selection must be saved **before** the move because it reads 0 afterwards. Input-method commits through `Input.insertText` still work; real composition was not tested. In one layout typing survived the move, so the symptom cannot be feature-detected. **The PORT recipe:** before applying patches save the focused node's key and `selectionStart`, `selectionEnd` and `selectionDirection`; afterwards, if the same node is the active element call `setSelectionRange(start, end, direction)`, or `blur()` then `focus()` where there is no selection API; if it is not the active element, `focus()` it then restore. Do this on the `insertBefore` and the `moveBefore` paths alike.

**Scroll locking: `showModal()` does not lock the document's scrolling.** It makes the rest of the page inert, which stops nested scrollers, but the root scroller still scrolls (wheel over the backdrop moved the document from 0 to 300; PageDown to 825). The recipe: `html:has(dialog:modal) { overflow: hidden }`, `html { scrollbar-gutter: stable }` (without it the page shifts 15 px when the scrollbar disappears) and `dialog { overscroll-behavior: contain }` for a scrollable dialog (otherwise a scroll at its end chains to the document). `overscroll-behavior` is flagged **not Baseline** in `web-features` (changed to false on 2026-04-28 because it "does not work consistently" when a container has no overflow; no Safari version is listed), so use it only on containers that really scroll. `scrollbar-gutter` is newly available (Safari 18.2). iOS Safari's rubber-band scrolling was not tested. On the Desktop the layer already blocks input behind it; the PORT only has to stop forwarding scroll deltas to areas behind the layer (not tested).

**Touch: hover is never delivered by touch, and `pressed` must not depend on hover.** `@media (hover: hover)` describes the primary input and `(any-hover: hover)` any input; MDN notes that "many mobile devices emulate hovering when the user performs an inconvenient long tap" and that on a touchscreen `:hover` "might never match, match only for a moment after touching an element, or continue to match even after the user has stopped touching". Measured with touch emulation: after a tap, `:hover` **stays on the button until a tap elsewhere** (sticky hover) and `:active` was gone by 500 ms; a rule inside `@media (hover: hover)` correctly did not apply on touch. The rule for the style contract's hooks: `hovered` styling applies only inside `@media (any-hover: hover)` (so a laptop with a touchscreen keeps mouse hover) and the PORT ignores hover after a touch pointer by tracking `pointerType`; `pressed` is `:active`, works for every pointer type and gets visible feedback that needs no hover; no meaning is ever conveyed by hover alone. A device that reports `hover: none` and `any-hover: hover` could not be emulated and needs real hardware (an iPad with a mouse, a Surface); press timing on real touch is also unmeasured.

**A host request to focus a node by key is a call on the PORT, not a command.** Focus is not application state (section 2 already restores it after a patch in the same place), and an effect that runs after render is timing-dependent, so [Bet 8](state-units.md)'s Effect form is not used for it. The PORT offers `focus(key)`, which the host (Valance's `connect`) calls after it has applied the patch that created or kept the node; the PORT focuses the node if the key exists and reports nothing if it does not. [Bet 11](forms.md) uses it for the first invalid field. This is a design decision, not a research result.

## Open questions for stage 3

- **Firefox and Safari behavior** of the overlays, focus restoration and anchored popovers was not run; only Chromium was available.
- **Real input-method composition** after a move, and iOS Safari's rubber-band scrolling behind a modal.
- **Hybrid devices** (`hover: none` with `any-hover: hover`) and real touch press timing need hardware.
- **Tooltips and menus** after the keyboard tables exist.
