# Cognitive-load log: the documentation-site benchmark

The question this answers: **could a competent frontend developer build a documentation-site slice thinking in pages, state, views, behavior, content and navigation, or did they have to learn how the engines work?**

`app.ts` is a small documentation site (home, introduction, two guide pages and a state/async guide, two reference pages; header, sidebar, main, footer; a keyed navigation list and a keyed content list; code blocks; an expandable section; search with loading, results, failure and stale answers; URLs and Back/Forward; server rendering; hydration). It was written as an application author would write it, from the Learn pages and the public API. **Nothing was fixed while building**: this records the interface as it is. It is an instrument, not the VALANCE website.

Evidence: `test/docs-benchmark.test.ts` (3 tests: SSR of home, guide and reference; jsdom hydration, navigation, search), `browser/docs-benchmark.browser.test.ts` (1 test, real Chromium: hydration, real clicks on real anchors, real typing, real history, stale search), `browser/docs-benchmark-uninit.browser.test.ts` (1 test: what an author sees without `init`).

Severity: **0** natural (only VALANCE/application concepts) · **1** minor friction (an API quirk, no engine knowledge) · **2** framework knowledge (a framework mechanism or special rule) · **3** abstraction failure (an underlying engine concept is needed for an ordinary task).
Layer: **App** = complexity that belongs to the problem · **FW** = caused by VALANCE's own model · **Eng** = caused by NEXUS / MESH / PORT / Effect.

## The log

| # | Task | Desired thought | Actual thought required | Extra concept | Engine exposed | Layer | Sev |
|---|---|---|---|---|---|---|---|
| 1 | state, which page, its values | "state is the page, the view follows" | `define` with `state`, `views`, `view`, `scope` | none | Schema (`effect`), documented | App | 0 |
| 2 | event → behavior (toggle, go) | "a click does this" | a bare command name matching the name in the view | none | none | FW | 0 |
| 3 | sidebar with the active page; prev / next | "derive it from state" | plain functions in `scope` | none | none | App | 0 |
| 4 | describe a page | "write the page's markup" | MPRX markup **and** a component manifest declaring every tag, prop, event, command and scope field (375 pretty-printed lines for two views and fifteen primitives) | manifest | MESH | FW | 2 |
| 5 | keep the page, the manifest and `scope` in step | "the page shows what `scope` returns" | three places must agree; `View.scope` is `Record<string, unknown>`. Drift is caught only when something renders: a missing or mistyped field gives a precise `MeshDiagnostics` (`title` is absent / is a number), an **extra** field passes silently | three-way agreement | MESH diagnostics | FW | 2 |
| 6 | **a list** (nav, results, paragraphs) | "for each item, a row" | `<mesh-each items as key>` in the markup, a manifest entry for `mesh-each` (list of `any`, `as`, `key`), the key expression, a record shape per list in `scope`. **No Learn, Use or contract page teaches it**, and MESH's own manual calls it *"a tracer, not a language feature"* | MESH `mesh-each`, keys | MESH | Eng | **3** |
| 7 | **conditional parts** (code block, search status, results, details, prev/next) | "show this if" | `<mesh-if when>` plus the same manifest entry, and **a boolean in `scope` for every condition** (I wrote six: `hasStatus`, `hasResults`, `hasCode`, `detailsOpen`, `hasPrev`, `hasNext`; see `VIEW_BOUNDARY.md`: most were avoidable, because MPRX has comparison expressions that no VALANCE page mentions). Equally untaught and equally provisional in MESH | MESH `mesh-if`, flag plumbing | MESH | Eng | **3** |
| 8 | **a link** | "a link to another page, that the application handles" | a `link` primitive realized as `<a>`, `href` as an attribute, and **the click's `payload` hook calling `event.preventDefault()`**, the only place PORT lets a native event be stopped (PORT stops nothing). Without it the document navigates away | PORT event payload hook | PORT | Eng | **3** |
| 9 | **a text field** | "a search box that shows the query" | a `field` primitive: `input` event with a payload hook reading `element.value`; a manifest event `payload` type; `$event` in the markup. Then `value`: the property form (`textProperty`) **cannot be server-rendered** (`WebRealizationError: has no HTML form`), so the attribute form is required, and **a DOM attribute no longer changes a field the reader has typed in** | PORT value realization, DOM attribute vs property | PORT | Eng | **3** |
| 10 | clear the search box from state | "the application cleared the query, so the box is empty" | **it is not**: after `go` cleared the query the state said `""` and the box still showed `"st"` (pinned in `test/docs-benchmark.test.ts`). State and screen disagree, and no application code can fix it | none available | PORT / DOM | Eng | **3** (correctness) |
| 11 | Back / Forward | "the URL follows the state" | `history: { window, urlOf, stateOf, navigate }`, and `"app/navigate": Valance.entry(go, nav => nav)` because popstate hands over one object; `navigate` is a string key not checked against `go`'s input | `entry`, the `"app/"` key | VALANCE | FW | 2 |
| 12 | expandable section | "toggle a flag" | a pure command, plus #7 for the conditional | none beyond #7 | none | App | 0 |
| 13 | **search: loading, results, failure** | "on input: wait, then show the answer or the failure" | `Nexus.Command.define(name, Schema.Struct, body)`, `Effect.gen` and `yield*`, `Effect.tryPromise` with the abort `signal`, `Effect.either`, `state.update(fn)` where `fn` returns an `Effect` (twice), `result._tag === "Right"`, `.right` / `.left` | NEXUS `Command`, Effect | Eng | **3** |
| 14 | overlapping searches | "an older answer must not replace a newer one" | a `ticket` in state, bumped when a search starts, read back from the value `state.update` returns, compared when the answer arrives | the ticket recipe | none beyond #13 | FW | 2 |
| 15 | a page change supersedes a search | "going to a page closes the search" | with the ticket **in state**, the pure `go` command bumps it: the recipe composes with pure commands. (With the ticket in a closure, as the Learn page shows, `go` needs `Nexus.Command.define` and `Effect.suspend`; see `../items/FRICTION.md` #7) | which place the ticket lives | none | FW | 1 |
| 16 | server rendering | "render the same application for a URL" | `renderToHtml(app, { primitives, state: stateFor(url) })`, which **returns an `Effect`**, so `Effect.runPromise` is needed at the call; the application needs a search service on the server although it cannot be awaited there | `Effect.runPromise` | Effect | FW | 2 |
| 17 | hydration | "the browser adopts the server's output" | `Web.run(app, { present: "hydrate", state })`; `host.mounted.hydration.adopted` confirms; the server's nodes were kept | none | none | FW | 0 |
| 18 | browser start | "run" | `init(wasmUrl)` with `import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url"` before `Web.run`. Not needed in Node. Forgetting it gives a clear MESH-level rejection (*call init() with the URL of mesh-runtime.wasm before the first render*) | `init`, a bundler asset URL | MESH runtime | FW | 2 |
| 19 | compile the views | "check and build the pages" | `compileProgram` (build time), a manifest, one call per root | `compileProgram` | MESH compiler | FW | 1 |
| 20 | map tags to elements | "a `heading` is an `<h1>`" | the `primitives` table; plain elements are one line each | primitives table | PORT (`Web.WebPrimitives`) | FW | 1 |
| 21 | headless / test host | "start, call, read" | `Scope`, `Effect.runPromise`, `forkIn` (an invoked waiting command is awaited by its caller) | Effect | Effect | Eng | 2 |
| 22 | stop the page | "end it" | `host.stop()`; the search in flight was aborted | none | none | FW | 0 |

## Measured, from the files

**Setup (a first page in a browser).** Modules imported: `@valancex/valance`, `effect` (Schema), `@valancex/valance/web`, `@valancex/mesh-compiler`, `node:fs` (build script), `@valancex/mesh-runtime`, and the wasm `?url` import: **7**, and an 8th (`@valancex/nexus`) the moment a command waits. Setup calls: `compileProgram`, `init`, `Web.run` = **3** (a fourth, `renderToHtml`, for SSR). Concepts to understand: state schema, view and scope, command, view description and its manifest, primitives table, mount versus hydrate = **6**; of those, **4 are engine concepts** (Schema from Effect, the MESH manifest, the compiled program, the wasm init). The async command adds **2 more** (NEXUS command, Effect).

**One ordinary page (the `doc` view).** In `app.ts`: a 3-line view entry and a ~30-line `scope` function; `doc.mprx` is 33 lines; the manifest is the bulk (see #4). Engine references in the page itself: `Mesh.Program` (one type, in `Programs`). The page's *structure* (#6, #7) is where the engine vocabulary enters, not its content.

**Navigation.** Add a page: one entry in `content.ts` (no VALANCE concept; the list, the URL, the active mark, prev / next all derive from it) = **0** new concepts. Sidebar navigation: #6 and #8 (a keyed list, a link) = **MESH `mesh-each`, PORT payload hook**. Back / Forward: #11 = **`history`, `entry`**.

**A keyed list.** To render one: `mesh-each`, `as`, `key`, a manifest entry, a record shape in `scope` = **5 concepts, all MESH's**.

**Async.** Loading / success / failure: **16 engine-reference occurrences, 12 distinct** in the command (`Nexus.Command.define`, `Effect.gen`, `yield*`, `state.update`, `Effect.succeed`, `Effect.tryPromise`, `Effect.either`, `_tag`, `.right`, `.left`, and the input's `Schema`). Overlapping work: **1** more concept (the ticket) and **0** more engine references when the ticket is state. Engine imports required in `app.ts`: **2** (`@valancex/nexus`, `effect`).

**SSR.** `renderToHtml`, `stateFor`, the same `primitives` = **3**, one of them an Effect boundary (#16). **Hydration.** `present: "hydrate"` and `state` = **1**.

## Scorecard

| Task | Rating | Why |
|---|---|---|
| State, view, scope, commands, derived navigation (#1-3, 12, 22) | **Green** | only VALANCE and application concepts |
| Describing a page (#4, 5) | **Yellow** | a manifest and a three-way agreement; documented, shallow, but heavy |
| **Lists and conditionals** (#6, 7) | **Red** | MESH's provisional constructs, untaught, with manifest and flag plumbing |
| **Links and text input** (#8-10) | **Red** | PORT event hooks and DOM attribute/property rules; a box that cannot be cleared |
| History (#11) | **Yellow** | `entry` and a string key, learnable from VALANCE's own page |
| **Waiting commands** (#13) | **Red** | NEXUS and Effect for an ordinary task |
| Overlapping work (#14, 15) | **Yellow** | the ticket recipe, learnable, composes with pure commands when kept in state |
| SSR (#16) | **Yellow** | one Effect boundary |
| Hydration (#17) | **Green** | one option |
| Browser bootstrap (#18, 19) | **Yellow** | one extra call and one URL import, with a clear error |

## The controlled async experiment (local, uncommitted)

**Current**, 14 lines, 16 engine-reference occurrences (12 distinct; counted by script over the command's body) (the `search` command in `app.ts`):

```ts
const search = Nexus.Command.define("docs.search", Schema.Struct({ query: Schema.String }), ({ query }) => Effect.gen(function* () {
  const started = yield* state.update((current) => Effect.succeed({ ...current, search: /* loading, or idle, with ticket + 1 */ }));
  if (query.trim() === "") return;
  const mine = started.search.ticket;
  const result = yield* Effect.tryPromise({ try: (signal) => searchDocs(query, signal), catch: String }).pipe(Effect.either);
  yield* state.update((current) => Effect.succeed(
    current.search.ticket !== mine ? current
      : result._tag === "Right" ? { ...current, search: { /* done, results: result.right */ } }
      : { ...current, search: { /* failed, message: result.left */ } }));
}));
```

**Candidate**, 9 lines, 2 engine-reference occurrences (the same `Schema.Struct` / `Schema.String` of the input, nothing else). It is `Valance.command` with a Promise in the middle: `begin` and `settle` are transitions of state, `work` is the only asynchronous thing, and `wanted` asks **the state** whether the answer is still relevant:

```ts
const wait = waiting(state);                       // the adapter is 17 lines over the public API; it is not in the repository
const search = wait(Schema.Struct({ query: Schema.String }), {
  begin:  ({ query }, current) => ({ ...current, search: query.trim() === "" ? idle() : { query, status: "loading", results: [], message: "" } }),
  work:   ({ query }, signal) => searchDocs(query, signal),
  wanted: ({ query }, current) => current.search.query === query && current.search.status === "loading",
  settle: (outcome, _input, current) => outcome.ok ? { ...current, search: { /* done */ } } : { ...current, search: { /* failed */ } },
});
```

Result: the **same three tests pass unchanged** (SSR, hydration, navigation, search success, failure, the stale answer dropped, a page change superseding a search, abort on stop), with the `ticket` removed from state.

| | Current | Candidate |
|---|---|---|
| Engine knowledge to write the command | NEXUS command, Effect generators, `tryPromise`, `either`, `update` | none (a Promise and four functions) |
| Ownership, cancellation, lifecycle | the application's | unchanged: it *is* a NEXUS command underneath, so admission, the abort signal and the close drain are the same |
| Stale results | a ticket: written by the author, bumped by every superseding command | the state is the guard: `wanted` is required (it cannot be forgotten), and **any** command that changes the state supersedes the work by changing it |
| New mental model | none | none: no async concept; a `command` whose middle step waits |
| Cost | | `wanted` cannot tell two identical requests apart (type `a`, `as`, `a`: the first `a`'s answer is accepted while the last is still loading; same query, same data); the state must be able to say "what is wanted" (here `query` and `status`); it does duplicate the begin / work / settle shape of a NEXUS command, about 17 lines, not a large part of NEXUS |

**Recommendation.** The candidate meets every bar the task set except one open judgment (the identical-request case, which looks harmless but is a semantic choice). It is *not* committed: the evidence is clear that the leak is real and that a VALANCE-vocabulary form removes it without a new async model, but it is not clear that the interface should be this one rather than a variant (an `Effect`-free `command` overload, or `wanted` optional). Decide it in the next phase together with the view boundary, because the benchmark shows the view boundary is the larger problem.

## Findings that are not about async

- **Lists and conditionals: inherent exposure or a teaching gap?** Both, and the second does not fix the first. They are untaught (a documentation gap), but the construct they would teach is, in MESH's own words, *provisional*, and it needs a manifest entry and a flag per condition. Teaching it as a VALANCE concept would publish a provisional engine construct as public API. That is an abstraction-boundary question, not a documentation patch.
- **`init(wasmUrl)`.** Every browser author must know it, and it cannot be hidden without a bundler convention, because the URL is the bundler's (`?url`). It belongs in the browser bootstrap, so it is a candidate for an option on `Web.run`, with `init` kept as the escape hatch. The failure when forgotten is already clear. Node needs nothing.
- **A native event cannot be stopped from the application.** PORT stops nothing, by contract. The only hook is the payload builder, so a link needs PORT knowledge. A real application will want links on every page.
