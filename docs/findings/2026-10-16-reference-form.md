# Findings: the reference form (WP-8)

Written 2026-10-16. Register: [`README.md`](README.md). Method: a real application, [`examples/forms-app`](../../examples/forms-app), written to find what building a form takes with `vlx` as it is (declared route and screen from slices 6a and 6d, the tags of [`vlx info --tags`](../../packages/cli/README.md), Effect Schemas, `command.waiting`, the `Http` capability). It is built and served under the strict policy the build writes and driven in Chromium by ten tests, with the backend answered by the test. **Rated by the author's judgement of the experience, not by a user study**, on the scale of [`COGNITIVE_LOAD.md`](../../examples/tracer-web/src/docs-benchmark/COGNITIVE_LOAD.md): severity **0** natural, **1** minor friction, **2** framework knowledge, **3** abstraction failure (the thing cannot be done, or only by going round the model); layer **App** / **FW** (Valance's own model) / **Eng** (NEXUS, MESH, PORT, Effect).

## What was built

A sign-up form on the declared route `/signup` with a screen of its own: three text fields, a checkbox, a plan chosen by two buttons (and by `?plan=pro` in the address), errors from Schemas shown after the first press and updated as the person types, a rule that needs two fields (a password may not contain the name), Enter in a field sends, Escape clears, a request that waits (the button says so and is disabled), a 409 shown beside the email, a failure shown in words, a welcome. **210 authored lines in six files** (`main.ts` 89, `validation.ts` 36, `signup-form.mprx` 30, `.ts` 32, `.css` 10, `layout.mprx` 13), plus the theme toggle copied from the scaffold.

`vlx check` passed the first time, and six of the nine first-draft tests passed on the first run. Of the three that failed, **none was the framework's**: `Schema.Literal(true, { message })` ignores the message in this Effect (the default "Expected true, actual false" showed), and my derived email error hid the server's "taken" message once the form had been attempted.

## What was easy

Declaring the page and its screen (one `route(...)` and `<screen />`; wiring by name meant no template for the switch); Schemas as the one place a rule lives, with the author's message; derived values for what the screen shows; Enter and Escape (the `submit` and `cancel` events of the text field); the query as state (`?plan=pro`, through `enter`); typing fast into a controlled field loses nothing (tested key by key); a scoped stylesheet for the screen.

## The log

| # | Task | Desired thought | Actual thought required | Extra concept | Engine exposed | Layer | Sev |
|---|---|---|---|---|---|---|---|
| 1 | The page: an address, a screen, state from the address | "this screen lives at /signup, and ?plan sets the plan" | `route(...)`, `screen:`, list the component too, `<screen />` in the layout | declared routes | none | FW | 1 |
| 2 | Fields bound to state | "a field shows a value and tells me when it changes" | a state field, a command with an input Struct (`{ value }`), an event on the screen's contract, a prop on the screen's contract, the template line: five places per field | wiring by name | none | FW | 1 |
| 3 | Rules | "a name needs two letters" | an Effect Schema with `message`; for a rule across fields, a plain function | Schema | Effect | App | 0 |
| 4 | Show errors only after the first press | "don't shout before they've tried" | a boolean state field, `attempted`, set by the submit command, read by every derived error | none | none | App | 1 |
| 5 | Show an error when the person leaves a field | "validate on blur" | **not possible**: the text field has no `blur` or `focus` event, so "touched" cannot be known | none | none | FW | 2 (RF-3) |
| 6 | Send the form | "send what's on the screen" | a command that waits is given its input and nothing else, so the form is made a **derived record**, passed out of the screen by its `submit` event (`submit(form)`), and received as the field of a one-field Struct (`{ form }`); the same check is written in `begin` and in `work` | derived, input round trip | none | FW | 3 (RF-5) |
| 7 | Say it is working | "the button says Creating… and can't be pressed twice" | a `phase` field and a derived `sending`; `disabled` on the button; a newer run supersedes an older one on its own | none | none | App | 0 |
| 8 | A server error | "show what the server said about the email" | the server's **words cannot reach the form**: a failure never carries the answer. Mapped from the status code (409 → "taken"); a 422 with field messages cannot be shown | none | none | FW | 2 (RF-6) |
| 9 | Keyboard | "Enter sends, Escape clears" | `on.submit` and `on.cancel` on each text field | none | none | App | 0 |
| 10 | A password | "a masked field" | **not possible**: no `type` on the text field; the password is shown as typed | none | none | FW | 3 (RF-1) |
| 11 | Errors a screen reader can use | "tell the field it is invalid and point to the message" | **not possible**: no `aria-invalid`, no `aria-describedby`, no `id` on the message | none | none | FW | 3 (RF-2) |
| 12 | One of a few options | "a plan chooser" | two buttons with `aria-pressed`: it works and looks right, but it is not a radio group (no group role, no arrow keys) | none | none | FW | 2 (RF-4) |
| 13 | Link to the form from content | "[Sign up](/signup)" in Markdown | `link-broken: /signup leads to no page`; linked from the layout instead | none | none | FW | 2 (RF-7, slice 6c) |
| 14 | A screen with many props | "just give it the form's state" | 13 props and 7 events declared, then used; the wiring is free but the contract is long | contracts | none | FW | 1 (RF-8) |
| 15 | A rule's message | "the Schema says what to show" | `Schema.Literal(true, { message })` ignored the message; `Schema.filter` honors it | Schema | Effect | Eng | 1 (RF-9) |

## The gaps

| ID | Gap | Evidence | Sev | Layer | What it justifies (direction: evidence before abstraction, DP2) |
|---|---|---|---|---|---|
| **RF-1** | **Fixed (web in Valance; desktop in Port, unreleased).** The text field could not be a password (or an email, number or search field): no `type` | `form.test.ts` "no password field type": the attribute is absent | 3 | FW / PORT | **Yes, build.** A portable `kind` on `textfield` (`text`, `password`, `email`, `number`) that PORT Web writes as `type` and the Desktop PORT realizes as masking or a keyboard hint. A form with a password is the commonest form |
| **RF-2** | **Fixed (same).** An invalid field could not be marked invalid or tied to its message | same test: no `aria-invalid`, no `aria-describedby`; `para` has no `id` | 3 | FW / PORT | **Yes, build.** `invalid` (boolean, written as `aria-invalid`) and a way to name the message: smallest is `describedby` plus an `id` on `para`. A field with its own `message` prop would be tidier but has one example behind it; wait for a second |
| **RF-3** | **Fixed (same).** There was no `blur` or `focus` event, so validate-on-blur and "touched" are impossible | by absence in `vlx info --tags` | 2 | PORT | **Yes, small.** Key events by one key already exist in PORT Web (`submit`, `cancel`); `blur` and `focus` are the same kind of event |
| **RF-4** | No radio group or select | two buttons with `aria-pressed` stand in | 2 | FW / PORT | **Not yet.** One example, and the stand-in works visually; a second form that needs more than three options decides between `select` and a radio group, and whether the desktop target has an equivalent |
| **RF-5** | A command that waits cannot read the state it starts from: the form had to be a derived record round-tripped through the screen | `main.ts`: `derived.form`, `submit(form)`, `Struct({ form })`, validity checked in `begin` and `work` | 3 | FW | **Yes, a design decision for `@valancex/valance`.** Give `work` the state as `begin` left it (a third argument). It removes the round trip, the derived record, the second check and one prop and one event from the screen. Not changed here: it is the core's public command surface |
| **RF-6** | A failed request carries no body, so a server's field messages cannot reach the form | `transport.ts`: `HttpError` carries a status only, by design (a body can hold a secret) | 2 | FW | **Yes, opt-in.** `request({ …, errors: Schema })`: a failed status's body decoded by a Schema the author supplies before it can reach state, as a success is. The safety reason holds (nothing undecoded gets through); the form needs it |
| **RF-7** | Content cannot link to a declared route | `vlx check`: `link-broken` | 2 | FW | Already planned: slice 6c |
| **RF-8** | A screen's contract is long (13 props, 7 events) | `signup-form.ts` | 1 | FW | **No change.** The wiring is free; the length is the form's. RF-5 removes two of them |
| **RF-9** | A Schema message can be ignored by some combinators | `Schema.Literal` | 1 | Eng | **Document**: the validation recipe says to use `Schema.filter` for a custom message on a literal |
| **RF-11** | A click that comes while the render of a `blur` is in flight can be lost: the render re-asserts the controlled checkbox between the click's toggle and the read of its `change` | found fixing RF-3; `form.test.ts` waits two frames before clicking; [`FORM-PRIMITIVES.md`](../application-model/FORM-PRIMITIVES.md) D-3 | 2 | FW / PORT | **Look into**: the value of a controlled control should be read when the event happens, or the re-assertion skipped while a gesture on it is in flight. A person is unlikely to meet it; a slow page makes it likely |
| **RF-10** | A `settle` returns state, so a success cannot `go` to another page; the form shows its welcome in place | **not tried**: by the signature of `settle` and `page` being the framework's | ? | FW | Try it before deciding; a success that navigates is the next thing a form does |

## Is a form helper justified?

**No.** Direction DP2 says to extract when the same friction recurs, and the friction here is not in assembling fields, errors and a submit (rows 3, 4, 7 and 9 are natural): it is in **missing primitives** (RF-1, RF-2, RF-3), **one missing argument** (RF-5) and **one missing capability** (RF-6). A `form()` helper over a framework that cannot mask a password or mark a field invalid would hide the gaps, not close them. The recipe of this example (Schemas with messages, a derived error per field shown after an attempt, `command.waiting` for the send, `phase` as state) is the documentation: it belongs in the learning path as written.

## Work this proposes

| Work | Closes | Size | Depends on |
|---|---|---|---|
| ~~Portable `kind` on `textfield`; PORT Web `type`; Desktop PORT masking~~ | RF-1 | **Done 2026-10-16**: web in Valance, desktop in Port (unreleased) | the Port release, for the desktop |
| ~~`invalid` and `describedby` on `textfield` and `checkbox`; `id` on `para`~~ | RF-2 | **Done**, without a PORT Web release (a `types` rule in the vocabulary, see FORM-PRIMITIVES.md D-1) | – |
| ~~`blur` and `focus` events on `textfield`~~ | RF-3 | **Done** | – |
| Controlled controls and a gesture in flight | RF-11 | S–M | a look at PORT Web |
| `work` receives the state after `begin` | RF-5 | M | a decision on `@valancex/valance`'s command surface |
| `request({ errors })` | RF-6 | M | a decision |
| Slice 6c (links checked against routes) | RF-7 | M | – |
| Try `settle` navigating; then decide | RF-10 | S | – |
| Write the validation recipe into the learning path | RF-9 and the rest | S | – |
| A second form (a checkout, with a choice of options and a list) | RF-4 | M | – |

## Not covered

The dev server loop (not timed). Desktop (the form was not run on the desktop target, whose text field is the portable core's). Internationalized messages. A form that saves a draft or guards leaving it (`canDeactivate` is slice 6f).
