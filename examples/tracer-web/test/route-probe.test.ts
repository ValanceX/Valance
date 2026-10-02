// PROBE, not a contract. MPRX has no conditionals, so "which view is shown" can only be "which MESH program".
// What does today's API do when the program changes on one container? (Routing is deliberately not built.)
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Schema } from "effect";
import { expect, it } from "vitest";

import { application, primitives } from "../src/app.js";
import { compileProgram } from "../src/compile.js";
import { load, until } from "./helpers.js";

it("a view switch is a program switch: today it is two Valance applications, and nothing crosses", async () => {
  const counter = application(await compileProgram("counter"));
  const about = Valance.define({
    name: "about", program: await compileProgram("about"),
    state: { schema: Schema.Struct({ title: Schema.String }), initial: { title: "Tracer" } },
    scope: ({ title }) => ({ title }), commands: () => ({}),
  });
  const page = load("");

  const seen = await Effect.runPromise(Effect.gen(function* () {
    const seen: Array<string> = [];
    // View 1. Its state (a click) lives and dies with its scope.
    yield* Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(counter);
      const mounted = yield* Valance.mount(running, Web.target({ container: page.container, primitives }));
      page.click(page.container.querySelector("button")!);
      yield* mounted.settled;
      yield* Effect.promise(() => until(() => page.container.textContent!.startsWith("1 clicks")));
      seen.push(page.container.textContent!);
    }));
    // The switch: the first scope's end unmounted view 1; view 2 is a different program, so PORT draws it afresh.
    yield* Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(about);
      yield* Valance.mount(running, Web.target({ container: page.container, primitives }));
      seen.push(page.container.textContent!);
    }));
    // Back to view 1: a new application, a new state. The click count did not survive the route change.
    yield* Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(counter);
      yield* Valance.mount(running, Web.target({ container: page.container, primitives }));
      seen.push(page.container.textContent!);
    }));

    return seen;
  }));

  expect(seen[0]).toMatch(/^1 clicks, last at \d+Click$/);
  expect(seen.slice(1)).toEqual(["About Tracer", "0 clicks, last at 0Click"]);
});
