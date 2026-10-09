<h1 align="center">
  <img src="docs/assets/valance-logo.svg" alt="Valance logo" width="120"><br>
  Valance
</h1>

<p align="center">
  Build web apps in TypeScript where one state drives the whole screen.<br>
  Write it once. Run it in the browser, render it on the server, test it without either.
</p>

<p align="center">
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="#learning-path"><strong>Learn</strong></a> ·
  <a href="docs/use/README.md"><strong>API reference</strong></a> ·
  <a href="https://github.com/ValanceX/Valance/issues">Report an issue</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@valancex/valance"><img src="https://img.shields.io/npm/v/@valancex/valance?color=7C5CFF" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@valancex/valance"><img src="https://img.shields.io/npm/l/@valancex/valance" alt="license"></a>
  <img src="https://img.shields.io/node/v/@valancex/valance" alt="node version">
</p>

<hr>

> Valance is pre-1.0. The API may change between minor releases; every change is listed in the [release notes](docs/releases/).

## Quick start

Build a counter and run it in your browser in about five minutes.

### Prerequisites

- [Node.js](https://nodejs.org) 22 or newer
- [pnpm](https://pnpm.io/installation)

### 1. Install

```console
$ mkdir my-app && cd my-app
$ pnpm init && pnpm pkg set type=module
$ pnpm add @valancex/valance @valancex/nexus@^0.12.0 @valancex/mesh-runtime@^0.10.0 @valancex/port-web@^0.4.0 effect@^3.10.0
$ pnpm add -D @valancex/mesh-compiler@^0.10.0 vite typescript
```

### 2. Describe the screen

**`counter.mprx`** is what the user sees:

```
<page>
  <text>Count: {count}</text>
  <button on.click={increment()}>Add one</button>
</page>
```

**`components.json`** lists the tags the screen may use. (It is written by hand here to keep the first example small. In a real application you do not write it: [`manifest`](docs/learn/README.md#common-tasks) derives it from your primitives, scopes and commands, as in [`examples/docs-site`](examples/docs-site).) `counter` is the screen itself: it reads `count` and runs `increment`.

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

### 3. Compile the screen

**`build-views.js`** checks the screen and turns it into JSON. If something is wrong, you find out here, not in the browser.

```js
import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync, writeFileSync } from "node:fs";

const built = await compileProgram({
  model: { manifest: readFileSync("components.json", "utf8"), path: "components.json" },
  root: "counter",
  components: [{ component: "counter", source: readFileSync("counter.mprx", "utf8"), path: "counter.mprx" }],
});

if (built.program === undefined) throw new Error(JSON.stringify(built.assembly ?? built.components, null, 2));
writeFileSync("counter.program.json", JSON.stringify(built.program));
```

### 4. Write the app

**`main.ts`**:

```ts
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { Schema } from "effect";
import program from "./counter.program.json";

const State = Schema.Struct({ count: Schema.Number });

const app = Valance.define({
  name: "counter",
  state: { schema: State, initial: { count: 0 } },
  views: { counter: { program, scope: ({ count }) => ({ count }) } },
  view: () => "counter",
  commands: (state) => {
    const command = Valance.command(state);
    return {
      increment: command((current) => ({ count: current.count + 1 })),   // the screen's increment() runs this
    };
  },
});

await init(wasmUrl);
await Web.run(app, {
  container: document.getElementById("root")!,
  primitives: {
    page: { element: "main" },
    text: { element: "p" },
    button: { element: "button", events: { click: { type: "click" } } },
  },
  present: "mount",
});
```

**`index.html`**:

```html
<div id="root"></div>
<script type="module" src="/main.ts"></script>
```

### 5. Run

```console
$ node build-views.js && pnpm vite
```

Open the URL Vite prints and click **Add one**. 🎉 You've built your first Valance app.

## Learning path

Follow these in order. Each one builds on the last.

| | Step | You'll learn |
|---|---|---|
| **1** | [Your first application](docs/learn/first-application.md) | The counter above, line by line, plus running it on a server and in tests |
| **2** | [State, views and events](docs/learn/state-views-events.md) | A two-screen inbox: switching screens, commands that take input, URLs |
| **3** | [Async work](docs/learn/async-work.md) | Waiting for data, loading and failure as state, cancelling, ignoring out-of-date answers |
| **4** | [Startup work](docs/learn/startup-work.md) | Work the application starts by itself, and how its failures show |
| **5** | [Mounting and hydration](docs/learn/mounting-and-hydration.md) | Drawing the application, taking over server HTML, what a server render does |
| **6** | [Common tasks](docs/learn/README.md#common-tasks) | Recipes: adding screens and commands, syncing the URL, server rendering |
| **7** | [API reference](docs/use/README.md) | Every export, by name |
| **8** | [The contract](docs/V1_CONTRACT.md) | Exact behavior, lifecycle and error handling, for when you need to be sure |

**Going deeper:** [how Valance is built](docs/understand/README.md) covers the architecture and design decisions. You don't need it to build apps.

## Examples

- [`examples/docs-site`](examples/docs-site): a real, runnable app on the **published** package: a documentation site with links, a search box (a command that waits), URLs and document titles, server rendering and hydration. Start here.
- [`examples/tracer-web`](examples/tracer-web): VALANCE's contract test suite (lifetimes, hydration, history, failure), with small fixture apps. It is the evidence behind the contract, not a model application.

## Releases

Release notes for every version are in [`docs/releases/`](docs/releases/).

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/ValanceX/Valance/issues). To work on Valance itself:

```console
$ pnpm install && pnpm build && pnpm typecheck && pnpm test
$ pnpm test:browser          # Chromium via Playwright
```

## License

[MIT](packages/valance/package.json)
