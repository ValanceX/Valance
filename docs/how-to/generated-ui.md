# Generated UI

> **TL;DR:** Let a model write the interface while VALANCE checks it as it arrives and draws only what passed. For hosts that stream generated UI.

## Prerequisites

* An application with a manifest: [Your first application](../tutorials/01-first-application.md).
* MESH 0.17 or later.

---

Let a model write the interface, and draw only what was checked. **Provisional** ([API stability](../reference/stability.md)); it needs MESH 0.17. Nothing in an ordinary application loads it: `@valancex/valance/generate` is its own entry, and no page's start-up set holds it.

## The shortest path

```ts
import { profile, promptOf, generation, previewProgram } from "@valancex/valance/generate";
import { admit } from "@valancex/valance";

// What a model may use: your manifest, with the commands that say what they do.
const allowed = await profile(manifest);          // the page component is "page"
const instructions = promptOf(allowed);           // the vocabulary, written from that data

const attempt = await generation(allowed);
for await (const chunk of model(instructions)) {
  const update = await attempt.push(chunk);
  update.diagnostics;                             // what this chunk got wrong, each mistake once
  if (update.preview) {                           // checked, and a prefix of the final page
    await Effect.runPromise(admit(handle, "generated", { program: await previewProgram(allowed, update.preview), scope }));
  }
}
const outcome = await attempt.finish();           // exactly the check of the whole text
```

* `profile(manifest)` is a **subset of the manifest**: every component but the page, and the page's commands that carry an `effect` and a `title`. A destructive command is not offered unless you name it. What was left out and why is `allowed.omitted` (for you, never sent to the model).
* `promptOf(allowed)` is the part of a prompt that says what exists. It is written from the same data the checker uses, so the two cannot disagree; the task and the style are yours.
* `push` checks what has arrived. A mistake is reported **once**, a few bytes after it is written (within 20 bytes of its start in the conformance cases); a preview is present only while **no error stands**, and it is drawn as a **fresh render** (a different program from the one before it; `admit` replaces the view). Number `preview.n` rises, so a draw that finishes late can be dropped.
* `finish()` is `check` of the whole text, however it was cut.

## When the model is wrong

```ts
let message = await attempt.correction(outcome);   // text for the model, or undefined
```

`correction` returns the mistakes the model has **not been told yet**, one line each, built from the diagnostic's code, the text it points at and MESH's suggestion (never from model words), and opens the next round. It returns `undefined` after three corrections (the limit of decision G7), or when there is nothing new to say. Match on `code`; a mistake is sent once.

## Commands: nothing runs without you

A generated page can only bind the commands the profile offers, with the manifest's typed arguments. The guard stands in front of whatever runs them:

```ts
const guard = commandGuard(allowed, (prompt) => ask(`${prompt.title}? ${prompt.effect === "destructive" ? "This cannot be undone." : ""}`));
const decision = await guard("add", { label: "milk" });   // { allowed: true } or { allowed: false, reason }
```

A `read` command runs. A `write` or `destructive` command asks `consent` with a prompt made from the manifest's `title` and `effect` and the typed arguments, **never from text the model wrote**; with no `consent` given, nothing that changes anything runs. A command the profile does not offer is `not-offered`.

## Tuning

| What | How | Default |
|---|---|---|
| The page, the name | `profile(manifest, { page, name })` | `"page"`, `"generated"` |
| The components a model may use | `components: [...]` | all but the page |
| The commands a model may bind | `commands: [...]` (a destructive one only appears here) | those with an `effect` and a `title`, except destructive |
| Checker time one push may take | `generation(p, { pushMs })` (at most 50) | 50 ms |
| Correction rounds | `generation(p, { rounds })` (at most 3) | 3 |
| A record of the generation | `generation(p, { record: (line) => … })` | none |

The checker's own limits (64 KB, 5,000 elements, 64 attributes, depth 128) are not options. A push over its budget ends the round (`update.ended`): show the last preview or text; `finish()` still gives the whole check.

## The record, during development

`record` receives each line of the generation: the profile's hash, the limits, each chunk **verbatim** with its round, the codes and a hash of each preview, and the end of each round. **Not the prompt and not the model's reasoning.** It holds what the model wrote (and so may hold your users' data): keep it out of a production bundle and out of version control. `replayGeneration(allowed, lines)` feeds the chunks to a fresh session and returns the first line that differs, or `undefined`; a budget trip is logged as an **input** and replayed as one, so a replay reads no clock.

## What it will not do

* It does not call a model, render, or run a command. It tells you what to draw and what may run.
* A link's `href` is typed by the primitive's specification, and the PORT refuses what it does not allow (decision G9); the checker only knows a string.
* An open `{#each}` is not drawn until it closes, and nothing cut inside a tag, an attribute or an expression is drawn ([streaming in MESH](https://github.com/ValanceX/Mesh/blob/main/docs/reference/streaming.md)).
* The tree hashes of previews are not in the record: the library renders nothing. The conformance kit renders every preview and checks it ([Replay and conformance](replay-and-conformance.md)).

## Next steps

* [Replay and conformance](replay-and-conformance.md): replaying what a generation drew.
