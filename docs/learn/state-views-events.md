# State, views and events

[Your first application](first-application.md) had one view. This page uses a small inbox, with a list and a message, to show how state, views and events fit together. The whole example is in [`examples/tracer-web/src/inbox/`](../../examples/tracer-web/src/inbox/).

## State is the truth

```ts
const AppState = Schema.Struct({ open: Schema.String, messages: Schema.Array(Message) });
```

`open` is the id of the open message (`""` for none). *Which message is open* is a fact about the application, so it lives in state, not in the screen and not in the URL. Everything else is derived from state.

Two rules follow:

- State changes only through commands. Nothing that draws or follows the URL writes to it.
- Reading state (`application.state`) is just a read. It starts nothing and nobody has to show it.

## A view is a function of state

```ts
views: {
  list:    { program: programs.list,    scope: ({ messages }) => ({ title: "Inbox", unread: …, items: … }) },
  message: { program: programs.message, scope: (state) => ({ title: "Message", subject: …, body: … }) },
},
view: (state) => opened(state) === undefined ? "list" : "message",
```

Three separate questions, three places:

| Question | Answered by |
|---|---|
| Which view is current? | `view(state)`: here, the message view when one is open, otherwise the list |
| What values does that view show? | that view's `scope(state)` |
| What does it look like? | that view's description (`program`) |

You never "navigate to" a view. You change state, and the current view follows. The list and the message are one application, and its state survives moving between them.

VALANCE decides one thing for you: whether the new screen **continues** the old one. Same view, new data: the screen is *updated*. Different view: it is *drawn afresh*. The decision is made from the view's name alone. (Which parts of the screen an update keeps is decided below VALANCE; see [Contract §5](../V1_CONTRACT.md#5-views-and-presentation).)

## An event runs a command

In the list's description:

```
<button on.click={open(m.id)}>Open</button>
```

`open(m.id)` names a command. The application has a command with that name:

```ts
commands: (state) => {
  const command = Valance.command(state);

  return {
    open: command(
      Schema.Struct({ open: Schema.String }),
      ({ open }, current) => ({ open, messages: current.messages.map((m) => m.id === open ? { ...m, read: true } : m) })
    ),
    star: command((current) => ({ ...current, messages: current.messages.map((m) => m.id === current.open ? { ...m, starred: !m.starred } : m) })),
  };
},
```

So a click goes:

1. The person clicks *Open* on a row. The screen reports the event with its argument (`m.id`).
2. VALANCE finds the command named `open` and runs it. The argument fills the command's input: the first argument is the first field, so the input is `{ open: id }`.
3. The input is checked; the command computes the next state.
4. State is committed. `view(state)` is now `"message"`, so the screen redraws as the message.

The name is the contract between a description and the application: the `open` in the description is the command `open`. If the description uses a name the application has no command for, the application does not start (`ConformanceViolation`, Contract §2). Two views that both use `star()` run the same command.

From outside the screen (a test, a host page, the browser's Back button) the same command is reached as `"app/open"`: `"app/"` and its name. There is one way into behavior.

## When an event's input needs adapting

Sometimes several events should run one command with different inputs, or an input should be a constant. Then you tie an exact `"component/name"` key to the command with `Valance.entry`, which says how the event's arguments become its input. The example inbox ([`examples/tracer-web/src/inbox/`](../../examples/tracer-web/src/inbox/)) uses one transition, `enter`, for opening, closing and going Back:

```ts
const enter = command(Schema.Struct({ open: Schema.String }), ({ open }, current) =>
  ({ open, messages: current.messages.map((m) => m.id === open ? { ...m, read: true } : m) }));

return {
  "list/open":     Valance.entry(enter, (open) => ({ open })),   // the click's argument becomes the input
  "message/close": Valance.entry(enter, () => ({ open: "" })),   // a constant: closing "opens" nothing
  "app/navigate":  Valance.entry(enter, (navigation) => navigation),   // an object from the URL (see below)
};
```

An exact key wins over a bare name for that event, so an entry can also give one view different behavior for a name the others share. `"app/navigate"` is explicit because the URL supplies a single object, and a single object is not unpacked into fields. You do not need entries for ordinary commands: a command named after its event, taking its arguments in order, is the normal form above.

## URLs are the application's decision

```ts
const urlOf   = ({ open }) => open === "" ? "/inbox" : `/inbox?open=${encodeURIComponent(open)}`;
const stateOf = (url: URL) => ({ open: url.searchParams.get("open") ?? "" });

Web.run(app, { container, primitives, present: "mount", history: { window, urlOf, stateOf, navigate: "app/navigate" } });
```

State becomes a URL with `urlOf`; the browser's Back and Forward become a command (`"app/navigate"`) with what `stateOf` read. VALANCE has no router: it moves the URL when your state's URL changes and runs your command when the browser goes back.

## What to take away

- One state; commands write it; views read it.
- `view(state)` picks the view; `scope(state)` feeds it; the description draws it.
- Events run commands by name; the same names are open to anything outside the screen.
- The application is data, so the same definition runs in a page, on a server, or in a test.
- A command can wait. Its progress is state like any other: see [Async work](async-work.md) and [Startup work](startup-work.md).

Exact rules for each of these are in the [API reference](../use/README.md) and the [contract](../V1_CONTRACT.md). How VALANCE is built, and the evidence for these rules, is in [Understand](../understand/README.md).
