# Async work

Real applications wait: for a server, a file, a timer. In VALANCE there is nothing new to learn for that.

> **A command can do asynchronous work. Once admitted, that work belongs to the application. Closing the application cancels it.**

That one sentence is the whole model. The rest of this page is what it looks like, and what follows from it.

## A profile that loads

The screen has a line of text and a **Reload** button:

```
<page>
  <text>{status}</text>
  <button on.click={reload()}>Reload</button>
</page>
```

The state says where the work is (`loading`, `ready` or `failed`) and what it produced. The commands do the work:

```ts
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

const State = Schema.Struct({
  phase: Schema.Literal("loading", "ready", "failed"),
  name: Schema.String,
});
type State = typeof State.Type;

const status = ({ phase, name }: State) =>
  phase === "loading" ? "Loading…" : phase === "ready" ? `Hello, ${name}` : `Could not load: ${name}`;

const app = (fetchName: (id: string, signal: AbortSignal) => Promise<string>) => Valance.define({
  name: "profile",
  state: { schema: State, initial: { phase: "loading", name: "" } },
  views: { profile: { program, scope: (state: State) => ({ status: status(state) }) } },
  view: () => "profile",
  commands: (state) => {
    let latest = 0;                                    // the newest request; older results are ignored
    const set = (next: (current: State) => State) => state.update((current) => Effect.succeed(next(current)));

    // Waiting, failing and cancelling are all ordinary parts of one effect.
    const fetchProfile = (id: string) => Effect.gen(function* () {
      const mine = ++latest;
      yield* set((current) => ({ ...current, phase: "loading" }));
      const result = yield* Effect.tryPromise({ try: (signal) => fetchName(id, signal), catch: String }).pipe(Effect.either);

      if (mine !== latest) return;                     // a newer request started meanwhile: drop this result
      yield* set(() => result._tag === "Right" ? { phase: "ready", name: result.right } : { phase: "failed", name: result.left });
    });

    const reload = Nexus.Command.define("profile.reload", Schema.Struct({}), () => fetchProfile("me"));
    const startup = Nexus.Command.define("profile.startup", Schema.Struct({}), () =>
      Effect.flatMap(state.get, (current) => current.phase === "loading" ? fetchProfile("me") : Effect.void));

    return {
      "profile/reload": Valance.entry(reload),         // the Reload button
      "app/startup": Valance.entry(startup),           // run once, when the application starts
    };
  },
  start: "app/startup",
});
```

Read it as three ideas:

1. **Waiting is part of a command.** `fetchProfile` sets `loading`, waits for `fetchName`, then commits the result. Nothing is committed while it waits, and the screen keeps showing `loading`.
2. **Loading, success and failure are ordinary state.** `phase` is a field like any other; `status` turns it into text for the view. There is no special "loading" mechanism, and no error object to catch somewhere else. A failure that the screen should show is a state the command commits.
3. **Two things start the same work.** The **Reload** button runs `profile/reload`. `start: "app/startup"` runs `app/startup` once when the application starts ([Startup work](startup-work.md)). Both are commands in the one table.

## Cancelling

You do not write cancellation. When the application is closed (`host.stop()` with `Web.run`, or closing its Scope when you start it yourself), every command that is still waiting is interrupted, and VALANCE waits for each to finish before it releases anything the application owns. After that nothing the work was doing can change the application: a result that arrives late is ignored, because the work is already over.

In the example, `Effect.tryPromise` hands your function an `AbortSignal` that is aborted when the command is interrupted, so a real `fetch` is cancelled too. Work that does not look at the signal still stops being waited for; it just may keep running in the background until it finishes.

Closing a **mount** (taking the screen away) does **not** cancel work. A command belongs to the application, not to the screen that started it.

## When an answer arrives late

Nothing orders results for you. If **Reload** is pressed twice and the first answer arrives last, the first answer would overwrite the second. The example keeps a counter, `latest`, and drops any result that is not from the newest request:

```ts
const mine = ++latest;
// … wait …
if (mine !== latest) return;      // a newer request started meanwhile: drop this result
```

That is ordinary application logic, and it is deliberately yours: whether a late answer is stale depends on your application. (A request counter in the command's closure is fine; it is created for each application that starts. You can also keep it in state.)

## What the person sees while it works

Because each commit is a state, the screen follows: `Loading…`, then `Hello, Ada`, or `Could not load: offline`. If several commits land faster than the screen can draw, it draws the latest ([Mounting and hydration](mounting-and-hydration.md)); state is never wrong, only sometimes shown one step late.

## Failure, and who sees it

| Work started by | Where its outcome is visible |
|---|---|
| a caller of `invoke` | the caller: `invoke` reports success, a failure, or interruption |
| an event on a mount (a click) | the mount's `dispatched` record, and anything the command committed |
| the application itself (`start`) | **only** what the command committed: there is no caller waiting |

So: if a failure should be visible, commit it. The example turns a failed fetch into `phase: "failed"`, which every route above shows. Do not rely on a failure being reported to someone; a command that is not waited for is not heard from. (More in [Startup work](startup-work.md#failure).)

## Using a service the platform provides

Real work usually goes through something the environment supplies: an API client, a clock, storage. Declare what the command needs, then supply it where the application is started. That keeps the application free of any one environment, so a test can supply a fake.

```ts
interface QuoteService {
  readonly fetch: (topic: string) => Effect.Effect<string, { readonly _tag: "Offline" }>;
}
const QuoteService = Nexus.Capability.define<QuoteService>("example/quotes");   // the name the platform registers it under

// in a command:
const quotes = yield* Nexus.Capability.require(QuoteService);
const text = yield* quotes.fetch("general");

// where the application is started:
const platform: Nexus.Application.Platform = Nexus.Capability.EnvironmentLive(new Map([
  [QuoteService.id, { _tag: "Available" as const, implementation: realService }],
]));
Valance.start(app, { platform });   // or Web.run(app, { …, platform })
```

If the platform does not supply it, the command fails with `CapabilityUnavailableError`. For work the application starts itself, that failure is silent ([Startup work](startup-work.md#failure)).

## Long-lived resources

A command's work ends with the command. Sometimes you need something that **outlives** the command and ends with the *application*: a connection, a socket, a cache. That is a *resource*.

The platform you give to `start` owns the application's lifetime. It can hand commands one narrow ability: *acquire into the application's lifetime*. The command then gets the resource, the command finishes, and the resource stays open until the application ends, when it is released exactly once (after all commands have stopped).

```ts
import * as Nexus from "@valancex/nexus";
import { Effect, Exit, Layer, Scope } from "effect";

// What a command may do with the application's lifetime: acquire into it. Nothing more.
interface Owner {
  readonly own: <A, E, R>(acquire: Effect.Effect<A, E, R | Scope.Scope>) => Effect.Effect<A, E, Exclude<R, Scope.Scope>>;
}
const Owner = Nexus.Capability.define<Owner>("my-app/owner");

// The platform builds it once; its Scope closes when the application ends, after the commands have finished.
const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.gen(function* () {
  const scope = yield* Scope.make();

  yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

  const owner: Owner = { own: (acquire) => Scope.extend(acquire, scope) as never };

  return { resolutions: new Map([[Owner.id, { _tag: "Available" as const, implementation: owner }]]) };
}));

// In a command: acquire a connection that outlives the command and is released when the application ends.
const connect = Effect.gen(function* () {
  const owner = yield* Nexus.Capability.require(Owner);

  return yield* owner.own(Effect.acquireRelease(openConnection(), (connection) => connection.close()));
});
```

Notes:

- This is a pattern built from what is already there, not a new VALANCE feature. Applications that need a resource at start can simply declare it in the platform instead.
- The resource is not tied to the command, so a command that finishes does not release it. If the command is cancelled *while acquiring*, nothing is held.
- Acquisition is not interruptible unless you say so: a very slow `acquire` keeps the application from closing until it finishes. If it can take long, make the waiting part interruptible (`Effect.interruptible`).

## Where the imports come from

Every example here is the ordinary form of a command that does more than compute the next state. Compared with `Valance.command` (a pure transition, [Your first application](first-application.md)), a command that waits is written as a general command, and that needs two imports you have not met:

```ts
import * as Nexus from "@valancex/nexus";   // Nexus.Command.define: a command that can wait, fail or use a resource
import { Effect, Schema } from "effect";     // Effect describes the waiting; Schema describes the input
```

You do not need to know more about either to read the example: `Effect.gen` with `yield*` is "do this, wait, then do that", and `Nexus.Command.define(name, input, body)` makes a command of it. (`name` identifies the command in its own error messages; it is separate from the key you give `Valance.entry` in the table, which is what events and `invoke` use. `state.update` takes a function that returns an `Effect`, which is why the example wraps results in `Effect.succeed`.) They are the engines VALANCE is built on; the pages under [Understand](../understand/README.md) explain them if you want to. `Valance.entry` binds any such command to a name exactly as it binds a pure one.

## Exact rules

[Contract §18](../V1_CONTRACT.md#18-asynchronous-work-and-start-time-work) for async work, [§3](../V1_CONTRACT.md#3-state-and-commands) for commits and concurrency, [§9](../V1_CONTRACT.md#9-scopes-and-shutdown) for shutdown, [§4](../V1_CONTRACT.md#4-capabilities-and-resources) for resources.

Next: [Startup work](startup-work.md).
