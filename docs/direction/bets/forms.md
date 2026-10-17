# Bet 11: Forms from the schema

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. What the schema carries, and what the manifest drops, was measured on 2026-10-17 with Effect 3.10.19 (the repositories declare `^3.10.0`) and read in `web-manifest.ts`. The decisions are in [decisions](../decisions.md) (F1 to F10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 7](accessibility.md) (names, `invalid`, `describedby` as references). [Bet 8](state-units.md) (draft state). [Bet 9](interaction-state.md) (focus on the first invalid field). [Bet 4](variant-types.md) (the closed `enum` kind) |

## Question

Can the state of a form's fields, and their validation, be derived from the schema that NEXUS already uses to validate a command's input, so there is one description of valid and no second one to drift?

## Why, and who is hurt

### What exists

NEXUS validates command input with Effect Schema "where data enters". Valance's `field(schema, initial)` and `component()` take schemas for state, props and events. A template can show a `textfield` (controlled, reporting `change`), a `checkbox` and, on the Desktop, a `radiogroup`. There is no form: no per-field state, no error display, no rule for when to show an error, no path from a failed command back to a field. An application writes this by hand, differently each time, and the rules of validity are written twice (in the schema and in the template's logic) when anyone writes them at all.

### What the schema already knows (measured)

A signup schema with a minimum length, an integer between 18 and 120 parsed from text, a pattern, a literal choice, a required `true`, and an optional bounded string:

| Information | Is it in the schema? | How to read it |
|---|---|---|
| Field names, nesting, optional or required | Yes | The syntax tree (`propertySignatures`), as `web-manifest.ts` already reads it |
| Constraints | **Yes**: as annotations on each refinement. `minLength: 2`, `pattern`, `minimum: 18`, `maximum: 120`, `maxLength: 140`, "an integer" | The JSON Schema annotation, or `JSONSchema.make` |
| The text a person types versus the value the command receives | **Yes**: `NumberFromString` is a transformation from string to number. JSON Schema of the schema as written describes the string; of its type side, the integer | The encoded side is what a text field holds |
| A label | Only if the author wrote a `title` annotation (it exists) | `annotations({ title })` |
| A message in the author's words | Yes, if given: `"Enter at least 2 characters"` came out as the issue text | The `message` annotation |
| Which fields are secret | `Schema.Redacted` exists | For replay and logs ([Bet 15](replay.md)) |

One decode with `errors: "all"` returns one issue per failing field, with a path and a message. The default reports **the first issue only** (1 issue for a form that had 6 wrong fields). Literal unions return **two issues** for one field (`plan` gave "Expected free" and "Expected pro"), and an optional field with a bound gave two (the bound and "Expected undefined"), so raw issues need folding to one message per field. Messages without an author's `message` are written for developers ("Expected integer, actual 7.5"). A field decoded alone, on its encoded side, works for a per-field check.

### What the manifest drops (read in the source)

`typeOf` in `web-manifest.ts` maps a `Refinement` to its underlying type (`return typeOf(ast.from)`), so **every constraint is lost** on the way to the MESH type. A union of string literals becomes plain `string`: the closed set is lost too ([Bet 4](variant-types.md)'s `enum` kind recovers it). A template can therefore not see that a field has a maximum, and does not need to: the host holds the schema.

### What the standards offer

[Standard Schema](https://raw.githubusercontent.com/standard-schema/standard-schema/main/packages/spec/README.md) is "a set of interfaces that standardize the provision and consumption of shared functionality in the TypeScript ecosystem": a `"~standard"` property whose `validate` returns either a value or `issues` with a message and a path, and may be asynchronous. Effect 3.10.19 has no `standardSchemaV1` (the function is absent in this version; I did not check later ones), so for now Effect's own `ParseResult` is the source.

### Who is hurt

- **Application authors** write validation twice, show errors at the wrong time, and lose typed text when state changes.
- **Library authors** ([Bet 12](reference-library.md)) cannot ship a `labeled-field` that knows about errors, because there is no error model to take.
- **People filling forms**: errors that appear while typing the first character, or not at all; no way to find the first mistake; nothing announced.

## Prior art

Reliability: **P** primary source read through a fetch agent; **M** measured in this session; **S** from general knowledge. See [prior art](../prior-art.md).

| Who | What they do and why | Lesson here |
|---|---|---|
| Angular forms (**P**, [validation](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/guide/forms/form-validation.md), [reactive](https://raw.githubusercontent.com/angular/angular/main/adev/src/content/guide/forms/reactive-forms.md)) | Each control has `touched` or `untouched`, `dirty` or `pristine`, `valid`, `invalid` or `pending`, and the form has `submitted`. The guide's templates show errors only if the control is invalid and "either `dirty` or `touched`". `markAllAsTouched()` before submit. Async validators run "only if the synchronous validation is successful", and put the control in `pending`. `updateOn: 'blur'` or `'submit'` delays validation | The set of per-field states, and the rule: show an error only after the person has interacted |
| Phoenix LiveView (**P**, [`phoenix_component.ex`](https://raw.githubusercontent.com/phoenixframework/phoenix_live_view/main/lib/phoenix_component.ex); the file was truncated and the relevant text came from a summary, so verify before quoting) | `used_input?`: "Used inputs are only those inputs that have been focused, interacted with, or submitted by the client." Changeset errors are shown only when the changeset's action is set | The same rule from a server-first framework, and errors that come back from the server are keyed to fields |
| Standard Schema (**P**, link above) | One interface for validators; issues with message and path; sync or async | The shape of our error model; do not invent a third |
| HTML constraint validation (**S**) | Attributes such as `required`, `minlength`, `pattern`; browsers show their own messages | Not read: the MDN page was not found. Native constraints are a possible web realization of the same facts, not the source of them |
| Effect Schema (**M**) | Table above | The source already exists |
| React Hook Form, Formik, Zod resolvers (**S**) | Form libraries that take a schema as the validator | Not read. The schema-as-source idea is common; our difference is that the same schema is the command's boundary |

## Constraints

- **One source of validity.** The command's input schema decides. UI validation is a convenience and is never trusted; the command validates again.
- **The runtime has no state** (fixed point). Field drafts are UI state, held in a unit ([Bet 8](state-units.md)) or the application's state.
- **Controlled fields** ([Bet 1](primitive-specification.md)): the slot shows what the application last rendered.
- **Accessibility** ([Bet 7](accessibility.md)): a field has a name, an invalid field says so, and its error is related by reference.
- **No new tree concepts.** A form is composition of existing primitives and a host model, not a primitive.

## Design

### 1. A form model, derived from a schema

```
const form = Form.make(SignupSchema, {
  initial: { name: "", age: "", ... },       // encoded side: what the person types
  submit: SignUp,                              // a command whose input is the decoded type
});
```

`Form.make` reads the schema once and gives each field a **descriptor**: its path, its kind (text, number as text, boolean, one of a closed set), whether it is required, the constraints read from the annotations, its `title`, and whether it is redacted. It requires a `title` on every field: a missing title is an error at startup in development builds that names the field ([Bet 7](accessibility.md): a control has a name).

### 2. Per-field state

Each field holds, per instance:

| State | Meaning |
|---|---|
| `value` | The encoded value (a string for a text field) |
| `touched` | Left once, or a submit was tried |
| `dirty` | Changed from its initial value |
| `errors` | One message, folded from the issues for its path |
| `pending` | Reserved for asynchronous checks (not in version 1) |

The form adds `submitting`, `submitted` and the first invalid field. This state is held in a state unit keyed by the form's identity ([Bet 8](state-units.md)), so a form inside a list row has its own draft and a form that moves keeps it. An application that wants the draft in NEXUS state, for instance to survive navigation, passes its own `State` handle; the interface is the same.

### 3. When errors show

The rule, taken from Angular's guide and Phoenix's `used_input?`:

1. Validation runs on every change, on the field alone (its encoded side) and on the whole schema for rules across fields.
2. An error is **shown** for a field when it is invalid **and** the field is touched (blurred once) or a submit was attempted.
3. Once shown, an error updates as the person types (it clears the moment the value is valid).
4. A `submit` with errors does not run the command: it marks every field touched, focuses the first invalid field ([Bet 9](interaction-state.md)), and sets a form-level message ("2 fields need attention") for a live region ([Bet 7](accessibility.md)).

### 4. One message per field, in the author's words

Issues are decoded with `errors: "all"`, then folded: one message per path, the first issue after dropping the union noise measured above. A `message` annotation wins over the default text. A field with no `message` shows the default text in development builds with a diagnostic naming it, since "Expected integer, actual 7.5" is not for a person. Translation is outside this bet: `message` may be a function the application supplies.

### 5. Errors from the command

The submit command may fail with a typed `FieldErrors` (a map from path to message), which the form folds in as if it were validation, marking those fields touched. This is also how checks that cannot run on the client (a name that is already taken) reach the field. They arrive after the command returns, and the form is `submitting` until then. Client-side asynchronous validators are not in version 1.

### 6. Fields map to primitives

| Field kind | Primitive |
|---|---|
| Text | `textfield` (with `kind` where the target has it) |
| Number | `textfield` holding text, decoded on submit |
| Boolean | `checkbox` |
| One of a closed set | `radiogroup` (the web gains it in [Bet 7](accessibility.md)) |

`Form.fields(form)` returns the descriptors in schema order. A scaffold (`vlx add form`) may generate a template from them, once. The library ([Bet 12](reference-library.md)) ships a `labeled-field` that takes a descriptor and renders the label, the control, the hint and the error with `invalid` and `describedby` ([Bet 7](accessibility.md)); the core ships no layout.

### 7. Where it lives

`Form.make` and the field model are in Valance (it already owns `field` and `component()`). NEXUS is unchanged. MESH needs the `enum` kind of [Bet 4](variant-types.md) and nothing more. PORT needs `invalid`, `describedby` and `radiogroup` on the web, which [Bet 7](accessibility.md) already adds.

### Alternatives considered

| Option | Why not |
|---|---|
| Copy the constraints into the MESH type system | Doubles the rules and drifts. The template does not need to see them |
| Native constraint attributes as the validator | Web only, English messages from the browser, and the Desktop has none. They can be a realization of the same facts later |
| A `form` primitive | Nothing about a form is target-specific. It is a model plus ordinary primitives |
| Show errors on every change | The first keystroke is an error. Both frameworks above avoid it |
| Standard Schema as the interface now | Effect 3.10.19 does not provide it. Adopt when Effect does; the folded issue shape is the same |
| Validate only on submit | A person learns of the mistake after finishing; the first invalid field is far away |

## Experiment

1. **Descriptors.** Derive them for ten real schemas from the repositories (the todo, the inbox, the reference library). Count what cannot be read.
2. **The model.** Build `Form.make` with units. Test that a form in a row of a keyed list keeps its draft when the list re-sorts.
3. **The timing rule.** A script of interactions (type, blur, submit) in the gallery ([Bet 2](conformance-kit.md)) with expected `observe` results for each step, on both targets.
4. **The server path.** A command that fails with `FieldErrors` and the form showing them.
5. **A usability trial.** Three people build a signup form from the documentation, with and without `Form`. Count lines and mistakes.

## Success

- A signup form is written in under 25 lines of template and schema, with no validation logic outside the schema.
- The rules of validity exist in exactly one place; a test mutates the schema and sees the form change with no other edit.
- The timing rule holds on both targets (the gallery script passes).
- Every shown error is related to its field for assistive technology, and the first invalid field gains focus on a failed submit.
- A form in a list row keeps its draft across a re-sort.

## Kill

- If descriptors cannot be derived for common schemas (nested optional records, unions of structures), restrict forms to flat structs and document it.
- If a unit is the wrong home for the draft (it must survive a remount), move the draft to NEXUS state and keep units for `touched` only.
- If the default messages are too poor to ship, require `message` annotations on every constraint at startup in development builds.
- If asynchronous checks are demanded before version 1, add `pending` with the Angular rule (run only after the synchronous checks pass).

## Breaks (allowed in the free window)

- Valance gains `Form`.
- The reference-library `labeled-field` takes a descriptor.
- Schema authors add `title` and `message` annotations where they build forms.

## Open questions for stage 3

- **Nested records and lists of records** (addresses, line items): whether a form can hold a list of sub-forms, and how their identity works with keyed lists.
- **Cross-field rules** (password confirmation): where the error is shown, and on which field.
- **Files and other inputs** that the primitives lack.
- **Autosave and drafts** that survive a reload.
- **Translation** of messages and labels.
- **Standard Schema** adoption when Effect provides it.
