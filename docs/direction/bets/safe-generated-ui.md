# Bet 13: Safe generated UI

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The checker's behavior on partial input, on hostile input and on injection-shaped input was measured on 2026-10-17 with the published `@valancex/mesh-compiler` and `@valancex/mesh-runtime` 0.13.0. The decisions are in [decisions](../decisions.md) (G1 to G10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 3](budgets.md) (limits are budgets). [Bet 1](primitive-specification.md) (what a prop may carry). Uses [Bet 15](replay.md)'s format to keep a generation session |

## Question

Can a model's partial MPRX be checked against a manifest while it streams, shown early when it is safe to, and corrected by the model, with no input able to make the checker slow, wrong or unsafe?

## Why, and who is hurt

### What exists

MESH's pitch is that generated UI "fails closed": the architecture document says Valance "never blindly executes generated UI", and the language can only express structure, bindings, simple expressions and intent. The guide ["Repairing generated UI"](https://github.com/ValanceX/Mesh/blob/main/docs/guides/checking-against-a-component-model.md) gives the loop for a **finished** file: run `mesh check --format json`, decide by exit status, match on `code`, point at `span`, apply `suggestions`, and "fix each diagnostic once" (a mistake gets one diagnostic). That is a batch check. Nothing is defined for a file that is still arriving.

### What a batch checker does with a half-written file (measured)

A 276-byte page (a card, an `{#if}`/`{:else}`, an `{#each}` with a keyed row) was cut at every byte and checked against its manifest:

| Result of checking a raw prefix | Prefixes (of 276) |
|---|---|
| A syntax error only (`syntax-error`, `missing-closing-tag`, `unterminated-tag`) | 275 |
| No diagnostics | 1 (the whole file) |

So a half-written file gets no semantic feedback: the checker stops at the first syntax problem. A wrong prop name written early is invisible until the file ends.

Closing what is open (cut back to the last complete tag or block, then append the closers) and checking again changed the picture:

| Result of checking the repaired prefix | Prefixes |
|---|---|
| Clean | 233 of 271 (86 percent) |
| Still a syntax problem | 38 (a naive repair; cut inside an open start tag) |

And on a page with three planted mistakes (an unknown prop, an unknown reference, an unknown component), each was reported at the first prefix that ended **8 to 13 bytes after** the mistake: `unknown-prop` at byte 77 was reported at prefix 90, `unknown-reference` at 114 at prefix 126, `unknown-component` at 139 at prefix 147. The batch check on the whole file reported the same three. The checker is fast on small input: about 0.3 ms on average over the 276 prefixes and under 4 ms at the worst (0.37 and 3.7 ms in one run, 0.27 and 1.5 ms in another). The same run also produced two transient false `unterminated-tag` diagnostics (at prefixes 27 and 125) from the naive repair that the final check does not report; the real repair must not emit them.

So **a streaming check is feasible by repairing the prefix**, and an error can reach the model within a few tokens of where it was made.

### Where the checker is not safe to point at a stream (measured)

| Input | Result |
|---|---|
| 500 nested elements | `nesting-too-deep`, 26 ms (the cap is 128 levels, and a block counts as 3; documented in the diagnostics manual and spec §9) |
| 1,000 siblings (14 KB) | about 0.15 s (131 and 146 ms in two runs) |
| 2,000 / 4,000 / 8,000 siblings | about 0.45 s / 2 s / 7 to 8 s (two runs each): **quadratic** |
| 20,000 siblings (280 KB) | **46 seconds** (the first run was stopped at 40 s) |
| 1,000 / 2,000 attributes on one element | about 0.15 to 0.2 s / 0.5 to 0.8 s |
| 10,000 attributes on one element | **15 seconds** |
| 5 MB of text in one element | 332 ms, accepted |
| 1 MB unterminated string | 56 ms, `missing-closing-tag` |

There is no input limit and the sibling cost is quadratic. A model that runs away, or an attacker who controls the prompt, held the checker for 46 seconds at 280 KB (re-run without a cutoff), and the quadratic growth puts about 560 KB at minutes (extrapolated). Timings varied by 30 to 50 percent between runs. A streaming check that re-checks the whole prefix on every chunk would make the **total** cost of a stream cubic in its length for sibling-heavy input (the sum of k squared over the chunks); ordinary pages cost about 0.3 ms.

### What the language already refuses (measured)

| Input | Diagnostic |
|---|---|
| `<script>` element | `unknown-component` |
| HTML written in text | `unknown-component` (it is a tag the manifest lacks) |
| `fetch("http://...")` as an event handler | `unknown-command` |
| `eval(name)` in an expression | `command-outside-handler` |
| `title="javascript:alert(1)"` on a string prop | **accepted** |

The last row is not a checker bug. A string prop is a string, and the checker cannot know that a prop is a link. Whether `javascript:` is safe depends on the primitive that realizes the prop, so it is decided in the primitive specification ([Bet 1](primitive-specification.md)) and enforced by the PORT, which does not trust the tree.

### Who is hurt

- **Builders of assistants** that produce screens cannot show anything until the model finishes, and cannot tell the model what is wrong until then.
- **Anyone exposing generation to users** has no stated limit on what the checker will accept or how long it takes.
- **Library authors** have no way to say which of their components or commands a model may use.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** from general knowledge, not read in this session; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| A2UI (**P**, [README](https://raw.githubusercontent.com/google/A2UI/main/README.md), [catalogs](https://raw.githubusercontent.com/google/A2UI/main/docs/public/concepts/catalogs.md), [protocol](https://raw.githubusercontent.com/google/A2UI/main/specification/v0_9_1/docs/a2ui_protocol.md)). Self-described "early stage public preview" at v0.9.1 | A stream of JSON messages. "A2UI is a declarative data format, not executable code": the client holds a "catalog" of approved components, and "all A2UI JSON sent from the agent is validated against the chosen catalog". Components may name children that have not arrived; clients render placeholders and begin once the `root` is defined. Failures go back to the agent as an `error` with `code`, `surfaceId`, `path` and `message`. Unknown components should degrade gracefully, not fail the surface | The same family and the same answers on the catalog and on the error loop. We differ on two points: the unit is a checked template, not loose JSON components, and we fail closed on unknown components even while previewing, because our pitch is that nothing unchecked is drawn |
| Airbnb server-driven UI (**S**, listed in [leads](../prior-art.md)) | Sections, screens and actions as data | Not read; no claim taken from it |
| tree-sitter (**P**, [README](https://github.com/tree-sitter/tree-sitter)) | An incremental parsing library that can "efficiently update the syntax tree as the source file is edited" | Supports the incremental design below |
| This ecosystem (**Repo**) | Diagnostics are data: stable `code`, `span`, `suggestions`, one diagnostic per mistake; the runtime refuses invalid programs and returns diagnostics, never an exception | The loop's wire format already exists |

## Constraints

- **Fail closed** ([architecture](https://github.com/ValanceX/Mesh/blob/main/docs/ARCHITECTURE.md)). Nothing unchecked is drawn, in a preview too.
- **Generated UI may only express structure, bindings, simple expressions and intent.** A model never gets code execution. Commands are intents that Nexus decides on.
- **The PORT contract is unchanged.** A preview is an ordinary `render` and `update`.
- **Fixed point 9 and the build-mode rule.** The streaming checker is not in the start-up path of an ordinary application. It loads when a page uses generation.

## Design

### 1. A profile: what a model may use

A **profile** is a named subset of a manifest: the components, props, events and commands a generator may reach. The checker run for generation uses the profile as its model, so a component outside it is `unknown-component`, exactly as today. Libraries ([Bet 12](reference-library.md)) can ship a profile. The profile is also the source of the model's prompt (a compact text rendering of the same data), so the checker and the prompt cannot disagree.

### 2. A stream session

```
const session = open(profile, { limits });
const step = session.push(chunk);   // step: { preview, diagnostics, pending }
const done = session.close();       // same result as a batch check of the whole text
```

- **Prefix acceptance.** After each chunk the session cuts back to the last complete token and closes what is open (the repair above, done by the checker, not by the host). It checks the result. The model never sees the synthesized closers.
- **`preview`** is the tree from the repaired prefix, or nothing while a diagnostic stands. It holds only complete elements and the ancestors still open.
- **`diagnostics`** are the repaired prefix's, with spans mapped back to the real text, each reported once.
- **`pending`** lists what is open (an element, a block), so a host can show a placeholder.
- **The law:** `close()` returns exactly what a batch check of the concatenated text returns. Property-tested.
- **Append-only:** a later chunk can add nodes, never change or reorder those already in a preview. Keys and positions give the identity ([§9.10](https://github.com/ValanceX/Mesh/blob/main/docs/MPRX-SPEC.md)), so a preview updates by `update` with append patches.

### 3. Limits, and an incremental check

| Limit | Default | On exceeding |
|---|---|---|
| Source size | 64 KB | `input-too-large`, nothing else is parsed |
| Nesting depth | The existing cap (128 levels; a block counts as 3) | `nesting-too-deep` (exists) |
| Elements | 5,000 | `too-many-elements` |
| Attributes on an element | 64 | `too-many-attributes` |
| Time per `push` | 50 ms of checker time | `check-budget-exceeded`, session ends |

The sibling and attribute paths become linear, and a session checks only from the last stable point. The measured quadratic cost is a bug in its own right and is fixed whether or not streaming ships. The limits are budgets in the sense of [Bet 3](budgets.md): a test fails if a documented input exceeds its time.

### 4. The correction loop

The loop is: stream, collect the diagnostics of the first failing step, send the model `code`, `span`, the offending text and `suggestions`, and let it continue from the last good point or restart. The contract, stated once:

- At most **3 rounds** by default, then fall back to the last good preview or to text.
- A diagnostic is sent once. A resend with the same `code` and `span` counts as no progress.
- Match on `code`, never on `message` (the guide's rule, kept).
- The host chooses whether to restart the whole text or to continue; the checker is stateless between sessions.

### 5. What a model cannot do

Beyond the profile, three rules are stated and tested:

1. **No value crosses into code.** There is no expression form that calls anything but a declared command, and no command is invoked at render; an event only requests one.
2. **Commands from generated UI go through the same Nexus handler as any other**, with the arguments the manifest types. A command that needs consent says so in its own contract; generation adds no new path.
3. **Values with meaning beyond text** (a link, a path, a color) are typed by the primitive that takes them, and the PORT refuses what the primitive does not allow. The `javascript:` case above is decided there, in [Bet 1](primitive-specification.md), not in the checker.

### 6. Where it lives

The session, the limits and the incremental check are in MESH (a `mesh-compiler` mode). The profile, the prompt text and the loop helper are in Valance. Nothing changes in a PORT.

### Alternatives considered

| Option | Why not |
|---|---|
| Batch only: wait for the end, then check | Measured above: the first mistake is hidden until the end, and the model hears nothing for the whole stream |
| Render what parses, check afterwards | Draws unchecked UI; breaks fail-closed |
| Skip unknown components and draw the rest (A2UI's graceful fallback) | The right call for a client that cannot reach the agent. For us it hides a mistake the model could fix in one message |
| Stream JSON components, not templates | Loses the template checker, the keyed lists and the types that make the check strong |
| Run the model's output in a sandbox | The language has nothing to run. The risk is resource use and meaning, which limits and typed props address |
| A separate "generation language" | Two languages to teach, check and render |

## Experiment

1. **The law.** Property-test `close()` against the batch checker over the conformance programs and 100,000 random prefixes and mutations. Any difference is a finding.
2. **The preview.** Stream the 276-byte page through `update`, byte by byte, and check that each step is an append patch and the final tree equals a direct render.
3. **Limits.** Add the limits and fix the quadratic paths. Re-run the table above; no row may exceed its limit's time.
4. **A real model.** Give a model the profile of the [reference library](reference-library.md) and ten tasks. Count rounds to a clean file, with and without streaming diagnostics, and tokens spent.
5. **Hostile set.** Fuzz with a seed (the MESH fuzzers already take `MESH_FUZZ_SEED`) and record any input that takes over 100 ms per kilobyte.

## Success

- `close()` equals the batch result on every tested input.
- A planted mistake is reported within 20 bytes of its start on the test set, as it was in the measurement above.
- No input within the limits takes over 100 ms per kilobyte; an input over a limit is refused in under 5 ms.
- A model reaches a clean file in no more rounds with streaming diagnostics than without, and in fewer tokens on at least half the tasks.
- No test input draws an unchecked node in a preview.

## Kill

- If incremental checking cannot be made linear without changing the language's grammar, check the whole repaired prefix on a timer instead (every 200 ms) and document the cost.
- If models are not helped by early diagnostics (rounds and tokens no better), keep the limits and the profile, drop the preview, and leave batch repair as the loop.
- If the repair of a prefix is wrong often enough to hide real errors (a mistake reported late or not at all in more than 5 percent of the random set), make the repair stricter and report fewer prefixes as acceptable.

## Breaks (allowed in the free window)

- MESH adds limits, so some very large files that check today are refused.
- New diagnostic codes (`input-too-large`, `too-many-elements`, `too-many-attributes`, `check-budget-exceeded`).
- A profile format beside the manifest.

## Open questions for stage 3

- **Streaming inside text and strings.** Whether a half-written text run shows as it grows, or only when its element closes.
- **Which block constructs a preview may show early** (an `{#each}` with one row written).
- **Consent for commands** that change data, and who owns the prompt that asks.
- **Replay of a generation session** ([Bet 15](replay.md)): whether chunks and diagnostics are logged, and what is redacted.
