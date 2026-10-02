// Stage 2: can ONE Valance application own several MESH programs and keep its state across view switches?
// One application, one NEXUS state, two programs. `path` is application state; `view` derives the program from it.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { application, primitives, stateFor } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { load, until } from "./helpers.js";

type Operation = "draw" | "hydrate" | "update";

/** The Web target, recording every PORT operation Valance asks for. PORT's own behavior is untouched. */
const recording = (container: Element, operations: Array<Operation>): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => { operations.push("hydrate"); return port.hydrate(tree); },
    unmount: () => { port.unmount(); },
  };
};

/** A platform whose one scoped resource counts its acquisition and release: the application's lifetime, observed. */
const countingPlatform = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(new Map()),
    Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
  );

  return { platform, counts };
};

const click = (page: ReturnType<typeof load>, index: number): void => { page.click(page.container.querySelectorAll("button")[index]!); };
const text = (page: ReturnType<typeof load>): string => page.container.querySelector("span")!.textContent!;

describe("one application, two MESH programs", () => {
  it("/ → /about → /: the application, its state and its resources live on; PORT draws afresh at each program change", async () => {
    const app = application(await compilePrograms());
    const page = load("");
    const operations: Array<Operation> = [];
    const { platform, counts } = countingPlatform();
    const seen: Array<{ step: string; text: string; section: Element | null; status: string; acquired: number; released: number }> = [];

    const final = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app, { platform });
      const mounted = yield* Valance.mount(running, recording(page.container, operations));
      const observe = (step: string) => Effect.gen(function* () {
        const status = yield* Nexus.Application.status(runningOf(running).nexus);
        seen.push({ step, text: text(page), section: page.container.firstElementChild, status: status._tag, ...counts });
      });
      const press = (index: number, expected: string) => Effect.gen(function* () {
        click(page, index);
        yield* mounted.settled;
        yield* Effect.promise(() => until(() => text(page).startsWith(expected)));
      });

      yield* observe("start");
      yield* press(0, "1 clicks");
      yield* press(0, "2 clicks");
      yield* observe("counter, 2 clicks");
      yield* press(1, "About");                      // → /about
      yield* observe("about");
      yield* press(0, "2 clicks");                   // Back → /
      yield* observe("counter again");
      yield* press(0, "3 clicks");
      yield* observe("counter, 3 clicks");

      return yield* running.state;
    })));

    // Application lifetime: one start, one platform acquisition, still Running at every step, released only when the scope closed.
    expect(seen.map((step) => [step.status, step.acquired, step.released])).toEqual(Array(5).fill(["Running", 1, 0]));
    expect(counts).toEqual({ acquired: 1, released: 1 });
    // State lifetime: both views are rendered from the one state; the count survived both switches.
    expect(seen.map((step) => step.text)).toEqual(["0 clicks, last at 0", expect.stringMatching(/^2 clicks/), "About Tracer: 2 clicks", expect.stringMatching(/^2 clicks/), expect.stringMatching(/^3 clicks/)]);
    expect(final.count).toBe(3);
    expect(final.path).toBe("/");
    // PORT continuity: same program → update (same elements); another program → draw afresh (new elements).
    expect(operations).toEqual(["draw", "update", "update", "draw", "draw", "update"]);
    const [start, two, about, again, three] = seen.map((step) => step.section);
    expect(two).toBe(start);
    expect(about).not.toBe(two);
    expect(again).not.toBe(about);
    expect(three).toBe(again);
  });

  it("SSR: the request path is the initial application state, and selects the program that is rendered", async () => {
    const app = application(await compilePrograms());
    const home = await Effect.runPromise(renderToHtml(app, { primitives, state: stateFor("/") }));
    const about = await Effect.runPromise(renderToHtml(app, { primitives, state: { ...stateFor("/about"), count: 3 } }));

    expect(home.html).toContain("0 clicks, last at 0");
    expect(about.html).toBe('<section aria-label="Tracer"><span>About Tracer: 3 clicks</span><span>tab: overview</span><button>Back</button></section>');
  });

  for (const [path, count, leaving, arrives] of [["/", 0, 1, "About Tracer: 0 clicks"], ["/about", 3, 0, "3 clicks"]] as const) {
    it(`hydration: the server's ${path} adopts, and the first program change draws afresh`, async () => {
      const app = application(await compilePrograms());
      const state = { ...stateFor(path), count };
      const served = await Effect.runPromise(renderToHtml(app, { primitives, state }));
      const page = load(served.html);
      const server = page.nodes();
      const operations: Array<Operation> = [];

      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const running = yield* Valance.start(app, { state: served.state });
        const mounted = yield* Valance.hydrate(running, recording(page.container, operations));

        expect(mounted.hydration).toEqual({ adopted: true });
        expect(server.every((node) => page.container.contains(node))).toBe(true);

        click(page, leaving);                                  // navigate to the other program
        yield* mounted.settled;
        yield* Effect.promise(() => until(() => text(page).startsWith(arrives)));

        // The other program is a fresh draw: none of the adopted server nodes remain.
        expect(server.filter((node) => page.container.contains(node))).toEqual([]);
      })));

      expect(operations).toEqual(["hydrate", "draw"]);
    });
  }
});
