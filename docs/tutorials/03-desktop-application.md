# Your first desktop application

> **TL;DR:** Build a to-do application that runs as a window on Linux and Windows, drawn with seven words and a ready-made window.

## Prerequisites

* JavaScript or TypeScript. No native toolkit knowledge.

---

You will build a to-do application that runs as a window on Linux and Windows. You need to know JavaScript or TypeScript. You do not need to know anything about native toolkits: the screen is described with seven words, and a ready-made window draws them.

The finished application is [`examples/todo`](../../examples/todo/README.md). Every code block on this page is a piece of a real file there, and a test checks that it still is.

## The pieces, in one paragraph

An application is **state** (what is true), **commands** (the only ways state changes) and **screens** (what to show). That is [the same model as on the web](../explanation/what-is-valance.md). What is new here is only how a screen is drawn: a **window** (the Desktop PORT) draws it, and your application runs beside it in a small program called the **engine**. You write screens, state and commands. You do not write the window.

## The seven words

A screen can use these and nothing else. There is no word for the window: the window belongs to the machine's desktop, and the application only says what it is called (step 4) (the [reference](../reference/desktop-vocabulary.md) has each one's details):

| Word | What it is |
|---|---|
| `column`, `row` | children one under the next, or side by side |
| `heading`, `text` | a title for what follows, and a run of text |
| `button` | something to press |
| `checkbox` | a box that is ticked or not |
| `textfield` | a line of text a person edits |

Repeating a part and showing a part only sometimes are not words. They are `{#each}` and `{#if}`, which you will see below.

## 1. A screen

The smallest screen in the application is the one shown for an address that is nothing.

**File:** `examples/todo/src/screens/notFound.mprx`

```
<column>
  <heading>There is nothing here</heading>
  <button on.click={go("/")}>Back to lists</button>
</column>
```

A column holds a heading and a button. `on.click={go("/")}` says what clicking the button does: run the command `go` with the address `/`. A button has one event, `click`, and it is not only a mouse: it is also what a keyboard or a screen reader does to a button, and what a finger does on a touch screen.

## 2. A list of things, and a place to type

**File:** `examples/todo/src/screens/lists.mprx`

```
<column>
  <heading>Your lists</heading>
  {#if none}
    <text>No lists yet. Name one below.</text>
  {/if}
  {#each lists as entryList (entryList.id)}
    <row>
      <button on.click={go(entryList.href)}>{entryList.name} ({entryList.open} of {entryList.total} open)</button>
    </row>
  {/each}
  <row>
    <textfield value={entry} placeholder="New list" on.change={setEntry($event)} />
    <button on.click={createList()}>Add list</button>
  </row>
</column>
```

`{#if none}` shows its content only when `none` is true. `{#each lists as entryList (entryList.id)}` makes one row for each list, and the part in parentheses says which row is which when the lists change. The text field shows `entry` and, whenever its value changes, runs `setEntry` with the new value (`$event`). A checkbox works the same way: its `change` event carries `true` or `false`, and the application decides what to do with it. The values `none`, `lists` and `entry` come from the application's state; the next step says how.

## 3. A command

A command is the only way state changes. This one makes a list from what was typed. `command.effect` is how a command whose body is an Effect is written (a pure change of state alone is `command((current) => next)`; one that waits is `command.waiting`): one way to write a command, whatever it needs.

**File:** `examples/todo/src/app.ts`

```
createList: command.effect(() =>
  change((current) => {
    const name = cleanText(current.entry);

    return name === "" ? current : { ...current, lists: addList(current.lists, `l${current.seq}`, name), entry: "", seq: current.seq + 1 };
  }),
),
```

It takes the current state, and returns the next one: the same state if the name is empty, or the state with the new list added and the text field cleared. Nothing else in the program changes state.

## 4. Where you can be, and what may stop you

An application has places: the lists, one list, an item being edited. A **route** names a place and its address. A **guard** says whether you may enter or leave one.

**File:** `examples/todo/src/routes.ts`

```
const saved = ({ state }: { readonly state: TodoState }) => state.draft === null;

export const router = createRouter<TodoState>({
  routes: [
    route("/", { name: "lists", title: "To-do" }),
    route("/lists/:id", { name: "list", params: ListParams, title: "List", canActivate: listExists }),
    route("/lists/:id/edit", { name: "listEdit", params: ListParams, title: "Rename list", canActivate: listExists, canDeactivate: saved }),
    route("/lists/:id/items/:itemId", { name: "item", params: ItemParams, title: "Edit item", canActivate: itemExists, canDeactivate: saved }),
  ],
  notFound: { name: "notFound", title: "Not found" },
});
```

`canDeactivate: saved` means: you cannot leave an edit while there is text that has not been saved. The same rule stops the window from closing: the person is told to save or discard first. Nobody wrote that twice; it is the guard.

The window's title is the application's too, and it follows where you are:

**File:** `examples/todo/src/app.ts`

```
export const titleOf = (state: TodoState): string => {
```

It takes the state and returns the title (the list's name, then the application's), and the window shows it. A template never sets a title, because the window is not part of any screen.

## 5. Run it

In `examples/todo`:

```
pnpm build
cd native
TODO_ENGINE="node ../dist/main.js" cargo run
```

`pnpm build` compiles the screens and the engine. The engine's whole `main` is one call, `Native.run(app, { titleOf, mayClose })`, which serves the application for the window to talk to. `cargo run` opens the window, which starts the engine named by `TODO_ENGINE` and draws what it sends. Make a list by typing a name and pressing **Add list**. Open it, add an item, open the item, change its text, and then try **Back to list**: the guard says no until you save or discard.

## 6. Give it to someone

```
scripts/dist.sh linux-x64
scripts/dist.sh win32-x64
```

Each writes an archive holding two programs side by side: the window, and the engine (your application and everything it needs, as one file). Nothing has to be installed on the other machine.

## Next steps
- [The desktop vocabulary](../reference/desktop-vocabulary.md): the eight words in full.
- [State, views and events](02-state-views-and-events.md): the model underneath, on the web.
- [Why these eight words](../explanation/application-model/native-vocabulary.md): how they were chosen and what is not here yet.
- [What the web has that native does not yet](../explanation/application-model/native-parity.md).
