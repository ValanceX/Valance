# Your first application

A counter: one view, one number, one command. It runs in a browser page, renders as HTML on a server, and can be driven headless. Install the packages listed in [Installation](../V1_CONTRACT.md#13-installation-and-package-surface). The list includes a few packages VALANCE is built on: a strict package manager needs you to declare them, but nothing on this page requires you to learn them.

## 1. Describe the view

A view description says what the view looks like and which command an event runs. `counter.mprx`:

```
<page>
  <text>Count: {count}</text>
  <button on.click={increment()}>Add one</button>
</page>
```

It may only use building blocks the application declares, and say which values and commands each has. That declaration is the component manifest, `components.json`:

```json
{
  "version": 1,
  "types": {},
  "components": {
    "page":    { "props": {}, "events": {}, "commands": {}, "scope": {} },
    "text":    { "props": {}, "events": {}, "commands": {}, "scope": {} },
    "button":  { "props": {}, "events": { "click": {} }, "commands": {}, "scope": {} },
    "counter": { "props": {}, "events": {}, "commands": { "increment": { "parameters": [] } }, "scope": { "count": { "kind": "number" } } }
  }
}
```

`counter` is the view itself: its `scope` is the values the description may use (`count`), and its `commands` are the ones it may run (`increment`).

## 2. Compile it, before the application runs

```ts
import { compileProgram } from "@valancex/mesh-compiler";   // build time only
import { readFileSync } from "node:fs";

const built = await compileProgram({
  model: { manifest: readFileSync("components.json", "utf8"), path: "components.json" },
  root: "counter",
  components: [{ component: "counter", source: readFileSync("counter.mprx", "utf8"), path: "counter.mprx" }],
});

if (built.program === undefined) {
  throw new Error(JSON.stringify(built.assembly ?? built.components));   // what is wrong, and where
}
```

`built.program` is the view's description, ready to use. A mistake (an unknown value, a mismatched tag) stops here with a diagnostic, not in a user's browser. See [§15](../V1_CONTRACT.md#15-building-a-view-description).

## 3. Define the application

```ts
import * as Valance from "@valancex/valance";
import { Schema } from "effect";

const State = Schema.Struct({ count: Schema.Number });

const app = Valance.define({
  name: "counter",
  state: { schema: State, initial: { count: 0 } },
  views: { counter: { program: built.program, scope: ({ count }) => ({ count }) } },
  view: () => "counter",
  commands: (state) => {
    const command = Valance.command(state);
    const increment = command(Schema.Struct({}), (_input, current) => ({ count: current.count + 1 }));

    return { "counter/increment": Valance.entry(increment) };
  },
});
```

Read it top to bottom: state is `{ count }`, starting at 0. There is one view, `counter`, drawn from `count`. The command `increment` takes no input and returns the next state. `"counter/increment"` connects the button's `increment()` in the description to that command.

## 4. Run it in a page

```ts
import * as Web from "@valancex/valance/web";

const primitives: Web.WebPrimitives = {
  page: { element: "main" },
  text: { element: "p" },
  button: { element: "button", events: { click: { type: "click" } } },
};

const host = await Web.run(app, { container: document.getElementById("root")!, primitives, present: "mount" });
// the page shows "Count: 0"; clicking "Add one" shows "Count: 1"
// await host.stop();   // ends the screen, then the application
```

`primitives` says which page element each building block becomes. It belongs to where the application is drawn, not to the application.

## 5. The same application, elsewhere

```ts
// On a server: HTML plus the state it was rendered from.
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
const { html, state } = await Effect.runPromise(renderToHtml(app, { primitives }));
// html === '<main><p>Count: 0</p><button>Add one</button></main>'

// Headless: no screen at all.
import { Exit, Scope } from "effect";
const scope = await Effect.runPromise(Scope.make());
const application = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
await Effect.runPromise(application.invoke("counter/increment", []));
await Effect.runPromise(application.state);                       // { count: 1 }
await Effect.runPromise(Scope.close(scope, Exit.void));           // ends the application
```

A server-rendered page is taken over in the browser with `present: "hydrate"` and the state `renderToHtml` returned (`state` option).

## What you just used

| You wrote | It is | Learn more |
|---|---|---|
| `State` + `initial` | the single state | [State, views and events](state-views-events.md) |
| `counter.mprx` + `components.json` | a view description | [Contract §15](../V1_CONTRACT.md#15-building-a-view-description) |
| `Valance.command` / `Valance.entry` | a command, and its binding to an event | [Contract §14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| `Valance.define` | the application, as data | [Contract §2](../V1_CONTRACT.md#2-application) |
| `Web.run` | one page, one lifetime | [Contract §16](../V1_CONTRACT.md#16-the-browser-host-webrun) |

Next: [State, views and events](state-views-events.md).
