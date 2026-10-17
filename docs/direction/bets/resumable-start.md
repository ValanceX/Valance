# Bet 14: Starting from what the server already did

| | |
|---|---|
| **Stage** | 3 Prototype for the early-input shell (measured in a scratch copy, not in the repository); 2 Design, accepted by delegation, for the rest. The decisions are in [decisions](../decisions.md) (H1 to H8); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 3](budgets.md) (the metrics and the start-up path). [Bet 10](collections.md) bounds the size of a page, which decides whether the original idea is ever needed |

## Question

The bet was opened as: *can a page start from the render tree without re-evaluating it?* Measuring it showed that question is the smaller one. The brief therefore answers three:

1. Is skipping the client's render-and-verify worth its complexity?
2. What happens to a tap that arrives before the application is ready, and can it survive?
3. Where does start-up time actually go?

## Why, and who is hurt

### What start-up costs for a server-rendered page

A server-rendered list page, hydrated in Chromium (median of 5 fresh contexts, brotli over localhost, the WebAssembly compiled in parallel as in [Bet 3](budgets.md#8-the-start-up-path-and-the-deferred-set)), at no throttling and at a 4x CPU slowdown:

| Rows | CPU | First paint | Before the script runs | `init` | Start, render, verify, adopt | Interactive at |
|---:|---|---:|---:|---:|---:|---:|
| 10 | 1x | 32 ms | 161 ms | 1 ms | 56 ms | 218 ms |
| 10 | 4x | 72 ms | 671 ms | 6 ms | 400 ms | 1,090 ms |
| 100 | 1x | 40 ms | 177 ms | 2 ms | 82 ms | 260 ms |
| 100 | 4x | 112 ms | 618 ms | 6 ms | 389 ms | 1,033 ms |
| 1,000 | 1x | 56 ms | 185 ms | 2 ms | 202 ms | 382 ms |
| 1,000 | 4x | 164 ms | 791 ms | 10 ms | 920 ms | 1,723 ms |
| 5,000 | 1x | 140 ms | 257 ms | 4 ms | 511 ms | 746 ms |
| 5,000 | 4x | 236 ms | 1,222 ms | 21 ms | 2,347 ms | 3,580 ms |

"Before the script runs" is the time from navigation until the module starts executing: download, parse and top-level evaluation of the bundle (the counter application's is 608 KB; the list page's size was not recorded). "Interactive at" is when hydration finished and the page responds. Run-to-run spread was large (one 1,000-row figure was 139 ms in one run and 202 ms in another), so read these as shapes, not decimals.

What the table says:

| Finding | Evidence |
|---|---|
| **The fixed cost dominates ordinary pages.** Start-up work is about 56 ms (1x) and 390 to 400 ms (4x) whether the page has 10 or 100 rows | rows 10 and 100 |
| **The per-row part is small until a page is large.** About 0.15 ms per row at 1x and 0.54 ms at 4x. Share of "interactive at" that is rows: about 10 percent at 100 rows (1x, and within noise at 4x), 38 percent (1x) and 31 percent (4x) at 1,000 rows, and 61 and 55 percent at 5,000 rows | derived from the table |
| **Loading the script is the largest single part for ordinary pages.** 618 to 671 ms of the ~1,050 ms at 4x, before any application code runs | "before the script runs" |
| **The WebAssembly is not on the critical path** once it is compiled in parallel: `init` is 1 to 10 ms for pages up to 1,000 rows | `init` column |
| **Content is visible long before it works.** At 4x, the page paints at 72 ms and responds at 1,090 ms | first paint against interactive |

### The dead zone

Between first paint and "interactive" is about a second at 4x CPU, in which the page looks ready and is not. The PORT contract says so: "Nothing is reported before hydration, and interactions before it are not replayed" ([PORT contract](https://github.com/ValanceX/Port/blob/main/docs/CONTRACT.md)). What that means in practice, measured on a server-rendered counter at 4x CPU, with the tap made 100 ms after the button appears:

| | Taps before the app was ready (n = 9) | Median ms of the tap that landed before ready, then ms to ready (two values) | Count after everything settled |
|---|---:|---|---|
| Today | 7 of 9 | 197 ms, 965 ms | **0 in all 7**: the taps were lost |
| With the prototype shell | 6 of 9 | 182 ms, 959 ms | **1 in all 6**: each was replayed once |

The prototype shell is 389 bytes (258 gzipped), inline in the document. The test used an in-page `button.click()`, which is not a trusted event; the shipped version records only trusted events, so its conformance test must drive real input through the browser's input protocol. That is a limit of this measurement.

### Who is hurt

- A person on a mid-range phone taps "Add to cart" at 300 ms and nothing happens, with no sign that anything was wrong.
- A page that paints early and works late has a worse experience than one that paints late and works, because the first lies.
- An engineer measuring "first paint" sees a good number and misses this.

## Prior art

Reliability: **P** primary source read through a fetch agent; **S** secondary; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What happened | Lesson here |
|---|---|---|
| Qwik (**S**, the author's own articles) | Hydration "repeats work the server already did"; a resumable framework serializes boundaries, listeners and the reactivity graph so execution continues where the server left off. The performance figures are the vendor's | The idea is sound in kind. Whether it pays here depends on the cost structure, and the measurement above says per-row work is the minority for ordinary pages |
| Angular deferrable views on the server (**P**, [defer](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/guide/templates/defer.md)) | On the server a deferred block renders its placeholder and its triggers are not invoked | A related but different tradeoff. This ecosystem renders the whole page on the server |
| This ecosystem, hydration (**Repo**, [PORT contract](https://github.com/ValanceX/Port/blob/main/docs/CONTRACT.md#web-server-html-and-hydrate)) | `hydrate` "verifies the whole DOM against the tree without changing it, then adopts it, keeping every server node", and a mismatch draws afresh. Verification is atomic and mutation-free | The safety property is real and worth keeping. Skipping verification is what a resumable design would trade away |
| This ecosystem, controlled fields (**Repo**) | "Text typed before `hydrate` is replaced by the rendered text: the application's value is authoritative." | Typed text is also lost in the dead zone. The shell can keep it |
| React's replay of discrete events during hydration, Astro islands | Other answers to the same dead zone | **Not researched in this session.** The design does not rely on them |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 3, 4, 6, 8 and 9:

- **The PORT contract does not change.** What the PORT promises about hydration stays true; replay is the composer's job (Valance's).
- **Hydration stays verified and fail-closed.** Nothing here may weaken it.
- **Only trusted input is replayed**, so a script on the page cannot forge a user's action.
- The shell is part of the start-up path, so it is tiny and has no dependencies.
- Links keep working without JavaScript. Nothing here makes them depend on it.

## Design

### A. The early-input shell (build this)

A small inline script, written into every document by `vlx build`, records the person's early actions and replays them once the application is ready.

| Part | Rule |
|---|---|
| **What it records** | Trusted discrete events only: a click or tap on a control, a form submit, Enter or Escape in a text field. The event types come from the primitives table (the same `events` data the PORT realizes), so the shell listens to exactly what the page's primitives use |
| **What it never records** | Clicks on links. They navigate natively, as they do in a static site, and need no replay. Continuous events such as pointer movement and scroll |
| **Typed text** | The last value of each text field the person typed in is kept and, after hydration, replayed as an input event, because hydration otherwise writes the application's value over it |
| **When it replays** | After hydration has verified and adopted the server's DOM, so the targets are the live nodes |
| **How it replays** | By dispatching a new event of the same type at the same adopted node, so the PORT's normal event resolution handles it. In order, one at a time, waiting for each command to settle (Valance already has `settled`) before the next |
| **Limits** | At most 20 events, none older than 10 seconds |
| **When it drops** | An event whose node is gone, and everything if hydration fell back to a fresh draw after a mismatch (the targets are different nodes, and the person did not see the page the tree describes) |
| **Feedback** | The document root carries `data-vlx="starting"` until the application is ready, and the shipped stylesheet gives controls a busy cursor and `aria-busy`, so a person is told the page is not ready and does not tap repeatedly |
| **Configuration** | None. It is generated |

**Why replay at the adopted nodes works.** Hydration "keeps every server node", so the element a person tapped is the element the PORT's listeners end up on. Because the server and the client start from the same state, the page the person saw is the page the tree describes, so the action means what they meant.

### B. Cut the fixed cost (the real lever)

Most of "interactive at" is the script arriving and the application starting. This belongs to [Bet 3](budgets.md), and this brief adds the metrics it needs:

| Metric | Baseline |
|---|---:|
| Interactive at, 10-row server-rendered page, 4x CPU | 1,090 ms |
| Dead zone (interactive at minus first paint), same page | about 1,020 ms |

The work: profile the start sequence (the module's top-level evaluation, the Effect layers, the application start, the first render, the PORT's verify and adopt) to find what the roughly 400 ms at 4x consists of, then cut bytes (the 46 KB of `fast-check` and `pure-rand`, Effect through subpaths) and the work in start itself. Targets are set after the profile, not before.

### C. Resuming from the tree (parked)

The original idea: the server embeds what the client would compute, and the client adopts it without rendering or verifying. It would save only the per-row part of start-up, 0.15 ms a row at 1x. It would cost the verified, fail-closed hydration, and would need the client to build its kept render lazily on first use.

**Parked, with a trigger.** Revisit it if a real page, after [windowing](collections.md) has bounded it, still spends more than a third of "interactive at" on rows, which the measurement puts at roughly 1,000 rows at 4x. A cheaper alternative to try first is to verify in idle slices rather than skip verification.

### D. What this corrects

[Bet 3](budgets.md) listed, as later work, that this bet "may move the WebAssembly out of the start-up set entirely". Measured: with the module compiled in parallel, `init` is 1 to 10 ms, so there is nothing to gain. The WebAssembly stays in the start-up set and the note in Bet 3 is changed.

### Alternatives considered

| Alternative | Why not |
|---|---|
| Do nothing | A tap in the dead zone is lost silently. Measured: 7 of 9 |
| Disable controls until the application is ready | Honest, and the page looks broken for a second. Feedback plus replay is strictly better |
| Fully resumable, with handlers loaded on demand (Qwik's design) | Contradicts the direction that everything else loads as soon as the app has started, and the saving for ordinary pages is small |
| Replay every event, links included | Links already work natively, and replaying them would make a page navigate twice |
| Skip hydration verification | Removes the guarantee that a mismatch cannot half-adopt. Not worth the per-row saving |

## Experiment

1. **Conformance first** (written before the shell): events recorded and replayed in order; a cap and a staleness limit; links untouched; trusted events only; typed text restored after hydration overwrites it; everything dropped on a mismatch fallback; no event applied twice; the shell absent from a page with no controls.
2. **Trusted input in the harness.** Add a tap-at-100-ms scenario to the Bet 3 harness using the browser's input protocol, and the metrics "interactive at" and "dead zone".
3. **Build the shell** into `vlx build`'s documents and the Valance client, with the readiness signal and the busy styling.
4. **Profile the start sequence** at 4x CPU and write down where the roughly 400 ms goes.
5. **A 5,000-row page with and without the Bet 10 window**, to see whether the parked idea is needed after windowing.

## Success

- Every trusted tap and keystroke made in the dead zone is applied exactly once, in order, after the application is ready. None is lost.
- A link clicked in the dead zone navigates normally.
- Hydration is still verified, and a mismatch still draws afresh and drops the queue.
- The shell is at most 1 KB gzipped.
- The profile exists, and the first cut to the fixed cost is measured against the new "interactive at" metric.

## Kill

- If replay causes surprising double effects in real applications (a payment, a send), make replay opt-out per control, with a prop in the primitive's specification, and default it off for controls that declare themselves non-idempotent.
- If the list of event types the shell needs grows past a click, a submit and two keys, restrict it to click and submit.
- If the busy feedback is not enough to stop repeated taps, add a visible "starting" state to the control and ignore taps on it.
- If the profile finds the fixed cost is mostly Effect's evaluation, the lever is the dependency, and the brief hands off to Bet 3.

## Breaks (allowed in the free window)

None to the language or the formats. `vlx build`'s documents gain the inline shell and a `data-vlx` attribute, and the shipped stylesheet gains the busy styling.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../decisions.md) H9 to H12. Measured in Chromium 141.

**Non-idempotent controls: a per-control declaration `replay: "safe" | "never"`**, default `"safe"` for `button`, `checkbox` and `textfield`, set by an author prop. A tap on a `replay: "never"` control in the dead zone is dropped and the control shows the busy state. It cannot be per primitive only, because "Pay" and "Like" are both buttons. Precedent: Phoenix LiveView disables a submit button and adds `phx-submit-loading` while a submit is pending, and "LiveView ignores clicks on elements that are currently awaiting an acknowledgement": block while pending, declared per element. Stripe's idempotency keys were not retrieved and Qwik's docs were only listed, so those precedents are unverified. The web vocabulary has `disabled` only on `button` and no declaration of replay safety today.

**Preserve every field whose value differs from its server default, not only the focused one.** Measured over 30 repetitions: capturing and restoring cost at most 0.1 ms for 200 inputs (below the timer's resolution for 1 and 20; the same at 4x CPU), and per-keystroke tracking 0.002 to 0.01 ms per event, so the "only the focused field" shortcut saves nothing. Loss modes found: writing a different value into a focused input moves the caret to the end (selection [1,3] became [5,5]); writing the same value keeps the selection; focus survives value writes; and a `setAttribute("value")` after the user has edited does not change the displayed value (the dirty flag). Restore by writing a value only when it differs, then restore the caret of the focused field with `setSelectionRange`. Not tested: file inputs (cannot be restored by script), input-method composition, autofill, and select, radio and checkbox state.

**Keyboard shortcuts: the shell covers none for now.** The vocabularies declare no shortcuts: a search of the common, valance, port-web and port-desktop sources finds only the text field's `submit` (Enter) and `cancel` (Escape), the per-event `key` field, and the Desktop's Enter, Escape and back/forward mapping. The event types needed are click, input, change and the Enter and Escape keys, matching the brief's kill threshold. Revisit when the primitive specification adds a shortcut field.

**Real devices** are the platform's concern (see [Bet 3](budgets.md)). What the shell does is specified in terms of events and DOM state, and checked against the DOM and UI Events specifications.

## Open questions for stage 3

- **Which real controls are non-idempotent** needs real applications.
