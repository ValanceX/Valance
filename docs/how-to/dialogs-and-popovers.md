# Dialogs and popovers

> **TL;DR:** Show a dialog or a popover above the page. The application owns whether each is open, with a boolean in its state.

## Prerequisites

* An application with a view and commands: [Your first application](../tutorials/01-first-application.md).

---

A **layer** is something drawn above the page. There are two, and the application owns whether each is shown: a boolean in its state, `open`.

## A dialog

```mprx
<button id="delete" on.click={ask()}>Delete</button>
<dialog open={confirming} label="Delete this order?" on.dismiss={cancel()}>
  <text>This cannot be undone.</text>
  <button on.click={cancel()}>Keep it</button>
  <button on.click={remove()}>Delete for good</button>
</dialog>
```

`open` and `label` are required: a dialog without a name is an error. While `confirming` is true the dialog is **modal**: what is behind it cannot be reached or scrolled, focus goes into it and stays there (Tab and Shift+Tab wrap), and when it closes focus goes back to what had it before (the button that opened it, found by its key; if that is gone, the dialog's parent).

The person asking to close it (Escape, or a press outside it) does **not** close it. The dialog raises `dismiss`, with the reason `escape` or `outside` as its text, and the application decides: `cancel()` above sets `confirming` to false, and only then does it close. An application that ignores `dismiss` keeps the dialog open (a browser closes a `<dialog>` on Escape by itself; the PORT opens it again). The Web draws it as `<dialog>` and shows it with `showModal()`; the page is first sent with `open` written, so it is on the screen before any script runs, and the browser then makes it modal. The window draws it with egui's `Modal`.

## A popover

```mprx
<button id="more" on.click={toggleMenu()}>More</button>
<popover open={menu} anchor="more" placement="bottom" on.dismiss={toggleMenu()}><text>Archive</text></popover>
```

A popover is not modal: the page behind it works. `open` is all it needs; the rest places it. `anchor` is the `id` of the element it sits against (a `button` has one on every target), `placement` is `top`, `bottom`, `start` or `end`, and `mode` is `auto` (the default: Escape or a press outside raises `dismiss`) or `manual` (never). Without an `anchor` it is placed in the middle of the window. On the web the placement is CSS anchor positioning; a browser without it shows the popover where it puts it.

## One modal at a time

A dialog inside a dialog is refused: `vlx` reports `nested-modal` where one template writes it, and the PORT refuses it, with the same words, where a component draws it inside another (the server's page, or the browser's, is not drawn). Put the two side by side, or open one after the other. A popover inside a dialog is fine.

## Renamed

A popover's `mode` was called `kind` before the first release; the word is the input type of a `textfield`. `vlx` says so where a template still writes it: `` `kind` on `popover` is now `mode` ``.

## Scrolling

While a modal is open the page behind it does not scroll and its scrollbar keeps its width (`html:has(:modal)`), and a scrollable dialog does not pass its scroll on to the page (`overscroll-behavior: contain`). These rules are in the library layer of the stylesheet `vlx` writes.

## Where it differs on the window

The window has no `popover` attribute and no top layer: a popover is an area at its anchor's rectangle of the last frame, and an anchor that is not on screen puts it in the middle. A `mode="auto"` popover is dismissed by a press outside it, or Escape. Focus return uses the same rule as the web.

## Making a primitive of your own a layer

An application never writes this. Someone writing a primitive for the web marks it as a layer in its web table with `layer`, `layerProp` and `layerDismiss`.

## Requirements

Needs PORT 0.12. With an older PORT the two tags are not in the table, and a template that writes them is told so.

## Next steps

* [Forms](forms.md): a form inside a dialog.
* [Primitives](../reference/primitives.md): every prop of `dialog` and `popover`.
