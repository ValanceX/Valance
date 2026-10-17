# Bet 15: Replay as a contract

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The determinism results under "Why" were measured on 2026-10-17 with the published `@valancex/mesh-runtime` 0.13.0. The decisions are in [decisions](../decisions.md) (R1 to R10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 2](conformance-kit.md) (the same line-JSON shape, and the interaction script that drives a PORT). [Bet 8](state-units.md) (the `units` input is part of what a log records) |

## Question

Can a recorded session be replayed on any conforming runtime so that every render tree comes out byte for byte the same, and can that be a requirement the language's test suite checks?

## Why, and who is hurt

### The promise was made and not kept

MESH's [fine-grained reactivity design](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md) (Part C, milestone M1b) states the idea: render is pure, state changes only through commands, so a session is an ordered log, and "replaying a recorded log reproduces every recorded tree byte for byte". It lists "a documented, versioned session log format with a conformance replay vector" as a deliverable. A search of the MESH changelog and manual finds no session log, no format and no vector. The devtools milestone (M7) that would consume it has not started.

### What is already true (measured)

A session of five trees (the initial render, then four steps that set, insert, remove, and insert-with-set on a keyed list), replayed three ways in a fresh runtime, with a SHA-256 of each tree's compact JSON:

| Route | Meaning | Hashes equal to the recording |
|---|---|---|
| `updateChanges` chain | The way a host runs it | Yes, 5 of 5 |
| `update` chain with whole snapshots | The older host path | Yes, 5 of 5 |
| `render` of each snapshot, never `update` | Time travel | Yes, 5 of 5 |

So the equivalence law ([spec §9.10](https://github.com/ValanceX/Mesh/blob/main/docs/MPRX-SPEC.md)) already holds at the scale of a session on this sample. Three more facts bear on the format:

- **Render versions are process-local.** The same session gave versions 2 to 5 in one run and 22 to 25 in another, with identical trees. A log must not record `base`; the player supplies its own.
- **Handler identifiers are stable across processes.** The same event's identifier was `hN0luu77litY.vcIRWPVjk9jj0Um_5TX9iw` in two separate runs, and `dispatch` gave an equal intent twice. A log may record handlers by identifier.
- **The runtime is already pinned to the native one.** The package's parity test (`parity.test.mjs`) requires the WebAssembly module and the native runtime to give byte-identical results for the same requests. Number text is the one place a JavaScript engine may differ, and MESH keeps its own table for that (`number-text-differences.json`, reviewed like code).

The sample is small (one program, one list). It does not cover windows, snippets or units, which do not exist yet.

### What is not deterministic is outside the runtime

Everything that varies between runs enters at the host: the snapshot the application builds, the payload a PORT reports, and the result of a command. Nexus runs commands as Effects, so a command may read the time or draw a random number. Nexus already takes an injectable clock (`Layer.setClock` in the reference platform), which shows the seam exists. A log therefore records command results as data and does not re-run commands.

### Who is hurt

- **Authors and reviewers** cannot reproduce a reported bug from a description. A log is a bug report a machine can run.
- **PORT and library authors** cannot tell whether a change of theirs altered behavior, only whether their own tests still pass. A golden log is a regression test written by using the application.
- **The conformance kit** ([Bet 2](conformance-kit.md)) needs interaction scripts. A log is one, with the checks already attached.
- **Whoever builds the devtools** has to invent a format first.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** from general knowledge, not read in this session (verify before relying); **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| This ecosystem, the design (**Repo**) | Pure render, state through commands, so a session is a log | The premise. The work left is the format and the check |
| This ecosystem, parity and vectors (**Repo**) | Native and WebAssembly runtimes agree byte for byte; the vectors compare trees byte for byte | Byte equality is already the standard for trees |
| Nexus reference platform (**Repo**) | A platform may supply a clock | Time is injectable at the host |
| Elm's time-travelling debugger (**S**) | Replays messages through a pure update | Same idea, and the reason purity matters. Recording only messages is enough when update is pure |
| Redux DevTools (**S**) | Records actions and states, jumps between them | A log of actions plus states is useful to people, not only to machines |
| Record-and-replay debuggers such as rr and Replay.io (**S**) | Capture nondeterministic inputs at a boundary and replay them | Record the boundary, not the inside. Ours is the host, which is small |

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
| `changes` | The edits to the snapshot as the `updateChanges` form, **without `base`** |
| `event` | A handler identifier and its payload, as a PORT reported them, and the intent the runtime returned |
| `result` | A command's outcome, as the data that came back into the snapshot |
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

## Open questions for stage 3

- **Events that a PORT reports out of order or twice.** Whether the log records what arrived or what was accepted.
- **Windows and units** ([Bet 10](collections.md), [Bet 8](state-units.md)): whether scroll position is an input to the log.
- **Streams of commands** that finish out of order: whether the `result` line carries a sequence number.
- **Redaction semantics** for values that decide control flow.
- **The relation to the early-input shell** ([Bet 14](resumable-start.md)): whether replayed early input appears in the log.
