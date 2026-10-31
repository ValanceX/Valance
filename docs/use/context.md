# Context: a value many distant components read

A theme, a locale, the person signed in. Many components need these, and most of the components between the layout and them do not. Passing such a value as a prop through every layer is noise in each one. **Context** gives it to the components that read it, and only to them. Each of those components says by name what it reads, and the toolchain checks every read before anything runs.

Tier 2, Provisional (MESH 0.18, direction decision K27). An application that does not use context writes nothing for it.

## Pass props first

Context is not the default way to give a component a value. Use this order, which is React's own guidance:

1. **A prop.** A value one or two levels down is a prop. The reader can see where the value comes from.
2. **Children or a snippet.** When a value only passes through a component, the parent can write the inner component itself and pass it as `children` (or a `snippet`). The middle component then never sees the value.
3. **Context.** Use it for values that many components far apart need: a theme, a locale, the current user. A value with one or two readers is a prop.

## Give the values: `context` beside the state

```ts
// src/main.ts
import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import card from "./card.mprx";
import badge from "./badge.mprx";

export default defineApp({
  state: { theme: field(Schema.Literal("light", "dark"), "light") },
  context: (state) => ({ theme: state.theme }),
  layout: component(layout),
  components: [component(card), component(badge, { props: {}, events: {}, uses: ["theme"] })],
});
```

- `context` is a pure function of the state, run for every committed state, on the server and in the browser alike. It must not throw.
- Each name is one the layout already reads: a state field, a `derived` value (worked out in the function, since the state does not hold it), or a framework name such as `colorScheme`. It has that name's type. The names are the ones the function returns for the initial state, so every state must return the same names. A name the layout does not read is refused, and the error names it.
- The values cross to the browser with the page, so `context` is given the state **without its `Schema.Redacted` fields**: a secret cannot reach a component this way. `vlx check` reports a projection that reads one (`redacted-in-view`).

## Read them: `uses` on the component

```html
<!-- layout.mprx: passes nothing -->
<shell theme={theme}><card /></shell>

<!-- card.mprx: passes nothing -->
<column><badge /></column>

<!-- badge.mprx: lists `theme` in `uses`, so it reads it like a scope name -->
<text>{theme}</text>
```

- `uses: ["theme"]` makes `theme` a name the badge's template reads. It is read only.
- **Nothing is inherited.** The card does not list `theme`, so the card cannot read it, even though the badge inside it can. A component that reads a name it does not list is an unknown-name diagnostic at its template.
- A `uses` name the context does not declare is MESH's `manifest-unknown-context`. A name that is also one of the component's props or scope names is `manifest-context-clash`.
- A component with `uses` states its interface (`props` and `events`, empty when it has none), as a component with a `unit` does.
- A snippet or a slot's content reads the context of the template that wrote it, not the template that renders it. Commands are not context: a template runs a command by name, as before.

## With `define`

`Valance.define` takes the same `context: (state) => values` beside each view's `scope`. The derived manifest takes the values' Schema: `manifest({ ..., context: Schema.Struct({ theme: Schema.Literal("light", "dark") }) })` writes the manifest's top-level `context`. A hand-written manifest declares it directly:

```json
"context": { "theme": { "kind": "enum", "values": ["light", "dark"] } },
"components": { "badge": { "props": {}, "events": {}, "commands": {}, "scope": {}, "uses": ["theme"] } }
```

`start` gives the values to every render beside the snapshot. When the state changes, MESH renders again whatever reads a changed value, and the target applies the patches.

## Not yet

- **No override inside a subtree.** One value per name for the whole tree. A later `{#with theme=expr}` block may add one.
- **No providers per subtree.**
- **Replay** does not record context values. A session log holds the snapshot only, so a recorded session of an application that uses context replays its snapshot changes but cannot replay a change made to a context value.

See also: [Units](units.md), the other per-component channel. Background: direction decisions K27 (context) and K29 (masking).
