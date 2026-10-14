# The native host protocol (version 1)

A native app is two programs. The **engine** (JavaScript: the application, its state, commands and router) and the **renderer** (native: the window). The renderer starts the engine as a child process and they exchange **one JSON object per line**, the renderer on the engine's stdin and stdout. The renderer never sees a command, a state or a route: only the render tree and the opaque handler identifiers in it, which is all PORT's contract gives a renderer.

## Engine to renderer

| Message | Meaning |
|---|---|
| `{"op":"hello","protocol":1,"app":"todo"}` | First line. A renderer that does not know the protocol number stops. |
| `{"op":"draw","tree":RenderTree}` | A different screen: draw it afresh. |
| `{"op":"update","tree":RenderTree}` | The same screen with new data: reconcile by `key`. |
| `{"op":"unmount"}` | The screen is gone (the application is closing). |
| `{"op":"closeAnswer","allowed":true\|false}` | The answer to `closeRequested`. When allowed the engine is ending and `unmount` follows; when not (unsaved edits), the window stays open. |

`RenderTree` is MESH's `mesh-render` format: nodes `{type:"node", component, key, props, events, children}` and `{type:"text", key, text}`. `events` maps an event name to an opaque handler identifier.

## Renderer to engine

| Message | Meaning |
|---|---|
| `{"op":"event","handler":"…","payload":JSON}` | The person did something. `handler` is copied from the tree; `payload` (optional) is the event's value, plain data. |
| `{"op":"close"}` | The window closed. The engine closes the application and exits. (The renderer's stream ending means the same.) |
| `{"op":"closeRequested"}` | The person asked to close the window. The renderer cancels the close and waits for `closeAnswer`: the application decides (`router.mayLeave`). |
| `{"op":"ready"}` | Accepted and ignored in version 1. |

The engine treats the renderer as a separate program: a line over 64 KiB, a line that is not JSON, an unknown `op`, a handler that is not text, or a payload that is not plain data (deeper than 8, a non-finite number, `__proto__`) is ignored, and counted.

## The screen vocabulary

The application's own (`src/vocabulary.ts`): `window{title}`, `column`, `row`, `heading`, `text`, `button{disabled?}` with `press`, `checkbox{checked}` with `toggle`, `field{value, placeholder?}` with `change` (payload: the text). A renderer draws these and surfaces any component it does not know rather than dropping it.
