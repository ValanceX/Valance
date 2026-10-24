# Replay and conformance

Two tools for the same promise: what a PORT draws is a function of the program and the state. Both are **Provisional** ([API stability](../stability.md)).

## Record a session, replay it (Tier 1 to use, Tier 2 to tune)

```
vlx dev --record            # writes session.jsonl in the project
vlx dev --record=run.jsonl  # or a file of your choice
vlx replay run.jsonl        # replays it, exit 0 when it agrees
```

`--record` is development only. The dev entry imports the recorder (`@valancex/common/record`) only in that mode; `vlx check` and `vlx build` write the entry without it, and a test builds a production bundle and shows it holds no recorder and no `/__vlx/record` route. **A log holds what was typed and drawn, that is, user data. Redaction (`sensitive`) is not built (decisions R9, R14): do not share a log.**

`vlx replay` compiles the project's web program, checks the program hash of the log's header against it (a mismatch is refused, exit 2) and replays the log by three routes:

| Route | What it does |
|---|---|
| `changes` | applies each recorded change list to the previous tree (`updateChanges` chain) |
| `update` | runs the runtime's `update` chain on the recorded states |
| `render` | renders each recorded snapshot afresh |

All three must give the recorded tree hash (SHA-256 of the compact JSON, keys sorted) at every tree line and the recorded outcome at every event line. The first line that differs is reported with the route (`--json` for tools; `--route changes` for one). Exit 0 agrees, 1 diverges, 2 cannot replay (bad log, wrong program, wrong arguments).

The same checks are available as code, `import { replay, recorder, parseLog } from "@valancex/valance/replay"` (Tier 2: the library imports only `@valancex/mesh-runtime`, no PORT and no DOM; a boundary test enforces it). MESH's `@valancex/mesh-conformance` ships the same format as data (`replay/`: seven logs and 1,000 random sessions), so a runtime in any language is checked against the same lines.

## The conformance kit (Tier 3: for the author of a PORT)

`packages/conformance` (private, `@valancex/conformance`) checks a PORT without a browser being the oracle.

* **The adapter** has five operations: `load(tree)`, `update(tree)`, `observe(key)`, `interact(key, how)`, `unmount()`, and optionally `force(key, state)` (hover, pressed, focus, focus-visible). A PORT in another process or language speaks the same thing as one JSON message per line (`serve`, `connect`). The terminal skeleton under `src/adapters/terminal/` is the measure: its adapter is 73 lines, its whole PORT 223 with the process entry, and it passed every vector it does not declare unsupported.
* **The vectors** (`vectors/primitives.vectors.json`: 118 vectors for 24 primitives) are generated from the specifications (`pnpm --filter @valancex/conformance generate`), never written by hand. A PORT states what it cannot do in its own data; a vector it covers is then `unsupported`. Silence is a `fail` (decision Q6).
* **The gallery** has one cell per primitive, per closed variant and per state; the structure snapshot (`gallery/structure.web.json`) is the gate; pixels are advisory and never committed.
* **The verifiers** are specification tools, not browsers: the Nu Html Checker, the accessible-name computation (`dom-accessibility-api`), the role rules (`aria-query`), `stylelint`, the DTCG 2025.10 test suite, the Web PORT in jsdom and in Chromium, a terminal PORT, the Desktop's accessibility tree through `accesskit_consumer`, and the session logs. **Each runs a deliberately wrong input that it must find; a verifier that does not is itself a failure.**

### The report

```
node packages/conformance/scripts/report.mjs --out report.json     # run, write the report
node packages/conformance/scripts/report.mjs --check --require html,names,...   # the release gate
node packages/conformance/scripts/report.mjs --verify report.json [--require-signed]
node packages/conformance/scripts/report.mjs --sign report.json --maintainer "Name" --key private.pem
```

`--check` exits 1 when a verifier fails or a required one did not run (a skipped verifier is not a pass). It is a step of the `conformance` job of `.github/workflows/release.yml`, which the dry run runs and which `pack` waits for.

The report is signed by a **named accessibility maintainer** (decision A15). Nobody is named yet (X6 is open), so the report says `UNSIGNED: no accessibility maintainer is named` where a person reads it, and `accessibilityMaintainer` is empty in the data. The signature is ed25519 over the SHA-256 of the report's canonical JSON, the maintainer's name and date included; changing any byte fails `--verify`.
