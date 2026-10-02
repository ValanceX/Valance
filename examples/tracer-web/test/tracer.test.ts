// The tracer, end to end, through @valancex/valance only:
//   server: application → start → MESH render-v1 → PORT Web → HTML
//   client: HTML → hydrate (PORT's own verification and adoption) → click → MESH intent
//           → NEXUS command → state → new render → PORT update, in place
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { Counter, application, initial, primitives } from "../src/app.js";
import { compileProgram } from "../src/compile.js";
import { load, until } from "./helpers.js";

const text = (root: Element): string => root.querySelector("span")!.textContent!;

describe("tracer: SSR → hydrate → event → state → render → update", () => {
  it("runs the whole lifecycle the substrates support", async () => {
    const app = application(await compileProgram());
    const served = await Effect.runPromise(renderToHtml(app, { primitives }));

    expect(served.html).toBe('<section aria-label="Tracer"><span>0 clicks, last at 0</span><button>Click</button></section>');

    const page = load(served.html);
    const server = page.nodes();

    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      // The client starts the same application with the state the server embedded.
      const running = yield* Valance.start(app, { state: served.state });
      const mounted = yield* Valance.hydrate(running, Web.target({ container: page.container, primitives }));
      const adopted = server.every((node) => page.container.contains(node));

      page.click(page.container.querySelector("button")!);
      yield* mounted.settled;
      yield* Effect.promise(() => until(() => text(page.container).startsWith("1 clicks")));

      // Updated in place: the server's own elements are still the page's elements.
      const kept = server.filter((node) => node.nodeType === 1).every((node) => page.nodes().includes(node));

      return { hydration: mounted.hydration, adopted, kept, dispatched: mounted.dispatched, state: yield* running.state };
    })));

    expect(result.hydration).toEqual({ adopted: true });
    expect(result.adopted).toBe(true);
    expect(result.kept).toBe(true);
    expect(result.dispatched.map((exit) => Exit.isSuccess(exit) ? exit.value.intent : "failed")).toEqual([{ command: { component: "counter", name: "increment" }, arguments: [] }]);
    expect(result.state.count).toBe(1);
  });

  it("on a hydration mismatch PORT draws afresh, and the application carries on", async () => {
    const app = application(await compileProgram());
    const served = await Effect.runPromise(renderToHtml(app, { primitives }));
    const page = load(served.html);
    const server = page.nodes();

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      // The client's state differs from the server's: PORT reports it, it does not guess.
      const running = yield* Valance.start(app, { state: { ...initial, title: "Other" } satisfies Counter });
      const mounted = yield* Valance.hydrate(running, Web.target({ container: page.container, primitives }));

      expect(mounted.hydration.adopted).toBe(false);
      expect(server.filter((node) => page.container.contains(node))).toEqual([]);

      page.click(page.container.querySelector("button")!);
      yield* mounted.settled;
      yield* Effect.promise(() => until(() => text(page.container).startsWith("1 clicks")));
    })));
  });
});
