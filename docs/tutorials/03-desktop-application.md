# Your first desktop application

> **TL;DR:** Add a desktop target to the to-do project with `vlx generate target desktop`, write its layout in the desktop vocabulary, open it in a window with `vlx dev --desktop`, and package it with `vlx package --desktop`. The state, commands, content and the two to-do components stay as they are.

## Prerequisites

* [State, components and events](02-state-views-and-events.md), and its project.
* Rust's `cargo`, once, to install the window program.

---

The finished application is [`examples/todo-multi`](../../examples/todo-multi), and blocks marked **File:** are checked against it. Starting fresh instead? `vlx init my-app --desktop` (or `--web --desktop`) makes a project with the target already in place. Steps 2 to 5 apply unchanged.

## How a desktop application runs

The application is the same: one state, its commands and its content. Only the drawing differs. A **window** (the Desktop PORT's `vlx-window` program) draws the screen, and your application runs beside it in a small program called the **engine**. You write templates, and `vlx` builds the engine. You do not write the window.

## 1. Add the target

```console
$ vlx generate target desktop
```

This writes three things:

- `valance.desktop.json`, which gives the project the target, and `valance.web.json`, which a project needs once it has a second target.
- `src/desktop/layout.mprx`, a layout of its own.
- an entry in `targets` in `src/main.ts`: `targets: { desktop: { layout: component(desktopLayout) } }`.

**The site moves.** A project with one target builds to `dist/`. A project with several builds to `dist/web/` and `dist/desktop/`. Point anything that deploys `dist/` at `dist/web/`.

## 2. The desktop vocabulary

A window has no `<div>`, `<shell>` or `class`. A desktop template uses the desktop's own words: `column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`, `link`, plus the content layer (`paragraph`, `list`, `listitem`, …). The [desktop vocabulary](../reference/desktop-vocabulary.md) has each one. A web tag in a desktop template is an error:

```
src/desktop/layout.mprx:17:6 unknown-component: unknown component "div": the manifest doesn't declare it
```

The generated layout already draws the pages: Back and Forward buttons, the sections as lists of links, and the page's `<blocks />`. Your Markdown in `content/` shows in the window as it is.

## 3. Put the to-do list in the window

`todo-item` and `todo-add` were written with the portable core (`row`, `text`, `checkbox`, `textfield`, `button`), so they work here unchanged. Add the list to `src/desktop/layout.mprx`, after `<blocks items={blocks} />`:

**File:** `src/desktop/layout.mprx`

```
<column>
  <heading level={2}>To do</heading>
  <text>{summary}</text>
  <todo-add entry={entry} on.type={setEntry($event)} on.add={addItem()} on.cancel={clearEntry()} />
  {#each items as it (it.id)}
    <todo-item title={it.title} done={it.done} on.tick={setDone(it.id, $event)} on.remove={removeItem(it.id)} />
  {/each}
  <button on.click={clearDone()}>Clear done</button>
</column>
```

The same names are used as in the web layout, the same commands run, and the same `persist` keeps the items. On the desktop they go to a file in the user's data directory. `vlx check` now checks both layouts, each against its own vocabulary.

Components in the top-level `components` list are shared by every target. Each target adds its own on top of them, so a component only the web uses can move to `targets: { web: { components: [themeToggle] } }`.

## 4. Open it in a window

Install the window program once:

```console
$ cargo install --git https://github.com/ValanceX/Port valancex-port-desktop --bin vlx-window
```

Then:

```console
$ npm run dev -- --desktop
```

`vlx dev` builds the engine and opens the window on it. When you save a file, it builds again and the window restarts the engine in place, keeping its position and size. A mistake leaves the last good build running and shows in the terminal. Closing the window ends `vlx dev`. Without `--desktop` or `--web`, a project with both targets serves the site and opens the window.

`vlx` finds the window program on your `PATH`. To use one somewhere else, set `VLX_WINDOW=/path/to/vlx-window`.

## 5. Give it to someone

```console
$ vlx package --desktop --archive
```

This writes `dist/package/<platform>/`: the engine as one executable (your application, Node and the MESH runtime) beside the window program. `--archive` also writes it as one file, a `.tar.gz` on Linux or a `.zip` on Windows, with its SHA-256 beside it. Nothing has to be installed on the other machine.

For another platform, name it and give that platform's programs:

```console
$ vlx package --desktop --platform win32-x64 --node <node.exe for Windows> --window <vlx-window.exe> --archive
```

The package is **unsigned**. `vlx` does not sign or notarize it.

## What you just used

| You did | It is | Learn more |
|---|---|---|
| `vlx generate target desktop` | a second target over the same application | [Adding a target](../../packages/cli/README.md#adding-a-target-vlx-generate-target-desktop) |
| `src/desktop/layout.mprx` | that target's layout, in its own vocabulary | [The desktop vocabulary](../reference/desktop-vocabulary.md) |
| `vlx dev --desktop` | the window, rebuilt as you edit | [A desktop application](../../packages/cli/README.md#a-desktop-application-vlx-init---desktop) |
| `vlx package --desktop` | a package to hand to someone | [A desktop application](../../packages/cli/README.md#a-desktop-application-vlx-init---desktop) |

## Next steps

* [The desktop vocabulary](../reference/desktop-vocabulary.md): every word, with its props and events.
* [What the web has that native does not yet](../explanation/application-model/native-parity.md).
* [Multiple targets](../explanation/application-model/multi-target.md): how one application is built for several.
