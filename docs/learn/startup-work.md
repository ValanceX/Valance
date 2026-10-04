# Startup work

Some work should happen as soon as the application exists: load the first data, open something, read what the environment knows. VALANCE lets the application say so.

> **`start` is an optional command name. VALANCE runs that command once, when the application starts.**

```ts
const app = Valance.define({
  name: "profile",
  // … state, views, view …
  commands: (state) => ({
    "app/startup": Valance.entry(startup),        // an ordinary entry in the command table
    "profile/reload": Valance.entry(reload),
  }),
  start: "app/startup",                           // run it once, at start
});
```

The complete application is on [Async work](async-work.md#a-profile-that-loads). Nothing about `app/startup` is special: it is a command, in the same table, and it can also be run by `invoke("app/startup", [])` (a retry button, a test).

## What it means

- **It is a command.** It uses the same table, the same validation and the same way of changing state as any command. There is no second way for the application to do things.
- **It takes no arguments.** There is no caller to supply any. (If your command needs input, give its entry a constant: `Valance.entry(load, () => ({ id: "me" }))`.)
- **The application owns it.** The host that started the application does not wait for it and is not responsible for it. Closing the application interrupts it and waits for it to stop, like any other command ([Async work](async-work.md#cancelling)).
- **It starts with the application.** `start` has returned the application only after every check has passed, and the startup command is the last thing it does. If starting fails, nothing runs.
- **It may finish before anything is on screen.** A mount made afterwards simply draws the state it finds.

## Doing it only when needed

State is available to the startup command, so ordinary logic decides whether to work:

```ts
const startup = Nexus.Command.define("profile.startup", Schema.Struct({}), () =>
  Effect.flatMap(state.get, (current) => current.phase === "loading" ? fetchProfile("me") : Effect.void));
```

If you start the application with a state that is already `ready` (for example the one a server rendered and handed to the browser, see [Mounting and hydration](mounting-and-hydration.md#hydrating)), this does nothing. There is no "skip startup" setting: the state is the guard.

## Failure

Startup work has **no caller waiting for it**. If it fails and nothing catches the failure, nobody hears about it: state is unchanged, the application keeps running, and the screen does not change.

So if a failure should be visible, make it state, exactly as for any async work: catch it in the command and commit it (`phase: "failed"` in the example). VALANCE has no startup error channel; the state is the channel.

What *can* fail at start itself is reported to whoever started the application, before anything runs:

| `start` fails with | When |
|---|---|
| `UnmappedCommand` | the `start` name is not a key of the command table |
| `ConformanceViolation`, `MeshDiagnostics` | a view's event has no command, or a view description is rejected |
| `InitialValueInvalid`, `ServiceGraphFailed` | the starting state is invalid, or the platform cannot start |

## Server rendering

`renderToHtml` starts the application too, so startup work **does begin** there. See [Server rendering](mounting-and-hydration.md#server-rendering-and-startup-work) for exactly what happens, and what to do about it.

## Exact rules

[Contract §18](../V1_CONTRACT.md#18-asynchronous-work-and-start-time-work) and [§2](../V1_CONTRACT.md#2-application). *Added after 0.3.0.*

Next: [Mounting and hydration](mounting-and-hydration.md).
