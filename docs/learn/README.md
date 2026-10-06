# Learn VALANCE

This path needs no knowledge of anything underneath VALANCE. Read in order:

1. [**What is VALANCE?**](what-is-valance.md): the problem, the model, and the words.
2. [**Your first application**](first-application.md): a counter, from nothing to a page that works, in about fifty lines.
3. [**State, views and events**](state-views-events.md): how the pieces fit, using a two-view inbox.
4. [**Async work**](async-work.md): waiting, failing, cancelling and out-of-date answers, all inside commands.
5. [**Startup work**](startup-work.md): work the application starts by itself.
6. [**Mounting and hydration**](mounting-and-hydration.md): drawing the application, taking over server HTML, and what a server render does.

Then use the [common tasks](#common-tasks) below, and the [API reference](../use/README.md) when you need an exact answer.

## The words

| Word | In VALANCE it means | Exact rules |
|---|---|---|
| **application** | One running instance: one state, its commands, its resources. A definition is just data; `start` makes it run. | [Contract §2](../V1_CONTRACT.md#2-application) |
| **state** | The single value that is the truth about the application. Nothing else holds truth. | [§3](../V1_CONTRACT.md#3-state-and-commands) |
| **command** | The only way state changes. It has a name, takes validated input, and returns the next state (or waits and does work first). Application behavior that an event, or the application itself, can run. | [§3](../V1_CONTRACT.md#3-state-and-commands), [§14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| **view** | One thing the application can show, such as a list or a message. Which view is current is a function of state. | [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| **view description** | What a view looks like, written in a small markup language (MPRX) and compiled before the application runs. Its `program` in the API. | [§5](../V1_CONTRACT.md#5-views-and-presentation), [§15](../V1_CONTRACT.md#15-building-a-view-description) |
| **scope** | The values a view description is drawn from: a function of state, written once per view. | [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| **event** | Something that happened on the screen (a click). A view description says which command an event runs. | [§7](../V1_CONTRACT.md#7-retained-render-and-interaction) |
| **mount** | A view of the application drawn somewhere (a page element) and kept up to date. Closing it does not stop the application. | [§6](../V1_CONTRACT.md#6-mounts) |
| **async work** | A command that waits (for data, a timer). Once it starts it belongs to the application; closing the application cancels it. Loading and failure are ordinary state. | [Async work](async-work.md), [§18](../V1_CONTRACT.md#18-asynchronous-work-and-start-time-work) |
| **startup work** | A command the application runs once, by itself, when it starts (`start: "startup"`). | [Startup work](startup-work.md), [§18](../V1_CONTRACT.md#18-asynchronous-work-and-start-time-work) |
| **resource** | Something an application owns and commands use (a connection, a clock): acquired when it starts, released when it ends. | [§4](../V1_CONTRACT.md#4-capabilities-and-resources) |
| **history** | Keeping the browser URL and the application's state in step. The application decides what a URL means. | [§8](../V1_CONTRACT.md#8-history) |
| **Scope** | Who is responsible for ending something. Only needed when you start an application yourself (`Web.run` does it for you): closing it ends the application or mount placed in it. | [§9](../V1_CONTRACT.md#9-scopes-and-shutdown) |

## Common tasks

| Task | How | Reference |
|---|---|---|
| Run in a page | `Web.run(app, { container, primitives, present: "mount" })` | [§16](../V1_CONTRACT.md#16-the-browser-host-webrun) |
| Add a view | Add an entry to `views` and have `view(state)` return its name | [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| Add a command | Name it in `commands`: `increment: command((state) => nextState)`, or with input `command(Schema.Struct({…}), (input, state) => nextState)` | [§14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| Reuse one command for several events, with a constant or a different input | An exact `"component/name"` key with `Valance.entry` (the advanced form) | [State, views and events](state-views-events.md#when-an-events-input-needs-adapting), [§14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| Run a command from outside the screen (a test, a host page) | `application.invoke("app/name", args)` | [§2](../V1_CONTRACT.md#2-application), [§3](../V1_CONTRACT.md#3-state-and-commands) |
| Read the state | `yield* application.state` | [§3](../V1_CONTRACT.md#3-state-and-commands) |
| Compile view descriptions | `compileProgram(...)` at build time | [§15](../V1_CONTRACT.md#15-building-a-view-description) |
| Wait for data in a command | `command.waiting(input, { begin, work, wanted, settle })` (added in 0.5.0): `begin` commits `loading`, `settle` commits `ready` / `failed`. The general NEXUS form is for typed failures | [Async work](async-work.md), [§18.3](../V1_CONTRACT.md#183-a-command-that-waits-commandstatewaiting) |
| Run something once when the application starts | `start: "startup"`, the name of an ordinary command | [Startup work](startup-work.md), [§18](../V1_CONTRACT.md#18-asynchronous-work-and-start-time-work) |
| Ignore an out-of-date answer | With `waiting` it is built in: a newer run supersedes an older one, and `wanted` drops an answer the state no longer waits for. In the general form, keep a request counter | [Async work](async-work.md#when-an-answer-arrives-late) |
| Show a failure from background work | Commit it as state; nobody is waiting to be told | [Async work](async-work.md#failure-and-who-sees-it) |
| Give commands a service (an API client, a clock) | Declare a capability, supply it in a `platform` passed to `start` | [Async work](async-work.md#using-a-service-the-platform-provides), [§4](../V1_CONTRACT.md#4-capabilities-and-resources) |
| Keep a resource past one command | Acquire it into the application's lifetime through the platform | [Async work](async-work.md#long-lived-resources) |
| Make URLs follow state | `history` option of `Web.run`, with `urlOf` / `stateOf`; add `titleOf` for the document title and `container` so link clicks navigate | [§8](../V1_CONTRACT.md#8-history) |
| Link to another page | `link: Web.link` in your primitives, then `<link href={…}>` in the view. No event, no command | [§6](../V1_CONTRACT.md#6-mounts), [State, views and events](state-views-events.md) |
| A text box the user types in | `field: Web.textField`, then `<field value={text} on.input={setText($event)} />` (needs PORT Web 0.3.0) | [State, views and events](state-views-events.md#a-text-field), [§6](../V1_CONTRACT.md#6-mounts) |
| Not write the MESH manifest | `manifest({ primitives, scopes, commands })` from `@valancex/valance/web/build` | [`examples/docs-site/src/compile.ts`](../../examples/docs-site/src/compile.ts) |
| See a whole application | A documentation site with search, links, titles, SSR and hydration, on the published package | [`examples/docs-site`](../../examples/docs-site) |
| Render on a server, then take over in the browser | `renderToHtml` on the server, then `present: "hydrate"` with the state it returned. Startup work begins during a server render | [Mounting and hydration](mounting-and-hydration.md#server-rendering-and-startup-work), [§17](../V1_CONTRACT.md#17-server-rendering-rendertohtml) |
| Show the same application in two places | Several mounts over one application handle | [§6](../V1_CONTRACT.md#6-mounts) |
| Recover from a view that failed to draw | Make a fresh mount; a failed one stays inert | [§6](../V1_CONTRACT.md#6-mounts), [§10](../V1_CONTRACT.md#10-failure-model) |
| Stop the application | Close its Scope (`host.stop()` with `Web.run`) | [§9](../V1_CONTRACT.md#9-scopes-and-shutdown) |
