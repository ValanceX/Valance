---
title: State
description: State is one value, and commands are the only way to change it. A command can be pure, or it can wait.
---

# State

State is one value. Commands are the only way to change it.

## Rules

- A **pure** command returns the next state.
- A **waiting** command shows loading, then ready or failed.
- Nothing else writes state.
  - A view only reads it.
  - A mount only draws it.

## Commands

Every command has an input schema, validated where it enters, and a handler.

| Kind | Made with | The handler returns | Use it for |
|:--|:--|:--|--:|
| Pure | `command(state)(schema, handler)` | The next state | Anything that needs no waiting |
| Waiting | `command(state).waiting(schema, options)` | Nothing: `begin` and `settle` return the states | Loading, then an answer or a failure |

## A command that waits

Loading, the answer and the failure are ordinary state. A newer call supersedes an older one, and `wanted` drops an answer that arrives after the reader has left.

```ts file=snippets/waiting-command.ts
```

> [!WARNING] Not a cache
> A waiting command keeps the *last* answer in state. It does not remember earlier ones; if you need that, keep it in state yourself.

## Ending

Closing the application interrupts what it admitted and releases what it acquired, in that order. See [errors](/docs/reference/errors#refusals) for how a command that races a shutdown is told apart from a bug.
