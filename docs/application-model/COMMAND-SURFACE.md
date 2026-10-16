# The command and request surface: what two applications asked for (WP-25)

Written 2026-10-16, before the implementation. Findings RF-5, RF-6 and RF-10 ([`reference-form`](../findings/2026-10-16-reference-form.md), [`orders-app`](../findings/2026-10-16-orders-app.md)). Each was met in two applications and worked around both times. The recommendations of the gap analysis are taken as the decisions; each is **additive**, so no existing application changes (DP10: a Stable surface changes only by addition here).

## RF-5: a waiting command cannot read the state it starts from

Both applications made a **derived record** only to carry values from the state into the command through an event (`submit(form)`, `saveStatus(save)`), because `work(input, signal)` sees its input and nothing else. `begin` and `settle` already receive the state; `work` is the odd one out.

- **C-1** `work` receives the state **as it is after `begin`** as a third argument: `work(input, signal, state)`. Existing `work` functions take two arguments and are unchanged. The state is a snapshot at the start of the work; the work does not see later changes (`wanted` and `settle` do).
- **C-2** The same for a route's `load.work` (`work(input, signal, state)`), so a load can use what the application already knows (the signed-in person, a filter).
- **C-3** What this removes is the derived-record-as-parcel: the form of `forms-app` and the `save` of `orders-app` can go, and an event of no value (`Schema.Void`) starts the command.

## RF-6: the server's words

Both applications guessed a message from the status because a failed request carries no body, by design: a body can hold a secret. The reason holds; the answer is to let the **author state what a failure may carry**, as a success must state what it carries.

- **C-4** `request({ …, errors: Schema })`: when a response has a failed status **and** a JSON content type, its body is decoded by `errors`. If it decodes, the failure is `{ _tag: "Status", status, body }` with the decoded value; if it does not (or there is no `errors`), the failure is `{ _tag: "Status", status }` as before. Nothing undecoded is ever kept.
- **C-5** The body is typed: `request` returns an Effect whose failure includes `{ _tag: "Status"; status; body: E }` when `errors` is given.
- **C-6** The size and type limits that guard a success guard this too; a body that is not JSON, too large, or not the declared shape leaves the failure as a bare status.
- **C-7** Interceptors are unchanged: they see the raw response as they always did.

## RF-10: a success that navigates

- **C-8** No change. Neither application needed it: a form shows its success in place, and the orders screen stays where it is. A route's `load` and the guards cover the navigation that was missing. A case that wants `settle` to move the page can say so; the row stays open with the reason.

## Acceptance

| Test | Statement |
|---|---|
| `work` receives the state after `begin`; a two-argument `work` still works; a later change is not seen by `work` | C-1 |
| A route's `load.work` receives the state | C-2 |
| `forms-app` and `orders-app` lose their derived parcels and their tests pass | C-3 |
| `errors` decodes a 4xx/5xx JSON body into `Status.body`; a body of the wrong shape, a non-JSON body and a missing `errors` give the bare status; the type carries `body` | C-4 to C-6 |
| An interceptor still sees the raw failed response | C-7 |

## Implementation status

Checked 2026-10-16.

| Statement | Status | Evidence |
|---|---|---|
| C-1 `work` gets the state after `begin` | Matches | `valance/src/waiting.ts`; `valance/test/waiting-state.test.ts` (after `begin`; a two-argument `work` unchanged) |
| C-2 route `load.work` gets it | Matches | `common/src/app.ts`; `orders-app` and `routing.test.ts` still pass |
| C-3 the parcels go | Matches | `forms-app` lost its derived `form` and `Form` prop; `orders-app` lost `save`; both suites pass (12 and 6 tests) |
| C-4 `errors` decodes a failed JSON body | Matches | `common/test/http.test.ts` ("what a failed status may carry"); the orders test shows the server's own reason ("Cannot ship: payment pending") |
| C-5 typed body | Matches | `StatusFailure<E>` in the failure type of `request` |
| C-6 limits | Matches | wrong shape, non-JSON, malformed and empty bodies give the bare status (tested); the transport's size limit applies as before |
| C-7 interceptors unchanged | Matches | tested |
| C-8 RF-10 | No change, as written | |

**Note.** A field the Schema does not name is dropped (`secret` in the test), so a body with more than the author asked for gives no more than was asked for.
