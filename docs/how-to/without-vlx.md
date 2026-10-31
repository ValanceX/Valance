# Without `vlx`

> **TL;DR:** Use the engine directly, with no command line: describe a view, compile it, define the application and run it in a page, on a server or headless. This is the route for embedding VALANCE in a page or a program you already have.

## Prerequisites

* Node.js and a package manager.
* Some TypeScript.

---

> Building a site or a desktop application? Start with the [tutorials](../tutorials/README.md) instead. `vlx` writes the compile step, the manifest, the browser entry and the server that this page writes by hand. This page is the explicit, lower tier underneath, for when you host the application yourself.

A counter: one view, one number, one command. It runs in a browser page, renders as HTML on a server, and can be driven headless. Install the packages listed in [Installation](../reference/v1-contract.md#13-installation-and-package-surface). The list includes a few packages VALANCE is built on: a strict package manager needs you to declare them, but nothing on this page requires you to learn them.

## 1. Describe the view

A view description says what the view looks like and which command an event runs. `counter.mprx`:

```
<page>
  <text>Count: {count}</text>
  <button on.click={increment()}>Add one</button>
</page>
```

It may only use building blocks the application declares, and say which values and commands each has. You do not write that declaration: `manifest` (from `@valancex/valance/web/build`) derives it from three things the application states anyway. Write them once, in one file the build and the page both import (`counter.ts`):

```ts
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Schema } from "effect";

// Which page element each building block becomes (it belongs to where the application is drawn, not to the application).
export const primitives: Web.WebPrimitives = {
  page: { element: "main" },
  text: { element: "p" },
  button: { element: "button", events: { click: { type: "click" } } },
};

// What the view may read: `counter`'s scope.
export const CounterScope = Schema.Struct({ count: Schema.Number });

// What the view may run: the command table. `define` takes this same function (step 3).
export const commands = (state: Valance.StateHandle<{ readonly count: number }>) => {
  const command = Valance.command(state);

  return { increment: command((current) => ({ count: current.count + 1 })) };
};
```

`counter` is the view itself: its `scope` is the values the description may use (`count`), and its `commands` are the ones it may run (`increment`).

> **Aside: the manifest by hand.** `manifest` returns the declaration MESH checks templates against, as data (`components.json`, manifest format 1). For the counter it is the file below. Writing it yourself is possible, and shows what is derived, but a hand-written file can drift from the primitives and commands; derive it. ([Contract §15.1](../reference/v1-contract.md#151-the-manifest-can-be-derived) says what comes from where; the [docs-site example](../../examples/docs-site) derives its own.)
>
> ```json
> {
>   "version": 1,
>   "types": {},
>   "components": {
>     "page":    { "props": {}, "events": {}, "commands": {}, "scope": {} },
>     "text":    { "props": {}, "events": {}, "commands": {}, "scope": {} },
>     "button":  { "props": {}, "events": { "click": {} }, "commands": {}, "scope": {} },
>     "counter": { "props": {}, "events": {}, "commands": { "increment": { "parameters": [] } }, "scope": { "count": { "kind": "number" } } }
>   }
> }
> ```

## 2. Compile it, before the application runs

```ts
import { compileProgram } from "@valancex/mesh-compiler";   // build time only
import { manifest } from "@valancex/valance/web/build";
import { readFileSync } from "node:fs";
import { commands, CounterScope, primitives } from "./counter.js";

const derived = JSON.stringify(manifest({ primitives, scopes: { counter: CounterScope }, commands }));

const built = await compileProgram({
  model: { manifest: derived, path: "derived-manifest.json" },
  root: "counter",
  components: [{ component: "counter", source: readFileSync("counter.mprx", "utf8"), path: "counter.mprx" }],
});

if (built.program === undefined) {
  throw new Error(JSON.stringify(built.assembly ?? built.components));   // what is wrong, and where
}
```

`built.program` is the view's description, ready to use. A mistake (an unknown value, a mismatched tag) stops here with a diagnostic, not in a user's browser. See [§15](../reference/v1-contract.md#15-building-a-view-description).

## 3. Define the application

```ts
import * as Valance from "@valancex/valance";
import { Schema } from "effect";
import { commands } from "./counter.js";

const State = Schema.Struct({ count: Schema.Number });

const app = Valance.define({
  name: "counter",
  state: { schema: State, initial: { count: 0 } },
  views: { counter: { program: built.program, scope: ({ count }) => ({ count }) } },
  commands,
});
```

Read it top to bottom: state is `{ count }`, starting at 0. There is one view, `counter`, drawn from `count`; with one view, `view` (which view the state shows) is left out and is that view. A **command** is how the application changes: `increment` takes the current state and returns the next one. Its name is how the screen finds it: the button's `increment()` in the description runs the command called `increment`.

A command that needs input says what it takes (put it in the table in `counter.ts`), and the event's arguments fill it: by name when each is a plain name of a field (`add(amount)`), otherwise in field order:

```ts
add: command(
  Schema.Struct({ amount: Schema.Number }),
  ({ amount }, current) => ({ count: current.count + amount })
),
```

The input is checked before the command runs, so a wrong argument changes nothing. (`Schema` comes from the `effect` package, which VALANCE uses to describe state and input.)

## 4. Run it in a page

```ts
import * as Web from "@valancex/valance/web";
import { primitives } from "./counter.js";

const host = await Web.run(app, { container: document.getElementById("root")!, primitives, present: "mount" });
// the page shows "Count: 0"; clicking "Add one" shows "Count: 1"
// await host.stop();   // ends the screen, then the application
```

`primitives` is the table from step 1: the same one the manifest was derived from.

## 5. The same application, elsewhere

```ts
// On a server: HTML plus the state it was rendered from.
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
const { html, state } = await Effect.runPromise(renderToHtml(app, { primitives }));
// html === '<main><p>Count: 0</p><button>Add one</button></main>'

// Headless: no screen at all. (This form uses Effect directly, as a test or a custom host does; `Web.run` hides it for an ordinary page.)
import { Exit, Scope } from "effect";
const scope = await Effect.runPromise(Scope.make());
const application = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
await Effect.runPromise(application.command("app/increment"));   // from outside the screen: "app/" and the command's name, checked by the type
await Effect.runPromise(application.state);                       // { count: 1 }
// With the `add` command from step 3 in the table, its input is typed from the command:
// await Effect.runPromise(application.command("app/add", { amount: 5 }));   // then the state is { count: 6 }
await Effect.runPromise(Scope.close(scope, Exit.void));           // ends the application
```

A server-rendered page is taken over in the browser with `present: "hydrate"` and the state `renderToHtml` returned (`state` option).

## What you just used

| You wrote | It is | Learn more |
|---|---|---|
| `State` + `initial` | the single state | [Contract §3](../reference/v1-contract.md#3-state-and-commands) |
| `counter.mprx` + `manifest(...)` | a view description and the declaration it is checked against | [Contract §15](../reference/v1-contract.md#15-building-a-view-description) |
| `Valance.command` and the name `increment` | a command, found by its name | [Contract §14](../reference/v1-contract.md#14-authoring-helpers-command-and-entry) |
| `Valance.define` | the application, as data | [Contract §2](../reference/v1-contract.md#2-application) |
| `Web.run` | one page, one lifetime | [Contract §16](../reference/v1-contract.md#16-the-browser-host-webrun) |

## Several views

With `vlx`, pages and the layout decide what is drawn. Here, an application with more than one screen names its views and picks one from state. The whole example is a small inbox, with a list and a message, in [`examples/tracer-web/src/inbox/`](../../examples/tracer-web/src/inbox/).

### A view is a function of state

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

VALANCE decides one thing for you: whether the new screen **continues** the old one. Same view, new data: the screen is *updated*. Different view: it is *drawn afresh*. The decision is made from the view's name alone. (Which parts of the screen an update keeps is decided below VALANCE; see [Contract §5](../reference/v1-contract.md#5-views-and-presentation).)

### An event runs a command

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

### When an event's input needs adapting

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

### URLs are the application's decision

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

### A text field

A text field is a primitive too. Put `Web.textField` in your `primitives` and write `<field value={query} on.input={search($event)} />`: the box shows the application's `query`, and what the person types arrives as a string. The box always shows what the state says: if a command resets the query (the reader went to another page), the box empties; if a command declines an edit, the next time the screen is redrawn it shows the application's value again. The server writes the value into the page, so a reload keeps it.


## Engine tasks

| Task | How | Reference |
|---|---|---|
| Run in a page | `Web.run(app, { container, primitives, present: "mount" })` | [§16](../reference/v1-contract.md#16-the-browser-host-webrun) |
| Add a view | Add an entry to `views` and have `view(state)` return its name | [§5](../reference/v1-contract.md#5-views-and-presentation) |
| Add a command | Name it in `commands`: `increment: command((state) => nextState)`, or with input `command(Schema.Struct({…}), (input, state) => nextState)` | [§14](../reference/v1-contract.md#14-authoring-helpers-command-and-entry) |
| Reuse one command for several events, with a constant or a different input | An exact `"component/name"` key with `Valance.entry` | [Several views](#when-an-events-input-needs-adapting), [§14](../reference/v1-contract.md#14-authoring-helpers-command-and-entry) |
| Run a command from outside the screen (a test, a host page) | `application.invoke("app/name", args)` | [§2](../reference/v1-contract.md#2-application), [§3](../reference/v1-contract.md#3-state-and-commands) |
| Read the state | `yield* application.state` | [§3](../reference/v1-contract.md#3-state-and-commands) |
| Compile view descriptions | `compileProgram(...)` at build time | [§15](../reference/v1-contract.md#15-building-a-view-description) |
| Wait for data in a command | `command.waiting(input, { begin, work, wanted, settle })` (added in 0.5.0): `begin` commits `loading`, `settle` commits `ready` / `failed`. The general NEXUS form is for typed failures | [Async work](async-work.md), [§18.3](../reference/v1-contract.md#183-a-command-that-waits-commandstatewaiting) |
| Run something once when the application starts | `start: "startup"`, the name of an ordinary command | [Startup work](startup-work.md), [§18](../reference/v1-contract.md#18-asynchronous-work-and-start-time-work) |
| Ignore an out-of-date answer | With `waiting` it is built in: a newer run supersedes an older one, and `wanted` drops an answer the state no longer waits for. In the general form, keep a request counter | [Async work](async-work.md#when-an-answer-arrives-late) |
| Show a failure from background work | Commit it as state; nobody is waiting to be told | [Async work](async-work.md#failure-and-who-sees-it) |
| Give commands a service (an API client, a clock) | Declare a capability, supply it in a `platform` passed to `start` | [Async work](async-work.md#using-a-service-the-platform-provides), [§4](../reference/v1-contract.md#4-capabilities-and-resources) |
| Keep a resource past one command | Acquire it into the application's lifetime through the platform | [Async work](async-work.md#long-lived-resources) |
| Make URLs follow state | `history` option of `Web.run`, with `urlOf` / `stateOf`; add `titleOf` for the document title and `container` so link clicks navigate | [§8](../reference/v1-contract.md#8-history) |
| Link to another page | `link: Web.link` in your primitives, then `<link href={…}>` in the view. No event, no command | [§6](../reference/v1-contract.md#6-mounts), [Several views](#several-views) |
| A text box the user types in | `field: Web.textField`, then `<field value={text} on.input={setText($event)} />` (needs PORT Web 0.3.0) | [Several views](#a-text-field), [§6](../reference/v1-contract.md#6-mounts) |
| Not write the MESH manifest | `manifest({ primitives, scopes, commands })` from `@valancex/valance/web/build` | [`examples/docs-site/src/compile.ts`](../../examples/docs-site/src/compile.ts) |
| See a whole application | A documentation site with search, links, titles, SSR and hydration, on the published package | [`examples/docs-site`](../../examples/docs-site) |
| Render on a server, then take over in the browser | `renderToHtml` on the server, then `present: "hydrate"` with the state it returned. Startup work begins during a server render | [Mounting and hydration](mounting-and-hydration.md#server-rendering-and-startup-work), [§17](../reference/v1-contract.md#17-server-rendering-rendertohtml) |
| Show the same application in two places | Several mounts over one application handle | [§6](../reference/v1-contract.md#6-mounts) |
| Recover from a view that failed to draw | Make a fresh mount; a failed one stays inert | [§6](../reference/v1-contract.md#6-mounts), [§10](../reference/v1-contract.md#10-failure-model) |
| Stop the application | Close its Scope (`host.stop()` with `Web.run`) | [§9](../reference/v1-contract.md#9-scopes-and-shutdown) |

## Next steps

* [Async work](async-work.md), [Startup work](startup-work.md) and [Mounting and hydration](mounting-and-hydration.md): waiting, starting and drawing, at this tier.
* [API reference](../reference/api.md): the exact rules for each name used here.
