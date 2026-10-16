# Form primitives: `kind`, `invalid` and `describedby`, `blur` and `focus`

Design note for gaps RF-1, RF-2 and RF-3 of [the reference form](../findings/2026-10-16-reference-form.md). Written 2026-10-16 **before** the implementation, so the implementation can be checked against it. Statements are numbered (`F-n`); "Implementation status" at the end is filled in after the check.

## What the form could not say

| Gap | What the form needed | What it got |
|---|---|---|
| RF-1 | A password that is masked | A text field with no `type`: the password shows as typed |
| RF-2 | An invalid field marked invalid, tied to its message | Nothing: no `aria-invalid`, no `aria-describedby`, no `id` on the message |
| RF-3 | "The person left this field" | No `blur`, no `focus`: validate-on-blur and "touched" are impossible |

The direction (gap analysis DP1, DP2, DP6): these are **intent that has a stable meaning on every target**, so they belong in the portable core (same names on web and desktop), realized by each PORT; a target-specific thing would be an explicit extra. The evidence is one real form with three of them in the way of an ordinary sign-up.

## The statements

- **F-1 `kind`.** `textfield` takes an optional `kind`: `text` (the default), `password`, `email`, `number`, `search`, `tel` or `url`. On the web it is the input's `type`. On the desktop `password` masks what is shown and the others are plain text (a keyboard hint where a platform has one). A value outside the list is `text` on the desktop and whatever the browser makes of an unknown `type` (text) on the web. `kind` is a string; a typo is not a diagnostic.
- **F-2 `invalid`.** `textfield` and `checkbox` take an optional boolean `invalid`. It is the state "this value is not acceptable": on the web `aria-invalid` (`true`/`false`); on the desktop the control is outlined and its accessible state is invalid.
- **F-3 `describedby`.** `textfield` and `checkbox` take an optional string `describedby`, the `id` of the text that explains the control (its error message, a hint). On the web `aria-describedby`; on the desktop the control's accessible description is that text.
- **F-4 `id` on text.** The portable `text` and the web's `para` and `span` take an optional `id` (the target of `describedby`). On the desktop `text` and `paragraph` take it.
- **F-5 `blur` and `focus`.** `textfield` raises `blur` when the person leaves it and `focus` when they enter it, with no payload. On the web these are `focusout` and `focusin` (the forms that bubble, as the events are delegated); on the desktop the field losing and gaining keyboard focus. `blur` is also raised when Enter or Escape take the focus out of the field (after `submit` or `cancel`).
- **F-6 Optional and additive.** Every new prop is optional (a template written before does not change), and every new event is reported only if a template binds it. Nothing an existing application writes changes meaning.
- **F-7 Same names on both targets.** The names, types and payloads are the same in the web table and in the Desktop PORT's `vocabulary.json`. Until a Desktop PORT release carries them, a project of two targets that writes them gets `vlx check`'s ordinary "unknown prop" on the desktop; this note names the release that closes it.
- **F-8 The form uses them.** `examples/forms-app` uses `kind="password"`, `invalid`, `describedby` with an `id` on each message, and `blur` to show a field's error when it is left; its browser tests assert each, and the test that pinned their absence now asserts their presence.

## Where it is built

- **Port** (`packages/port-desktop`): `vocabulary.json` and `content.json` (the data), `view.rs` (masking, outline and accessible state, description, focus events), tests. `packages/port-web` needs no new realization (see below). `packages/port-desktop-vocabulary` carries the copy.
- **Valance** (`packages/common`): the web's tag table and its `optional` rule, the generated tag reference, the example and its tests, the findings.

**Web realizations without a PORT Web change.** `kind` is `attribute("type")`, `describedby` is `attribute("aria-describedby")`, `id` is `attribute("id")`, `blur`/`focus` are `event("focusout")`/`event("focusin")` in the existing event table. `invalid` is the one that needs care: `booleanAttribute` writes the attribute by presence (`aria-invalid=""`, which ARIA reads as false), and a text attribute would make the prop a string where the desktop's is a boolean. It is realized as the DOM property `ariaInvalid` (`property("ariaInvalid", "value")`): a boolean assigned to it becomes `"true"` or `"false"`, so the prop is a boolean on both targets. A property has no HTML form, so a server-rendered page has no `aria-invalid`; hydration writes it. That is harmless here (a field is not invalid before the person has acted) and is the reason a PORT Web realization for boolean-as-text (the old finding F12) remains a better home if a page ever needs it in the HTML.

## Acceptance

| Test | Statement |
|---|---|
| Web: `kind="password"` renders `type="password"`, the others their `type`; absent is no attribute | F-1, F-6 |
| Desktop: a password field is drawn masked (the rendered text is not the value); an unknown `kind` is plain text | F-1 |
| Web and desktop: `invalid` true/false is `aria-invalid` true/false; the desktop accessibility tree says invalid | F-2 |
| `describedby` is `aria-describedby`; the desktop's accessible description is the text of the node with that `id` | F-3, F-4 |
| `blur` and `focus` reach the application as commands on the web (real focus changes in Chromium) and on the desktop (egui focus) | F-5 |
| A template written before the change compiles and renders as before; an event not bound reports nothing | F-6 |
| The names, types and payloads match in the two vocabularies | F-7 |
| The reference form's tests | F-8 |

## Implementation status

Checked 2026-10-16. Port: commit "Desktop PORT: form primitives" on `claude/inspiring-ptolemy-fssz6c` in the Port repository (unreleased). Valance: the web table, the `types` rule, the generated tag reference, `examples/forms-app`.

| Statement | Status | Evidence |
|---|---|---|
| F-1 `kind` | Matches | Web: `cli/test/form-primitives.test.ts` (`type="password"`, none when absent). Desktop: Port `tests/password.rs` (a password is drawn masked; text, email, number, search, tel, url, an unknown kind and none are drawn as the text). **Not tested:** how a browser treats a `kind` it does not know (the note says text) |
| F-2 `invalid` | Matches the behavior; **differs from the mechanism the note described** | Web: `aria-invalid="true"` and `"false"` in the built HTML and after the page starts (`form-primitives.test.ts`, `forms-app` "marks an invalid field invalid"). Desktop: invalid in the AccessKit tree, `false` is not invalid (Port `tests/accessibility.rs`); the outline is drawn but its look is not tested. See D-1 |
| F-3 `describedby` | Matches | Web: `aria-describedby` and the message's `id` (`forms-app`). Desktop: the description is the text of the node with that id; an id nothing has describes nothing (Port `tests/accessibility.rs`) |
| F-4 `id` | Matches, with a note | Web: `text`, `para`, `span` (`form-primitives.test.ts`). Desktop: `text` (drawn and read back) and `paragraph` (declared and gathered; **not drawn in a test**) |
| F-5 `blur` and `focus` | Matches, with a difference between the targets | Web: `focusin` and `focusout` in Chromium (`forms-app` "shows a field's problem when the person leaves it"). Desktop: reported once on entering and once on leaving, not at all with no handler (Port `tests/keyboard.rs`). **Differs from the note:** it said `blur` is also raised when Enter or Escape take the focus out. That is true on the desktop (a single-line field gives up focus on Enter), and **not on the web**, where Enter leaves the focus in the field. See D-2 |
| F-6 Additive | Matches | A field that says none of it has none of it (`form-primitives.test.ts`); the whole CLI, common and example suites pass unchanged |
| F-7 Same names, types and events | Matches in the sources; **not yet in the installed package** | Checked against the Port repository's `vocabulary.json` and `content.json`: every shared prop has the same type and requiredness, and `textfield` has the same five events (a one-off script; the permanent test `form-primitives.test.ts` "name the same props…" is skipped until the installed `@valancex/port-desktop-vocabulary` carries the form primitives, which needs the Port release) |
| F-8 The form uses them | Matches | `examples/forms-app`: a masked password, `invalid` and `describedby` on each field, `blur` showing a field's error when it is left; the test that pinned their absence now asserts their presence; 11 browser tests |

### Differences found

- **D-1 (F-2): `invalid` is not a DOM property.** The note realized it as `property("ariaInvalid", "boolean")` and said a server-rendered page would simply lack `aria-invalid`. PORT Web's server renderer **refuses** a property with no HTML form (`WebRealizationError: … has no HTML form`), so the first build failed. PORT Web's own documentation says a text slot writes a boolean prop's text (`"true"`), so `invalid` is `attribute("aria-invalid")` and what was missing was only the *type*: the manifest derived from a table types every attribute as a string, so a template could not pass a boolean (the old finding F12). The fix is a new rule beside `optional` in the web vocabulary, `types: { textfield: { invalid: "boolean" } }`, applied when the manifest is derived (`cli/src/compile.ts`). It needs **no PORT Web release**, closes F12 for any prop that wants it, and the HTML carries `aria-invalid`.
- **D-2 (F-5): `blur` on Enter and Escape is the desktop's behavior only.** Recorded; not made the same, because making the web leave the field on Enter would change what a person types into.
- **D-3: a race the new event exposed (RF-11).** The reference form's first click on a checkbox after leaving a field was lost: leaving the field reports `blur`, its command's render re-asserts the controlled box between the click's toggle and the moment its `change` is read, and `change` reads the box unticked. A person's mousedown-to-mouseup is tens of milliseconds and the render takes a few, so it is rare for a person and certain for a test that clicks as fast as it can (the form's tests wait for the render now). It is a property of controlled boolean controls, not of `blur`; `blur` makes it likely. Not fixed here.

### What is not done

The Desktop PORT is not released, so a project of two targets that writes the new props gets "unknown prop" on the desktop until `@valancex/port-desktop-vocabulary` is published with them and Valance's dependency range is raised. Nothing in Valance depends on an unreleased Port to build or test.
