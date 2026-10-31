# Bet 15: Replay as a contract

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The determinism results under "Why" were measured on 2026-10-17 with the published `@valancex/mesh-runtime` 0.13.0. The decisions are in [decisions](../direction/decisions.md) (R1 to R10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 2](conformance-kit.md) (the same line-JSON shape, and the interaction script that drives a PORT). [Bet 8](state-units.md) (the `units` input is part of what a log records) |

## Question

Can a recorded session be replayed on any conforming runtime so that every render tree comes out byte for byte the same, and can that be a requirement the language's test suite checks?

## Why, and who is hurt

### The promise was made and not kept

MESH's [fine-grained reactivity design](https://github.com/ValanceX/Mesh/blob/main/docs/explanation/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md) (Part C, milestone M1b) states the idea: render is pure, state changes only through commands, so a session is an ordered log, and "replaying a recorded log reproduces every recorded tree byte for byte". It lists "a documented, versioned session log format with a conformance replay vector" as a deliverable. A search of the MESH changelog and manual finds no session log, no format and no vector. The devtools milestone (M7) that would consume it has not started.

### What is already true (measured)

A session of five trees (the initial render, then four steps that set, insert, remove, and insert-with-set on a keyed list), replayed three ways in a fresh runtime, with a SHA-256 of each tree's compact JSON:

| Route | Meaning | Hashes equal to the recording |
|---|---|---|
| `updateChanges` chain | The way a host runs it | Yes, 5 of 5 |
| `update` chain with whole snapshots | The older host path | Yes, 5 of 5 |
| `render` of each snapshot, never `update` | Time travel | Yes, 5 of 5 |

So the equivalence law ([spec §9.10](https://github.com/ValanceX/Mesh/blob/main/docs/reference/mprx-spec.md)) already holds at the scale of a session on this sample. Three more facts bear on the format:

- **Render versions are process-local.** Within one process, the first recording of the session gave versions 2 to 5 and a second recording of the same session gave 22 to 25, with identical trees (separate processes both give 2 to 5). A log must not record `base`; the player supplies its own.
- **Handler identifiers are stable across processes.** The same event's identifier was `hN0luu77litY.vcIRWPVjk9jj0Um_5TX9iw` in two separate runs, and `dispatch` gave an equal intent twice. A log may record handlers by identifier.
- **The runtime is already pinned to the native one.** The package's parity test (`parity.test.mjs`) requires the WebAssembly module and the native runtime to give byte-identical results for the same requests. Number text is the one place a JavaScript engine may differ: MESH computes its own number text in the runtime and compares it against V8's `String(x)` for 1,000,000 values, and the list of intentional differences (`number-text-differences.json`) is empty.

The sample is small (one program, one list). It does not cover windows, snippets or units, which do not exist yet.

### What is not deterministic is outside the runtime

Everything that varies between runs enters at the host: the snapshot the application builds, the payload a PORT reports, and the result of a command. Nexus runs commands as Effects, so a command may read the time or draw a random number. Nexus's test reference platform (not exported from the package) accepts a `Clock` and applies it with `Layer.setClock`; a platform is a Layer, so a real platform can supply one. That is a plausible seam, not a public option today. A log therefore records command results as data and does not re-run commands.

### Who is hurt

- **Authors and reviewers** cannot reproduce a reported bug from a description. A log is a bug report a machine can run.
- **PORT and library authors** cannot tell whether a change of theirs altered behavior, only whether their own tests still pass. A golden log is a regression test written by using the application.
- **The conformance kit** ([Bet 2](conformance-kit.md)) needs interaction scripts. A log is one, with the checks already attached.
- **Whoever builds the devtools** has to invent a format first.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** from general knowledge, not read in this session (verify before relying); **Repo** this ecosystem's own record. See [prior art](../direction/prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| This ecosystem, the design (**Repo**) | Pure render, state through commands, so a session is a log | The premise. The work left is the format and the check |
| This ecosystem, parity and vectors (**Repo**) | Native and WebAssembly runtimes agree byte for byte; the vectors compare trees byte for byte | Byte equality is already the standard for trees |
| Nexus reference platform (**Repo**) | A platform may supply a clock | Time is injectable at the host |
| Elm's time-travelling debugger (**S**) | Replays messages through a pure update | Same idea, and the reason purity matters. Recording only messages is enough when update is pure |
| Redux DevTools (**S**) | Records actions and states, jumps between them | A log of actions plus states is useful to people, not only to machines |
| Record-and-replay debuggers such as rr and Replay.io (**P** for the generic claim: rr is "a lightweight tool for recording, replaying and debugging execution of applications"; Replay.io is "a new debugger for recording and replaying software"; **unverified** that they record at a nondeterminism boundary) | Record and replay executions | Record the boundary, not the inside. Ours is the host, which is small |

## Constraints

- **The MESH runtime has no state and no I/O** (a runtime invariant in MESH's design, not one of the numbered fixed points). The player must not need a clock or random source.
- **Fixed point 9, and the build-mode rule.** Recording costs bytes and time, so it exists in development builds only. A production build contains none of it.
- **Logs hold user data.** A recorder that ships by default is a privacy risk.
- **The PORT contract is unchanged.** Replay is a host feature; a PORT receives trees as ever.

## Design

### 1. The session log

A log is line-JSON, appendable and readable after a crash, the same shape as the host protocol of [Bet 2](conformance-kit.md).

| Line | Holds |
|---|---|
| `header` | `format` (a number), `runtime` (the version that recorded it), `program` (a SHA-256 of the templates in order), `manifest` (a SHA-256 of the model), `snapshot` (the initial root scope), `units` (initial, once [Bet 8](state-units.md) lands) |
| `changes` | The edits to the snapshot as the `updateChanges` form, **without `base`**, with a `units` member when a state unit changed ([Bet 8](state-units.md)) |
| `event` | A handler identifier and its payload, as a PORT reported them, with `n` (its sequence number), `on` (the ordinal of the `tree` line the PORT had drawn) and `out` (the intent or the diagnostic code the runtime returned); an early-input event carries `"origin": "early"` |
| `result` | A command's outcome, as the data that came back into the snapshot, informational, with an optional `of` naming the `event` it answers; the player does not consume it |
| `tree` | A SHA-256 of the compact JSON of the current tree, after every `changes` line, and the whole tree at every 50th line and at the end |

Only inputs and hashes are recorded. The trees are not, except at checkpoints, so a log of a thousand steps is kilobytes and a divergence still shows a readable tree.

### 2. The player

`replay(log)` renders the header snapshot, applies each `changes` line, and compares each `tree` hash. It reports the first line that differs, with both trees if a checkpoint is near. It never runs a command, and never reads a clock or random source: a `result` line is simply the data the next `changes` line applies.

A conforming player replays a log by **all three routes** (an `updateChanges` chain, an `update` chain, and a `render` of each snapshot) and requires the same hashes. This is the equivalence law, checked on a whole session.

### 3. Conformance

MESH publishes a `replay/` directory in `@valancex/mesh-conformance` ([Bet 2](conformance-kit.md)): at least six logs covering lists with keys, nested composites, an `else` branch, a rejected (diagnostic-only) update that leaves the old render valid, and every number-text edge. Both the Rust and the JavaScript runtime replay all of them, and both must give the recorded hashes. That is the requirement: **any MESH runtime must replay the published logs exactly.**

PORTs are not asked to replay trees. They are asked to pass the interaction script derived from a log: the same `event` lines sent through the adapter's `interact`, and the same `observe` results. That makes one artifact serve the semantics layer, the PORT layer and the gallery's `play` scripts.

### 4. Recording

Valance provides the recorder as a host feature: on by `vlx dev --record`, never in a production build, writing to a local file and never uploading it. A field can be marked sensitive in the manifest, and the recorder replaces its value with a placeholder of the same type. A log with placeholders still replays structurally, and the tree hashes are then recorded against the redacted snapshot, so the log is replayable and useless for anything else.

### 5. Versions

Within a runtime minor version, replay is exact. Across versions the player reports the first divergent step as information, not failure. Golden logs in the vectors are regenerated when behavior changes on purpose, and the changelog says so. The `format` number follows the Edition rule: a new format is added beside the old one for one release.

### Alternatives considered

| Option | Why not |
|---|---|
| Record trees, not inputs | Large, and it checks nothing: a recorded tree cannot tell whether the runtime still produces it |
| Record inside the runtime | Breaks "the runtime has no state" and puts the recorder in every build |
| Re-run commands on replay | Needs clocks, random sources, the network and fakes for each. The recorded result is exact and free |
| One big format with devtools state inside | The devtools panel is a consumer; the log is the contract |
| Make PORTs replay trees byte for byte | A PORT draws a tree, and its output is a screen. The tree is checked at the MESH layer and the screen by observation |

## Experiment

Stage 3 repeats the measurement on a larger base before the format is frozen:

1. **The three routes** over each existing program in `examples/conformance/` and over generated random sessions (random edits to keyed lists, 1,000 steps, a fixed seed), in the JavaScript and the Rust runtimes. Any hash that differs is a finding.
2. **Cross-version.** Record on 0.13.0 and replay on the next release to see what the divergence report looks like in practice.
3. **The recorder.** Add `--record` to the `vlx dev` host of the reference application ([Bet 12](reference-library.md)) and record the sessions its tests already script.
4. **Size and cost.** The bytes per step and the time added to a step.

## Success

- The three routes agree on every vector and on 1,000 random sessions in both runtimes.
- The published logs replay exactly in the Rust and JavaScript runtimes.
- A bug reported with a log is reproduced by `vlx replay` with no other information.
- A production build contains no recorder code (a size check in [Bet 3](budgets.md)).
- Recording adds under 5 percent to the time of a step in development.

## Kill

- If random sessions find two routes that disagree, that is a runtime bug and the bet's first product: fix it, add the case to the vectors.
- If logs are too large to share (over 1 MB for an ordinary bug), record changes only at checkpoints and require the player to re-derive.
- If nobody uses logs for reports within two releases of shipping, keep the format as a test artifact only and drop the recorder.

## Breaks (allowed in the free window)

- MESH gains a session-log specification and a conformance directory.
- The manifest gains an optional `sensitive` marker on fields.
- `vlx dev` gains `--record`; `vlx replay` is new.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../direction/decisions.md) R11 to R15. Run on the published runtime 0.13.0 and Effect 3.22.2.

**The log records what arrived, with the outcome and the render it was drawn against.** The `event` line gains `n` (its sequence number), `on` (the ordinal of the `tree` line the PORT had drawn) and `out` (`{ "intent": ... }` or `{ "diag": "runtime-unknown-handler" }`). Measured with a keyed list and an `{#if}`: dispatching the same id twice on one render gave equal intents; after removing an item and hiding the `{#if}` the old render still dispatched the old id, while the new render gave `runtime-unknown-handler` for the removed row's id and for the alternative's id (also on a second try); a malformed or foreign id gave `runtime-handler-other-program`; a payload on a payloadless event gave `runtime-unexpected-payload`; re-inserting the item restored the same id. The runtime manual says the host pairs an event with "the render whose tree the renderer had drawn", and dispatch is pure in (render, id, payload), so replay is reproducible only if that pairing is logged; the first design left it out. Valance's `connect` does the pairing with `drawn.current` but forks each dispatch concurrently, so outcomes complete in any order. If a PORT applied a patch late (in an animation frame, say), a click on a just-removed node would dispatch against the newer render; whether the PORTs do that was not checked. Recording only accepted events would hide PORT bugs and make the kit's interaction script unreproducible.

**Pixel scroll offset is not logged.** The window is data in the template's scope ([Bet 10](collections.md)); only `start` and `count` reach the tree. The `window` event the PORT reports is an ordinary `event` line and the change to `start` it causes is an ordinary change. The PORT should coalesce `window` reports, because each is a line. **A gap in the first design:** `changes` lines have no form for state units, though [Bet 8](state-units.md) makes units a render input; a `units` member is added to `changes` lines.

**No sequence number is needed on `result`.** Results can complete out of order (the async-work guide: "Nothing orders results for you"), but the commit sequence is a total order and replay applies presented snapshot changes in line order. A newer run of a `command.waiting` supersedes an older one and nothing is committed for a superseded or unwanted answer, so those are not logged as results. `result` lines are informational with an optional `of` correlating to an `event`'s `n`; the player consumes only `event`, `changes` and `tree`. A `changes` line is a presented snapshot delta, not necessarily one commit, because commits coalesce.

**Redaction has five rules.** (1) Redact in the log only; the live snapshot is untouched and the placeholder is a fixed typed constant (`""` for a string). (2) **A manifest `sensitive` value is opaque in templates**: the checker accepts a bare reference in a prop or as a child and refuses it as an operand of a unary or binary operator, as an `{#if}` condition, or as an `{#each}` list or key. That makes the placeholder unable to change the tree's shape. Measured: with `{#if secret == "open"}<btn on.press=.../>{/if}` the tree hash differs between the real and the redacted snapshot, and the recorded handler id then gives `runtime-unknown-handler` on the redacted render, so a redacted log would fail at the first such event without rule 2. (3) Redact the three places a value flows: a scope field, an event payload and a command parameter. (4) Scrub issue text: log the diagnostic code and path only. Measured in Effect 3.22.2: `Schema.Redacted` stringifies as `<redacted>` for `String()`, `JSON.stringify`, `util.inspect` and template strings, but `Schema.encode` returns the plaintext (the encoded side is a plain string, and Nexus snapshots and form values are encoded values), and the default issue message leaks the value even for a `Redacted` field. (5) The recorder takes the tree hashes from a second render of the redacted snapshot, which costs one extra render in development only. Values derived by host code before MESH sees them (such as a boolean computed from a password's length) are not covered by the marker.

**Replayed early input appears in the log as ordinary `event` lines** with `"origin": "early"`, informational and ignored by the player. The shell's drops are not logged, since dropped events never reach the host. The development recorder must start before hydration completes, so the header snapshot is the server's state.

## Open questions for stage 3

- **Whether the PORTs apply patches late** (in an animation frame), which would make a click on a just-removed node dispatch against a newer render.
- **Event order across the Desktop protocol**, which needs the Rust PORT run.
- **Whether authors accept opaque `sensitive` values** (a usability trial).
- **Redaction of values derived by host code** before MESH sees them.
