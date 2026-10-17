# Bet 10: Collections (windowed lists)

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The design questions are decided in [decisions](../decisions.md) (L1 to L10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 1](primitive-specification.md) (the scroller primitive), [Bet 5](template-values.md) (rows supplied by the caller) and [Bet 8](state-units.md) (the window state). It is the first consumer of the `len` expression deferred in [Bet 4](variant-types.md) |

## Question

Can a long list be shown without rendering all of it, as a property of the repeat, without changing what the list means, and without making the engine, the render tree or the Desktop protocol pay for rows nobody can see?

## Why, and who is hurt

### What a long list costs today

A `{#each}` renders every item. From the [2026-10-17 baseline](../baselines/2026-10-17.md), for a keyed list with one item changed:

| Rows | Full render | `update` | Render tree | Desktop protocol, one update |
|---:|---:|---:|---:|---:|
| 1,000 | 44 ms | 6 ms | 186 KB | 186 KB |
| 10,000 | 452 to 493 ms | 68 to 85 ms | 1.88 MB | 1.88 MB |

The cost is in the engine (60,001 expressions for 10,000 rows), in the tree that crosses to the PORT, and in the DOM or the window that has to hold every row. There is no way to say "only these". No example in the repository was found that renders a list of more than about 100 rows (searched `examples/`; not measured), so nothing else in the repository meets this scale.

Two records say this was seen and set aside:

- [NATIVE-VOCABULARY](../../application-model/NATIVE-VOCABULARY.md) puts "a list with many rows (virtualized), tables, menus, dialogs, drag and drop" in tier 3, "not planned".
- The Desktop table is "A static table: rows and columns with header meaning, not a grid" ([Desktop PORT README](https://github.com/ValanceX/Port/blob/main/packages/port-desktop/README.md), `table` row), drawn as one grid with every row.

### The measurement that shapes the design

If only a window of the list is evaluated but the whole list is still in the snapshot (the current packages, a program that iterates a 50-row slice of a scope that also carries 10,000 rows), measured with the published runtime:

| | Today (whole list rendered) | Window of 50 rendered, whole list still in the snapshot |
|---|---:|---:|
| Full render | 458 to 479 ms | **31 ms** (31.1 to 31.6) |
| Render tree | 1,877,926 B | **9,326 B** |
| A scroll step as a full-snapshot `update` | | 30 to 33 ms |
| A scroll-like edit from the changes form (the list is not re-sent) | | **0.6 to 1.1 ms** |

So evaluating only the window removes about 93 percent of the time and 99.5 percent of the tree. (Three runs of the same script on 2026-10-17 with the published `@valancex/mesh-runtime` 0.13.0, one machine, least of 10 renders; the script is `floor.mjs` in the session scratch and is not committed.) The 31 ms that remains is the cost of encoding and validating the 10,000 rows in the snapshot, which the changes form removes. It also grows with the list, about 3 ms per 1,000 rows, so past tens of thousands of rows the data itself has to be sliced or paged by the application. Windowing the view is not paging the data, and the design says where one ends and the other begins.

### Who is hurt

- A library author cannot ship a table, list or select that stays usable with real data.
- An application author with a long list must page it by hand, putting a view concern in the application's state.
- The Desktop window and protocol pay for every row on every update.

## Prior art

Reliability: **P** primary source read through a fetch agent; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they decided and why | Lesson here |
|---|---|---|
| Angular CDK virtual scroll (**P**, [scrolling](https://raw.githubusercontent.com/angular/components/main/src/cdk/scrolling/scrolling.md)) | Fixed item size: "the `itemSize` property on the viewport must be set", because "items do not need to be measured as they are rendered". A variable-size strategy is "currently being developed ... not ready for production use yet". Caveat: the parent must not add space (margin or padding) | Variable row heights are hard even for a mature framework. Require a declared size in the first version |
| egui `ScrollArea::show_rows` (**P**, [source](https://raw.githubusercontent.com/emilk/egui/main/crates/egui/src/containers/scroll_area.rs)) | "Efficiently show only the visible part of a large number of rows", whose signature takes one row height (`row_height_sans_spacing`); the other scroll modes were not read | The Desktop PORT's toolkit offers a uniform-row mode, so a declared size maps directly to it |
| CSS `content-visibility` (**P**, [MDN](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/reference/properties/content-visibility/index.md)) | `auto` turns on layout, style and paint containment and skips the contents of an element that is not relevant to the user; skipped contents stay in the DOM and the accessibility tree and remain findable | Helps the browser's rendering cost for moderate lists without any script. It does not remove nodes from the engine, the tree or the wire. Baseline status (web-features data): newly available since 2025-09-15, with Safari 26; not yet widely available |
| This ecosystem, the reactivity design (**Repo**) | An update costs "one visit per item of the changed repeat" | A window cuts those visits |
| This ecosystem, node identity (**Repo**, spec §9.10) | An identity is a site and a declared key; a node that leaves a render has ended | Windowing needs no new identity concept, and it has a consequence for unit state (below) |
| React Window, TanStack Virtual, Compose `LazyColumn`, SwiftUI `LazyVStack`, Flutter `ListView.builder` | Lazy lists are standard in other toolkits | **Not researched in this session.** The pitfalls named below (find in page, focus, accessibility counts) are hypotheses from general knowledge, not findings |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 1 to 4, 6 and 8 and by the budgets:

- **Meaning is unchanged.** Rendering with a window equals rendering the whole list and keeping the items inside the window. Identity and declared keys are the same.
- **Nothing is dropped silently.** The PORT receives only the window's rows, plus the numbers it needs to lay out the whole list.
- **`render-v1` gains no concept.** The metadata travels as ordinary props and events on a primitive.
- **The window is data**, so the runtime holds no state and render stays a function of its inputs.
- Budgets from [Bet 3](budgets.md) hold, and this bet improves them.

## Design

### 1. A window clause on the repeat

```xml
{#each rows as row (row.id) window start, count}
  {@render item(row)}
{/each}
```

`start` and `count` are number expressions in the template's scope. The repeat renders the items at indices `start` up to `start + count`, clamped to the list. Each rendered item keeps its declared key, so its identity is exactly what it would be in the whole list. Without a `window` clause nothing changes. A negative, fractional or non-finite value is a runtime diagnostic (`runtime-invalid-window`), and the render fails closed. The spelling is a sketch; the semantics are what is decided.

### 2. The container is a primitive, and the numbers are props

A new primitive in the [specification](primitive-specification.md), `scroller`:

| | |
|---|---|
| Props | `total` (number, how many items the whole list has), `start` (number, the index of the first rendered item), `itemSize` (number, the uniform size of one item in the target's logical units) |
| Event | `window`, payload `{ start, count }`: the range the person can see, computed by the PORT from the scroll position and `itemSize` |
| Content | The rendered rows |

The web realization is a scroll container holding space for `total * itemSize` with the rows placed at `start * itemSize`. The Desktop realization draws the same through its toolkit's row-virtualized scroll area. Because `total`, `start` and `itemSize` are ordinary props and `window` an ordinary event, `render-v1` and the patch format are unchanged, and a PORT without a `scroller` realization surfaces it visibly, as the contract already requires.

### 3. `len`, the first consumer

The template needs the list's length to pass `total`. [Bet 4](variant-types.md) deferred `len`, subscripts and `?.` "until a consumer". This is the consumer, and only `len` is added: `len(list)` is a `number`, and a string's length is deferred until a consumer needs it.

### 4. The window lives in a unit

A library component owns its window, so the application does not have to:

```xml
<!-- virtual-list.mprx: `rows` and `itemSize` are props; `start` and `count` are unit state -->
<scroller total={len(rows)} start={start} itemSize={itemSize} on.window={setWindow($event)}>
  {#each rows as row (row.id) window start, count}{@render item(row)}{/each}
</scroller>
```

The unit's `setWindow` stores the PORT-reported range widened by an overscan of one page each way, so a fast scroll finds rows already there. An application that wants to control the window (a deep link into row 5,000) passes `start` as a controlled prop, and the unit rules for controlled values apply. The runtime needs no new host input: the window is data.

### 5. Key uniqueness

Declared keys must be unique within a repeat. Checking that over the whole list costs one key evaluation per item (an estimated 75 ms for 10,000 items: about 466 ms times 10,000/60,001, which assumes every expression costs the same and is to be measured) and would give back most of the saving. So:

- In **development, tests and verify mode**, uniqueness is checked over the whole list.
- In **production**, it is checked within the rendered window.

This mirrors the existing choice for the changes form: verification is on in tests and development and off in production. A duplicate outside the window is caught by the tests that should have caught it, and in production it surfaces, fail-closed, when it is scrolled to.

### 6. Sizes

The first version requires a **uniform declared `itemSize`**, as Angular's fixed-size strategy and egui's `show_rows` do. A list whose rows differ in height declares an estimate; the cost is that the scrollbar length is approximate and the position can drift. Measured variable sizes wait until a real need appears, given that Angular's own documentation still calls its variable-size strategy experimental.

### 7. What leaving the window means

A row outside the window does not exist, so its occurrence has ended (spec §9.10.6). Consequences, stated so nobody is surprised:

- **Unit state resets** for a row that scrolls out and back ([Bet 8](state-units.md)). State a row must keep is application state, which is the rule that bet already gives.
- **Browser find-in-page will not find rows outside the window.** An application with a long list offers its own search.
- **Focus** on a row that scrolls out is lost. A contiguous window cannot hold a distant pinned row. Pinning is an open question.
- Accessibility counts (`total` and `start` as set size and position) are available as props for [Bet 7](accessibility.md), which realizes them as set size and position. Nothing here blocks it.

### 8. Tiers, server rendering and tables

- **Tier 1, the platform.** For lists up to a few thousand rows (**unmeasured**; to be benchmarked in a browser), the web realization may set `content-visibility: auto` on rows. It is a web-only option and does not reduce the engine, tree or wire cost.
- **Tier 2, windowing.** Beyond that.
- **Server rendering and hydration.** Both render the initial window from the unit's defaults (a start of 0 and a default count), so hydration sees identical trees. A deep link supplies `start` from application state.
- **Tables.** The table family gains a windowed body by the same clause. Columns are not windowed.

### 9. Where the data's own limit begins

The snapshot still carries the whole list, at about 3 ms per 1,000 rows. For lists in the tens of thousands, an application slices in its scope function (the host runs it before the runtime sees anything, so the snapshot holds only the slice) or pages its data. That pattern already works today, and the brief names it as supported. Windowing the view is for the range where the data fits and the rendering does not.

### Alternatives considered

| Alternative | Why not |
|---|---|
| The PORT drops off-screen nodes (renderer-only virtualization) | It leaves the engine evaluating every row (about 460 ms) and the protocol sending every row (1.88 MB). The measurement above is the case against it |
| Slice in the application's scope function | Works today, and stays supported for huge data. But the application must own the window state, so a library cannot package a list that works without wiring |
| `content-visibility: auto` alone | Cheap and good for moderate lists. It does nothing for the engine, the tree, the wire or the memory of nodes |
| Pagination controls | A product choice, not a rendering one, and it moves a view concern into the application |
| A host-supplied window input, like the units input | Unnecessary: the window is data in the template's scope, and a unit holds it |

## Experiment

1. **Vectors first.** Windowed against full renders for the same list (the equivalence above), a window moving (patches insert and remove at the edges and reuse the overlap by key), a window past the end, an empty list, a window of zero, an invalid window, and key uniqueness in both modes.
2. **MESH.** `len` and the `window` clause in the grammar, semantic model, analysis, template format and runtime, in Rust then the WebAssembly packages. Confirm the existing identity, update and event vectors pass unchanged.
3. **The `scroller` primitive** in the specification, with its web and Desktop realizations.
4. **The `virtual-list` component** as a unit with a snippet row, in both targets.
5. **Measure** with the Bet 3 harness: add a 10,000-row windowed list. And in Chromium, a continuous scroll at 4x CPU with frame times recorded.

## Success

- A 10,000-row list windowed to 50 renders in at most 35 ms with the whole list in the snapshot (31 ms measured), with a tree of at most 12 KB (9.3 KB measured).
- A scroll step from the changes form takes at most 2 ms (0.6 to 1.1 ms measured) and sends at most 2 KB to the Desktop window.
- Rows are in place before the person reaches them during a continuous scroll in Chromium at 4x CPU, with no frame over 50 ms.
- Every existing identity, update and event conformance vector passes unchanged.
- The same `virtual-list` works on the web and the Desktop with no application wiring.

## Kill

- If the contiguous window cannot serve ordinary cases (a selected or focused row far from the window) without pinning, add a pin list or drop the feature to the application-slicing pattern.
- If the round trip from the PORT's `window` report to new rows is slower than the overscan on the Desktop protocol, so blank rows show, require a larger overscan, or move the Desktop's window computation into the engine.
- If production key checking within the window lets a real duplicate-key bug through often, check the whole list in production too and accept the cost.
- If approximate scrollbars from uniform sizes annoy more than they help, reconsider measured sizes.

## Breaks (allowed in the free window)

- The grammar and template format gain the `window` clause and `len` (with the template format bump already decided as U8).
- The vocabulary gains `scroller`. The Desktop's tier-3 note "not planned" for virtualized lists is superseded.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../decisions.md) L11 to L14. Measured in Chromium 141; library sources read from GitHub.

**Scroll anchoring: render the window as in-flow rows between a top and a bottom spacer, leave `overflow-anchor: auto`, and do not position rows absolutely.** Measured: inserting 5 rows above the visible ones moved `scrollTop` from 1000 to 1200 with the same row staying at the top; the same held with `content-visibility: auto` rows; growing a top spacer from 4000 to 4200 px moved `scrollTop` from 4050 to 4250 and the row stayed put. With `overflow-anchor: none` the row jumped. **Rows positioned absolutely (by `top` or `translateY`) get no anchoring in Chromium 141** (the row jumped from -10 to 190), so the web realization must not place rows that way. Removing two top rows while growing the spacer by the same height left `scrollTop` unchanged either way. Support: `overflow-anchor` is Baseline "newly available" from 2026-09-14 and needs Safari 27, so earlier Safari has no anchoring.

**Pinning a focused or selected row far from the window: not in version 1.** Selection stays data held by key, and the focus-loss rule of [Bet 9](interaction-state.md) applies when the focused row leaves the window; the scroller carries `tabindex="-1"` as the landing target. TanStack Virtual shows why a pin is costly: its `rangeExtractor` returns the contiguous range, and its sticky example unions in the pinned index (`new Set([activeStickyIndex, ...defaultRangeExtractor(range)])`), making the result non-contiguous, which works only because every item is positioned absolutely from a measurement array. A contiguous window with in-flow rows cannot do that. If a pin is needed later, add it as a second one-row range with a spacer between the ranges, not a non-contiguous window.

**Measured row sizes: version 1 stays with a declared fixed `itemSize`.** TanStack Virtual's variable-size path needs a required `estimateSize` (its docs recommend estimating the largest size), a `ResizeObserver` observation for every mounted row, rounding of the border-box size, a cache by key, and a rebuild of the measurement array from the earliest changed index to the end on each resize batch; it also corrects scroll position when a row above the fold is first measured. That is code to write and maintain; none of it was benchmarked here.

**Initial server window: derive the count from a viewport hint.** `count = ceil(viewportHint / itemSize) + overscan`, with an explicit viewport-height hint. All three libraries read need the caller to supply a size: TanStack's `initialRect` defaults to 0 by 0 (about 2 rows on the server unless given one; overscan default 1), react-window's `defaultHeight` ("important for server rendering") defaults to 0 with overscan 3, and Angular CDK skips measurement on the server and renders no items ("Scrolling depends on the element dimensions which we can't get during SSR"). Without a hint, use a fixed count; **20 is the suggested default, which is my inference and not sourced**.

**A windowed table body emits `aria-rowcount` and `aria-rowindex`.** The table carries `aria-rowcount` (the total row count, header rows included; `-1` if the total is unknown), and every rendered row carries `aria-rowindex`, 1-based and counting header rows. MDN: `aria-rowcount` is needed "if the rows aren't all present in the DOM at any time"; `aria-rowindex` is "an integer greater than or equal to 1, greater than the aria-rowindex value of any previous rows" and "must be added to each row" when a subset is present. Headers stay outside the window in their own `rowgroup`, always rendered, with their own `aria-rowindex` values (1 to n), as in MDN's example; `aria-colcount` is added only if columns are ever omitted, which they are not here. The APG table pattern says the same. The existing `total` and `start` props map to the count and the index plus the header offset. A real screen-reader test is still owed.

**The clause spelling stays `{#each rows as row (row.id) window start, count}`.** Nothing was found that beats it and it keeps the key and the window together. The spellings of Angular's `@for` with a slice, Jinja's `[start:end]`, SwiftUI's `ForEach(range)` and Compose's `items(count)` were not researched, so this is judgement.

## Open questions for stage 3

- **The clause spelling** is the maintainer's taste (kept as drafted).
- **A real screen-reader test** of the windowed table.
- **Pinning** in a later version, as a second one-row range.
