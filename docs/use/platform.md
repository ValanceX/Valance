# The platform: native callbacks and a target of your own

Tier 3: the explicit escape hatch to the platform. Most pages never need it: `Web.run` starts the application, draws it and keeps the URL in step. You reach for this page when the page must do something to the screen that the vocabulary cannot say (hand a node to a charting library, observe an element's size, move focus after a view change, wrap every draw in a view transition). It is outside the vocabulary, so what you add is yours to keep correct on every target; a desktop window does not run it.

(For styling, the other hatch is CSS: `escape.web.css` in a recipe, or your own CSS in the `vlx-app` layer. See [Themes](themes.md#tier-3-the-marked-escape-hatch).)

There are two ways down, and they are not equally safe:

| Option of `Web.run` | What it is | Protected |
|---|---|---|
| `native` | PORT Web's native hatch: a callback per component, given each drawn element of that primitive | Yes: constrained by the PORT (below) |
| `target` | A wrapper of the target `Web.run` builds | No: what it writes to DOM the PORT owns is not kept true |

Both are **Provisional** (Unreleased, for 0.16.0), Web only, and not in contract v1 ([stability](../stability.md)). `native` needs a PORT Web with the hatch (PORT's next release); an older one ignores it.

## `native`: the constrained hatch

```ts
import type { Native } from "@valancex/port-web/native";
import * as Web from "@valancex/valance/web";

// One entry per primitive that needs the platform, by the name the view uses. Mark the primitive `opaque: true` in the table to give the callback its content.
const native: Native = {
  chart: (element, { key }) => {
    const chart = drawChart(element);                                     // your library, on the element the PORT drew

    return () => chart.destroy();                                         // runs when the element ends
  },
};

const host = await Web.run(app, { container, primitives, present: "hydrate", native });
```

`Web.run` hands `native` to the PORT unread. The PORT decides everything else, as its README states ([Leaving the portable layer](https://github.com/ValanceX/Port/blob/main/packages/port-web/README.md#leaving-the-portable-layer)):

- **When it runs.** The callback runs once its element is in the document: after a draw, an insert, and once hydration adopts the server DOM. Its cleanup runs when the element is removed or replaced, on a draw and on `host.stop()`, after focus has been handed off. The server ignores it: the page is the same with or without it.
- **It cannot change state.** The callback gets the element and `{ key }`, and nothing that reports or dispatches: state changes only through commands, as always. The PORT writes back every slot it owns on the element on its next write.
- **Only `opaque` content is yours.** A primitive with `opaque: true` has no children in the tree, and the PORT never touches what is inside it. Without `opaque`, the element's children are the tree's: leave them alone. A layer can't be opaque.
- **It is checked.** A callback for a component the table does not have, or one that is not a function, is refused (`invalid-primitives`): `Web.run` rejects with that error.

## `target`: a wrapper, unprotected

`target` takes the factory `Web.run` built (`Web.target` with `container`, `primitives` and `native`) and returns the one it mounts or hydrates with. `Web.run` keeps its duties: the `Mounted` (`host.mounted.dispatched`, `followed`), the URL policy and `stop`.

```ts
const host = await Web.run(app, {
  container,
  primitives,
  present: "mount",
  // A new view was drawn (a navigation), not updated in place: put focus on its first button.
  target: (base) => (report) => {
    const port = base(report);

    return {
      ...port,
      draw: (tree) => {
        port.draw(tree);
        container.querySelector("button")?.focus();
      },
    };
  },
});
```

**This is Tier 3 and it is unprotected.** A wrapper that writes to DOM the PORT owns (the elements and attributes it draws) leaves the framework's guarantees: the next `update` may overwrite what you wrote, a hydration may not adopt it, and nothing checks it. What is safe is: reading the DOM; calling `focus` and similar requests that leave no state behind; and writing only nodes the PORT does not own (an element you created and appended outside the tree it draws). For work on one element, use `native`.

What the wrapper sees, and what it does not:

- `draw` is a program change (a different view); `update` is the same view with new data; `hydrate` takes over server markup and is not a `draw`, so focus stays where it was on load. A navigation, from a link or from Back, reaches `draw`.
- It receives `report` only through the factory, and should pass it to `base` unchanged. The state changes only through commands, as always.
- For `present: "hydrate"`, keep `base`'s `hydrate` (spreading `port` does).

## Without `Web.run`

The public path underneath `Web.run` takes any target: `start` returns the handle, `mount` or `hydrate` takes a `TargetFactory` (a function from `report` to an object with `draw`, `update`, optionally `hydrate`, `patch`, `focus`, and `unmount`), and `Web.target({ container, primitives, native })` is one such factory. A page that needs several mounts, independent lifetimes or headless use composes them:

```ts
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Scope } from "effect";

const scope = await Effect.runPromise(Scope.make());

await Effect.runPromise(
  Effect.gen(function* () {
    const handle = yield* Valance.start(app, { state });                  // state: what the server rendered from, if any

    yield* Valance.hydrate(handle, Web.target({ container, primitives, native }));   // or Valance.mount, or a wrapper as above
    yield* Web.history(handle, { window, container, urlOf, stateOf, navigate: "go" });
  }).pipe(Scope.extend(scope)),
);
// await Effect.runPromise(Scope.close(scope, Exit.void));               // ends the screen, then the application
```

`Web.run` also retains the `Mounted` and reports its abnormal end and its event outcomes. A page that composes the calls itself owns that: read `mounted.followed` for how the mount ended and `mounted.dispatched` for how event commands ended ([Contract §6](../V1_CONTRACT.md#6-mounts)). `Web.history` is a separate call, and binds the URL to the application whether or not you wrapped the target.

Evidence: `examples/todo/test/native-hatch.test.ts` (`native` and `target` through `Web.run`, over jsdom); PORT Web's own tests of the hatch (re-assertion, cleanup order, `opaque`); [FINDINGS Stage 55](../FINDINGS.md) (a wrapper that restores focus after a view change, in real Chromium, over `start`, `hydrate` and `Web.history`).
