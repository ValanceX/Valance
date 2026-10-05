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

An exact key wins over a bare name for that event, so an entry can also give one view different behavior for a name the others share. `"app/navigate"` is how this example hands history an adapted binding; if the navigate command simply takes what `stateOf` reads as its input, you do not need an entry at all (see *URLs* below). You do not need entries for ordinary commands: a command named after its event, taking its arguments in order, is the normal form above.

## URLs are the application's decision

```ts
const urlOf   = ({ open }) => open === "" ? "/inbox" : `/inbox?open=${encodeURIComponent(open)}`;
const stateOf = (url: URL) => ({ open: url.searchParams.get("open") ?? "" });

Web.run(app, { container, primitives, present: "mount", history: { window, urlOf, stateOf, navigate: "app/navigate" } });
```

State becomes a URL with `urlOf`; the browser's Back and Forward become a command with what `stateOf` read. VALANCE has no router: it moves the URL when your state's URL changes and runs your command when the browser goes back.

**Naming the navigate command.** The simplest form: `navigate` is a bare command name, and the object `stateOf` returns **is that command's input**:

```ts
const enter = command(Schema.Struct({ open: Schema.String }), ({ open }, current) => ({ ...current, open }));
// commands: { enter, … }       history: { window, urlOf, stateOf, navigate: "enter" }   with   stateOf = (url) => ({ open: … })
```

No adapter is needed. The input is checked by the command's schema like any other. (The inbox above passes an exact key, `"app/navigate"`, which is the form for a command whose arguments need adapting.)

**A link is a destination.** Put `Web.link` in your `primitives` and write `<link href={…}>` in the view description. A click on it is the same request as the browser going to that URL: your navigate command runs with what `stateOf` reads from the `href`. You write no event, no command and no `preventDefault`, and a Ctrl-click, a middle click, `target="_blank"` or a link to another site still does what the browser does. A plain click also starts the new page at the top, as a page load does, and the browser's Back and Forward restore the position they left. Without `history`, the link is a plain anchor and loads the page.

**The title** is not part of a view: it lives in the document's head. Give history a function and it keeps `document.title` in step with the state, Back and Forward included: `history: { …, titleOf: (state) => state.page === "home" ? "Docs" : `${titleOfPage(state)} · Docs` }`. The server's document writes the same function's result for the state it rendered, so the first paint already has the right title and hydration does not touch it.

## Repeated and conditional parts (provisional)

A list of items and a part that shows only sometimes are written in the view description with two reserved tags. They are MESH's, and MESH calls their spelling provisional: they have not changed since they were introduced (MESH 0.7, through 0.9), but they are not promised.

```
<mesh-each items={nav} as="n" key={n.id}>      repeat the child for each item; `key` is the item's identity
  <item><link href={n.href}>{n.label}</link></item>
</mesh-each>

<mesh-if when={search.status == "failed"}>      one child: shown when `when` is true
  <text>Search failed</text>
</mesh-if>
```

- **`key` is the identity.** An item keeps its on-screen element through reordering and removal; an item that leaves and returns is new. A `mesh-each` without a `key` is refused when the view is compiled.
- **`mesh-if` has one or two children, by position**: the first when `when` is true, the second when it is false. With one, a false `when` shows nothing. A `mesh-if` may not be a *direct* child of another; wrap the inner one in an element.
- **`when` and `items` are ordinary expressions** over what `scope` supplies: `search.status == "failed"`, `code != ""`, `!loading`. There is no length operator, so "the list is empty" is a value your `scope` computes.
- You declare nothing else: the compiler is told these tags for you.

## What to take away

- One state; commands write it; views read it.
- `view(state)` picks the view; `scope(state)` feeds it; the description draws it.
- Events run commands by name; the same names are open to anything outside the screen.
- The application is data, so the same definition runs in a page, on a server, or in a test.
- A command can wait. Its progress is state like any other: see [Async work](async-work.md) and [Startup work](startup-work.md).

Exact rules for each of these are in the [API reference](../use/README.md) and the [contract](../V1_CONTRACT.md). How VALANCE is built, and the evidence for these rules, is in [Understand](../understand/README.md).
