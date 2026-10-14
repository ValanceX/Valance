# The host protocol, from the engine's side

The window is the **Desktop PORT** ([`valancex-port-desktop`](https://github.com/ValanceX/Port/tree/main/packages/port-desktop)), and the protocol between an engine and a PORT is specified there: [the architecture note](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-10-14-port-desktop.md#the-host-protocol). This page is what is specific to the engine in this example (`src/host.ts`).

One JSON object per line over the engine's stdin and stdout. The engine sends `hello`, `title`, `draw`, `update`, `unmount` and `closeAnswer`; it reads `event`, `closeRequested` and `close` (and accepts `ready`, ignored in version 1).

## What the engine does with what it reads

The renderer is a separate program, so nothing it sends is trusted until it has the shape of a message (`parseInbound`):

| Refused (ignored, and counted in the result of `serve`) | Limit |
|---|---|
| a line that is not JSON, or not a message | |
| a line longer than | 64 KiB |
| an `event` whose `handler` is not text, or is longer than | 256 characters |
| a `payload` deeper than | 8 levels |
| a payload with a non-finite number or a `__proto__` key | |

`closeRequested` is answered by `closeAnswer`: the engine asks the router (`router.mayLeave`), so a screen with unsaved edits says no, and the window stays open until they are saved or discarded.

## The vocabulary

`src/desktop-vocabulary.json` is a copy of the PORT's `vocabulary.json` (a test in `native/` holds it to the original); `src/vocabulary.ts` adds this application's screens to it. The components are described in [the desktop vocabulary](../../docs/use/desktop-vocabulary.md).
