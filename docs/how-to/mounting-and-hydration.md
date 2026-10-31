# Mounting and hydration

> **TL;DR:** Draw a running application somewhere, take over HTML a server rendered, and know what a server render starts.

## Prerequisites

* An application definition: [Your first application](../tutorials/01-first-application.md).

---

An application can run with no screen at all. A **mount** is one drawing of it somewhere, kept up to date. You can have none, one or several over one application.

```ts
const mounted = yield* Valance.mount(application, Web.target({ container, primitives }));
```

Most pages use `Web.run`, which starts the application and mounts it for you ([Your first application](../tutorials/01-first-application.md#4-run-it-in-a-page)). `mount` and `hydrate` are what it does underneath, and what you use for several mounts or a custom target.

## What a mount does

1. **Draws** the application's current view once.
2. **Follows** the state: when it changes, the mount shows the latest state. Same view, new data: the screen is *updated*; a different view: *drawn afresh*.
3. **Reports** what the person does. A click runs the command the view says, as application work (it belongs to the application, not to the mount).

A mount shows the **latest** state it can, not every state. If five commits land before it draws, it draws the fifth. The application's state is always right; the screen may be one step behind and never shows states out of order.

Taking the screen away (closing the mount) stops showing and reporting. It does not stop the application or any work it is doing.

## What `Mounted` tells you

`mount` returns a `Mounted`. You can ignore it. If you need it:

| Member | What it is for |
|---|---|
| `followed` | Completes when this mount stops following, and says why: the application ended, a state could not be drawn, or the mount was closed. |
| `settled` | Waits for the commands this mount's events started to finish (for a test or a shutdown). |
| `dispatched` | A record of how each of those commands ended, including failures. It is for hosts and tests to observe, not something an application builds behavior on. |

Three different things, kept apart: *draw* (showing a state), *follow* (keeping up with changes), and *dispatch* (an event running a command). A mount that cannot draw a state stops following and stays on its last good screen; recovery is a fresh mount.

## Hydrating

A server can send ready-made HTML so the page shows something before any code runs. The browser then **hydrates**: it takes over that markup with its own render, so the same elements become live.

```ts
const host = await Web.run(app, { container, primitives, present: "hydrate", state });
```

`state` is what the server rendered from, carried in the page. It is the application's state **without its secrets**: a top-level field typed `Schema.Redacted` (or `NullOr` of one) is never embedded, and the browser starts it at the default the field declares. A secret field must have a default, and no view may read it (`vlx check` reports `redacted-no-default` and `redacted-in-view`), so the page the browser draws is the page the server wrote. Only top-level fields are masked: a Redacted inside a sub-struct, an array or a state schema that is not a plain struct is refused by `vlx check` (`redacted-unmaskable`). The default of `Schema.Redacted(S)` is written as the plain encoded value (`"secret"`), the default of `Schema.RedactedFromSelf(S)` as a `Redacted` (`Redacted.make("secret")`); the state is decoded as given. Everything else in the state is readable by anyone who can read the page. If the markup does not match what the browser renders, that is not an error: the browser draws its own version and tells you through `hydration`. After the first draw, a hydrated mount behaves exactly like any other.

## Server rendering and startup work

On a server, `renderToHtml` starts the application, renders the current view once as HTML, and ends it:

```ts
const { html, state } = await Effect.runPromise(renderToHtml(app, { primitives }));
```

Because it starts the application, **startup work begins**. What happens next:

- Rendering does **not** wait for it. The HTML is rendered from the state at that moment, which is normally the starting state.
- When rendering ends, the application ends, and any startup work still waiting is **interrupted**. A slow load is cancelled, not awaited.
- If startup work commits after the render has read the state but before `renderToHtml` returns, the returned `state` is newer than the `html`. The browser then hydrates that `html` with that `state`; as above, that is a redraw, not a failure. (So a startup command that checks the state at the browser sees `ready`, and does nothing.)
- Nothing is skipped for you. If the work should not run on a server, decide in the command from state or from what the platform offers (a server platform that provides no such capability makes the command fail harmlessly):

```ts
Effect.flatMap(state.get, (current) => current.phase === "loading" ? fetchProfile("me") : Effect.void)
```

This is how it is today, explained rather than changed. See [Contract §17](../reference/v1-contract.md#17-server-rendering-rendertohtml).

## Exact rules

[Contract §6](../reference/v1-contract.md#6-mounts), [§7](../reference/v1-contract.md#7-retained-render-and-interaction), [§16](../reference/v1-contract.md#16-the-browser-host-webrun), [§17](../reference/v1-contract.md#17-server-rendering-rendertohtml).

## Next steps

* [API reference](../reference/api.md): the exact rules.
* [Explanation](../explanation/README.md): the reasons.
