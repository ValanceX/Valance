# State, components and events

> **TL;DR:** Add a to-do list to the project from [Your first application](01-first-application.md). You make two components with `vlx generate component`, state each one's interface, and connect their events to commands. You see how state, templates and events fit together: state is the truth, a template is a function of it, and an event runs a command.

## Prerequisites

* [Your first application](01-first-application.md), and its project with `vlx dev` running.

---

The finished application is [`examples/todo-multi`](../../examples/todo-multi). Every block on this page marked **File:** is a piece of a real file there, and a test checks that it still is.

## 1. The state

A to-do list is a list of items, the text being typed and a counter that numbers new items. Add them to `src/main.ts`, above `defineApp` and in `state`:

**File:** `src/main.ts`

```ts
const Item = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean });
```

**File:** `src/main.ts`

```ts
items: field(Schema.Array(Item), []),
entry: field(Schema.String, ""), // what is typed in the new-item field, until it is added
seq: field(Schema.Number, 1), // the next item's number
```

Even the text in the box is state. *What has been typed so far* is a fact about the application, so it lives in one place with every other fact. Nothing on the screen holds a value of its own.

## 2. The commands

Each way the list can change is one command:

**File:** `src/main.ts`

```ts
setEntry: command(Schema.Struct({ text: Schema.String }), ({ text }, state) => ({ ...state, entry: text.slice(0, 200) })),
// Escape in the field: back out of what was typed
clearEntry: command((state) => ({ ...state, entry: "" })),
addItem: command((state) => {
  const title = state.entry.trim();

  return title === "" ? state : { ...state, items: [...state.items, { id: `i${state.seq}`, title, done: false }], entry: "", seq: state.seq + 1 };
}),
setDone: command(Schema.Struct({ id: Schema.String, done: Schema.Boolean }), ({ id, done }, state) => ({
  ...state,
  items: state.items.map((item) => (item.id === id ? { ...item, done } : item)),
})),
removeItem: command(Schema.Struct({ id: Schema.String }), ({ id }, state) => ({ ...state, items: state.items.filter((item) => item.id !== id) })),
clearDone: command((state) => ({ ...state, items: state.items.filter((item) => !item.done) })),
```

A command that takes input gives its schema first. The input is checked before the command runs, so a wrong value changes nothing. Each command returns the next state and does nothing else. That makes it easy to test: call it with a state and look at what comes back.

## 3. Two components

```console
$ vlx generate component todo-item
$ vlx generate component todo-add
```

Each one writes a template (`src/todo-item.mprx`), a file for its interface (`src/todo-item.ts`), and registers the component in `src/main.ts`. Replace the templates:

**File:** `src/todo-item.mprx`

```
<row>
  <checkbox label="Done" checked={done} on.change={tick($event)} />
  <text>{title}</text>
  <button on.click={remove()}>Remove</button>
</row>
```

**File:** `src/todo-add.mprx`

```
<row>
  <textfield label="New item" value={entry} placeholder="What needs doing?" on.change={type($event)} on.submit={add()} on.cancel={cancel()} />
  <button on.click={add()}>Add</button>
</row>
```

A component knows nothing about the application. `todo-item` reads two props (`title`, `done`) and raises two events: `tick` with the new checked value (`$event`) and `remove` with nothing. Say so in its interface. Add `import { Schema } from "effect";` and fill in the generated `component(...)` call:

**File:** `src/todo-item.ts`

```ts
export default component(template, {
  props: { title: Schema.String, done: Schema.Boolean },
  events: { tick: Schema.Boolean, remove: Schema.Void },
});
```

**File:** `src/todo-add.ts`

```ts
export default component(template, {
  props: { entry: Schema.String },
  events: { type: Schema.String, add: Schema.Void, cancel: Schema.Void },
});
```

The interface is a contract that both sides are checked against. `vlx check` reports a template that reads a prop the contract leaves out. It also reports a use that passes a prop the component does not have, leaves a required one out, or handles an event it never raises.

`row`, `text`, `checkbox`, `textfield` and `button` are the *portable core*. These tags have the same props and events on the web and in a desktop window. A component written only with them runs on both, as [the next tutorial](03-desktop-application.md) shows.

## 4. Use them

Put the list in `src/layout.mprx`, inside `<main>`, after `<blocks items={blocks} />`:

**File:** `src/layout.mprx`

```
<section>
  <paragraph class="todo-title">To do</paragraph>
  <paragraph class="todo-summary">{summary}</paragraph>
  <todo-add entry={entry} on.type={setEntry($event)} on.add={addItem()} on.cancel={clearEntry()} />
  <list class="todo-list">
    {#each items as it (it.id)}
      <listitem><todo-item title={it.title} done={it.done} on.tick={setDone(it.id, $event)} on.remove={removeItem(it.id)} /></listitem>
    {/each}
  </list>
  <button class="todo-button" pressed="false" on.click={clearDone()}>Clear done</button>
</section>
```

`{#each items as it (it.id)}` repeats its body once for each item. The part in parentheses is the item's identity: an item keeps its place on the screen when the list is reordered. A `{#each}` with no key is refused (`missing-repeat-key`).

`{summary}` is not state yet, so `vlx check` reports it. That is the next step.

## 5. Values worked out from state

A template reads names and calls nothing. A count such as "2 of 3 open" is worked out in `src/main.ts`, next to `state`:

```ts
derived: (derive) => ({
  summary: derive(Schema.String, (state) => `${state.items.filter((item) => !item.done).length} of ${state.items.length} open`),
}),
```

A derived value is read like a field (`{summary}`), with its type checked, and it is kept current as the state changes. Use one whenever a template needs a question answered about the state. For example, `{#if items.length == 0}` is an error (`unknown-member`: a list has no `length`). Derive the answer instead:

```ts
none: derive(Schema.Boolean, (state) => state.items.length === 0),
```

```
{#if none}<paragraph class="todo-empty">Nothing to do.</paragraph>{/if}
```

`{#if}` takes `{:else if …}` and `{:else}` as well. Its condition is an ordinary expression over the names the template can read: `it.done`, `entry != ""`, `!none`.

Save, and the list works. Type an item and press Enter (`submit`) to add it, or Escape (`cancel`) to clear the box.

## 6. Keep it between visits

Reload the page and the list is gone, because state starts at its defaults. Name the fields that should outlive a visit:

**File:** `src/main.ts`

```ts
persist: ["items", "seq", "theme"],
```

The platform keeps them: the page's storage on the web, a file in the user's data directory on the desktop. `entry` is a draft, so it is left out.

## How an event becomes a new state

Take a click on an item's checkbox:

1. The checkbox reports `change` with `true`. `todo-item` turns it into its own event, `tick($event)`.
2. The layout handles `on.tick={setDone(it.id, $event)}`, so the command `setDone` runs with `it.id` and `true`.
3. The arguments fill the command's input in field order, so the input is `{ id, done: true }`. It is checked, and the command returns the next state.
4. The state is committed. `summary` is worked out again, and the screen shows the new state.

The names are the contract at every step. `setDone` in the template is the command `setDone` in `src/main.ts`. `tick` is the event in `todo-item`'s interface. Misspell either and `vlx check` says where. The types are checked too: swap the arguments (`setDone($event, it.id)`) and you get `type-mismatch: the argument "id" of command "setDone" needs string, found boolean`.

## What to take away

- One state, in `src/main.ts`. Commands write it, and templates read it.
- A component states its interface (props in, events out) and knows nothing else. The layout connects its events to commands.
- A question about the state is a derived value, not template logic.
- `vlx check` checks every name between a template, a component and the application before anything runs.

## Next steps

* [Your first desktop application](03-desktop-application.md): the same project, in a window.
* [Forms](../how-to/forms.md), [Units](../how-to/units.md) and [Context](../how-to/context.md) for more components.
* [Talking to a backend](../../packages/cli/README.md#talking-to-a-backend): a command that waits for data.
