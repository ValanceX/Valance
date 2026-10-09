---
title: State
---

# State

State is one value. Commands are the only way to change it.

## Rules

- A pure command returns the next state.
- A waiting command shows loading, then ready or failed.
- Nothing else writes state.

```ts
const go = command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id }));
```
