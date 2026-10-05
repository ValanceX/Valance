# The view boundary: what VALANCE should own for links, inputs, lists, conditionals and waiting commands

Evidence for the next phase, from the documentation-site benchmark (`COGNITIVE_LOAD.md`). **Nothing here is public API.** The prototypes were built locally over the public API (`start`, `mount`, `hydrate`, `history`, `invoke`, `command`, `entry`) and are **not committed**; the code that matters is excerpted below. Every claim was run: Node/jsdom (10 tests), real Chromium (1 test for the vocabulary, a 12-case probe for inputs), against the same application the benchmark uses.

## 1. The input mismatch, root-caused

`state.search.query === ""` while the box showed `"st"`. Real Chromium, the application resetting, declining or normalizing what the reader typed (state | box after the application acted):

| Realization | Reset | Application rewrites the value (`"ST"`) | Application declines the edit | Server-rendered |
|---|---|---|---|---|
| `attribute("value")` | `"" \| "st"` **wrong** | `"ST" \| "st"` **wrong** | `"" \| "st"` **wrong** | yes |
| `textProperty("value")` | `"" \| ""` ok | `"ST" \| "ST"` ok | `"" \| "st"` **wrong** | **no** (`WebRealizationError`: *has no HTML form*) |
| `attribute` + a sync after every presentation (prototype) | ok | ok | wrong until the next presentation | yes, and hydrates |

**Root cause: PORT target behavior, and a missing semantic contract. Not VALANCE API, not MESH, not hydration, not application misuse.** Two independent gaps in the Web realization:

1. **No realization is both server-renderable and live.** A property cannot be serialized to HTML; an attribute is serializable, but the DOM stops reading the `value` attribute once the reader has typed (the dirty-value rule). So the only SSR-capable form can never follow state again.
2. **PORT writes a prop only when it differs from the previous render's output, not from the DOM** (`port.ts`, `sameOutput`). An edit the application declines leaves the render unchanged, so nothing is written even for the property form.

Hydration is not at fault (the hydrated box behaves as the mounted one). Fast typing (20 characters) lost nothing in any variant.

**What the contract should guarantee** (proposed): *after each presentation, a controlled field's value equals the value in the render.* The prototype meets it above PORT by reading the attribute PORT always writes:

```ts
const sync = () => { for (const el of container.querySelectorAll("input")) { const want = el.getAttribute("value") ?? ""; if (el.value !== want) el.value = want; } };
// called after port.draw / port.update / port.hydrate
```

Limit that no presentation-based contract can meet: an edit the application declines **with no commit** causes no presentation, so the box keeps the typed text until the next one. Closing that needs a resync at the event boundary. The right home for the mechanism is PORT (a controlled realization: serialized as an attribute, written as a property whenever the live value differs); VALANCE's web binding is the interim place.

## 2. What each primitive means, and what VALANCE needs

| | What the developer means | What VALANCE needs | What the runtime already knows | Implementation-only (mask) |
|---|---|---|---|---|
| **Link** | "go to this place in the application" | a destination (`href`) | history already has `urlOf`, `stateOf` and the navigate command; a popstate already means "navigation request to a URL" | the click event, `preventDefault`, the payload hook, the command in the view |
| **Input** | "this text is the state; changes update it" | the value, and what to do with a change | the state; the field's text is the payload | `value` property vs attribute, the payload builder, resync |
| **List** | "one of these per item, each with its identity" | the items, the key, what an item looks like | MESH keys, PORT keyed reconciliation | the manifest entry for `mesh-each`, the item's record declaration |
| **Conditional** | "show this if…, else that" | a condition, up to two alternatives | MPRX has `!`, `==`, `&&`, `?:` | the manifest entry, flags for conditions the state already answers |
| **Waiting command** | "when this happens, wait for something, then update the state" | how the state begins, the work (a Promise), what to do with its outcome, whether the outcome is still wanted | NEXUS admission, the abort signal, the close drain | the Effect program, `either`, `update`, a ticket |

## 3. Link: navigation belongs to history

A link is **a destination**. `history` already turns a URL into the application's own navigate command (`stateOf`), so a click on a same-document anchor is the same kind of fact as a popstate. Prototype, at the host, from the public API only:

```ts
// a plain left click on a same-origin anchor: the application's navigate command, with what its stateOf reads from the URL
event.preventDefault();
handle.invoke(history.navigate, [{ value: history.stateOf(new URL(a.href)) }]);
```

The view declares `<link href={n.href}>` and nothing else: no `on.click`, no command, no payload hook, no manifest event. Ctrl/Cmd/Shift/Alt-click, middle-click, `target`, `download` and foreign origins are the browser's (and the benchmark's own hook had been **preventing the modified clicks**, a real defect in the current approach). Without `history`, a link is a plain anchor: a full page load, which is the correct default. SSR needs nothing (an anchor with `href`). Verified: click, push, Back, Forward, SSR, hydration, modified clicks.

Cost to note: a link navigation does not go through MESH dispatch, so it is not recorded in `mounted.dispatched`.

## 4. Lists and conditionals: mask the manifest, keep the vocabulary honest

**Lists.** The author still writes `<mesh-each items={…} as="r" key={r.id}>`: items, identity and item view are real semantic information. What is *not* semantic, and was masked: the manifest entry (identical in every application) and each list's record declaration (derived from the view's scope Schema). Identity verified in jsdom and Chromium: survivors keep their DOM nodes through reorder and removal; an item removed and re-added is a new node, by contract; nav `<li>`s survive navigation. A VALANCE-owned list *syntax* is not justified yet: MESH calls `mesh-each` and `mesh-if` "provisional… not a language feature", so VALANCE should not freeze its own spelling over a spelling MESH has not decided.

**Conditionals.** `mesh-if` is **if/else by position**: one or two element children, the first when true, the second when false (I misread this and got a silent wrong result). A conditional cannot be a direct alternative of another; nesting needs a wrapper element, and MESH lists nested conditionals as "not decided". MPRX expressions make most flags unnecessary: **the benchmark's `scope` carried six booleans and only one needed computing** (`search.empty`, because MPRX has no length operator); `hasStatus`, `hasCode`, `hasPrev` and `hasNext` became comparisons on values already in scope (`search.status == "failed"`, `code != ""`, `prev.href != ""`), `hasResults` was unnecessary (an empty list renders nothing), and `detailsOpen` is plain state. This is first a teaching gap, then a vocabulary question.

## 5. The manifest: nobody should write it

Derived, in the prototype, from three things the application already states:

- the **tags** (declared once, feeding PORT's realization table *and* MESH's components: props with their types, events with their payload kind);
- each view's **scope Schema** (an Effect `Schema.Struct`, which also types the `scope` function, replacing `Record<string, unknown>`);
- the **command table** (each command's input Schema gives its parameters).

The derived manifest compiled the same views, with the same 18 components as the 375-line hand-written one (406 pretty-printed lines, written by nobody). Static drift between page, manifest and scope became a TypeScript error for the scope; a view that uses a name its scope lacks is still a MESH diagnostic. The one remaining semantic declaration is the scope Schema: it states what the view needs, which only the author knows. The tag declaration replaces **two** lists of the same tags (the primitives table and the manifest).

Measured, same site: hand-written manifest 375 lines → 0; primitives table (20) and manifest → one `tags` declaration (14 one-liners, 3 with props or events); `doc` scope booleans 6 → 2 (`detailsOpen`, which is plain state, and one computed, `search.empty`); scope checked by TypeScript.

## 6. The waiting command, in the final model

The view model does not change what the command looks like, and the candidate stayed natural in the site. The repeated-request test changed it:

- `wanted` alone, `a`, `as`, `a`: the **first** `a`'s answer is accepted and the **third** (latest) is **dropped** (the state is `done` by then). State equality cannot say "latest request"; for retry or refresh of the same query this shows the older answer and discards the newer.
- Adding **latest-wins per command** (a private counter; delivery of older runs is dropped, their work is left alone) fixes it: the first answer is ignored, the third accepted.
- `wanted` is still needed for **cross-command** invalidation (`go` clears the search); without it the late answer lands in a state that moved on (the benchmark's `back` bug). It fails silently if forgotten.

So the two kinds of supersession are different and both occur: *the same command run again* (a default: latest wins) and *any other change of state* (a guard, `wanted`). Verified: loading, success, failure, stale, repeated identical, close while pending (aborted, nothing commits afterwards), headless `invoke`. Not exercised: a waiting command as `start` work and during SSR. The candidate is a NEXUS command underneath, so admission, abort and the close drain are unchanged.

```ts
// the adapter (about 24 lines over the public API): begin and settle are transitions, work is a Promise, wanted asks the state
search: wait(Schema.Struct({ query: Schema.String }), {
  begin:  ({ query }, current) => ({ ...current, search: { ...current.search, query, status: "loading" } }),
  work:   ({ query }, signal) => searchDocs(query, signal),
  wanted: ({ query }, current) => current.search.query === query && current.search.status === "loading",
  settle: (outcome, _input, current) => outcome.ok ? /* done */ : /* failed */,
});
```

## 7. Decisions

| Candidate | Decision | Why |
|---|---|---|
| Link as a destination, handled by history | **ADOPT** | removes event, command, hook and manifest event; fixes a real defect (modified clicks); needs no engine change; one semantic (navigation request) |
| Controlled-field contract: *the box equals the render after each presentation* | **ADOPT the contract; REVISE the mechanism** | the mismatch is a correctness bug; the right mechanism is a PORT realization, the interim one is VALANCE's web binding; the declined-edit-without-commit case needs an event-boundary resync |
| Manifest derived from tags, scope Schemas and the command table | **ADOPT** | removes 375 lines of work nobody should write; replaces two tag lists with one; types `scope` |
| Lists: mask the manifest, keep `mesh-each` | **REVISE** | keep the item/key/view information; do not freeze a spelling over MESH's provisional one; document it |
| Conditionals: if/else, expressions | **DEFER (teach now)** | MESH has not decided nesting or spelling; most flags were avoidable by teaching expressions |
| Waiting command (`begin/work/wanted/settle`) | **REVISE** | add latest-wins; decide whether `wanted` is required, optional or defaulted (a silent failure if forgotten) |
| A VALANCE component or view abstraction | **REJECT** | no evidence required one |
