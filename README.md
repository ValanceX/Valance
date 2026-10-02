# VALANCE (`@valancex/valance`)

The application-composition boundary over [NEXUS](https://github.com/ValanceX/Nexus) (behavior), [MESH](https://github.com/ValanceX/Mesh) (template semantics) and [PORT](https://github.com/ValanceX/Port) (target realization). **0.0.1, a guarded tracer bullet: the API is a hypothesis.**

```ts
const app = Valance.define({ name, state: { schema, initial }, views: { counter: { program, scope }, about: { program, scope } }, view: (state) => /* program for this state */, commands });

// server
const { html, state } = await Effect.runPromise(renderToHtml(app, { primitives }));

// client
Effect.scoped(Effect.gen(function* () {
  const running = yield* Valance.start(app, { platform, state });
  const mounted = yield* Valance.hydrate(running, Web.target({ container, primitives }));
  yield* Web.history(running, { window, path: (state) => state.path, navigate: "app/navigate" });   // URL ↔ path, optional
}));                                   // closing the scope ends everything
```

- `docs/CONSTRAINTS.md`: the MUST / MUST NOT list the tracer was held to.
- `docs/FINDINGS.md`: what the tracer proved, what it invalidated, what is unresolved.
- `packages/valance`: the package. `examples/tracer-web`: the tracer (jsdom tests + Chromium).

```console
$ pnpm install && pnpm build && pnpm typecheck && pnpm test
$ pnpm test:browser          # Chromium via Playwright
```
