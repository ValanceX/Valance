# Forms from the schema

One description of what is valid: the schema the submitted command takes. `Form.make(schema)` reads it once for what a screen needs (each field's name, kind, title, constraints), keeps what the person typed, and decides from the same schema what is wrong and when to say so. There is no second description to drift from the first.

```ts
const Signup = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2)).annotations({ title: "Name", message: () => "Enter at least 2 characters" }),
  age: Schema.NumberFromString.pipe(Schema.int(), Schema.between(18, 120)).annotations({ title: "Age", message: () => "Enter a whole number from 18 to 120" }),
  accept: Schema.Literal(true).annotations({ title: "I accept the terms", message: () => "You must accept the terms" }),
});
const signup = Form.make(Signup);

export default defineApp({
  state: { signup: signup.field(), done: field(Schema.Boolean, false) },
  derived: (derive) => ({ form: signup.view(derive, (state) => state.signup) }),
  commands: (command) => signup.commands(command, { field: "signup", submitted: (state) => ({ ...state, done: true }) }),
  layout: component(layout),
});
```

```html
<shell class="x" theme="light">
{#each form.fields as f (f.name)}<column>
{#if f.kind == "boolean"}<checkbox label={f.title} checked={f.checked} invalid={f.invalid} describedby={f.errorId} on.change={check(f.name, $event)} />{:else}<textfield label={f.title} value={f.value} kind={f.input} invalid={f.invalid} describedby={f.errorId} on.change={edit(f.name, $event)} on.blur={blur(f.name)} />{/if}
<text id={f.errorId}>{f.error}</text></column>
{/each}
<button on.click={submit()}>Sign up</button>{#if done}<status>Welcome, signed up</status>{/if}
</shell>
```

That is the whole form: 24 lines of schema, wiring and template, and no validation outside the schema (`packages/cli/test/forms.test.ts` builds it, uses it in a browser, and checks the HTML it draws with the Nu Html Checker and what a screen reader says with the Accessible Name and Description Computation).

Tier 1 is `Form.make(schema)`. Tier 2: `initial` (the text each field starts with), `message` (your words, or a translation, for a field with no `message` annotation, told `{ path, code, params, actual }`), and a server's `FieldErrors`.

## What it decides for you

- **Fields** come from the schema: `form.fields` lists them in order, with kind (`text`, `password`, `number`, `boolean`, `choice`), `title` (required: a field with no `title` annotation is refused at the declaration, naming it), whether it is required, the closed set of a choice, and the constraints the refinements declare (`minLength`, `maximum`, `pattern`, …). A nested struct's fields have dotted names (`address.zip`). Lists of fields are not supported yet.
- **What a field holds** is the text typed (a yes or no for a boolean), whether the person has left it, and a server's message. A number is typed as text and decoded by the schema (`NumberFromString`).
- **When an error is shown:** when the field is wrong and the person has left it once, or tried to submit. Not at the first keystroke. Once shown it follows the typing and clears the moment the text is right. A failed submit touches every field, and `form.message` says how many need attention (for a live region).
- **One message per field**, in your words: the `message` annotation of the check, else of the field, else the `message` function, else a plain sentence (never the schema's developer text, and never the typed text of a secret).
- **A rule across fields** is a `Schema.filter` on the struct that reports at a path: `{ path: ["confirm"], message: "Passwords must match" }`. It runs once the fields are valid, so it shows after the rest is right.
- **A secret** (`Schema.Redacted`) is a `password` field, never repeated in a message, and never in a draft.
- **A server's answer.** A check the client cannot make reaches the field with `Form.fieldErrors({ name: "That name is taken" })` and `form.reject(state, errors)`; editing the field clears it.
- **A draft** (`form.draft(state)`, `form.restore(draft)`) is what was typed, without secrets, for a library to keep; one made for another schema is not restored.
- **Standard Schema:** `form.standard` is the schema as the `~standard` interface, for tools that take that.

## Drawn with the ordinary primitives

A form is a model, not a primitive: `textfield`, `checkbox`, `radiogroup`, `text` and `button`. `describedby` names the message element, which is always drawn (empty when there is no message), because a primitive's relation prop cannot be left out of a template that may or may not have a value; an empty `aria-describedby` is an error in HTML (the Nu Html Checker says so).

**A closed set** (`Schema.Literal("small", "medium", "large")`) is a field of kind `choice`, with its values in `f.choices`. Draw it as a `radiogroup` with one `radio` for each, and choose with `edit`:

```html
{#if f.kind == "choice"}<radiogroup label={f.title} invalid={f.invalid} describedby={f.errorId}>{#each f.choices as c (c)}<radio label={c} value={c} checked={f.value == c} on.select={edit(f.name, $event)} />{/each}</radiogroup>{/if}
```

The group is one tab stop and the arrow keys choose, which is the browser's own behavior for radios of one group; PORT Web names the group (it is the `radiogroup`'s, never shared with another group or another mount of the page). `packages/cli/test/forms-choice.test.ts` builds it and checks the HTML and the accessible name.

## Where focus goes

A failed submit moves focus to the first field in error, and a second failed submit does it again. A state field made with `Form.field()` is enough: nothing is written. (The mechanism is `focusFirstInvalid`, a count the form keeps of its attempts, Tier 2 for an application that is not built with `defineApp`.) Focus is not state: it is a request to the platform after the render that shows the error is applied.

## Not done yet

Lists of fields with row keys, a form in a list row that keeps its state across a re-sort, and a `kind` enum on the web `textfield`. See the decisions F17 to F25.
