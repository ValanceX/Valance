# Units: state that belongs to one occurrence of a component

> **TL;DR:** Give one occurrence of a component its own state, such as whether a disclosure is open, without a field in the application's state.

## Prerequisites

* A component of your own: [State, views and events](../tutorials/02-state-views-and-events.md).

---

A disclosure is open or closed. A tab strip has a chosen tab. Neither is about the application, and neither should be a field of its state with a name the application invents. A **unit** is that state, declared with the component, held for each occurrence of it, and invisible to the application.

A component with no unit needs none of this, and nothing about an application changes until it writes one.

## Declare it with the component

```ts
// disclosure.ts
import { component, field, unit } from "@valancex/common";
import { Schema } from "effect";
import template from "./disclosure.mprx";

export default component(template, {
  props: { label: Schema.String },
  events: {},
  unit: unit({
    state: { open: field(Schema.Boolean, false) },
    commands: { toggle: (state) => ({ open: !state.open }) },
  }),
});
```

```html
<!-- disclosure.mprx: reads `open`, runs `toggle()`; holds nothing -->
<column>
  <button on.click={toggle()}>{label}</button>
  {#if open}<slot />{/if}
</column>
```

- The state is typed with defaults, as application state is. A command is a pure function of the state as the person saw it that returns the fields it changes. With parameters: `select: unitCommand({ params: { n: Schema.Number }, run: (state, { n }) => ({ at: n }) })`.
- The template reads the fields and runs the commands by name. They join its scope and its commands in the model, so `vlx check` checks them like any others (`unknown-reference` for a name the unit does not have).
- A component with a unit states its interface: `props` and `events` (empty if it has none).

## What it does

- **It follows its row.** The state belongs to the occurrence, and an occurrence's identity is its place in the program, by the item's declared key inside `{#each … (item.id)}`. Re-sort the list and the open one is still the one that was opened.
- **It starts again when the occurrence does.** Hide the component under `{#if}` and show it again, or change an item's key, and it is a new occurrence with the defaults. State that must survive that, that a command of the application reads, that belongs in the URL or must persist, is application state, not a unit.
- **It is not rendered on the server or persisted.** The server and the first render in the browser both use the defaults, so they agree; interaction before the page is live is lost, as it always was.
- **It costs memory for the occurrences that have changed**, not for every one on the page: an occurrence nobody touched has no state held.

## The caller may own a value

```ts
unit({
  state: { at: field(Schema.Number, 0) },
  controllable: ["at"],
  commands: { select: unitCommand({ params: { n: Schema.Number }, run: (_, { n }) => ({ at: n }), raises: { change: (next) => next.at } }) },
})
// props: { at: Schema.UndefinedOr(Schema.Number) }, events: { change: Schema.Number }
```

If a use writes `<tabs at={tab} on.change={chose($event)} />`, the prop is the value, the unit's change to `at` is not applied, and `raises` tells the caller what the person chose, so the application holds the one copy (and the router, or a test, can drive the tabs). A use that does not write `at` leaves the tabs to themselves. A controllable field needs a prop of its name: optional, of the same type.

## What a person of the application never sees

The registry that keeps the state of the occurrences, the keys, and the re-render when one changes are VALANCE's and are checked by tests to stay out of the application, the templates and the targets (`packages/valance/test/boundaries.test.ts`, `packages/cli/test/units.test.ts`). `Valance.define` takes `units` (by component name) for an application that is not built by `vlx`.

## Needs

MESH 0.15 (the `unit` of the manifest and the runtime's `units`) and NEXUS 0.14.

## Next steps

* [Context](context.md): a value many distant components read.
