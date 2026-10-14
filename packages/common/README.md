# @valancex/common

What an application's `src/main.ts` imports: `defineApp`, `component` and `field`. It describes the application; the [`vlx` command](../cli) builds, serves and checks what it describes.

```console
$ vlx init my-app --web      # a project that already depends on this package
```

```ts
// src/main.ts
import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import themeToggle from "./theme-toggle.js";

export default defineApp({
  layout: component(layout),
  components: [themeToggle],
  state: { theme: field(Schema.Literal("light", "dark"), "light") },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
```

| Export | Is |
|---|---|
| `defineApp({ layout?, components?, override?, state?, commands? })` | The application: its shell, its components, its state and the commands that change it. It starts nothing. |
| `component(template, { props?, events? })` | A component: a `.mprx` template and, optionally, the interface it states (Effect Schemas). Which components its template uses is read from the template. |
| `field(schema, initial)` | One field of the state: its type and its default, together. |

`Schema` is [Effect's](https://effect.website/docs/schema/introduction/); import it from `effect`. This package types against it and does not re-export it.

Nothing here runs a build: no Node, no bundler, no compiler. A page's `src/main.ts` is loaded in the browser as well, and this package is small enough to be loaded there.

Documentation: [`@valancex/cli`](../cli/README.md) (the project layout, components, state and commands).

Pre-1.0: the API may change between minor releases; every change is in the [release notes](../../docs/releases/).
