---
title: API
---

# API

The names the core exports.

- define, start, mount, hydrate and command.
- isRefusal and ValanceError, for telling work turned away by a closing application from a bug.

> [!WARNING]
> A refusal is a defect with a stable code, never a typed failure.

```ts
if (Valance.isRefusal(defect)) {
  // the application is closing: stop quietly
}
```
