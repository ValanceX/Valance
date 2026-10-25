# The platform: using a target of your own

Tier 3: the explicit escape hatch to the platform. Most pages never need it: `Web.run` starts the application, draws it and keeps the URL in step. You reach for this page when the page must do something to the screen that the vocabulary cannot say (move focus after a view change, hand a node to a charting library, wrap every draw in a view transition). It is outside the vocabulary, so what you add is yours to keep correct on every target; a desktop window does not run it.

(For styling, the other hatch is CSS: `escape.web.css` in a recipe, or your own CSS in the `vlx-app` layer. See [Themes](themes.md#tier-3-the-marked-escape-hatch).)

## What works today

`Web.run` builds its own target and takes no other. The public path underneath it takes any: `start` returns the handle, `mount` or `hydrate` takes a `TargetFactory` (a function from `report` to an object with `draw`, `update`, optionally `hydrate`, `patch`, `focus`, and `unmount`), and `Web.target({ container, primitives })` is just one such factory. So you wrap it:

```ts
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Scope } from "effect";

const scope = await Effect.runPromise(Scope.make());

await Effect.runPromise(
  Effect.gen(function* () {
    const handle = yield* Valance.start(app, { state });                  // state: what the server rendered from, if any

    // The factory VALANCE calls with `report`. Wrap what Web.target makes; change only what you must.
    const create = (report: Valance.Report) => {
      const port = Web.target({ container, primitives })(report);

      return {
        ...port,
        // A new view was drawn (a navigation), not updated in place: put focus on its first button.
        draw: (tree: Parameters<typeof port.draw>[0]) => {
          port.draw(tree);
          container.querySelector("button")?.focus();
        },
      };
    };

    yield* Valance.hydrate(handle, create);                               // or Valance.mount(handle, create)
    yield* Web.history(handle, { window, container, urlOf, stateOf, navigate: "go" });
  }).pipe(Scope.extend(scope)),
);
// await Effect.runPromise(Scope.close(scope, Exit.void));               // ends the screen, then the application
```

**This is Tier 3 and it is unprotected.** A wrapper that writes to DOM the PORT owns (the elements and attributes it draws) leaves the framework's guarantees: the next `update` may overwrite what you wrote, a hydration may not adopt it, and nothing checks it. Until the planned `native` hatch (a constrained one, not yet built), what is safe is: reading the DOM; calling `focus` and similar requests that leave no state behind; and writing only nodes the PORT does not own (an element you created and appended outside the tree it draws).

What the wrapper sees, and what it does not:

- `draw` is a program change (a different view); `update` is the same view with new data; `hydrate` takes over server markup and is not a `draw`, so focus stays where it was on load. A navigation, from a link or from Back, reaches `draw`.
- It receives `report` only through the factory. The state changes only through commands, as always: a wrapper that writes to the DOM the port owns can be overwritten on the next update.
- `Web.history` is a separate call, and binds the URL to the application whether or not you wrapped the target.

## What you now own

`Web.run` also retains the `Mounted` and reports its abnormal end and its event outcomes. A page that composes the calls above owns that: read `mounted.followed` for how the mount ended and `mounted.dispatched` for how event commands ended ([Contract §6](../V1_CONTRACT.md#6-mounts)).

## What does not exist

`Web.run` has no option for a target, and there is no hook that gives a callback to one element. A page that needs either composes the calls above. When the platform needs a first-class, constrained hatch, it will be designed on its own: see the direction in [North star refinements](../direction/north-star-refinements.md) (B6), which is a plan, not a release.

Evidence: [FINDINGS Stage 55](../FINDINGS.md) (a wrapper that restores focus after a view change, in real Chromium, over `start`, `hydrate` and `Web.history`, with `Web.run` untouched).
