# VALANCE (`@valancex/valance`)

The application-composition boundary over [NEXUS](https://github.com/ValanceX/Nexus) (behavior), [MESH](https://github.com/ValanceX/Mesh) (template semantics) and [PORT](https://github.com/ValanceX/Port) (target realization). **0.1.0: the first validated baseline** (the architecture is summarised in the "Architectural checkpoint" and "Canonical lifecycle architecture" sections of [`docs/FINDINGS.md`](docs/FINDINGS.md)). Pre-1.0: the API can still change, and `./internal` is unstable by design.

```ts
const app = Valance.define({ name, state: { schema, initial }, views: { counter: { program, scope }, about: { program, scope } }, view: (state) => /* program for this state */, commands });

// server
const { html, state } = await Effect.runPromise(renderToHtml(app, { primitives }));

// client
Effect.scoped(Effect.gen(function* () {
  const application = yield* Valance.start(app, { platform, state });   // the application's handle: { state, invoke }
  const mounted = yield* Valance.hydrate(application, Web.target({ container, primitives }));
  yield* Web.history(application, { window, urlOf, stateOf, navigate: "app/navigate" });   // URL ↔ state (the application's functions), optional

  yield* application.invoke("app/changeItems", [{ value: items }]);      // any other producer: a host page, a headless caller
  const current = yield* application.state;                              // one read of the committed state
}));                                   // closing the scope ends everything
```

Here one Scope holds the application and its mount, so closing it ends both (mount first, then the application). `start` and `mount` each take *a* Scope from the caller and relate them in no other way: a mount placed in its own Scope ends with that Scope, and if the application ends first it stays drawn but no longer updates (events and commands reaching the ended application are refused). The whole application / mount / command lifecycle is stated once in `docs/FINDINGS.md`, "Canonical lifecycle architecture".

- `docs/CONSTRAINTS.md`: the MUST / MUST NOT list the tracer was held to.
- `docs/FINDINGS.md`: what the tracer proved, what it invalidated, what is unresolved.
- `packages/valance`: the package. `examples/tracer-web`: the tracer (jsdom tests + Chromium).

```console
$ pnpm install && pnpm build && pnpm typecheck && pnpm test
$ pnpm test:browser          # Chromium via Playwright
```
