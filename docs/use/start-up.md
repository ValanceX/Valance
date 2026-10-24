# Start-up and budgets

What a page costs to ship and to start, and how to keep it from growing. Provisional ([API stability](../stability.md)).

## The three sets (Tier 1: nothing to configure)

A built page loads in three sets (decisions W11, W12):

| Set | Contains | Loads |
|---|---|---|
| **Paint** | the server-rendered HTML and the stylesheets it names | with the document; nothing else blocks the first paint, because the page is already whole |
| **Start** | the page's script and the WebAssembly runtime | in parallel, from the first bytes of the document: the head names both (`modulepreload` for the script, and a link the head's shell compiles the module from while it streams), so hydration waits for these two and for nothing else |
| **After start** | every chunk only a dynamic `import()` reaches | once the application is running, at low priority (`admit` puts a program that arrives into the running application) |

`vlx build` prints the sets and what each file costs, in brotli bytes (what travels) beside the raw size:

```
Size report (brotli, what travels):
  start-up (what the page cannot start without): 283.9 kB brotli
    assets/client-D3ujKJRX.js  434.1 kB raw, 98.8 kB brotli
    assets/client-DdkJW0xt.css  8.1 kB raw, 1.5 kB brotli
    assets/mesh-runtime-BHxDKd15.wasm  732.0 kB raw, 183.6 kB brotli
  after-start: nothing (no chunk is loaded after the application has started)
  ok      start-up JavaScript and CSS: 100.3 kB (error above 210.4 kB) (warning above 105.2 kB)
  ok      WebAssembly runtime: 183.6 kB (error above 192.9 kB)
```

`vlx dev` prints none of this and checks no budget: development is quiet and fast (W9).

## Budgets (Tier 2)

With nothing set, a production build is held to the framework's own start-up budgets: a warning when the start-up JavaScript and CSS pass the largest reference application's, an error at twice that, and an error if the WebAssembly runtime grows past its ceiling (it is the same for every application, so its growth is the upgrade's, not yours). To hold your application to its own, in `valance.json`:

```json
{ "name": "Notes", "budgets": [{ "type": "initial", "warning": "150kB", "error": "250kB" }, { "type": "afterStart", "warning": "400kB" }] }
```

A budget is a `type` and a `warning` and an `error` threshold, each in bytes (`150000`), `kB` (1,000 bytes) or `MB`. The types: `initial` (the start-up JavaScript and CSS), `runtime` (the WebAssembly module), `startup` (the whole start-up set), `afterStart`, and `anyChunk` (the largest JavaScript chunk). An error fails the build, after printing the report; a warning prints and passes. The build no longer raises the bundler's chunk-size limit to hide its warning (W14): the budget is the warning.

The framework's own budgets are data, `packages/cli/src/budgets.json`, and the release holds the reference applications to them (`scripts/check-budgets.mjs` over the output of `scripts/measure-footprint.mjs`). A ceiling is the baseline plus 5 percent; **a ceiling raised above that, or above its previous value, needs a size analysis that exists** (W23a), and the check refuses it without. The analysis of the ceilings of this release: `docs/direction/evidence/measurement/size-2026-10-24.md`.

## A tap before the application is ready (Tier 1)

The second or so between the server's HTML being painted and the application starting used to lose a tap: nothing listened yet (measured: 7 of 9 taps in that zone). Every page's head now carries a small script (the same bytes on every page, allowed by hash in the Content-Security-Policy, so no `'unsafe-inline'`) that keeps what a person did there:

* a click on a control, in order (at most 20, none older than 10 seconds when they are replayed);
* Enter and Escape in a text field;
* the text of every field that differs from what the server wrote, and the caret of the focused one.

When the application is ready, **once**, after hydration has kept the server's nodes, the page restores the text and then does each tap at the same node, one at a time, waiting for each command to settle. If hydration drew the page afresh (a mismatch), nothing is replayed. A link is never kept (the browser follows it), and the page says it is not ready: the root carries `data-vlx="starting"` and controls show a busy cursor until it is.

A control that must not be done twice, such as *Pay*, says so (Tier 2, the web only):

```html
<button on.click={pay()} replay="never">Pay</button>
```

A tap on it before the application is ready is dropped, and the control shows `aria-busy` until the application starts. `replay` is `"safe"` (the default) or `"never"`, on `button`, `toggle`, `checkbox` and `radio`. `replay` is a web-only prop, like `class`: a desktop target has no dead zone, and its compile says `unknown-prop` for it, so a project of both targets writes it in the web layout. PORTs do not know any of this: the page dispatches ordinary events.

## Late admission (Tier 2)

```ts
import { admit } from "@valancex/valance";

await Effect.runPromise(admit(handle, "docs", { program, scope }));
```

Puts a program that arrived after the application started under `name` (a view the application already has is replaced, a new name is added). It is held to the invariant `start` holds every view to, that what the program declares is in the command table: if not it fails with the same `ConformanceViolation`, naming the view, and nothing changes. A mount that shows the view draws the new program afresh, with its own keys (MESH's `update` is not defined across programs). The loading is yours: an ordinary waiting command whose busy and failed states are application state. `view(state)` must not name a view that has not been admitted.
