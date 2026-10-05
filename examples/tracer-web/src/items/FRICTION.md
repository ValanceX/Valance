# Friction log: the items pressure test

The application here (`app.ts`) was written as an application author would write it, from the Learn pages and the public API, to find where VALANCE stops feeling like one framework. **Nothing was fixed while building**: this records the interface as it is. It is an instrument, not a product.

Scenarios (all run): list and detail views; select, back, reload; one waiting command with loading, success and failure as state; overlapping requests with a stale answer; URL and browser history; server rendering of a list URL and a deep-linked detail URL; hydration; stop with work in flight.
Evidence: `test/items.test.ts` (7 tests, headless / SSR / jsdom hydrate with history), `browser/items.browser.test.ts` (1 test, real Chromium).

> **Since written:** the manifest this log's #3 and #4 complain about is no longer hand-written here. `compile.ts` derives it (`@valancex/valance/web/build`), from the primitives table, the views' scope Schemas and the command table; `components.json` is gone and the tests below pass unchanged. #3's teaching gap for `mesh-each` is unchanged.

## Classification

A legitimate advanced API · B setup or tooling leakage · C public semantic leakage (an engine concept needed for ordinary behavior) · D accidental implementation leakage.
Severity: 0 natural · 1 slightly awkward · 2 noticeable framework knowledge · 3 breaks the VALANCE model.

## Log

| # | Step | What I wanted to express | What VALANCE required | Engine exposed | Class | Sev |
|---|---|---|---|---|---|---|
| 1 | state, `view(state)`, `scope(state)` | the state, which view is current, its values | `define` with `state`, `views`, `view` | none (Schema from `effect`, documented) | none | 0 |
| 2 | event → behavior | a click runs `select` / `reload` / `back` | a bare command name in `commands`, matching the name in the view description | none | none | 0 |
| 3 | a list view | repeat a row per item, keyed | `mesh-each` with `as`/`key` in the view description, **and** a manifest entry for `mesh-each` with its prop schema (`list` of `any`, `as`, `key`). Neither is taught by any Learn, Use or contract page; I copied both from an existing example | MESH view language and manifest | B | 2 |
| 4 | compile views | check and build the view descriptions | `compileProgram` from `@valancex/mesh-compiler`, a manifest JSON, one call per root | MESH compiler | B | 1 |
| 5 | **a waiting command** | "when selected: fetch, show loading, then success or failure" | `Nexus.Command.define(name, Schema.Struct, body)`, `Effect.gen` + `yield*`, `Effect.tryPromise` (with the abort `signal`), `Effect.either`, and `state.update(fn)` where `fn` must return an `Effect` (so every write is wrapped in `Effect.succeed`). The `name` argument matters only to error messages | NEXUS `Command`, `StateHandle`; Effect | **C** | **2** |
| 6 | overlap: a late answer | drop A's answer when B started later | a counter in the commands' closure, as the recipe says: natural, 3 lines | none beyond #5 | none | 1 |
| 7 | **Back while loading** | going back also invalidates the request in flight | The recipe's ticket lives in the closure, so a *pure* `Valance.command` cannot bump it. My first `back` was pure, and **A's late answer then committed `detail: ready` into a state whose `selected` was `""`** (observed; silent; a test caught it, the type system and the view did not). The fix was to make `back` a `Nexus.Command.define` with `Effect.suspend` just to touch the counter | NEXUS `Command`, Effect | **C** | **2** (silent correctness) |
| 8 | URL → state | the browser's Back runs the same behavior as a click | `"app/navigate": Valance.entry(select, (navigation) => navigation)`, because history hands over one object, which a bare name does not unpack; `navigate: "app/navigate"` is a string, so `stateOf`'s result is not type-checked against `select`'s input | VALANCE's own advanced `entry`; the `"app/"` key form | D | 2 |
| 9 | URL → state, the second half | "no id means the list" | **My defect:** the one `select` served clicks and navigation, so `/items` ran `select("")`, which fetched `""` and left `detail: loading` under the list. Only the application can know that "" is the list; nothing flagged it | none (application logic) | none | 1 |
| 10 | read the URL | keep URL and state in step | `urlOf`, `stateOf`, `history: { window, urlOf, stateOf, navigate }`. All the application's own functions; no router, no PORT | none | none | 0 |
| 11 | start-time work | a deep link loads its detail | `start: "startup"` plus a command that checks state: documented, natural | NEXUS command (as #5) | C (#5) | 1 |
| 12 | server render | the same application, for a URL | `renderToHtml(app, { primitives, state: stateFor(url) })`. `stateFor` is the application's | none | none | 0 |
| 13 | server and the fetch service | render a deep-linked detail | The server cannot await the data (start-time work begins and is not awaited), so the HTML says `Loading…` and the browser's own start work fetches. My application takes the fetch as a parameter, so the server was given a fetch that never completes: a stub the application author has to invent | none (documented behavior) | none (limit) | 2 |
| 14 | hydrate | take over the server's HTML | `Web.run(app, { present: "hydrate", state })`; `host.mounted.hydration.adopted` confirms; the server's elements were kept. Carrying the state to the browser is the page's job | none | none | 1 |
| 15 | MESH runtime in the browser | run | `init(wasmUrl)` with `import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url"` before `Web.run`. Not needed in Node (SSR, jsdom) | MESH runtime, bundler asset import | B | 2 |
| 16 | run on a page | one page, one lifetime | `Web.run`, `host.stop()` | none | none | 0 |
| 17 | headless host | start, call a command, read state | `Scope.make`, `Scope.extend`, `Effect.runPromise`, `Effect.forkIn(scope)` around `invoke` (an invoked waiting command is awaited by its caller, so a host that must not wait forks it) | Effect, `Scope` | A | 2 |
| 18 | `invoke(key, args)` | start a command from a host | `[{ value: id }]`. Application code never called `invoke`; only the test host did. It typechecked for a string; elsewhere in this repo an array value needs `as never` (`browser/composition.browser.test.ts:87`) | MESH `IntentArgument` | D | 1 |
| 19 | `scope` vs `Scope` | write `scope:` on views, and own lifetimes | `scope:` appears on every view in application code; `Scope` appears only in the headless host. They never appeared in the same place and I never confused them | none | none | 0 |
| 20 | stop with work in flight | end the page | `host.stop()` aborted the request's `AbortSignal` (browser and jsdom). Replacing a request by Back dropped delivery and did **not** abort it (`aborted === false`), as the contract says | none | none | 0 |

## Hypothesis, not tested here

The state-based guard (commit only if the state still names this request, e.g. `current.selected === id`) would have covered #7 with no counter and no Effect-form `back`. If it holds, it is a documentation recipe, not an API. Test it in the next phase before writing it down.
