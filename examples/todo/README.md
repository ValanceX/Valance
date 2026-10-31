# To-do: a desktop app written once

A to-do application (lists, items, editing, routes with guards) written against its own screen vocabulary, with no browser in it, and built into Linux and Windows apps. It exists to learn what a non-web target needs from Valance and from `@valancex/router`; the findings are in [`docs/explanation/application-model/native-target.md`](../../docs/explanation/application-model/native-target.md).

| Part | Is | Where |
|---|---|---|
| The application | state, commands, router, screens (`.mprx`), the vocabulary | `src/` (`app.ts`, `routes.ts`, `domain.ts`, `vocabulary.ts`, `screens/`) |
| The engine | the application behind stdin/stdout, speaking [`PROTOCOL.md`](./PROTOCOL.md) | `src/engine.ts`, `src/main.ts`, `src/sea-main.ts` (the protocol itself is `Native.run`, `@valancex/valance/native`) |
| The window | the **Desktop PORT** ([`valancex-port-desktop`](https://github.com/ValanceX/Port/tree/main/packages/port-desktop), its own package in the PORT repository): draws the render tree and reports events. This example only names the app and its engine | `native/` |
| Packaging | the engine as one executable (Node SEA), the renderer, archived | `scripts/package.mjs`, `scripts/dist.sh` |

```console
$ pnpm --filter @valancex/todo test              # the application, headless, through a text target
$ pnpm --filter @valancex/todo build             # compile the screens and the engine
$ (cd native && cargo test)                      # the renderer against the real engine, no window
$ scripts/dist.sh linux-x64                      # out/todo-linux-x64.tar.gz
$ scripts/dist.sh win32-x64                      # out/todo-win32-x64.zip (cross-built on Linux)
```

Development run: `TODO_ENGINE="node dist/main.js" cargo run` in `native/`. A packaged app keeps `todo-desktop` and `todo-engine` side by side.

**What has been run.** Everything above on Linux, including the packaged app under a virtual display. The Windows archive is cross-built (`x86_64-pc-windows-gnu`, Node's official `node.exe` with the engine injected, checked against its published SHA-256); **it has not been run on Windows**.

**An experiment beside it.** `src/reader-main.ts` runs a content site (a `vlx`-style project compiled against the native vocabulary, see [the content layer experiment](../../docs/explanation/application-model/native-vocabulary.md#five-the-content-layer-tested-run)) in the same window: `NATIVE_READER_OUT=/some/dir pnpm --filter @valancex/cli exec vitest run test/native-content.test.ts` writes the compiled site, then `TODO_ENGINE="node dist/reader-main.js /some/dir" cargo run` in `native/` shows it.
