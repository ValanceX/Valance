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
- Not yet: nested routes, a `beforeunload` guard, typed HTTP interceptors.
