// The navigation slice, through the application's one navigate entry ("app/navigate", the command a MESH intent and
// Web.history's popstate both reach) and the real stack: NEXUS state → MESH render-v1 → Valance → PORT Web (jsdom).
//
//   N1  one navigation intent resolves the view deterministically: another view draws, the same view (a tab) updates,
//       and the application's state outlives both. Nothing in the application names PORT or an operation.
//   N2  an event reported on a drawn render is dispatched against THAT render even if a navigation has already
//       committed, before the target has drawn the new view (FINDINGS Stage 2, "navigation vs. in-flight events").
import type { WebPort } from "@valancex/port-web";

import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { application, primitives } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { load, until } from "./helpers.js";

type Operation = "draw" | "update";

/** The Web target, recording each PORT operation Valance asks for. PORT's own behavior is untouched. */
const recording = (container: Element, operations: Array<Operation>): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => port.hydrate(tree),
    unmount: () => { port.unmount(); },
  };
};

const text = (page: ReturnType<typeof load>): string => page.container.textContent!;

describe("navigation: one intent, one resolution, the right continuity", () => {
  it("N1 view change draws, same-view change updates, application state survives both", async () => {
    const app = application(await compilePrograms());
    const page = load("");
    const operations: Array<Operation> = [];
    const seen: Array<{ text: string; root: Element | null }> = [];

    const final = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);

      yield* Valance.mount(handle, recording(page.container, operations));
      const go = (path: string, tab: string, arrived: (shown: string) => boolean) => Effect.gen(function* () {
        yield* handle.invoke("app/navigate", [{ value: { path, tab } }]);
        yield* Effect.promise(() => until(() => arrived(text(page))));
        seen.push({ text: text(page), root: page.container.firstElementChild });
      });

      yield* handle.invoke("counter/increment", []);
      yield* Effect.promise(() => until(() => text(page).startsWith("1 clicks")));
      seen.push({ text: text(page), root: page.container.firstElementChild });
      yield* go("/about", "overview", (shown) => shown.includes("tab: overview"));        // another view
      yield* go("/about", "details", (shown) => shown.includes("tab: details"));          // the same view
      yield* go("/", "details", (shown) => shown.startsWith("1 clicks"));              // back to the first view

      return yield* handle.state;
    })));

    expect(operations).toEqual(["draw", "update", "draw", "update", "draw"]);
    expect(seen.map((step) => step.root === seen[0]!.root)).toEqual([true, false, false, false]);   // only the first step shares the first root
    expect(seen[2]!.root).toBe(seen[1]!.root);                                                    // a tab change keeps the elements
    expect(final).toMatchObject({ count: 1, path: "/", tab: "details" });
  });

  it("N2 an event on the drawn render is dispatched against it, even after a navigation committed", async () => {
    const app = application(await compilePrograms());
    const page = load("");
    const operations: Array<Operation> = [];

    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);
      const mounted = yield* Valance.mount(handle, recording(page.container, operations));
      const [increment, goAbout] = Array.from(page.container.querySelectorAll("button"));

      // Both reports arrive on the counter's tree, in one turn: the navigation's commit cannot have been drawn between them.
      page.click(goAbout!);
      page.click(increment!);
      yield* mounted.settled;
      yield* Effect.promise(() => until(() => text(page).startsWith("About Tracer: 1 clicks")));

      return { state: yield* handle.state, dispatched: mounted.dispatched.map((exit) => exit._tag) };
    })));

    expect(result.state).toMatchObject({ path: "/about", count: 1 });
    expect(result.dispatched).toEqual(["Success", "Success"]);
    expect(operations).toEqual(["draw", "draw", "update"]);
  });
});
