# Learn VALANCE

This path needs no knowledge of anything underneath VALANCE. Read in order:

1. [**What is VALANCE?**](what-is-valance.md): the problem, the model, and the words.
2. [**Your first application**](first-application.md): a counter, from nothing to a page that works, in about fifty lines.
3. [**State, views and events**](state-views-events.md): how the pieces fit, using a two-view inbox.

Then use the [common tasks](#common-tasks) below, and the [API reference](../use/README.md) when you need an exact answer.

## The words

| Word | In VALANCE it means | Exact rules |
|---|---|---|
| **application** | One running instance: one state, its commands, its resources. A definition is just data; `start` makes it run. | [Contract §2](../V1_CONTRACT.md#2-application) |
| **state** | The single value that is the truth about the application. Nothing else holds truth. | [§3](../V1_CONTRACT.md#3-state-and-commands) |
| **command** | The only way state changes. It has a name, takes validated input, and returns the next state (or does work first). | [§3](../V1_CONTRACT.md#3-state-and-commands), [§14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| **view** | One thing the application can show, such as a list or a message. Which view is current is a function of state. | [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| **view description** | What a view looks like, written in a small markup language (MPRX) and compiled before the application runs. Its `program` in the API. | [§5](../V1_CONTRACT.md#5-views-and-presentation), [§15](../V1_CONTRACT.md#15-building-a-view-description) |
| **scope** | The values a view description is drawn from: a function of state, written once per view. | [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| **event** | Something that happened on the screen (a click). A view description says which command an event runs. | [§7](../V1_CONTRACT.md#7-retained-render-and-interaction) |
| **mount** | A view of the application drawn somewhere (a page element) and kept up to date. | [§6](../V1_CONTRACT.md#6-mounts) |
| **resource** | Something an application owns and commands use (a connection, a clock): acquired when it starts, released when it ends. | [§4](../V1_CONTRACT.md#4-capabilities-and-resources) |
| **history** | Keeping the browser URL and the application's state in step. The application decides what a URL means. | [§8](../V1_CONTRACT.md#8-history) |
| **Scope** | Who is responsible for ending something. You create it; closing it ends the application or mount placed in it. | [§9](../V1_CONTRACT.md#9-scopes-and-shutdown) |

## Common tasks

| Task | How | Reference |
|---|---|---|
| Run in a page | `Web.run(app, { container, primitives, present: "mount" })` | [§16](../V1_CONTRACT.md#16-the-browser-host-webrun) |
| Add a view | Add an entry to `views` and have `view(state)` return its name | [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| Add a command | `Valance.command(state)(input, transition)`, then bind it with `Valance.entry` | [§14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| Run a command from outside the screen (a test, a host page) | `application.invoke("app/name", args)` | [§2](../V1_CONTRACT.md#2-application), [§3](../V1_CONTRACT.md#3-state-and-commands) |
| Read the state | `yield* application.state` | [§3](../V1_CONTRACT.md#3-state-and-commands) |
| Compile view descriptions | `compileProgram(...)` at build time | [§15](../V1_CONTRACT.md#15-building-a-view-description) |
| Give commands a resource | Pass a `platform` to `start`; commands reach it by capability | [§4](../V1_CONTRACT.md#4-capabilities-and-resources) |
| Make URLs follow state | `history` option of `Web.run`, with `urlOf` / `stateOf` | [§8](../V1_CONTRACT.md#8-history) |
| Render on a server, then take over in the browser | `renderToHtml` on the server, then `present: "hydrate"` with the state it returned | [§6](../V1_CONTRACT.md#6-mounts), [§17](../V1_CONTRACT.md#17-server-rendering-rendertohtml) |
| Show the same application in two places | Several mounts over one application handle | [§6](../V1_CONTRACT.md#6-mounts) |
| Recover from a view that failed to draw | Make a fresh mount; a failed one stays inert | [§6](../V1_CONTRACT.md#6-mounts), [§10](../V1_CONTRACT.md#10-failure-model) |
| Stop the application | Close its Scope (`host.stop()` with `Web.run`) | [§9](../V1_CONTRACT.md#9-scopes-and-shutdown) |
