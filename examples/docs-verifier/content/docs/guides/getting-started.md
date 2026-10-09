---
title: Getting Started
---

# Getting Started

Install the packages, describe a view, and define the application.

```ts
import * as Valance from "@valancex/valance";

const app = Valance.define({
  name: "counter",
  state: { schema: State, initial: { count: 0 } },
  views: { main: { program, scope: (state) => ({ count: state.count }) } },
  view: () => "main",
  commands: (state) => ({ increment: Valance.command(state)((current) => ({ count: current.count + 1 })) }),
});
```

> [!TIP]
> A command's name in the table is the name the template calls.

## Run it

Call `Web.run` with a container and the primitives table.
