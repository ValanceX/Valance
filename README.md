# VALANCE (`@valancex/valance`)

Build an interactive application whose **state lives in one place**, whose **screen is a function of that state**, and whose **only way to change anything is a command**. The application is data, so the same definition runs in a browser page, renders to HTML on a server, and runs headless in a test. **0.2.1** is the current release; the API is pre-1.0 and can still change.

```ts
const app = Valance.define({
  name: "counter",
  state: { schema: State, initial: { count: 0 } },                        // the one truth
  views: { counter: { program, scope: ({ count }) => ({ count }) } },      // what is shown, and from which values
  view: () => "counter",                                                   // which view is current: a function of state
  commands: (state) => ({ "counter/increment": Valance.entry(Valance.command(state)(Schema.Struct({}), (_input, current) => ({ count: current.count + 1 }))) }),
});

await Web.run(app, { container, primitives, present: "mount" });          // one page, one lifetime; host.stop() ends it
```

## Documentation

| | |
|---|---|
| **[Learn](docs/learn/README.md)** | What VALANCE is, your first application, how state, views and events fit together, common tasks. Start here. |
| **[Use](docs/use/README.md)** | The API reference by name, and [the contract](docs/V1_CONTRACT.md): exact behavior, lifecycle, failure, and what is not guaranteed. |
| **[Understand](docs/understand/README.md)** | How it is built and why: the architecture, the engineering constraints, the investigation record, and the packages underneath. |

Everything is indexed in [`docs/README.md`](docs/README.md). Release notes: [`docs/releases/`](docs/releases/).

## Repository

`packages/valance` is the package; `examples/tracer-web` is the tracer (jsdom tests and Chromium).

```console
$ pnpm install && pnpm build && pnpm typecheck && pnpm test
$ pnpm test:browser          # Chromium via Playwright
```
