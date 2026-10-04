# VALANCE V1 contract

*Level 2 of the documentation (**Use**): the exact reference. New to VALANCE? Start with [Learn](learn/README.md). For why it is built this way and the evidence behind each rule, see [Understand](understand/README.md). The index of the API by name is [`use/README.md`](use/README.md).*

This document states what `@valancex/valance` guarantees, what the caller owns, what happens when things fail or close, and what is deliberately not guaranteed. It describes the public entries `.` (`define`, `start`, `mount`, `hydrate`, `command`, `entry`), `./web` (`Web.target`, `Web.history`, `Web.run`) and `./web/server` (`renderToHtml`). Everything under `./internal` is outside this contract.

Normative words: **guarantees** and **must** are promises; **may** marks behavior callers must not rely on either way. `docs/CONSTRAINTS.md` lists the same rules as tripwires for maintainers.

## 1. What VALANCE is

An application has four parts, each with one owner:

| Concern | Owner |
|---|---|
| State, commands, capabilities, the application's runtime | NEXUS |
| What a view means: templates, structure, keyed identity, the render tree | MESH |
| Realizing a render on a target (DOM): `draw`, `update`, `hydrate`, events | PORT |
| Composing them: starting the application, choosing the view, following state, dispatching events | **VALANCE** |

VALANCE adds no behavior of its own to state, templates or targets. It connects them and decides one thing the others cannot: *which program is current* and therefore whether a presentation continues the previous one.

## 2. Application

```ts
// abridged: the shapes, not a complete program
const app = Valance.define({ name, state: { schema, initial }, views: { home: { program, scope }, about: { program, scope } }, view: (state) => "home", commands, start /* optional: a command key */ });
const handle = yield* Valance.start(app, { platform, state });   // inside the caller's Scope
// handle: { state: Effect<S>, invoke(key, args): Effect<unknown, UnmappedCommand | E> }
```

- `define` returns the definition unchanged. An application is data; defining one starts nothing.
- `start` creates **exactly one application lifetime** for the Scope it runs in, and returns the handle only once the state exists, the programs of every view have passed MESH's checks, every event they declare has a command-table key (below), the optional `start` key names a table entry, and commands are admitted. The `start` command, if any, is then admitted as the last step (§18). It does no presentation, no URL work and creates no mount or history.
- **One handle is one application.** Every operation made from a handle (`state`, `invoke`, mounts, histories) refers to that application's state, command registry and lifetime. Two `start`s are two applications and share nothing. There is no global current application.
- The **caller owns the application's Scope.** Closing it ends the application (section 9). VALANCE keeps nothing that outlives it, never restarts an application, and offers no shutdown call of its own.
- `start` failure is typed and yields no handle. It is one of: an initial state that fails the schema (`InitialValueInvalid`); a platform that fails to initialize (`ServiceGraphFailed`); a view's MESH program that MESH rejects (`MeshDiagnostics`, MESH's own diagnostics for that program: they depend on the program alone, never on state); a conformance failure (`ConformanceViolation`, below); or a `start` key that the command table lacks (`UnmappedCommand`, §18). No command has been admitted, because commands are admitted only through a handle. Whatever the platform had already acquired belongs to the caller's Scope and is released when that Scope closes. A Scope that is already closed, or that closes while `start` is still running, cannot produce an application: `start` dies with `NEXUS: the runtime has begun terminating`.
- **Conformance (`D ⊆ B`).** `start` returns a handle only if every event the application's programs declare has an entry in its command table.
  - **D** is the set of `component/command` keys MESH reports as declared by the program of **every** view, whether or not that view is current, whether or not the declaring branch is currently rendered (an inactive conditional branch, a repeated body, a composite's own template all count). VALANCE asks MESH (`declaredEvents`); it reads no program. A key declared more than once is one requirement. No reachability is analysed.
  - **B** is the own keys of the table `commands(state)` returned. It is the application's: keys MESH never declares (`app/...` entries, history's navigate key) are permitted. Only `D ⊆ B` is checked, never `B ⊆ D`.
  - The checks run after `commands(state)` has returned, in this order: the programs' MESH diagnostics (the first view, in the definition's order, that has any fails `start` with them, and `D ⊆ B` is then not evaluated, because D is not complete), then conformance. A conformance failure lists **every** declaration whose key is absent: the view, the declaring component, the event, the command, the key `component/command`, and MESH's span in that component's template source (it names no file), in the order of the definition's views and then MESH's order.
  - `start` asks MESH for the declared events, so in a browser the MESH runtime must have been initialized (`init`) **before** `start`; an uninitialized runtime is a defect from `start`, not a typed failure. (In Node it initializes itself.)
  - It states **only that the key is present**. It does not state that a NEXUS command exists, that the entry runs any particular command, that the event's arguments fit it, or that running it succeeds: none of that is checked or promised.

## 3. State and commands

**State is authoritative.** The application's single state cell is the only source of truth. Nothing a mount, a history or a target does feeds back into it.

- `handle.state` reads the current committed state. A read creates no subscription and no obligation for anyone to present it. A commit is readable as soon as it completes.
- `start` (§18.2) takes either key form: an exact key, or a bare name, which means `"app/name"`.
- Asynchronous work is an ordinary command that waits; §18 states what it owns, how it ends, and who sees its failure.
- A **command** is the only way state changes. `commands(state)` maps keys to NEXUS command bindings. Keys of the form `"component/name"` are the intents a MESH program can raise; other keys (`"app/..."`) are for `invoke`. Both enter the same table.
- **Two key forms.** A key containing `/` is an exact binding (`entry(...)`) for that `component/name`, as above. A key **without** `/` is a *bare name* holding a NEXUS command; `start` binds it to every declared `component/name` whose `name` it is, and to `"app/name"` (for `invoke`, history and `start`). **Resolution, for each declared `component/name` and each `app/name`:** the exact key in the table wins; otherwise the bare name; otherwise there is no command (`ConformanceViolation` for a declared event, §2; `UnmappedCommand` for any other key). `D ⊆ B` is evaluated on the resulting table, unchanged. A bare name is one implementation for every component that declares it; to give one component different behavior, add its exact key. A bare name must hold a command object: a binding there is a mistake and `start` dies with a defect naming it. **Arguments of a bare command:** a struct input takes the supplied arguments as its fields **in field order** (missing is `undefined`, so a required field fails validation; arguments beyond the fields are ignored; the event's parameter names are not used); a non-struct input takes the first argument whole. A single object argument is not unpacked into fields, so a command that history's `navigate` calls with an object (`stateOf` returning an object) keeps its exact `"app/navigate"` binding. *(Tripwire: `examples/tracer-web/test/name-keyed-commands.test.ts`.)*
- A key resolves **in its own application's registry**. An unknown key fails with the typed `UnmappedCommand`, before admission, and nothing runs. A key defined in another application is unknown here. For the events its programs declare, `start` has already established that the key is present (§2); this lookup nevertheless runs for every `invoke` and every dispatched event and stays total: a key MESH never declared (`app/...`, a mistake), another application's key, or a render that did not come from this application's programs is still the typed `UnmappedCommand`. That is defense in depth below `start`'s guarantee, not something a started application's own events can reach.
- **Input** is validated by the command's schema before its body runs. Invalid or missing input fails with the typed `CommandValidationError`; the body is not entered and nothing commits. The body receives the decoded value.
- **Admission** happens when the invocation runs, not when `invoke(...)` is called. After the application's Scope has begun closing, every run is refused with a defect (section 9).
- Inside a command, state is changed through the handle the application is given:
  - `State.set(next)` validates `next` against the schema first. Invalid: typed `StateValidationFailed`, no commit.
  - `State.update(f)` is the **trusted, atomic** writer: `f` runs as one atomic read-modify-write, so concurrent updates all land. A failing `f` commits nothing. A value `f` returns is committed **as is, without validation**.
- **Commit and failure.** A command that fails before committing commits nothing. A command that commits and then fails keeps its commit: it is **never rolled back**, and `invoke` reports the failure in its own channel (typed failure, defect and interruption stay distinct). A command's failure is not an application lifecycle event: the application keeps admitting commands.
- **Concurrent commands** run concurrently, each in its own fiber. VALANCE does not serialize, queue, version-check or retry them. Two commands may read the same prior state; what they can rely on is `State.update`'s atomicity, and a read followed by a write that ignores the current value can overwrite another command's commit.
- A command completing implies **nothing about presentation**. Zero mounts is a normal, complete application.

## 4. Capabilities and resources

- A platform (`StartOptions.platform`) supplies capabilities and the resources behind them. It is acquired by `start`, not on first use.
- Commands reach capabilities through NEXUS (`Capability.require`). All commands of one application share that application's implementation; two applications have isolated implementations and resources.
- The resource belongs to the **application's Scope**: it is held across command completions and across any mount or history closing, and it is released **exactly once** when the application's Scope closes (after admitted commands have been interrupted, section 9).
- A capability failure is the command's own failure: before a commit nothing commits, after a commit the commit stays. It never closes the application.
- Mounts, histories and any observation (reading state, the state stream, presentation) never acquire, use or release a capability.
- After the application closes, admission is terminal, so no command can reach a capability.
- **Resource lifetime is not command lifetime.** A resource a command acquires in its own scope is released when that command ends. A resource that must outlive the command and end with the application belongs to the platform: it is acquired by `start` (above), or acquired later through a platform capability that runs the acquisition in a Scope the platform closes at termination. VALANCE exposes no application Scope to commands. The pattern is in §18, and is a use of NEXUS and Effect, not an addition to VALANCE.

## 5. Views and presentation

- `view(state)` returns the name of the current view; `views` maps names to `{ program, scope }`. `scope(state)` produces the values the MESH program renders. The view is a function of state: the application, not the presentation, decides it.
- **Continuity is decided by view name alone.** A presentation of the same view as the one the mount has drawn is an `update`; a presentation of a different view is a `draw`. VALANCE never compares render trees, so two different views that render identical output are still a `draw`, and a same-view change of any structure (a conditional appearing, keyed items added, removed or reordered) is an `update`.
- Which nodes an `update` keeps, creates or removes is MESH's identity and PORT's realization; VALANCE promises nothing about it.
- **Every state that reaches a mount is presented as `update` or `draw`.** There is no render-equality or no-op optimization: a state change outside the render, or an equal-valued new state, still reaches the target. The one state a mount does not present again is the very state object it last read.

**Latest-state presentation.** Application commits are authoritative. A mount may skip superseded intermediate states and converges on the latest state available when it reaches presentation. A mount's presentations only move forward through the commit sequence; they are never reordered, repeated or invented. It is **not** true that every commit becomes a DOM update, and how many are presented is not specified. Commits never wait for any mount.

## 6. Mounts

```ts
const mounted = yield* Valance.mount(handle, Web.target({ container, primitives }));       // or Valance.hydrate(...)
// mounted: { dispatched, settled, followed }   (hydrate adds `hydration`)
```

- A mount lives in a **caller-owned Scope of its own**. It owns exactly its target, its follower and its presentation; closing its Scope unmounts the target and ends the follower. It does not own the application, its state or its resources, and closing it never closes or interrupts the application, another mount or a history.
- `mount` draws the current state; `hydrate` takes over server-rendered markup with the client's own render (the application's `state` option carries the server's state to the client). A hydration mismatch is **not a failure**: PORT draws the client render afresh and reports it in `hydration`.
- After its first successful presentation a mount is the same thing however it began: same-view update, other-view draw, events against its own retained render.
- **Several mounts** over one handle share the application's state and nothing else. Each keeps its own retained render and its own pace, and may present different subsets of the committed states.
- A mount attached later starts from the **current state** and replays nothing.
- **Failure is local to the mount.** If MESH cannot render a state the mount reaches (typed `MeshDiagnostics`) or its target throws (a defect), that mount's follower ends: it becomes **inert**, stays drawn on its last successfully presented render, and **never resumes**, even when later states are valid. The application, the state stream, history and other mounts are unaffected. `followed` reports how a mount ended.
- **Recovery is a fresh mount** against the current state.
- A first `draw` or `hydrate` that fails gives no `Mounted` (the render's `MeshDiagnostics`, or the target's defect). Nothing is retained and the failed attempt is never unmounted; VALANCE does not undo what the target may have done.
- `Mounted.dispatched` is a mount-owned diagnostic record of the exits of the commands that mount's events started, and `settled` waits for an open mount's held dispatches. They are observation aids, not part of the programming model.

## 7. Retained render and interaction

Each mount keeps **the render of its last successful presentation**. A presentation counts as successful when the target's `draw`, `update` or `hydrate` returns; if the target throws, the previous render stays retained.

The retained render is the **logical source of event identity, handler identity and event arguments**. It is not a snapshot of the physical DOM.

- When the target reports an interaction, the mount reads its retained render **at that moment** and the interaction is resolved against it. Later presentations, other mounts and state commits do not change an interaction already reported.
- The command that results **runs against the application state it finds when it executes**, not the state at report time. Presentation-derived data is captured at the report; application state is read at execution.
- An update that leaves the tree unchanged still replaces the retained render, so event arguments follow the newest presented render.
- Changing the DOM directly (attributes, text, removing or replacing nodes) neither changes VALANCE's state nor its retained render. An element PORT did not create reaches no handler.
- There is **no stale-event check and no version**: an event from an older render is not rejected because state has moved on. After a mount goes inert, its events still resolve against its retained render and run against current application state.
- **Admission is part of the report.** The dispatch registers with the application in the same synchronous step as the report, before MESH resolves the handler. After the application's close begins the interaction is refused; closing a mount's Scope is not an admission boundary (a command already admitted continues, and its exit is still recorded in that mount's `dispatched`).

## 8. History

`Web.history(handle, { window, urlOf, stateOf, navigate })` keeps the browser URL and the application in step. It runs in its own caller-owned Scope.

- **The application owns navigation.** `urlOf(state)` and `stateOf(url)` are the application's functions, and `navigate` is the key of the application's own navigate command. History reads and writes URLs and knows nothing of what they mean. There is no router.
- **Attaching** takes the current state's `urlOf` as the baseline and writes nothing; a foreign URL is left alone, never reconciled. The baseline is taken asynchronously after attaching, so a commit made immediately afterwards can become the baseline.
- A later committed state whose `urlOf` differs from the last synchronized one is pushed (`pushState`). History follows every committed state through its own subscription, independently of any mount's presentation.
- A **popstate** invokes the navigate command with `stateOf(location)`; it never writes a URL itself. A popstate that fails (unbound key, invalid argument, refusal) is logged, not repaired.
- A defect in `urlOf` or `stateOf` is logged and ends only that synchronization step.
- Closing history's Scope removes its listener and nothing is synchronized afterwards. It does not touch the application. Several histories are independent.

## 9. Scopes and shutdown

The application, each mount and each history are separate, **caller-owned sibling Scopes**. VALANCE creates none and does not make one the child of another:

```
caller's Scope A ─ application: runtime, state, command registry, resources
caller's Scope M ─ a mount: target, follower, presentation          (any number; related to A only by what the caller passes)
caller's Scope H ─ a history: listener, follower                    (any number; likewise)
```

One Scope never closes another. The caller may put them in one Scope or in several; both are valid. The application may live with no mount and no history.

**Closing the application's Scope** (`Scope.close` on A):

1. Admission closes synchronously. Every later `invoke`, mount event or popstate is refused with a defect (`VALANCE: admission is closed (draining)`, then `NEXUS: the runtime has begun terminating`). An unknown key is still the typed `UnmappedCommand`.
2. Admitted commands are interrupted and awaited one at a time (how they interleave inside the drain is not specified, only that every commit precedes the close's resolution). A command that is uninterruptible keeps the close waiting for its actual exit; if it commits meanwhile, the commit stands, though its caller still sees `Interrupted`. The state, not the caller's exit, is the record of what committed.
3. The runtime terminates and platform resources are released, once.
4. **No commit happens after `Scope.close` resolves**, and `handle.state` stays readable as the last committed state. The state stream ends and never resumes.

What it does **not** do: it does not close, unmount or await mounts and histories.

- Mounts end inert: their followers end when the stream ends, and the target stays drawn. A mount may still present a state that was committed *before* the close, even after `Scope.close` has resolved; it never presents a state that was not committed.
- A history stays attached until its own Scope closes. It writes nothing, commits nothing, and a popstate is attempted, refused and logged.
- `mount` and `hydrate` against a closed application end with the defect `the application ended before its first render`: no render, no target operation, no commit. `Web.history` still attaches, inert. During the drain (before the close completes) the runtime is still alive and a mount or history attaches normally.

**Closing a mount's Scope** is the boundary for that mount: its follower is interrupted and awaited and the target is unmounted, so **no presentation occurs through that mount after the close resolves**. A target whose `unmount` throws makes the Scope close fail with that defect; the rest of VALANCE's cleanup still happens.

Closing the application and a mount at the same time breaks neither boundary; no order between them is specified.

## 10. Failure model

| What fails | Result | Reaches |
|---|---|---|
| Initial state invalid | typed `InitialValueInvalid`, no handle | the caller of `start` |
| Platform fails to initialize | typed `ServiceGraphFailed`, no handle | the caller of `start` |
| A view's program has MESH diagnostics (they depend on the program alone) | typed `MeshDiagnostics`, no handle; every view is checked, the first in the definition's order is reported | the caller of `start` |
| A declared event has no command-table key | typed `ConformanceViolation` listing every such declaration, no handle | the caller of `start` |
| Unknown command key | typed `UnmappedCommand`, nothing admitted (runtime defense, §3) | the caller of `invoke` / history's log / a dispatch's ledger entry |
| Command input invalid | typed `CommandValidationError`, body not entered | the caller of `invoke` |
| `State.set` invalid | typed `StateValidationFailed`, no commit | the command |
| `start` key not in the command table | typed `UnmappedCommand`, no handle, nothing run | the caller of `start` |
| Start-time work (§18) fails, or is interrupted | the command's exit is discarded; any commit it made stays | nobody: there is no caller. State is the only record |
| Capability fails before a commit | command fails, nothing committed | the command's caller; the application continues |
| Capability fails after a commit | command fails, commit stays | the command's caller; consumers see the commit |
| MESH cannot render a state (diagnostics that depend on the values the view's scope produced) | typed `MeshDiagnostics` for each mount that renders it | those mounts become inert; others may skip it |
| Target `draw`/`update` throws | defect in that mount | that mount becomes inert, last good render retained |
| First `draw`/`hydrate` fails | no `Mounted` | the caller of `mount`/`hydrate` |
| Application Scope closes | admission refused, state readable | commands refused; mounts end inert; history inert |
| Mount Scope closes | that mount unmounted | that mount only |

A failure is local to its owner. Only closing the application's Scope is application-wide.

## 11. Intentional non-guarantees

VALANCE does **not** guarantee:

- that a mount presents every committed state, how many it presents, or when (committed states may be skipped);
- any order among command admission, start, read, commit, completion, or the exits in a mount's record; only the close boundary in section 9 is ordered;
- presentation scheduling, fairness or main-thread responsiveness (a caller that cares paces its own commits);
- render-equality or no-op optimization: an unchanged render is still presented;
- that the retained render matches the physical DOM; it is the logical interaction source, never an inspection of the DOM;
- that application close linearizes presentation: it linearizes application state;
- that `State.update`'s result is valid for the schema;
- rollback of a failed presentation or hydration: a throwing target may leave partial effects, and VALANCE does not reconcile or undo them;
- that a failed first hydrate cleans up what the target left in the container;
- any router, route type or navigation abstraction beyond the application's own navigate command;
- a derived-observation or selector API: `ApplicationHandle` is `state` and `invoke`;
- stale-event rejection, state versions, retries, or cross-application communication.

## 12. Scope of V1

This contract covers VALANCE's composition of state, commands, views, mounts, history and Scopes. It does not specify:

- MESH language, compilation or render-tree semantics (including which keyed nodes survive an update);
- PORT or target-specific behavior, including how `draw`, `update` and `hydrate` realize a render and what a browser DOM guarantees;
- the NEXUS application, capability and state APIs beyond the use described here;
- anything under `./internal`, which is unstable by design.

The package is pre-1.0: the API can still change before the first stable release.

## 13. Installation and package surface

Each package has one role. A strict package manager (pnpm) resolves only what the application declares, so declare all of the application-level and build-time rows yourself:

| Package | Range | Role | Declare it as |
|---|---|---|---|
| `@valancex/valance` | the release you target | this package | dependency |
| `@valancex/nexus` | `^0.10.2` | **application-level**: command definitions, state handles and capabilities are written against it (`Command.define`, `Mesh.bind`, `State.StateHandle`, `Capability`), and its types appear in `define`'s signature | dependency (the same range `@valancex/valance` uses, so exactly one copy is shared) |
| `@valancex/mesh-runtime` | `^0.8.0` | peer: renders MESH programs at run time | dependency |
| `@valancex/port-web` | `^0.2.3` | optional peer: needed for `@valancex/valance/web` and `@valancex/valance/web/server`, not for the core entry | dependency, when you use the Web entries |
| `effect` | `^3.10.0` | peer: the effect system the API is written in | dependency |
| `@valancex/mesh-compiler` | `^0.9.0` | **build time only**: compiles MPRX sources to the `program` each view takes (`compileProgram`, [§15](#15-building-a-view-description)); nothing imports it at run time | devDependency |

```console
$ pnpm add @valancex/valance @valancex/nexus@^0.10.2 @valancex/mesh-runtime@^0.8.0 @valancex/port-web@^0.2.3 effect@^3.10.0
$ pnpm add -D @valancex/mesh-compiler@^0.9.0
```

Give the ranges explicitly, as above: an unversioned `pnpm add effect` resolves to a newer major than the peer range allows.

The package's type declarations use TypeScript's `NoInfer` (so that an application's state type is inferred from its schema, not from `initial`), which needs **TypeScript 5.4 or newer** in the application that compiles against it.

- **Entries:** `@valancex/valance` (`define`, `start`, `mount`, `hydrate`, `command`, `entry`), `@valancex/valance/web` (`Web.target`, `Web.history`, `Web.run`, and the PORT Web primitive helpers it re-exports), `@valancex/valance/web/server` (`renderToHtml`). `@valancex/valance/internal` is not part of the contract.
- The MESH, NEXUS and PORT packages keep their own versions; the ranges above are the set this release is built and tested against.

## 14. Authoring helpers: `command` and `entry`

Two helpers make the commands table of §3 short to write. They add no behavior: each returns what `commands(state)` already accepts. `command` is the ordinary one; `entry` is for the case where an event's input needs adapting.

```ts
// ordinary: commands found by their NAME (§3, "Two key forms")
const command = Valance.command(state);                                   // the state is bound first
return {
  increment: command((current) => ({ ...current, count: current.count + 1 })),                                                  // no input
  add: command(Schema.Struct({ amount: Schema.Number }), ({ amount }, current) => ({ ...current, count: current.count + amount })),   // the event's arguments fill the fields, in order
};

// advanced: one command, an exact key, and an input that is adapted (a constant here)
const reset = command(Schema.Struct({ amount: Schema.Number }), ({ amount }, current) => ({ ...current, count: amount }));
return { "counter/clear": Valance.entry(reset, () => ({ amount: 0 })) };
```

- `Valance.command(state)(input, transition)` returns an ordinary command whose whole behavior is `transition(validatedInput, currentState) → nextState`. `input` is a Schema: invalid input fails with the typed `CommandValidationError` before `transition` runs, and nothing commits.
- A command with no input may be written `command((current) => next)`: exactly `command(Schema.Struct({}), (_input, current) => next)`, the same command, validated and run in the same way.
- It is `State.update`, the **trusted, atomic** writer of §3, never `State.set`: the returned state is committed **as returned, without being validated against the state's schema**, and concurrent transitions all land.
- The state is given in a first call, and `transition` must return that state's type. A returned object is not checked for excess properties, as when returned from `State.update`.
- The command has no author-chosen name: every command made this way carries one shared diagnostic id, which only decorates `CommandValidationError.command` (so such a failure does not tell two of them apart, and its value is not something to match on). A command that must consult the platform, wait, or fail with its own error is written as a NEXUS command (`Command.define`) and bound the same way.
- `Valance.entry(run, input?)` makes the table entry for `run`. `input` receives the entry's arguments as **plain values, in order** (an absent argument is `undefined`) and returns the command's input, which is validated by the command's schema as always. Without `input`, the command is given `{}`.
- Any number of entries may run the same command. A key `"component/name"` is an intent a view's description raises; a key `"app/..."` is for `invoke` and history. Both are resolved in the one table (§3), and an unknown key is the typed `UnmappedCommand`.

## 15. Building a view description

Each view's `program` is the opaque value a build step produces; **VALANCE never compiles MPRX.** The build step is MESH's `compileProgram`, from `@valancex/mesh-compiler` (devDependency, §13):

```ts
const built = await compileProgram({
  model: { manifest, path: "components.json" },       // the manifest's text; path only names it in diagnostics
  root: "counter",                                     // the component the view renders
  components: [{ component: "counter", source, path: "counter.mprx" }],   // every component that has a description, in order
});
// built.program: the value for `views.<name>.program`; undefined when something is wrong
// built.components: each source's diagnostics document; built.assembly: the program-level check's diagnostics document
```

- `built.program` is present when no component had an error and the program check found none. Otherwise it is `undefined` and `built.components` (per-source errors) and `built.assembly` (program-level, such as a missing root) say why. Warnings do not stop a program.
- Pass **every** component that has a description. A component not listed has none and is a primitive (MESH's rule): the target realizes it from the `primitives` table (§16), not from a description.
- A view's `program` is used as returned. VALANCE does not parse it, inspect its templates, interpret it or change it: its structure and meaning are MESH's. VALANCE hands it to MESH, which validates it and says which events it declares (`declaredEvents`), and VALANCE compares those keys with the command table (§2). A program MESH rejects at program level fails `start`, for every view (§2, §10). Diagnostics that depend on the values a view's scope produces are reported as `MeshDiagnostics` when a mount (or `renderToHtml`) renders that state (§10).
- Its exact behavior (inputs, the checks, the diagnostics) is MESH's: see the compiler package's README. Everything VALANCE needs is the value it returns.

## 16. The browser host: `Web.run`

`Web.run` runs one ordinary application on one page: `start`, then `mount` or `hydrate`, then `history` if the application has a URL policy, all in **one lifetime**. It is a convenience over §2, §6 and §8, and decides nothing the core does not.

```ts
const host = await Web.run(app, { container, primitives, present: "mount" /* or "hydrate" */, state, platform, history });
// host: { handle, mounted, stop }
```

- `present` is explicit and never inferred from the container. `"mount"` creates the presentation (anything the container held is replaced). `"hydrate"` adopts server-rendered markup (`mounted.hydration` reports whether it did, §6). `state` and `platform` are `start`'s options; `history`, when present, is `Web.history`'s options, handed on unread; absent, the URL is not kept in step.
- `handle` and `mounted` are exactly what `start` and `mount` / `hydrate` return.
- `run` resolves once the first presentation has been made; `history`'s baseline is taken asynchronously after that (§8). `stop()` closes the page's one lifetime in the order of one Scope that holds all three (§9): URL synchronization, then the presentation, then the application (admitted commands interrupted and awaited, resources released). Calling it again returns the same completion.
- **Startup failure** rejects with the failure itself (a typed failure of `start`, §2, or of the first presentation, `MeshDiagnostics`; or the defect), after the lifetime it had begun has been closed. Nothing is logged, written to the page or committed by the host.
- After startup, the host reports nothing itself: how things end is observed through `handle`, `mounted.followed`, `mounted.settled` and `mounted.dispatched`, as in §6. (`history` still logs a failed popstate, §8.)
- `run` is for an ordinary page: it needs a DOM `container`. A server uses `renderToHtml` (§17); headless use is `start` (§2).
- Several mounts, independent lifetimes, a custom target and headless use are the core's own: compose `start`, `mount`, `hydrate` and `history` yourself.

## 17. Server rendering: `renderToHtml`

`renderToHtml(app, { primitives, state?, platform? })` (from `@valancex/valance/web/server`) starts the application, renders its current view once, ends it, and returns `Effect<{ html, state }, StartError | MeshDiagnostics>`. There is no target object and no DOM.

- It uses `start`, so a `platform` is acquired and released for that one render (§4). Every failure of `start` (§2), conformance included, is its failure: a page is never served from an application that cannot start.
- **No event command runs, but the application's start-time work does begin.** If the application declares `start` (§18), that command is admitted by `start` like anywhere else. The render does not wait for it. It then runs concurrently with the render, and when the render ends the application ends, so work still waiting is interrupted (a work item may be interrupted before it has done anything). Only a commit that lands before the render reads the state is in the HTML; one that lands after that read but before `state` is read is in `state` only (below). Declaring no `start` means no command runs.
- `html` is the render written as HTML (use the same `primitives` as the client, so hydration can adopt it). `state` is the application's state **read after the render**. Without start-time work it is the state the HTML was rendered from. With start-time work that commits between the render's read and the final read, `state` is newer than the HTML; hydrating that pair draws the client's render afresh, which is a mismatch and not a failure (§6). Embedding `state` in the page is the application's job.
- Nothing skips start-time work for a server. An application that must not do it on a server decides in the command: from the state it is given, or from a capability the server's platform does not provide (the command then fails, unobserved, as §18 states).
- The client takes the markup over with `present: "hydrate"` and that `state` (§6, §16).
- Failure is the same typed failures as `start` and a render's `MeshDiagnostics`.
  *(Tripwires: `examples/tracer-web/test/server-start-work.test.ts`.)*

## 18. Asynchronous work and start-time work

*Evidence: C20 to C26, C33 and C35 to C37 in [`CONSTRAINTS.md`](CONSTRAINTS.md); the tests named below. Learner's version: [Async work](learn/async-work.md), [Startup work](learn/startup-work.md).*

### 18.1 Asynchronous work is an admitted command

VALANCE has no asynchronous API. A command that waits (on a timer, a fetch, a gate) is an ordinary command (§3), bound with `entry` like any other.

- **Ownership.** Once admitted (by `invoke`, by a mount's event, or by `start`, §18.2), the command belongs to the application's registry until it exits. Not the caller, not the mount, not the platform. Closing a mount's Scope does not end it (C25).
- **Cancellation is the application's close** (§9): admitted commands are interrupted and awaited before the runtime terminates and platform resources release. Interruption is Effect's: a signal given to `Effect.tryPromise` aborts. A result that arrives after the close changes nothing and admits nothing. *(Tripwires: `application-owned-async.test.ts`, `async-flow.test.ts`.)*
- **Uninterruptible work holds the close open.** Work the author makes uninterruptible, including the acquire step of `Effect.acquireRelease` unless interruptibility is restored, keeps the close waiting for its actual exit (C23). Nothing is leaked: what it acquired is released with the application.
- **Concurrency and staleness.** Commands run concurrently; completion order decides what commits. VALANCE has no notion of an older request: dropping a stale result is application logic over its own state or a counter in the command's closure (it is created per started application). *(Tripwires: `async-compose.test.ts`, group H.)*
- **Loading, success and failure are state.** A command that waits commits what it wants shown. VALANCE represents none of them.
- **Who sees a failure.**

  | Work started by | The outcome is observable by |
  |---|---|
  | `invoke` | its caller: success, a typed failure, a defect, or interruption |
  | a mount's event | the dispatching mount's record `Mounted.dispatched`, and what the command committed |
  | `start` (§18.2) | only what the command committed |

- **Resources.** A resource a command acquires in its own scope is released when the command ends. An application-lifetime resource is acquired by the platform at start, or later through a platform capability that offers `own(effect)`, which runs a scoped acquisition inside a Scope the platform closes when the application terminates (after the drain). It is released once, in reverse acquisition order, and is not exposed as a Scope. If a command is cancelled while acquiring, nothing is held. The recipe is in [Async work](learn/async-work.md#long-lived-resources). *(Tripwire: `application-scoped-capability.test.ts`.)*

### 18.2 Start-time work: `ApplicationDefinition.start`

*Added after 0.3.0.* `start?: string` is a key of the command table that `start` runs once.

- **It is a command.** It is resolved in the same table as events and `invoke`. There is no second way to express behavior, and it can also be run by `invoke(key, [])`.
- **Arguments.** None: the entry is called with no arguments, as `invoke(key, [])` would.
- **Order.** It is admitted as the last step of `start`, after the checks of §2, in the application's registry. A `start` that fails (any `StartError`) runs nothing. The key is checked after `commands(state)` has returned: a key that the table lacks fails `start` with the typed `UnmappedCommand` (`{ component, name }` from the key split at the first `/`), with no handle.
- **Ownership.** It has no caller and is the application's from the moment it is admitted. It does not need, and is not given, a caller's Scope. Closing the application interrupts and awaits it like any admitted command (§9), and `Scope.close` racing `start` either runs it and interrupts it, or never runs it; it never commits after the close resolves. *(Tripwires: `application-start-work.test.ts`.)*
- **State.** It reads the state `start` was given (`StartOptions.state`, e.g. hydration). A command that finds its work already done can do nothing; nothing in VALANCE skips it.
- **Presentation.** It may finish before anything is mounted; a later mount draws the settled state. Mounts follow its commits like any others.
- **Failure.** Its exit is not reported anywhere: no caller, no mount ledger, no log. A failure it does not catch leaves state untouched and the application running. Work whose failure should be seen commits it as state (§18.1).
- **Multiplicity.** One key. An application that has several things to do at start composes them in one command.
- **Server render.** `renderToHtml` starts the application, so it begins there (§17).

