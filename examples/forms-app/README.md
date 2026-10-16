# forms-app: the reference form

A sign-up form, written to find out what building a form takes, not to be a model of one. It is a declared route (`/signup`) with a screen of its own (slice 6d), validated by Effect Schemas, submitted to a backend with `command.waiting`, driven from the keyboard (Enter sends, Escape clears), with a plan taken from the address (`/signup?plan=pro`).

| | |
|---|---|
| `src/validation.ts` | What is acceptable, once, as Schemas with the author's messages; a rule that needs two fields |
| `src/main.ts` | The state, the derived errors, the route, the commands (the submit waits) |
| `src/signup-form.mprx`, `.ts`, `.css` | The screen: fields, messages, the button; its contract; its own style |
| `test/form.test.ts` | Built, served under the strict policy, driven in Chromium with the backend answered by the test |

What it found, scored on the cognitive-load scale: [`docs/findings/2026-10-16-reference-form.md`](../../docs/findings/2026-10-16-reference-form.md).

```console
$ pnpm --filter @valancex/forms-app dev      # serve it; the backend is not included: /api/signup answers 404
$ pnpm --filter @valancex/forms-app test:smoke
```
