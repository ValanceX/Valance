---
title: Errors
description: Each failure has a stable code or tag, so a caller can tell a refusal from a bug.
---

# Errors

Misuse and refusals die with a `ValanceError` that carries a stable `code`. Expected failures are typed, with a `_tag`.

## Codes

| Code | Meaning |
|:--|:--|
| `admission-closed` | The application is closing and no new work is admitted |
| `application-ended` | The application ended before its first render |
| `plugin-conflict` | Two parties declared something that can be declared only once |
| `invalid-head` | A head link carries script |

## Refusals

A command that races the application's shutdown is turned away with a refusal. That is not a bug, and a caller can say so.

```ts file=snippets/refusal.ts
```

## Composition

A `plugin-conflict` names both owners and fails the call before anything starts, so a conflict never half-starts an application.
