# VALANCE V1 contract

This document states what `@valancex/valance` guarantees, what the caller owns, what happens when things fail or close, and what is deliberately not guaranteed. It describes the public entries `.` (`define`, `start`, `mount`, `hydrate`), `./web` (`Web.target`, `Web.history`) and `./web/server` (`renderToHtml`). Everything under `./internal` is outside this contract.

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
const app = Valance.define({ name, state: { schema, initial }, views: { home: { program, scope }, about: { program, scope } }, view: (state) => "home", commands });
const handle = yield* Valance.start(app, { platform, state });   // inside the caller's Scope
// handle: { state: Effect<S>, invoke(key, args): Effect<unknown, UnmappedCommand | E> }
```

- `define` returns the definition unchanged. An application is data; defining one starts nothing.
- `start` creates **exactly one application lifetime** for the Scope it runs in, and returns the handle only once the state exists and commands are admitted. It does no presentation, no URL work and creates no mount or history.
- **One handle is one application.** Every operation made from a handle (`state`, `invoke`, mounts, histories) refers to that application's state, command registry and lifetime. Two `start`s are two applications and share nothing. There is no global current application.
- The **caller owns the application's Scope.** Closing it ends the application (section 9). VALANCE keeps nothing that outlives it, never restarts an application, and offers no shutdown call of its own.
- `start` failure is typed and yields no handle: an initial state that fails the schema is `InitialValueInvalid`; a platform that fails to initialize is `ServiceGraphFailed`. Whatever the platform had already acquired belongs to the caller's Scope and is released when that Scope closes. A Scope that is already closed, or that closes while `start` is still running, cannot produce an application: `start` dies with `NEXUS: the runtime has begun terminating`.

## 3. State and commands

**State is authoritative.** The application's single state cell is the only source of truth. Nothing a mount, a history or a target does feeds back into it.

- `handle.state` reads the current committed state. A read creates no subscription and no obligation for anyone to present it. A commit is readable as soon as it completes.
- A **command** is the only way state changes. `commands(state)` maps keys to NEXUS command bindings. Keys of the form `"component/name"` are the intents a MESH program can raise; other keys (`"app/..."`) are for `invoke`. Both enter the same table.
- A key resolves **in its own application's registry**. An unknown key fails with the typed `UnmappedCommand`, before admission, and nothing runs. A key defined in another application is unknown here.
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
| Unknown command key | typed `UnmappedCommand`, nothing admitted | the caller of `invoke` / history's log |
| Command input invalid | typed `CommandValidationError`, body not entered | the caller of `invoke` |
| `State.set` invalid | typed `StateValidationFailed`, no commit | the command |
| Capability fails before a commit | command fails, nothing committed | the command's caller; the application continues |
| Capability fails after a commit | command fails, commit stays | the command's caller; consumers see the commit |
| MESH cannot render a state | typed `MeshDiagnostics` for each mount that renders it | those mounts become inert; others may skip it |
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
| `@valancex/mesh-compiler` | `^0.8.0` | **build time only**: compiles MPRX sources to the `program` each view takes; nothing imports it at run time | devDependency |

```console
$ pnpm add @valancex/valance @valancex/nexus@^0.10.2 @valancex/mesh-runtime@^0.8.0 @valancex/port-web@^0.2.3 effect@^3.10.0
$ pnpm add -D @valancex/mesh-compiler@^0.8.0
```

Give the ranges explicitly, as above: an unversioned `pnpm add effect` resolves to a newer major than the peer range allows.

- **Entries:** `@valancex/valance` (`define`, `start`, `mount`, `hydrate`), `@valancex/valance/web` (`Web.target`, `Web.history`, and the PORT Web primitive helpers it re-exports), `@valancex/valance/web/server` (`renderToHtml`). `@valancex/valance/internal` is not part of the contract.
- The MESH, NEXUS and PORT packages keep their own versions; the ranges above are the set this release is built and tested against.

