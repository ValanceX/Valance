# Use VALANCE: API reference

The exact behavior of every public name. The reference itself is the [**V1 contract**](../V1_CONTRACT.md); this page is the index to it by name. New to VALANCE? Start with [Learn](../learn/README.md).

Package entries: `@valancex/valance` (core), `@valancex/valance/web` (browser target, history, host), `@valancex/valance/web/server` (server rendering). `@valancex/valance/internal` is outside the contract.

## Core: `@valancex/valance`

| Name | What it is | Rules |
|---|---|---|
| `define(definition)` | The application, as data: `name`, `state: { schema, initial }`, `views`, `view`, `commands`. Returns the definition unchanged and starts nothing. | [§2](../V1_CONTRACT.md#2-application), [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| `start(app, { platform?, state? })` | Starts one application in the caller's `Scope`; returns the handle once state exists and commands are admitted. | [§2](../V1_CONTRACT.md#2-application), [§9](../V1_CONTRACT.md#9-scopes-and-shutdown) |
| `ApplicationHandle` | `{ state, invoke }`: read the committed state; run a command by key. | [§2](../V1_CONTRACT.md#2-application), [§3](../V1_CONTRACT.md#3-state-and-commands) |
| `command(state)(input, transition)` | A command that is a pure transition of state, validated by `input`. | [§14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| `entry(run, input?)` | A `commands` table entry for a command, taking the event's arguments as plain values. | [§14](../V1_CONTRACT.md#14-authoring-helpers-command-and-entry) |
| `mount(handle, target)` | Draws the current state and follows it. Returns `Mounted`. | [§6](../V1_CONTRACT.md#6-mounts), [§7](../V1_CONTRACT.md#7-retained-render-and-interaction) |
| `hydrate(handle, target)` | Takes over server markup, then behaves as `mount`. Adds `hydration`. | [§6](../V1_CONTRACT.md#6-mounts) |
| `Mounted` | `{ dispatched, settled, followed }`: how a mount ended, and observation aids. | [§6](../V1_CONTRACT.md#6-mounts), [§10](../V1_CONTRACT.md#10-failure-model) |
| `StartOptions`, `StartError`, `TargetFactory`, `Target` | Start options and failures; the shape a target implements. | [§2](../V1_CONTRACT.md#2-application), [§6](../V1_CONTRACT.md#6-mounts) |

## Web: `@valancex/valance/web`

| Name | What it is | Rules |
|---|---|---|
| `run(app, options)` | One application on one page, one lifetime; `stop()` ends it. | [§16](../V1_CONTRACT.md#16-the-browser-host-webrun) |
| `target({ container, primitives })` | A browser target for `mount` / `hydrate`. | [§6](../V1_CONTRACT.md#6-mounts) |
| `history(handle, { window, urlOf, stateOf, navigate })` | Keeps the URL and the application in step. | [§8](../V1_CONTRACT.md#8-history) |
| `WebPrimitives`, `attribute`, `booleanAttribute`, `property`, `textProperty` | The table that says which page element each building block becomes. Target configuration, not part of the application. | [§6](../V1_CONTRACT.md#6-mounts) |

## Server: `@valancex/valance/web/server`

| Name | What it is | Rules |
|---|---|---|
| `renderToHtml(app, { primitives, state?, platform? })` | Renders the current view once as HTML, and returns the state it came from. | [§17](../V1_CONTRACT.md#17-server-rendering-rendertohtml) |

## Build time: `@valancex/mesh-compiler`

| Name | What it is | Rules |
|---|---|---|
| `compileProgram({ model, root, components })` | Turns MPRX sources and a component manifest into each view's `program`. | [§15](../V1_CONTRACT.md#15-building-a-view-description) |

## Behavior by topic

| Topic | Rules |
|---|---|
| Application, one handle one application | [§2](../V1_CONTRACT.md#2-application) |
| State, commands, atomicity, concurrency | [§3](../V1_CONTRACT.md#3-state-and-commands) |
| Resources and platform | [§4](../V1_CONTRACT.md#4-capabilities-and-resources) |
| Views, continuity, latest-state presentation | [§5](../V1_CONTRACT.md#5-views-and-presentation) |
| Mounts and hydration | [§6](../V1_CONTRACT.md#6-mounts) |
| Events and the retained render | [§7](../V1_CONTRACT.md#7-retained-render-and-interaction) |
| Navigation / history | [§8](../V1_CONTRACT.md#8-history) |
| Lifecycle, Scopes and shutdown | [§9](../V1_CONTRACT.md#9-scopes-and-shutdown) |
| Errors and failure behavior | [§10](../V1_CONTRACT.md#10-failure-model) |
| What is not guaranteed | [§11](../V1_CONTRACT.md#11-intentional-non-guarantees) |
| What the contract covers | [§12](../V1_CONTRACT.md#12-scope-of-v1) |
| Installation and package versions | [§13](../V1_CONTRACT.md#13-installation-and-package-surface) |

## Going further

The contract names NEXUS and MESH types where they appear in a signature (`Command`, `StateHandle`, `MeshDiagnostics`). Their own rules are in those packages' documentation; the way VALANCE uses them, and why, is in [Understand](../understand/README.md). Why a rule exists: [concept → evidence](../understand/README.md#from-a-concept-to-its-evidence).
