# Evidence scripts

The scripts that produced the measurements in the briefs, kept so an implementation session can re-run them. They were written and run in a scratch directory on 2026-10-17, not inside the workspace, so **paths and installs need adjusting**; none of them is a maintained test. The repository's lint and format checks ignore this folder.

**Environment when they were run:** Node 22.22, Chromium 141.0.7390.37 (driven with `playwright-core` and its DevTools protocol), `@valancex/mesh-runtime` and `mesh-compiler` 0.13.0, `@valancex/valance` 0.13.0, `@valancex/port-web` 0.9.0 (SSR serializer), Effect 3.10.19 and 3.22.2, Vite 7, Java 21 for `vnu-jar`. Install what a script imports into a temporary directory (`npm i <packages>`); scripts that import `playwright-core` expect it at a path you set.

| Folder | Script | Backs | What it does |
|---|---|---|---|
| `language/` | `replay.mjs` | [Bet 15](../bets/replay.md) | Records a five-tree keyed-list session and replays it by three routes (`updateChanges` chain, `update` chain, `render` of each snapshot) and compares SHA-256 hashes; prints render versions and handler ids |
| | `stream.mjs`, `stream2.mjs` | [Bet 13](../bets/safe-generated-ui.md) | Checks every prefix of a page raw and after closing what is open; time to first report of three planted mistakes |
| | `stream2h.mjs`, `scale.mjs` | Bet 13 | Hostile inputs (nesting, siblings, attributes, large text) one case per process; scaling of siblings and attributes |
| | `floor.mjs` | [Bet 10](../bets/collections.md) | Whole-list render against a window of 50 over 10,000 rows, scroll step, changes form |
| | `depth.mjs` | [Bet 5](../bets/template-values.md) | Nested-composite depth at which the runtime fails |
| `accessibility/` | `n2.mjs` | [Bet 7](../bets/accessibility.md) | Names and roles a browser's accessibility tree gives for the web primitives (illustrative; the gate is the specification verifiers in `specs/`) |
| | `focus2.mjs`, `dlg2.mjs` | [Bet 9](../bets/interaction-state.md) | Focus after a keyed move and a removal; `dialog` focus, Escape and `cancel` behavior |
| `web-platform/` | `mv2.mjs` | Bet 9 | `moveBefore` against `insertBefore`: focus, selection and typing afterwards |
| | `esc2.mjs`, `pop.mjs` | Bet 9 | Close-watcher behavior for repeated Escape; `popover` auto and manual |
| | `anc.mjs`, `anchor2.mjs` | Bet 9, [Bet 10](../bets/collections.md) | Anchored-popover flipping; scroll anchoring with in-flow rows, spacers and absolute rows |
| | `lock3.mjs`, `touch2.mjs` | Bet 9 | Scroll locking behind a modal; hover and active after a tap |
| `specs/` | `ssr.mjs`, `tree.json` | Bet 7 | Serializes a hand-built render-v1 tree with the published Web PORT serializer into `body.html`/`page.html` |
| | `acc.mjs`, `roles.mjs` | Bet 7 | Accessible names with `dom-accessibility-api` and the web-platform-tests accname cases; element-to-role checks with `aria-query` |
| | `axe.mjs`, `css.mjs`, `sample.css`, `bad.css` | Bet 7, [Bet 6](../bets/style-contract.md) | `axe-core` under jsdom; `css-tree` and `stylelint` against a valid and an invalid stylesheet |
| | `dtcg.mjs` | Bet 6 | The official DTCG 2025.10 JSON Schema and test suite through Ajv |
| | `spec_invariants.rs` | Bet 7 | An AccessKit `TreeUpdate` invariant checker over the Desktop PORT's own update. Now kept as `packages/port-desktop/tests/spec_invariants.rs` in `valancex/port`, as assertions, with `accesskit` 0.17 and `accesskit_consumer` 0.26 as dev-dependencies |
| | `wptrun-browser.mjs` | Bet 9 | Runs a web-platform-tests file in a reference browser (needs a testdriver shim for input-driven tests). Superseded by `integration/wpt` in the Port repository (WP6b, I27) |
| `measurement/` | `mem.mjs` | [Bet 3](../bets/budgets.md) | JavaScript heap, WebAssembly memory and resident size for the counter and lists of 1,000 and 10,000 rows, with updates |
| | `late.mjs` | Bet 3 | Late admission: `render` with a growing templates list; node keys; `update` ignoring a program argument |
| | `smap.mjs`, `vite.config.mjs` | Bet 3 | Effect share from a source map; the Vite configuration that built the counter at 79,220 B brotli |
| `replay-forms/` | `lib.mjs`, `s1.mjs` to `s4.mjs` | Bet 13 | Scanner-based prefix repair and the text, string, `{#if}` and `{#each}` prefix tests |
| | `d1.mjs`, `d2.mjs` | Bet 15 | Dispatch of stale, repeated and foreign handler ids |
| | `effect-schema-form.mjs` | [Bet 11](../bets/forms.md) | What Effect Schema keeps (annotations, issue paths, `errors: "all"`) |
| | `shell-form-cost.mjs` | [Bet 14](../bets/resumable-start.md) | Cost of capturing and restoring 1, 20 and 200 inputs before hydration |

**Not kept:** builds of `docs-app` and the Mesh and Port copies (they are reproduced by the steps in [Bet 3](../bets/budgets.md)), downloaded sources, and the `node_modules` folders.
