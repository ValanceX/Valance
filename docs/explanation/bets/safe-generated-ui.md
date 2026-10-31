# Bet 13: Safe generated UI

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The checker's behavior on partial input, on hostile input and on injection-shaped input was measured on 2026-10-17 with the published `@valancex/mesh-compiler` and `@valancex/mesh-runtime` 0.13.0. The decisions are in [decisions](../direction/decisions.md) (G1 to G10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 3](budgets.md) (limits are budgets). [Bet 1](primitive-specification.md) (what a prop may carry). Uses [Bet 15](replay.md)'s format to keep a generation session |

## Question

Can a model's partial MPRX be checked against a manifest while it streams, shown early when it is safe to, and corrected by the model, with no input able to make the checker slow, wrong or unsafe?

## Why, and who is hurt

### What exists

MESH's pitch is that generated UI "fails closed": the architecture document says Valance "never blindly executes generated UI", and the language can only express structure, bindings, simple expressions and intent. The guide ["Repairing generated UI"](https://github.com/ValanceX/Mesh/blob/main/docs/how-to/checking-against-a-component-model.md) gives the loop for a **finished** file: run `mesh check --format json`, decide by exit status, match on `code`, point at `span`, apply `suggestions`, and "fix each diagnostic once" (a mistake gets one diagnostic). That is a batch check. Nothing is defined for a file that is still arriving.

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

Reliability: **P** primary source read through a fetch agent; **S** from general knowledge, not read in this session; **Repo** this ecosystem's own record. See [prior art](../direction/prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| A2UI (**P**, [README](https://raw.githubusercontent.com/google/A2UI/main/README.md), [catalogs](https://raw.githubusercontent.com/google/A2UI/main/docs/public/concepts/catalogs.md), [protocol](https://raw.githubusercontent.com/google/A2UI/main/specification/v0_9_1/docs/a2ui_protocol.md)). Self-described "early stage public preview" at v0.9.1 | A stream of JSON messages. "A2UI is a declarative data format, not executable code": the client holds a "catalog" of approved components, and "all A2UI JSON sent from the agent is validated against the chosen catalog". Components may name children that have not arrived; clients render placeholders and begin once the `root` is defined. Failures go back to the agent as an `error` with `code`, `surfaceId`, `path` and `message`. Unknown components should degrade gracefully, not fail the surface | The same family and the same answers on the catalog and on the error loop. We differ on two points: the unit is a checked template, not loose JSON components, and we fail closed on unknown components even while previewing, because our pitch is that nothing unchecked is drawn |
| Airbnb server-driven UI (**S**, listed in [leads](../direction/prior-art.md)) | Sections, screens and actions as data | Not read; no claim taken from it |
| tree-sitter (**P**, [README](https://github.com/tree-sitter/tree-sitter)) | An incremental parsing library that can "efficiently update the syntax tree as the source file is edited" | Supports the incremental design below |
| This ecosystem (**Repo**) | Diagnostics are data: stable `code`, `span`, `suggestions`, one diagnostic per mistake; the runtime refuses invalid programs and returns diagnostics, never an exception | The loop's wire format already exists |

## Constraints

- **Fail closed** ([architecture](https://github.com/ValanceX/Mesh/blob/main/docs/explanation/architecture.md)). Nothing unchecked is drawn, in a preview too.
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
- **`preview`** is the tree from the repaired prefix, or nothing while a diagnostic stands. It holds only complete elements and the ancestors still open, plus a trailing text run that is still growing inside a complete open element. An open `{#each}` is withheld until its `{/each}` arrives.
- **`diagnostics`** are the repaired prefix's, with spans mapped back to the real text, each reported once.
- **`pending`** lists what is open (an element, a block), so a host can show a placeholder.
- **The law:** `close()` returns exactly what a batch check of the concatenated text returns. Property-tested.
- **Each step is a fresh render.** A repaired prefix is a different program from the next one, so no node keeps its identity between steps (measured: 0 of 3 keys shared) and `update` cannot carry one preview to the next; the PORT draws each preview afresh. The earlier claim that a later chunk only appends to a preview holds for text and for `{#if}` blocks, and fails for an open `{#each}` with a multi-element body.

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
2. **The preview.** Stream the 276-byte page through `render`, byte by byte, and check that every step is a prefix of the final tree except for a growing text run, and that the final tree equals a direct render. (Done on a 491-character page: see "Answered by research".)
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

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../direction/decisions.md) G11 to G14. Run on a 491-character page (long text, an attribute string, interpolations, `{#if}`, `{#each}`, an accented letter and an emoji) with every prefix, using the published compiler and runtime and a scanner-based repair of my own.

**Correction to the design above.** The brief said a preview updates with `update` and append patches, and that a later chunk only adds nodes. **Both are wrong as written.** Each repaired prefix is a different program, and node identity includes the program (spec §9.10.8): a repaired prefix and a longer program share 0 of 3 keys, and `update` cannot change program. So **every preview step is a fresh `render` that the PORT draws afresh** (Valance's `connect` does exactly that when the view changes). And the append-only property is false in one case: for an open `{#each}` whose body has two elements, 24 of the prefixes tested are not a prefix of the final tree (the preview holds `[row1, row2, row3]` where the final tree is `[row1, text1, row2, text2, ...]`; `each` inside `each` gave 21 violations). `mesh-each` takes exactly one element child and a longer body becomes a fragment.

**Text growing mid-stream.** Raw prefixes are clean 1 time in 491. Cutting at the last complete token and closing what is open checked clean and rendered for 486 of 486 prefixes (5 repair to nothing and are excluded); 360 are an exact prefix of the final tree and 126 differ only because a text run grows. Keeping the partial trailing text was clean and prefix-consistent for 485 of 486; the exception is a lone surrogate, which the checker accepts and renders as U+FFFD (a cut UTF-8 byte does the same). **The rule: draw a trailing text run as it grows, but only inside an already-complete open element; never draw anything cut inside an attribute string, an attribute expression, an interpolation or a tag.** Measured why: closing a cut attribute string and its tag checks clean with a **different value** in 39 of 40 attribute-string prefixes, so drawing it would show wrong data. Drop a trailing lone high surrogate, or decode with a streaming UTF-8 decoder, before checking. MPRX has no entities, so a text run is any text outside `<` and `{`. A number that grows ("5" then "50") is visible and wrong for a moment; that is a product choice.

**Blocks.** `{#if}`/`{:else}` and nesting may show early after repair: in both data states every prefix was a prefix of the final tree, as were `each` inside `if` and `if` inside `each`. **An open `{#each}` is withheld until `{/each}` arrives.** A body of one element was append-only (116 prefixes, plus 6 where text grows). Bodies of three or more elements and composites were not run.

**Consent for commands that change data.** Add `effect: "read" | "write" | "destructive"` to a command in the manifest; it is required for any command in a generation profile, so a missing one is a profile error. The host (Valance) shows the prompt at dispatch, before invoking the Nexus command, built from the manifest's command title and the typed arguments with sensitive arguments masked, **never from text the model wrote**. MCP's 2025-11-25 specification defines the hints `readOnlyHint` (default false), `destructiveHint` (default true), `idempotentHint` (default false) and `openWorldHint` (default true), says "Clients should never make tool use decisions based on ToolAnnotations received from untrusted servers", and says "there SHOULD always be a human in the loop with the ability to deny tool invocations". Our annotations come from the application's own manifest, so they are trustworthy where MCP's are not; a model-generated button label can lie, which is why the prompt cannot come from it. A2UI's actions page has no consent concept: safety there is restriction to pre-registered behaviors. Prompt appearance per target is not settled.

**Replaying a generation session.** Log `chunk` lines verbatim with a round number; the `profile` and `limits` hashes in the header; a `program` hash line per preview (each preview is a different program, so one header hash is not enough); `check` lines with the diagnostic `code` and `span`; and a `tree` hash per preview. Do not log the prompt or the model's reasoning. **The 50 ms per-push budget is wall-clock, so replay cannot recompute it: log a budget trip as an input**, as a `result`. The player re-runs the compiler, and a program-hash mismatch is reported separately from a runtime divergence. Treat chunks as sensitive and development-only: the model may copy user data into text and string literals, which the `sensitive` field marker cannot cover. Whether compiler output is stable across versions was not measured.

## Open questions for stage 3

- **How a model chunks its output in practice**, and whether people dislike growing text.
- **Open `{#each}` with three or more elements, and composites**, were not run.
- **Consent prompt appearance** per target and how a PORT surfaces it.
- **Whether compiler output is stable across versions**, for replaying a generation session.
