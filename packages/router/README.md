# @valancex/router

Routing for VALANCE applications: route definitions, typed path and query parameters, guards, programmatic navigation and a title per route. **Provisional** (0.x).

```ts
import { Schema } from "effect";
import { createRouter, redirect, route } from "@valancex/router";

const router = createRouter({
  routes: {
    home: route("/", { title: () => "Home" }),
    message: route("/inbox/:id", {
      params: { id: Schema.NumberFromString },
      title: ({ params }) => `Message ${params.id}`,
      canActivate: ({ context }) => (context().signedIn ? true : redirect("login")),
    }),
    login: route("/login", { title: () => "Sign in" }),
  },
  notFound: "notFound",
  context: () => ({ signedIn: false }),
});

await Web.run(app, { container, primitives, present: "mount", plugins: [router.plugin] });
```

- `router.commands(state)` gives `navigate`, `go` and `replace` commands for the application's state.
- Guards: `canMatch` (sync), `canActivate`, `canDeactivate`, and `beforeEach`; each answers a boolean, a `redirect(...)`, or a Promise/Effect of one. A refused Back/Forward is undone.
- Redirects name a route, never a URL; `router.safeNext(address)` only accepts an address on the application.
- `History`: the list of places visited and its moves (`History.start`, `push`, `replace`, `go`, `canGo`, `restore`), pure and serializable. A target with no history of its own (a window) keeps one in its state; `restore` drops entries that are no longer routes and starts again at the first when none is left. Guards are told why a move is made, including `"history"` for Back and Forward along such a list. `permit` runs a guard; one that throws or fails refuses. See `docs/explanation/application-model/navigation.md`.
- Not yet: nested routes, a `beforeunload` guard, a mobile adapter.
