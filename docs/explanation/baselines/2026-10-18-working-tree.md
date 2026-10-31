# Baseline, 2026-10-18, the working tree (after W20 and W21)

The third baseline. The [first](2026-10-17.md) bundled with esbuild; the [second](2026-10-17-vlx-build.md) built the published packages with `vlx build` and found that memory grew with every update and that a plain install ships the WebAssembly runtime twice. Both causes have since been fixed in the working tree (W21 in commit `d7aea88`, W20 in `15db457`), but the harness installed published packages and could not see either. This one measures the working tree, with `scripts/measure-footprint.mjs --tree`, and recomputes the memory ceilings. The earlier files are not edited.

## How it was measured

| | |
|---|---|
| **What was installed** | The workspace's `@valancex/cli`, `common`, `valance` and `router`, built and packed with `pnpm pack` (which turns `workspace:` ranges into versions) at commit `15db457` of `claude/wp1-conformance` (the harness change itself is `e30d7d7`), installed as tarballs into temporary directories with `npm`, beside `effect` 3 and what npm resolves for the rest: `@valancex/mesh-runtime` 0.12.0, `nexus` 0.12.3, `port-web` 0.6.1. `npm` is told the other three tarballs through `overrides` |
| **The comparison** | The same harness without `--tree`, one run at 1,000 updates, installs the published 0.13.0 packages. Its wall-clock rows were taken while a heap analysis ran on the same machine and are not used; its sizes and memory are |
| **Applications** | The counter, and `docs-app` (this repository's example, with the theme toggle as the thing that updates), both `vlx build --web`, served precompressed on localhost |
| **Environment** | A Linux container, 4 vCPUs, 16 GB, Node 22.22.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1. One machine. Medians of 7 fresh browsers per row, with and without 4x CPU throttling |
| **Memory** | After the application is interactive (start), and after 200 and after 1,000 updates (separate runs): JavaScript heap after a forced garbage collection, WebAssembly memory summed over the `WebAssembly.Memory` objects the runtime exports. The resident size is reported, not gated |
| **Not measured** | Wall-clock rows (first paint, interactive-at, click): this run was not repeated, and they are ratio gates against the previous release on one machine anyway. The update benchmark and wire bytes do not depend on these packages and are unchanged |

## W21: the WebAssembly growth is gone

Unthrottled, medians of 7. WebAssembly memory:

| | At start | After 200 updates (tree) | After 1,000 updates, published 0.13.0 | After 1,000 updates, tree |
|---|---:|---:|---:|---:|
| Counter | 1,310,720 | 1,310,720 | 11,010,048 | **1,310,720** |
| `docs-app` | 2,228,224 | 2,228,224 | 28,966,912 | **2,228,224** |

The memory is exactly its starting size after 200 and after 1,000 updates (and under 4x throttling, where the published build varied by a megabyte, the tree's is also exactly flat). Published, `docs-app` went from 2.4 MB to 29.0 MB in 1,000 updates (twelve-fold) and the counter from 1.3 MB to 11.0 MB (8.4-fold).

## W20: one runtime in a plain resolve

In the tree, the counter as npm resolves it (no override) has one WebAssembly file, so the "as installed" and "deduplicated" builds are the same:

| Counter | JavaScript brotli | WebAssembly brotli | Transferred, brotli | WebAssembly memory after 200 updates |
|---|---:|---:|---:|---:|
| Published 0.13.0, as npm resolves it | 88,086 | 341,787 (two files) | 432,064 | 5,767,168 |
| Published 0.13.0, deduplicated by hand | 87,918 | 170,828 | 260,671 | 4,653,056 |
| **Working tree, as npm resolves it** | 87,781 | 170,828 | **260,535** | **1,310,720** |

`vlx build` has its guard (`runtime-duplicate`) and the three packages one range (`^0.12.0`); the published packages keep both problems until the next release.

## Footprint, working tree

| | Raw | gzip | brotli |
|---|---:|---:|---:|
| Counter JavaScript (2 chunks) | 312,482 | 100,019 | 87,781 |
| `docs-app` JavaScript (2 chunks) | 410,563 | 106,743 | 92,662 |
| `mesh-runtime.wasm` | 765,371 | 232,170 | 170,828 |

Transferred by the browser, brotli: counter 260,535 (260,869 at 4x), `docs-app` index page 267,902 (268,791). Client JavaScript per added page: 2,471 bytes raw, 333 gzip and 272 brotli over 20 added pages, unchanged from the second baseline.

## The next cause: the JavaScript heap still grows, about 150 bytes per update

After the WebAssembly fix the JavaScript heap, after a forced collection, is still higher after more updates:

| | At start | After 200 | After 1,000 |
|---|---:|---:|---:|
| Counter | 5,353,036 | 4,406,024 | 5,023,808 |
| `docs-app` | 4,765,004 | 4,657,116 | 5,201,076 |

(The start is read without a collection, so it carries garbage the later readings do not.) A longer run on `docs-app`, one browser, heap after collection by number of updates: 20: 4.76 MB; 200: 5.23; 500: 5.53; 1,000: 5.82; 2,000: 5.77; 4,000: 6.07; 8,000: 6.69. The first thousand updates are warm-up (the engine compiling code, which is not a leak); after that the slope is about **150 bytes per update**, linear.

A heap snapshot before and after 1,000 updates finds it. Besides compiled code (about 720 KB, the browser's own optimization of the page's code and of the WebAssembly module, which stops growing) and the browser's performance-entry buffers (about 170 KB), **one object, an `Exit`, a few small objects and a string stay alive per update** (1,000 of each in 1,000 updates, about 140 bytes together). Their retainer path ends at `Mounted.dispatched`: `connect` in `packages/valance/src/index.ts` appends the exit of every dispatch to an array that is "append-only, never removed, never reordered" for the life of the mount (`docs/explanation/findings.md`, C26 and the note on long-lived pages that says no page had run long enough for it to matter). The array is reachable from the target's report closure for as long as the application runs, whether or not the host kept the `Mounted` value. Nothing in Valance reads it.

This is a design property, not a slip, so it is **not changed here**. At 150 bytes per event, a page that handles a million events holds about 150 MB for a record nobody reads. The options are a bounded ledger (the most recent N exits), recording only when the host asks (`mount` with a flag), or removing `dispatched` as FINDINGS suggests ("remove or narrow when `mount`'s result is decided"). Each changes a documented contract that `test/conformance.test.ts` reads. Recommended: a decision (W22) before WP8.

## Ceilings recomputed (W3, W18)

Rule of W3: the baseline plus 5 percent, rounded up to the next 100 bytes. These replace the memory ceilings of the second baseline, which were set on the leaking build (4,885,800 for WebAssembly memory), and ratchet the size ceilings down. Not enforced yet (WP8).

| Metric | Baseline | Ceiling |
|---|---:|---:|
| Counter JavaScript, brotli | 87,781 | **92,200** (was 92,400) |
| `mesh-runtime.wasm`, brotli | 170,828 | **179,400** |
| Counter transferred, brotli (larger of the two throttle rows) | 260,869 | **274,000** (was 274,100) |
| `docs-app` JavaScript, brotli | 92,662 | **97,300** (was 97,400) |
| Client JavaScript per added page, raw | 2,471 | **2,600** |
| Counter WebAssembly memory after 200 updates | 1,310,720 | **1,376,300** (was 4,885,800) |
| `docs-app` WebAssembly memory after 200 updates | 2,228,224 | **2,339,700** |
| Counter JavaScript heap after 200 updates | 4,406,024 | **4,626,400** |
| `docs-app` JavaScript heap after 200 updates | 4,657,116 | **4,890,000** |
| Counter, `docs-app` JavaScript heap after 1,000 updates (reported, not gated until W22) | 5,023,808; 5,201,076 | would be 5,275,200; 5,461,200 |

The WebAssembly ceilings also hold at 1,000 updates (the memory is flat). The heap ceilings hold at 200 updates only: at 1,000 the ledger's growth is in them, and a ceiling that rises with the length of the run is not a ceiling.

## Limits

One machine, one browser, one run each of 200 and 1,000 updates (the memory figures are medians of 7 browsers and were identical across them for WebAssembly). The packages are the workspace's at one commit, and `nexus`, `port-web` and `mesh-runtime` are the published ones. The heap path was found on `docs-app` with one browser; the per-update count of objects (1,000 in 1,000) was exact.
