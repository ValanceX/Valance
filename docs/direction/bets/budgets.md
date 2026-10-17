# Bet 3: Budgets as gates

| | |
|---|---|
| **Stage** | 3 Prototype for the harness and the baseline (both exist); 2 Design, accepted by delegation, for the gates. The decisions are in [decisions](../decisions.md) (W1 to W14); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | Nothing. Every other bet's success criteria that mention cost depend on this one |

## Question

Can the cost of shipping, starting and updating a Valance application be a set of limits that every bet must meet before it advances, measured cheaply and repeatably, so that "it got slower" or "it got bigger" is a failed check and not an opinion?

## Why, and who is hurt

### The ecosystem already believes in this, in two places

- The reactivity design says it outright: "**Benchmark first.** ... The sharing and changes-form work must show a measured improvement to ship; otherwise it is dropped from M1 and stays as designed." It also uses a deterministic counter, not a stopwatch: "7 expressions evaluated, not 60,001".
- The `docs-verifier` example has a budget test for a generated 500-page site ("what a document costs a reader, what a build costs its author, and that neither grows with the pages that are not the one asked for"), and its roadmap makes "payload and render budgets hold" an exit criterion.

Both are real, and neither covers the framework's own footprint. The first lives in a design note, the second in an example that has its own package root and is not among the commands CI runs (`pnpm test`, `test:browser`, `test:examples`).

### What the first measurement found

[The 2026-10-17 baseline](../baselines/2026-10-17.md) is the first time the footprint was measured. A counter application costs:

| | |
|---|---:|
| JavaScript, brotli | 162,138 B |
| WebAssembly runtime, brotli | 170,828 B |
| Transferred by the browser, all files, brotli | 333,683 B |
| First paint in Chromium, localhost, no throttling | 211 ms |
| First paint at 4x CPU slowdown | 847 ms |

and the measurement surfaced things nobody had decided:

- **Effect is 83 percent of the JavaScript of the esbuild-bundled counter** (75 percent by source map in a real `vlx` build of `docs-app`; see "Answered by research"), and the ecosystem's own packages about 10 percent (58,066 of 607,655 bytes). Where the bytes go is not where a team would look.
- **About 46 KB of raw JavaScript (12.4 KB brotli) is `fast-check` and its dependency `pure-rand` (`fast-check` alone is 36.7 KB raw) in the esbuild bundle**, a property-testing library pulled in through Effect's barrel import. **A Vite build, which `vlx` uses, does not include it** (see "Answered by research"), so this is a finding about hand-bundled applications.
- **`wasm-opt -Oz` makes the transferred size worse** (brotli +9.9 percent) while making the raw file 22 percent smaller. A raw-size budget would have rewarded the wrong change.
- **The Desktop protocol sends the whole tree on every update.** At 1,000 rows that is 185,924 bytes for a change the runtime already describes in 202.
- **A plain install gets older packages than the newest published.** `valance` 0.13.0 accepts `port-web` `^0.6.1` and `mesh-runtime` `^0.11.0 || ^0.12.0`, so npm resolves 0.6.1 and 0.12.0 while 0.9.0 and 0.13.0 are the newest. Asking explicitly for the newest `port-web` next to `valance` 0.13.0 fails (ERESOLVE).

The harness itself caught two of its own mistakes: a 3.5-second "start-up" that was really the test server compressing at maximum quality on every request, and an installability claim that was wrong because npm backtracks. Both are in the baseline under "What this measurement got wrong first".

### Who is hurt

- A maintainer cannot tell whether a change made the thing heavier, until a user complains.
- A bet's success criterion that says "no more than 10 percent" has no number to be 10 percent of.
- A new user with a slow connection pays for dependencies they cannot see.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** secondary; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What happened | Lesson here |
|---|---|---|
| React Native (**P**, [architecture docs](https://raw.githubusercontent.com/facebook/react-native-website/main/website/architecture/landing-page.md) and [2024 announcement](https://raw.githubusercontent.com/facebook/react-native-website/main/website/blog/2024-10-23-the-new-architecture-is-here.mdx)) | From the announcement: "in the old architecture, serializing function calls over the bridge quickly became a bottleneck, especially for frequent updates or large objects"; the redesign has run "since 2018". From the landing page: enabling the New Architecture "may not immediately improve the performance or user experience" | A serialization boundary is a cost to budget from the start, and an optimization has to be shown, not assumed. The Desktop protocol is that boundary here |
| TC39 Signals (**P\***, [proposal](https://github.com/tc39/proposal-signals)) | The authors expect native signals to be faster only "by a small constant factor", which "remains to be proven in code" (FAQ), and do not expect the bundle-size effect "to be very large" | Even the authors of a performance-motivated design do not claim more than they measured |
| Angular signal inputs (**P\***, [discussion 49685](https://github.com/angular/angular/discussions/49685)) | "Dependency tracking has overhead" (quote **unverified**: the discussion page could not be read in full) | A mechanism that saves work also costs work. The budget has to include the cost side |
| Flutter on the web (**S**) | Accessibility semantics are off by default because the team cites "noticeable performance costs" | A cost that is not budgeted early becomes a feature that ships switched off |
| Runtime CSS-in-JS (**S**, one team's comparison; **unverified**, no source recorded) | Render time nearly doubled with Emotion against Sass modules (27.7 ms against 54 ms) in one codebase | Measure the effect of a design choice in your own application, not someone else's |
| This ecosystem, the reactivity design (**Repo**) | Gates a design on a measured improvement, counts evaluations instead of milliseconds | The method already exists. This bet generalizes it |
| This ecosystem, `bench-update.mjs` (**Repo**) | Reports "the least of several runs ... since a machine's noise only adds time" | The right way to take a wall-clock number |
| webpack (**P**, [performance](https://raw.githubusercontent.com/webpack/webpack.js.org/main/src/content/configuration/performance.mdx)) | `performance.hints` defaults to `'warning'` in production and `false` in development; `maxEntrypointSize` is "all assets that would be utilized during initial load time" | Size warnings belong to production builds, and the thing budgeted is the initial load |
| Vite (**P**, [build options](https://raw.githubusercontent.com/vitejs/vite/main/docs/config/build-options.md)) | `chunkSizeWarningLimit` defaults to 500 kB, "compared against the uncompressed chunk size"; "Unless noted, the options in this section are only applied to build" | The same split. The uncompressed comparison is the metric W2 rejects |
| Angular budgets (**P**, [builder schema](https://raw.githubusercontent.com/angular/angular-cli/main/packages/angular/build/src/builders/application/schema.json), [CLI docs](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/tools/cli/build.md)) | Configurable budgets by type (`initial`, `bundle`, `anyComponentStyle`, ...), with warning and error thresholds in bytes or percent. `initial` is "the size of JavaScript and CSS needed for bootstrapping the application", defaulting, per the CLI docs, to warn at 500 kB and error at 1 MB (the schema names the types and carries no defaults). The docs' example puts them under the production configuration | A model for author-facing budgets. The docs do not say budgets are production-only; the example is |
| Angular deferrable views (**P**, [defer](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/guide/templates/defer.md)) | `@defer` "reduce[s] the initial bundle size ... by deferring the loading of code that is not strictly necessary for the initial rendering of a page". Triggers: idle (the default), viewport, interaction, hover, immediate, timer; `prefetch` is separate from rendering. Caveats: avoid deferring above-the-fold content (layout shift); under HMR "all `@defer` block chunks are fetched eagerly"; on the server a deferred block renders its placeholder | The closest precedent for the start-up and after-start sets, including that development may load eagerly |
| MDN (**P**, [modulepreload](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/html/reference/attributes/rel/modulepreload/index.md), [compileStreaming](https://raw.githubusercontent.com/mdn/content/main/files/en-us/webassembly/reference/javascript_interface/compilestreaming_static/index.md), [requestIdleCallback](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/window/requestidlecallback/index.md)) | `modulepreload` fetches, parses and compiles a module early, with the warning "you can't just preload everything!". `compileStreaming` compiles from a stream, and a wrong MIME type rejects with a `TypeError`. `requestIdleCallback`: "A `timeout` option is strongly recommended for required work" | The tools for the start-up set. Browser support statements were not in the fetched text; check Baseline |

Not researched in this session: other frameworks' sizes. The baseline does not say whether 333 KB is large or small for a counter, and a comparison would use the same harness on a counter in other stacks.

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 3 and 7, and by the measurement rules below:

- A budget is a number a script can produce, from published packages, by anyone.
- A budget never lets a metric be gamed by changing what is measured (the `wasm-opt` example).
- A gate that is wrong is worse than no gate. A new metric earns trust only after a sanity check.

## Design

### 1. Six kinds of budget

| Kind | What is measured | Why this metric |
|---|---|---|
| **Footprint** | Brotli bytes of the reference application's JavaScript, the WebAssembly runtime, and everything the browser transfers | Compressed bytes are what travels. Raw bytes reward the wrong changes |
| **Start-up** | Time to first paint and to one working click, in Chromium, with and without CPU throttling | What a person waits for |
| **Update** | The runtime's own counter of expressions evaluated for one changed item in 10,000 (**not yet in the harness**; the figure 7 is from the Mesh README and manual), and the least-of-N time for render, `update` and update-from-changes at 1,000 and 10,000 items | A counter is exact and does not drift between machines; time is what people feel |
| **Wire** | Bytes sent to a PORT for one changed item at 1,000 rows, whole tree against patches | Exact, and the one place the cost grows with the wrong thing today |
| **Installability** | Whether the newest published version of each of the five runtime packages the harness tracks (`mesh-runtime`, `mesh-compiler`, `nexus`, `valance`, `port-web`) installs together | A user following the documentation hits this first |
| **Authoring cost** | The cognitive-load log (severity 0 to 3 per friction) | Real and already kept. It is logged and reviewed, not gated by a number |

### 2. Ceilings, targets and allowances

| | Meaning |
|---|---|
| **Ceiling** (hard) | A limit the release check fails above. Set at the baseline plus 5 percent, then ratcheted down as improvements land. **Raising a ceiling is a recorded decision, not an edit** |
| **Target** (soft) | Where we want to be. Informs priorities; fails nothing |
| **Allowance** (per bet) | How much a bet may move a metric. Stated in its brief and measured as a **paired comparison**: both variants in the same run, on the same machine, interleaved. Never against a number stored from another machine |

### 3. The first budgets

Ceilings are the 2026-10-17 baseline plus 5 percent, rounded up. Wall-clock rows are **ratio gates against the previous release on the same machine**, because the absolute value depends on the machine.

| Metric | Baseline | Ceiling | Target and notes |
|---|---:|---:|---|
| Counter app JavaScript, brotli | 162,138 B | 170,300 B (baseline plus 5 percent, rounded up to the next 100 bytes) | Superseded. Recomputed from `vlx build` in [the 2026-10-17 `vlx build` baseline](../baselines/2026-10-17-vlx-build.md#ceilings-recomputed-w3): 87,918 B baseline, 92,400 B ceiling. (The 79,220 B Vite figure was a hand-run Vite build of the bare counter entry.) |
| `mesh-runtime.wasm`, brotli | 170,828 B | 179,400 B | Hold. Do not apply `wasm-opt -Oz` (measured worse) |
| Transferred, all files, brotli | 333,683 B | 350,400 B | |
| First paint, no throttling | 211 ms | 2x the previous release | Report the trend |
| First paint, 4x CPU | 847 ms | 2x the previous release | |
| `update`, 10,000 items, one changed | 79 to 85 ms | 1.5x the previous release | Noise on this machine was up to 16 percent, so the gate sits well above it |
| Expressions evaluated, 10,000 items, one changed | 7 (the Mesh README's figure; to be re-measured and pinned) | exact | A counter; any increase fails |
| Interactive at, 10-row server-rendered page, 4x CPU (from [Bet 14](resumable-start.md); to be added to the harness) | 1,090 ms (scratch measurement, not reproducible from the repository yet) | 2x the previous release | Report the dead zone (interactive minus first paint, about 1,020 ms) beside it |
| Wire, 1,000 rows, one changed item | 185,924 B (whole tree) | none yet | Target 2,048 B once the protocol carries patches. **Known red** |
| Newest `@valancex` set installs together | No (`mesh-runtime`, `port-web` behind) | must pass at release | **Known red** (with wire bytes; the `fast-check` target applies only to esbuild bundles) |

### 4. How it is measured, and kept honest

- The harness is [`scripts/measure-footprint.mjs`](../../../scripts/measure-footprint.mjs). It installs published packages into a temporary directory, so it never measures the working tree by accident and anyone can run it.
- Wall-clock numbers take the least of several runs. Browser numbers take a median.
- **Every metric has a known-answer check.** A page that never shows the count stalls the browser measurement instead of reporting a number. A gate is only added after a deliberate regression, such as adding a dependency, is shown to fail it.
- A baseline is a dated file in `docs/direction/baselines/` and is never edited. A later measurement is a new file.

### 5. Where it runs

It needs the network, a browser and a minute or two, so it does not belong on every push. It runs:

- on the **release dry run** (`release.yml` already has one), where a ceiling breach fails the release;
- **weekly**, on a schedule, with results kept as a build artifact so a trend exists.

Its deterministic parts (the wire bytes and the evaluation counter) are cheap and can join `pnpm test` once the benchmark fixtures live in the workspace.

### 6. Other bets are held to it

| Bet | Allowance | Already stated in its brief |
|---|---|---|
| 4: variant types | No change in render-tree or patch bytes; render at most 5 percent slower; WebAssembly at most 5 percent larger | Byte-identical output for existing programs |
| 5: template values | A row as a snippet within 10 percent of the same row as a composite on the 10,000-item benchmark; WebAssembly at most 5 percent larger | The 10 percent figure |
| 6: style contract | Zero added JavaScript bytes at runtime; stylesheet size gets its own budget when the gallery exists | "No runtime work" |
| 8: state units | Toggling one of 1,000 instances at most 1.2x the same change in application state; JavaScript and WebAssembly each at most 5 percent larger | The 1.2x figure |
| Any other | WebAssembly at most 5 percent larger and JavaScript at most 3 percent larger, unless the brief says otherwise | |

A bet cannot reach stage 4 over its allowance. Going over needs a recorded decision with the reason.

### 7. Production and development builds

The goal of a production build is the smallest, fastest-starting output possible. The goal of a development build is fast rebuilds and clear errors. So they differ in tooling, not in meaning.

| | Production (`vlx build`, the release dry run) | Development (`vlx dev`) |
|---|---|---|
| Minification, tree-shaking, dead-code removal, development-only code stripped | Yes | No |
| Size and budget reporting | A size report (brotli, per chunk, split into start-up and after-start) and budget warnings and errors | **None.** No size warnings, no budget checks, no chunk-size messages |
| Deferral | Applied: split, preloaded, prefetched | The same behavior, but nothing is optimized away and a deferred chunk may load eagerly, as Angular's does under HMR |
| Source maps | Separate files, not fetched at start-up | Complete |

**What happens today.** The web build sets Vite's `chunkSizeWarningLimit` to 1,500 (kB) and the Desktop engine's to 4,000, where the default is 500, and the Desktop engine is built with `minify: false`. So the production build neither reduces as far as it could nor warns. It silences the warning instead (`packages/cli/src/vite.ts` and `build.ts`). The raised limits are replaced by real budgets, below.

**Author-facing budgets.** A project may set budgets in `valance.json`, in the shape Angular uses (a type, a warning threshold and an error threshold, in bytes, kB or percent). With no setting, the defaults are the framework's own ceilings from section 3, applied to the **start-up set** only. Budgets are checked by `vlx build` and never by `vlx dev`.

### 8. The start-up path and the deferred set

**What happens today** (read from the code):

1. `vlx build` writes one entry chunk, and every page's document points at it. There is no code splitting.
2. The generated client calls `await init(wasmUrl)` **after** the entry has been downloaded, parsed and run. `init` fetches the module with `fetch` and `arrayBuffer`, then compiles it. So the WebAssembly download cannot begin until the JavaScript has arrived, and compiling never overlaps downloading.
3. Nothing is preloaded. The document has the script and the styles.
4. Whether the client bundle carries the content of every page, which would make it grow with the site, was not measured.

**Three sets:**

| Set | Contains | Loads |
|---|---|---|
| **Paint** | The page's server-rendered HTML and the CSS it needs | With the document. Nothing else blocks first paint, because the server already rendered the page |
| **Start** | The entry chunk (runtime core, the current page's program, the state boot) and the WebAssembly runtime | Starts with the document, in parallel with each other, the WebAssembly compiled while it streams. Hydration waits for these two and nothing more |
| **After start** | Everything else | Starts as soon as `start` resolves, in parallel, at low priority. Never blocks paint, hydration or the first interaction |

Candidates for **after start**: other routes' programs and code, capabilities the first view does not use, heavy components (tables, lists, menus), per-page content that grows with the site, locale data, and anything an author marks as lazy. Never in a production build: development tooling.

**Rules:**

1. **The necessity test.** A thing is in the start-up set only if hydration cannot run without it. Everything else has to justify its place.
2. **Parallel by default, not lazy on first use.** Once the application has started, deferred chunks begin loading at once, using idle time (`requestIdleCallback` with a timeout, since MDN recommends one for required work, and a timer where it is missing), so the first click usually finds them already there. Rare or heavy things load on interaction or when they become visible instead. Angular's trigger set (idle, viewport, interaction, hover, immediate, timer, with `prefetch` separate from render) is the model.
3. **Loading is async work, and async work is state.** A deferred load is a waiting command, and its loading and failure are state, as the ecosystem already treats async work. Navigating to a route whose code has not arrived shows the busy state and then the page. A failed chunk is a typed failure, never a crash.
4. **No holes above the fold.** Content the first view shows is never deferred (Angular warns of layout shift).
5. **Deferral is about code, not content.** The server renders the complete page, so the HTML is whole before any deferred code arrives. This differs from Angular, whose deferred blocks render a placeholder on the server.
6. **A new deploy can strand an open tab.** Chunks are content-hashed and the page records its build, so a missing chunk after a deploy becomes a "new version available" state. (Not researched; flagged for the design.)

**The prototype.** `init` already accepts a `WebAssembly.Module`, so the parallel path needed no change to the runtime. In a scratch copy of the counter application, a head script starts `WebAssembly.compileStreaming(fetch("mesh-runtime.wasm"))` as the document is parsed, and the entry calls `init(await window.__wasm)` before `Web.run`. Median of 5 fresh Chromium contexts to a visible `Count: 0` (the counter renders on the client, so this is time to a working application), network and CPU throttled:

| Network | CPU | Serial (today) | Parallel and streaming | Faster |
|---|---|---:|---:|---:|
| Slow 4G (1.6 Mbps, 150 ms RTT) | 1x | 2,373 ms | 2,119 ms | 11% |
| Slow 4G | 4x | 2,866 ms | 2,684 ms | 6% |
| Regular 4G (9 Mbps, 170 ms RTT) | 1x | 1,002 ms | 783 ms | 22% |
| Regular 4G | 4x | 1,551 ms | 1,374 ms | 11% |
| Fast wifi (30 Mbps, 20 ms RTT) | 1x | 352 ms | 298 ms | 15% |
| Fast wifi | 4x | 920 ms | 854 ms | 7% |

Reading it: parallelism and streaming compile always help, and most where latency is high and bandwidth is good (22 percent at 9 Mbps and 170 ms). On a slow link the bytes dominate (6 to 11 percent), so **reducing bytes stays the main lever** and the two work together. Caveats: one machine, throttling emulated by Chromium, localhost, and `compileStreaming` rejects a response with the wrong MIME type, so the shipped path must fall back to `arrayBuffer` as the current loader does.

**Planned work** (nothing here is built):

- **Document head:** `modulepreload` for the entry and an early streaming compile of the WebAssembly, written by `vlx build`.
- **Bundle:** split by route, cut from the component tree declared in `main.ts` (the CLI notes already say "the tree is the thing a split would be cut from"); import Effect through subpaths and leave out `fast-check` (the measured 12.4 KB brotli, which includes `pure-rand`); minify the Desktop engine unless a measurement shows no start-up benefit; remove the raised warning limits.
- **After start:** a prefetch step that begins when `start` resolves. A program loaded after `start` needs a late-admission step, which does not exist: the lazy-loading tracer (`examples/tracer-web/test/lazy-loading.test.ts`) records forcing a loaded program into `views` after `start` as "unsupported, out-of-contract behavior". Its design splits the work in three: loading is an ordinary application command, admission checks the program's declared events against the command table (`declaredEvents`, the existing start-time D ⊆ B check), and use is the render. Route splitting has to build admission.
- **Authoring:** zero configuration by default (a component the first route does not use is after-start). An author may mark a component to load on interaction or visibility; progressive disclosure keeps the common path free of it.
- **Measured, and not worth it:** [Bet 14](resumable-start.md) checked whether hydrating from the render tree could take the WebAssembly out of the start-up set. With the module compiled in parallel, `init` takes 1 to 10 ms, so the WebAssembly stays in the start-up set. The cost that matters is the script arriving and the application starting, and Bet 14 adds the metrics to track it.

## Experiment

1. **Harness and baseline.** Done in this change: the script and the dated record.
2. **Wire it in.** Run it on the release dry run and weekly, keep the output, and fail the dry run above a ceiling. First, prove each gate fails on a deliberate regression.
3. **Fix the known reds.** Each belongs to a place that can fix it: the barrel imports in NEXUS and Valance (the `fast-check` saving), the peer ranges in `valance` and `common` (installability), and patches in the Desktop protocol (wire, its own bet).
4. **Move the deterministic parts into `pnpm test`.**
5. **The start-up path.** Parallel preload and streaming compile in the build's HTML, then route splitting and the after-start prefetch, each shown with the harness (section 8's prototype is the first data point). Replace the raised chunk-size limits with budgets, applied to `vlx build` only.
6. **Optional: a comparison.** The same counter in a few other stacks through the same harness, to place the numbers in context. Budgets stay relative to our own history, not to anyone else's.

## Success

- Every release dry run produces the table in section 3 and fails if a ceiling is crossed.
- A deliberate regression (a new dependency, a changed `wasm-opt` flag, an extra evaluation) fails the right gate in a test of the gate.
- The known reds (wire bytes, installability) and the `fast-check` target are fixed or each has an owner and a date to be re-examined.
- `vlx dev` prints nothing about size, and `vlx build` prints a size report split into start-up and after-start sets.
- The start-up set is smaller than today's single entry, and a deliberate regression in it fails the build when a project budget is set.
- Every bet brief has an allowance, and the next bets to advance are measured against it.

## Kill

- If run-to-run noise on the CI machine exceeds 25 percent, wall-clock metrics stop being gates and become reports. The deterministic metrics stay.
- If a full run takes more than ten minutes, move it to weekly only.
- If route splitting makes first navigation visibly slower than today because the after-start prefetch loses to the user's click, prefetch earlier or merge the chunks of the routes most often visited next.
- If maintaining the harness costs more attention than the regressions it catches, shrink it to the footprint and wire metrics, which are exact.

## Breaks (allowed in the free window)

None to the language or the formats. The fixes for the known reds change import statements and peer ranges, which are internal to the packages.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../decisions.md) W15 to W19. Builds ran in copies of the repositories; Chromium 141, one machine.

**Correction to the baseline: it measures a hand-bundled counter, not what `vlx` produces.** The harness bundles the counter with esbuild (`--bundle --minify`). `vlx build` uses Vite, which tree-shakes Effect's barrel import. Building **the same counter entry with Vite 7** gives 279,535 B of JavaScript (79,220 B brotli) against esbuild's 607,671 B (161,977 B brotli), and **no `fast-check` or `pure-rand` in the output**; the WebAssembly file is identical (765,371 B). The `docs-app` example, built with the real `vlx build` (7.7 s), has a client entry of 410,264 B (92,576 B brotli) and no `fast-check` either (checked in the source map and by search), although the workspace imports the `"effect"` barrel in 27 places. So the 46 KB `fast-check` finding, the "known red" for it and the 149,700 B target are artifacts of the harness's bundler; they apply only to applications bundled with esbuild or similar. **The harness must build with `vlx build` (Vite) before any ceiling is set**; the esbuild numbers become a labelled "hand-bundled" row. A counter built the Vite way transfers about 250 KB brotli (JavaScript 79 KB, WebAssembly 171 KB) instead of 334 KB. Effect is still the largest part: by source map in `docs-app` it is 75.2 percent of the bytes the map attributes (305,595 of 410,295 bytes are mapped), against the esbuild counter's 82.9 percent by metafile; the two methods are not strictly comparable.

**A second reference application: `docs-app`.** It builds in the sandbox after `pnpm install --frozen-lockfile` and building the workspace packages (the README says only `pnpm install` then `pnpm build`, which fails with `ERR_MODULE_NOT_FOUND` for `packages/cli/dist/cli.js` until the packages are built: a documentation gap). Its production build: one real entry chunk (410,264 B raw, 92,576 B brotli), a 288 B chunk, the WebAssembly runtime (764,239 B raw, 170,959 B brotli), 1,781 B of CSS and about 2,300 B of HTML per page; no route splitting and no `modulepreload`. **Page content is compiled into the client bundle**: 50 generated pages (29.7 KB of Markdown) took the build from 3 to 53 pages and the entry from 410,264 to 500,775 B raw (about 1.8 KB per page, 190 B brotli per page), and each page's text is shipped twice, in its HTML and in the script. (Fifty identical copies added only 645 B brotli, so gates must use distinct content.) That answers the open question in section 8 and is the strongest argument for route splitting. Add a "bytes per added page" metric. First paint and 4x CPU for `docs-app` were not run.

**Memory: gate on the WebAssembly memory and the JavaScript heap, report the resident size.** Three fresh browsers per cell:

| | JS heap used | WebAssembly memory | Renderer RSS | Renderer peak |
|---|---:|---:|---:|---:|
| counter | 4.2 MB | 1.1 MB | 131 MB | 134 MB |
| list, 1,000 rows | 5.1 MB | 4.8 MB | 141 to 142 MB | 148 to 149 MB |
| list, 10,000 rows | 11.9 MB | 37.8 MB | 204 to 205 MB | 246 to 247 MB |

The heap and WebAssembly bytes were identical every run; resident size varied under 1 percent; a blank page's renderer is about 63 MB, so the application's own share is smaller than the totals. **Memory grows with updates:** at 10,000 rows the WebAssembly memory went from 37.8 MB at start to 56.4 MB after 25 updates and 68.1 MB after 50, and stayed at 68.1 MB through 150 updates (it never shrinks; it plateaus near 1.8 times the start value). A gate must measure after updates, not only after start. **The "79 MB" Desktop note** is `NATIVE-PARITY.md:32` ("engine memory about 79 MB"); the "engine" is the Node single-executable bundle from `vlx package`, not the egui window, and no method, workload or metric is recorded. Bare Node is 41.6 MB here and 48.8 MB after importing the runtime and compiler, so 79 MB is plausible for the engine alone; treat it as unreproducible. The Desktop window's own memory (egui, GPU) was not measured.

**History: dated files in the repository for exact numbers, an artifact for wall-clock trends.** `size-limit` keeps no history and checks every commit against limits (its action comments pull-request deltas); `bundlewatch` compares each file with the target branch; `rustc-perf` keeps history in a database on dedicated collector machines (Hetzner AX-42 servers, per its deployment guide). Nobody read keeps wall-clock history in committed files, which supports committing only exact, machine-independent numbers (bytes) and keeping wall-clock trends out of git. Angular's golden size files could not be reached. A release gate compares with the previous tagged dated file.

**Late admission: it works only as a fresh `render` with the full templates list, and node keys change when the set changes.** `render()` takes the whole templates list every call; `update(previous, snapshot)` takes two arguments, and a third `{ program }` argument is silently ignored (it returned a patch for the old program only). Rendering `[A]` and then `[A, B]` with root A both succeed, but the same root and snapshot give different node keys (`kGw7...` against `k874...`): keys are stable only for the same program, which is consistent with keys being derived from the program (the derivation was not located). A late-admitted render therefore re-keys the DOM, which breaks adopted-node identity, focus restoration and the replay of [Bet 14](resumable-start.md). Errors return as diagnostic values (`assembly-malformed-template` at the template index, `assembly-missing-root`). The minimal change is to define admission in the Valance client as "re-render with the larger list and re-key" and leave `update` alone; a key-preserving admission would need a MESH change.

**Real networks and real devices are the platform's concern.** Under the tenth fixed point the project measures what it emits (bytes, which are exact) and its own runtime costs (the update counter and the least-of-N time), and reports wall-clock numbers with the conditions they were taken under; it does not set budgets for how a particular phone or network treats the output.

## Open questions for stage 3

- **First paint and 4x CPU for `docs-app`**, which the sandbox could measure but did not.
- **Whether keys can be made program-independent**, which would let late admission keep identity (a MESH change).
- **The Desktop window's memory** (egui, GPU), and per-unit memory once Bet 8 exists.
- **Angular's golden size files**, unreachable as a history precedent.
