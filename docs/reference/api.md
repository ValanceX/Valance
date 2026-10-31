# API reference

> **TL;DR:** Every public name, what it does, and where the [V1 contract](v1-contract.md) states it exactly. New to VALANCE? Start with the [tutorials](../tutorials/README.md).

Looks and themes: [Themes](../how-to/themes.md). Tuning (opt-in): [Performance](../how-to/performance.md). Reaching the platform, with native callbacks or a target of your own: [The platform](../how-to/platform.md). Components and themes you can install, and making your own: [Libraries](../how-to/libraries.md). State for one occurrence of a component: [Units](../how-to/units.md). A value many distant components read, such as a theme or a locale, without a prop at every level: [Context](../how-to/context.md). Forms from the schema: [Forms](../how-to/forms.md). [Dialogs and popovers](../how-to/dialogs-and-popovers.md). Recording a session and replaying it, and the conformance report: [Replay and conformance](../how-to/replay-and-conformance.md). Letting a model write the interface, checked as it arrives: [Generated UI](../how-to/generated-ui.md).

Package entries: `@valancex/valance` (core), `@valancex/valance/web` (browser target, history, host), `@valancex/valance/web/server` (server rendering), `@valancex/valance/web/build` (the manifest from a definition). What each promises: [API stability](stability.md). `@valancex/valance/internal` is outside the contract.

## Core: `@valancex/valance`

| Name | What it is | Rules |
|---|---|---|
| `define(definition)` | The application, as data: `name`, `state: { schema, initial }`, `views`, `view` (optional with exactly one view), `commands`, and optionally `start` (a command key run once at start, added in 0.4.0), `units` (state for one occurrence of a component, added in 0.14.0; [Units](../how-to/units.md)) and `context` (values a component reads by listing them in `uses`, worked out from the state beside `scope`, added in 0.16.0; [Context](../how-to/context.md)). Returns the definition unchanged and starts nothing. | [§2](v1-contract.md#2-application), [§5](v1-contract.md#5-views-and-presentation), [§18](v1-contract.md#18-asynchronous-work-and-start-time-work) |
| `start(app, { platform?, state? })` | Starts one application in the caller's `Scope`; returns the handle once state exists, the checks have passed and commands are admitted; then admits the `start` command, if the definition has one. Fails with a typed `StartError`. | [§2](v1-contract.md#2-application), [§9](v1-contract.md#9-scopes-and-shutdown), [§18](v1-contract.md#18-asynchronous-work-and-start-time-work) |
| `ApplicationHandle` | `{ state, invoke, command }`: read the committed state; run a command by key. `invoke(key, args)` takes each argument wrapped as `{ value }`, in the command's field order: `invoke("app/add", [{ value: 5 }])`; a command with no input takes `[]`. Since 0.16 the key's type names the table's keys, so an editor completes them; any string is still accepted (a typo is the typed `UnmappedCommand` at run time, not a type error). Since 0.16, opt-in, `command(key, input)` runs the same table with the key and the input **checked by the type**: a bare command's `"app/name"` takes its input whole, a struct by field name (`command("app/move", { from: "a", to: "b" })`, never by position), another input as itself, and nothing for a command that takes none; an exact `"component/name"` key takes its entry's arguments as `invoke` does. A typo is a type error. A table built by spreading one typed as the wide `CommandTable` has keys its type does not show: give the shared table its own literal keys (no annotation), or call those keys with `invoke`. | [§2](v1-contract.md#2-application), [§3](v1-contract.md#3-state-and-commands) |
| `command(state)(transition)`, `command(state)(input, transition)` | A command that is a pure transition of state; with `input`, validated by it. Put it in `commands` under its name. | [§14](v1-contract.md#14-authoring-helpers-command-and-entry) |
| `command(state).waiting(input, spec)` | A command that waits: `begin`, `work` (a Promise), `wanted` (required), `settle`. A newer run supersedes an older; the failure reaches `settle` as the Promise rejected. | [§18.3](v1-contract.md#183-a-command-that-waits-commandstatewaiting) |
| `entry(run, input?)` | An exact `"component/name"` entry for a command, adapting the event's arguments (plain values) to its input, for when an event's input does not match the command's. Not needed for an ordinary command. | [§14](v1-contract.md#14-authoring-helpers-command-and-entry) |
| `mount(handle, target)` | Draws the current state and follows it. Returns `Mounted`. | [§6](v1-contract.md#6-mounts), [§7](v1-contract.md#7-retained-render-and-interaction) |
| `hydrate(handle, target)` | Takes over server markup, then behaves as `mount`. Adds `hydration`. | [§6](v1-contract.md#6-mounts) |
| `Mounted` | `{ dispatched, settled, followed }`: how a mount ended, and observation aids. | [§6](v1-contract.md#6-mounts), [§10](v1-contract.md#10-failure-model) |
| `Program`, `StateHandle<S>` | Types only. `Program` is a compiled view description (what `compileProgram` returns and a view's `program` takes). `StateHandle<S>` is the `state` that `commands` receives, for writing `commands` apart from `define`. No runtime. | [§14](v1-contract.md#14-authoring-helpers-command-and-entry), [§15](v1-contract.md#15-building-a-view-description) |
| `StartOptions`, `StartError`, `TargetFactory`, `Target` | Start options and failures (`InitialValueInvalid`, `ServiceGraphFailed`, `MeshDiagnostics`, `ConformanceViolation`, and `UnmappedCommand` for a `start` key the table lacks); the shape a target implements. | [§2](v1-contract.md#2-application), [§6](v1-contract.md#6-mounts), [§10](v1-contract.md#10-failure-model) |
| `ValanceError`, `ValanceErrorCode`, `isValanceError`, `isRefusal` | The stable identity of a defect VALANCE dies with: a `code` (`admission-closed`, `application-ended`, `not-an-application`, `bare-command-binding`, `unknown-view`, `target-not-drawn`, `plugin-conflict`, `invalid-head`, `invalid-ledger`, `missing-view`, `redacted-unmaskable` and `context-not-recordable` (since 0.16.0); the list is `ValanceErrorCode` in `packages/valance/src/errors.ts`). `isRefusal(defect)` is true for work turned away because the application or the NEXUS runtime under it is closing, ended or was never started, and false for a bug. Added in 0.6.0. | [§9](v1-contract.md#9-scopes-and-shutdown), [§10](v1-contract.md#10-failure-model) |
| `View<S>`, `CommandTable`, `CommandMaker<S>`, `Ambient` | Types only. `View` is one MESH program and the scope that feeds it; `CommandTable` is what `commands` returns (bare names and exact keys); `CommandMaker` is what `command(state)` returns; `Ambient` is what a command may require from the application runtime. | [§2](v1-contract.md#2-application), [§14](v1-contract.md#14-authoring-helpers-command-and-entry) |
| `Report`, `HydratableTarget<H>`, `UnmappedDeclaration`, `Outcome<A>` | Types only. `Report` is the function a target calls with a handler identifier and a payload; `HydratableTarget` is a target whose PORT can take over server output; `UnmappedDeclaration` is one event a view declares that the command table lacks (in `ConformanceViolation`); `Outcome` is how a waiting command's work ended. | [§6](v1-contract.md#6-mounts), [§14](v1-contract.md#14-authoring-helpers-command-and-entry) |

## Web: `@valancex/valance/web`

| Name | What it is | Rules |
|---|---|---|
| `run(app, options)` | One application on one page, one lifetime; `stop()` ends it. | [§16](v1-contract.md#16-the-browser-host-webrun) |
| `target({ container, primitives })` | A browser target for `mount` / `hydrate`. | [§6](v1-contract.md#6-mounts) |
| `history(handle, { window, urlOf, stateOf, navigate, container? })` | Keeps the URL and the application in step. `navigate` is a bare command name (the navigation fact is its input) or an exact key. `titleOf?` keeps `document.title` in step with the state. A plain link click starts at the top. With a `container` (`run` passes its own), a plain click on an `<a href>` inside it is a navigation, as a popstate is; the browser keeps every other click. | [§8](v1-contract.md#8-history) |
| `textField` | A primitive for an `<input>` the user types in: its `value` is the application's text and its `input` event carries a string. The field always shows the rendered value. Put it in `primitives`. | [§6](v1-contract.md#6-mounts) |
| `controlled(name)` | The PORT realization `textField` is made of, re-exported for a custom field: an attribute that is also its DOM property. Needs `@valancex/port-web` 0.3.0. | [§6](v1-contract.md#6-mounts) |
| `link` | A primitive for a link: an `<a>` with an `href` and no event. Put it in `primitives`. | [§8](v1-contract.md#8-history) |
| `event(type, payload?)` | A PORT event realization whose payload kind is declared (`{ kind, of }`), so a manifest can be derived. | [§15.1](v1-contract.md#151-the-manifest-can-be-derived) |
| `WebPrimitives`, `attribute`, `booleanAttribute`, `property`, `textProperty` | The table that says which page element each building block becomes. Target configuration, not part of the application. | [§6](v1-contract.md#6-mounts) |
| `RunOptions`, `Host<S, E>`, `HistoryOptions<S>` | Types only. `RunOptions` extends `StartOptions` with `container`, `primitives`, `present` and an optional `history`; `Host` is what `run` resolves to (`handle`, `mounted`, `stop`); `HistoryOptions` is `history`'s options without the handle. | [§16](v1-contract.md#16-the-browser-host-webrun), [§8](v1-contract.md#8-history) |

## Plugins: `@valancex/valance/web/plugin`

*Stable (since 0.8.0).*

| Name | What it is | Rules |
|---|---|---|
| `Plugin<S>` | A value with a `name` and any of `primitives`, `platform`, `routes`, `head`. Passed as `plugins` to `Web.run`, `renderToHtml` or `manifest`; nothing registers on import. | [§19](v1-contract.md#19-plugins-and-the-documents-head) |
| `RouteTable<S>`, `Navigation`, `Delivery` | The URL policy as one value (`urlOf`, `stateOf`, `navigate`, `known`, `paths`, `delivery?`, `onNavigated?`); what `onNavigated` is told; `"static"` (default) or `"server"`. | [§19](v1-contract.md#19-plugins-and-the-documents-head) |
| `HeadTags`, `MetaTag`, `LinkTag` | What the document's head says for a state. Types only. | [§19](v1-contract.md#19-plugins-and-the-documents-head) |
| `renderHead(head)` | The head as escaped HTML, each meta and link marked `data-valance-head`. Title, meta content and link titles are cleaned to plain text (control and direction-override characters out, title cut at 200). Refuses a link whose href carries script (`invalid-head`). | [§19](v1-contract.md#19-plugins-and-the-documents-head) |
| `applyHead(document, head)` | Sets the (cleaned) title, only when it changed, and replaces the elements VALANCE wrote; touches no other. What `Web.history` calls. | [§19](v1-contract.md#19-plugins-and-the-documents-head) |
| `deliveryOf(routes, pathname)`, `staticPaths(routes)` | How a path is delivered; the paths a static export renders. | [§19](v1-contract.md#19-plugins-and-the-documents-head) |
| `compose(own, plugins)`, `mergePlatforms`, `mergeHeads` | The composition rules, exposed for a tool that composes outside `run` (an exporter). A tag and the URL policy are declared once (`plugin-conflict`); platforms and heads merge in order. | [§19](v1-contract.md#19-plugins-and-the-documents-head) |

## Build time: `@valancex/valance/web/build`

| Name | What it is | Rules |
|---|---|---|
| `manifest({ primitives, scopes, commands })` | The MESH component manifest, derived from the primitives table, each view's scope Schema and the command table. Pure; refuses (`ManifestError`) what it cannot derive safely. | [§15.1](v1-contract.md#151-the-manifest-can-be-derived) |
| `Manifest`, `ManifestOptions`, `MeshType` | Types only. `Manifest` is the derived MESH component manifest (manifest format 1), `ManifestOptions` the arguments of `manifest`, `MeshType` a MESH type. | [§15.1](v1-contract.md#151-the-manifest-can-be-derived) |

## Server: `@valancex/valance/web/server`

| Name | What it is | Rules |
|---|---|---|
| `renderToHtml(app, { primitives?, state?, platform?, head?, plugins? })` | Renders the current view once as HTML, and returns the state read after it. Start-time work begins and is interrupted when the render ends. | [§17](v1-contract.md#17-server-rendering-rendertohtml) |
| `Served<S>` | Types only. What `renderToHtml` returns: the HTML, the state read after it, and (0.8) the `head` for that state. | |

## Build time: `@valancex/mesh-compiler`

| Name | What it is | Rules |
|---|---|---|
| `compileProgram({ model, root, components })` | Turns MPRX sources and a component manifest into each view's `program`. | [§15](v1-contract.md#15-building-a-view-description) |

## Behavior by topic

| Topic | Rules |
|---|---|
| Application, one handle one application | [§2](v1-contract.md#2-application) |
| State, commands, atomicity, concurrency | [§3](v1-contract.md#3-state-and-commands) |
| Resources and platform | [§4](v1-contract.md#4-capabilities-and-resources) |
| Async work: ownership, cancellation, staleness, who sees a failure | [§18.1](v1-contract.md#181-asynchronous-work-is-an-admitted-command), [Learn: Async work](../how-to/async-work.md) |
| Start-time work (`start`) | [§18.2](v1-contract.md#182-start-time-work-applicationdefinitionstart), [Learn: Startup work](../how-to/startup-work.md) |
| Application-lifetime resources | [§4](v1-contract.md#4-capabilities-and-resources), [§18.1](v1-contract.md#181-asynchronous-work-is-an-admitted-command) |
| Views, continuity, latest-state presentation | [§5](v1-contract.md#5-views-and-presentation) |
| Mounts and hydration | [§6](v1-contract.md#6-mounts), [Learn: Mounting and hydration](../how-to/mounting-and-hydration.md) |
| Events and the retained render | [§7](v1-contract.md#7-retained-render-and-interaction) |
| Navigation / history | [§8](v1-contract.md#8-history) |
| Lifecycle, Scopes and shutdown | [§9](v1-contract.md#9-scopes-and-shutdown) |
| Errors and failure behavior | [§10](v1-contract.md#10-failure-model) |
| What is not guaranteed | [§11](v1-contract.md#11-intentional-non-guarantees) |
| What the contract covers | [§12](v1-contract.md#12-scope-of-v1) |
| Installation and package versions | [§13](v1-contract.md#13-installation-and-package-surface) |

## Going further

The contract names NEXUS and MESH types where they appear in a signature (`Command`, `StateHandle`, `MeshDiagnostics`). A command that waits is written with NEXUS's `Command.define` and Effect, which is why those packages are application-level dependencies ([Learn: Async work](../how-to/async-work.md#where-the-imports-come-from)). Their own rules are in those packages' documentation; the way VALANCE uses them, and why, is in [Explanation](../explanation/README.md). Why a rule exists: [concept → evidence](../explanation/README.md#from-a-concept-to-its-evidence).

## The desktop vocabulary

What a template may write: [the primitives](primitives.md) (role, name, states, props and events of each), and for a native window [the desktop vocabulary](desktop-vocabulary.md).
