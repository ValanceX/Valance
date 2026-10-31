# Your first application

> **TL;DR:** Build a counter from nothing to a working page in about fifty lines: describe the view, compile it, define the application and run it.

## Prerequisites

* Node.js and a package manager.
* Some TypeScript.

---

> This page builds an application from the engines up, with no command line: the route for embedding Valance in an application you already have. To make a site of Markdown pages and components, start with [`vlx init`](../../packages/cli/README.md), which writes the compile step, the manifest and the browser entry you see below for you.

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
| `State` + `initial` | the single state | [State, views and events](02-state-views-and-events.md) |
| `counter.mprx` + `manifest(...)` | a view description and the declaration it is checked against | [Contract §15](../reference/v1-contract.md#15-building-a-view-description) |
| `Valance.command` and the name `increment` | a command, found by its name | [Contract §14](../reference/v1-contract.md#14-authoring-helpers-command-and-entry) |
| `Valance.define` | the application, as data | [Contract §2](../reference/v1-contract.md#2-application) |
| `Web.run` | one page, one lifetime | [Contract §16](../reference/v1-contract.md#16-the-browser-host-webrun) |

Next: [State, views and events](02-state-views-and-events.md). Later: [Async work](../how-to/async-work.md), [Startup work](../how-to/startup-work.md), [Mounting and hydration](../how-to/mounting-and-hydration.md).

## Next steps

* [State, views and events](02-state-views-and-events.md): the same ideas with two views.
