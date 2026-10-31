# Tutorials

> **TL;DR:** Build a VALANCE application step by step, in order, with `vlx`. You do not need to know anything about what runs underneath.

## Prerequisites

* Node.js 22 or newer and a package manager.
* Some TypeScript.

---

## The path

Read in order. Each tutorial adds to the project the one before it made:

1. [**Your first application**](01-first-application.md): `vlx init`, `vlx dev`, a page, a piece of state and a command, a mistake caught by `vlx check`, then `vlx build`.
2. [**State, components and events**](02-state-views-and-events.md): a to-do list made of two components, each with its interface stated, and their events connected to commands.
3. [**Your first desktop application**](03-desktop-application.md): the same project in a window on Linux and Windows, from `vlx generate target desktop` to `vlx package --desktop`.

Want the idea before the code? [What is VALANCE?](../explanation/what-is-valance.md) explains the problem, the model and the words in a few minutes.

## The words

| Word | In VALANCE it means | Where |
|---|---|---|
| **project** | A directory with a `valance.json`. `vlx` builds it, and each `valance.<target>.json` adds a target. | [The project](../../packages/cli/README.md#the-project) |
| **target** | Where the application runs: the web (a static site) or the desktop (a window). One application, one layout per target. | [Adding a target](../../packages/cli/README.md#adding-a-target-vlx-generate-target-desktop) |
| **content** | The pages: Markdown in `content/`. A file's path is its address. | [Content](../../packages/cli/README.md#content) |
| **state** | The single value that is the truth about the application, declared field by field in `src/main.ts`. | [State and commands](../../packages/cli/README.md#state-and-commands) |
| **command** | The only way state changes. It has a name, takes checked input and returns the next state (or waits for work first). | [State and commands](../../packages/cli/README.md#state-and-commands) |
| **derived** | A value worked out from state that a template reads like a field. | [Values worked out](../../packages/cli/README.md#values-worked-out-kept-and-moved-between) |
| **layout** | The template around every page, for one target. | [Layout and components](../../packages/cli/README.md#layout-and-components) |
| **component** | A template with a stated interface: props in, events out. Registered once in `src/main.ts`. | [The components](../../packages/cli/README.md#the-components) |
| **event** | Something a person did (a click, typing) that a template connects to a command. | [State, components and events](02-state-views-and-events.md#how-an-event-becomes-a-new-state) |
| **diagnostic** | A mistake `vlx check` found, with its file, line, column and a stable code. | [Diagnostics](../../packages/cli/README.md#diagnostics) |

## Common tasks

| Task | How |
|---|---|
| Make an application | `vlx init my-app --web` (add `--desktop` for a window too) |
| Serve it as you edit | `npm run dev` (`-- --desktop` for the window) |
| Find every mistake | `vlx check` (`--json` for editors and CI) |
| Build it | `npm run build`: `dist/`, or `dist/<target>/` with several targets |
| Add a page | `vlx generate page guide/intro` |
| Add a component | `vlx generate component post-card`, then state its `props` and `events` |
| Add a target | `vlx generate target desktop` |
| Add state | A `field(Schema, default)` in `state` in `src/main.ts` |
| Add a command | `name: command((state) => next)`, or with input `command(Schema.Struct({…}), (input, state) => next)` |
| Show a value worked out from state | `derived: (derive) => ({ name: derive(Schema, (state) => …) })` |
| Keep state between visits | `persist: ["field", …]` |
| Set the page or window title | `title` in `valance.json`, and `title: (state, page) => …` in `defineApp` |
| Talk to a backend | `command.waiting` with `request` from `@valancex/common/http`, and `api` in `valance.web.json` ([guide](../../packages/cli/README.md#talking-to-a-backend)) |
| Wait for data, show loading and failure | [Async work](../how-to/async-work.md) |
| Ship the desktop application | `vlx package --desktop --archive` |
| Use the engine without `vlx` (embed in an existing page, render on a server, test headless) | [Without `vlx`](../how-to/without-vlx.md) |

## Next steps

* The [how-to guides](../how-to/README.md): one task each.
* [The CLI guide](../../packages/cli/README.md): every convention a project follows.
