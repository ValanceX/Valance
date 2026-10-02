// The async ownership tracer, in jsdom (the fast loop). The same scenarios run in Chromium (async.browser.test.ts).
//
//   MPRX (build time) → Valance.start (platform with one capability) → mount → a real click → NEXUS command
//   → loading committed and drawn → the capability completes from OUTSIDE the runtime → loaded committed and drawn
//
// The question: does the existing NEXUS command/resource/scope model, composed through Valance, keep work that
// outlives its event inside the application's lifetime? Nothing here asks for a Valance change.
import { describe, expect, it } from "vitest";

import { compileProgram } from "./compile.js";
import { closure, deferredCompletion, failure } from "./scenarios.js";
import type { Driver } from "./scenarios.js";
import { describeShutdown } from "./shutdown.spec.js";
import { load } from "../test/helpers.js";

const driver = async (): Promise<Driver> => {
  const page = load("");

  return {
    program: await compileProgram(),
    container: page.container,
    press: (index) => { page.click(page.container.querySelectorAll("button")[index]!); return Promise.resolve(); },
  };
};

describe("async ownership tracer (jsdom)", () => {
  it("T1 deferred completion: loading is observable before completion; completion later produces loaded", async () => {
    const result = await deferredCompletion(await driver());
    const [started, loading, loaded] = result.steps;

    expect(started?.dom).toEqual(["status: idle", "data: ", "ticks: 0"]);
    expect(started?.operations).toEqual(["draw"]);

    // The click has returned and the work has not completed: `loading` is committed AND drawn, the capability pending.
    expect(loading?.dom).toEqual(["status: loading", "data: ", "ticks: 0"]);
    expect(loading?.states).toEqual(["idle/0", "loading/0"]);
    expect(loading?.seen).toEqual(["started", "loading-committed"]);
    expect(loading?.pending).toBe(1);
    expect(loading?.operations).toEqual(["draw", "update"]);

    // Completion, later and from outside: loaded is committed and drawn, in place.
    expect(loaded?.dom).toEqual(["status: loaded", "data: payload", "ticks: 0"]);
    expect(loaded?.states).toEqual(["idle/0", "loading/0", "loaded/0"]);
    expect(loaded?.seen).toEqual(["started", "loading-committed", "fetched", "loaded-committed"]);
    expect(loaded?.operations).toEqual(["draw", "update", "update"]);
    expect(loaded?.root).toBe(started?.root);
  });

  it("T2 application remains usable: after completion another synchronous command succeeds", async () => {
    const result = await deferredCompletion(await driver());
    const loaded = result.steps[2];
    const tick = result.steps[3];

    expect(loaded?.status).toBe("Running");
    expect(tick?.dom).toEqual(["status: loaded", "data: payload", "ticks: 1"]);
    expect(tick?.states).toEqual(["idle/0", "loading/0", "loaded/0", "loaded/1"]);
    expect(tick?.operations).toEqual(["draw", "update", "update", "update"]);
    expect(tick?.status).toBe("Running");
    // One start, one platform lifetime across the whole flow.
    expect(tick?.counts).toMatchObject({ acquired: 1, released: 0, started: 1, cancelled: 0, completions: 1 });
    expect(result.dispatched).toEqual(["success", "success"]);
  });

  it("T3 failure observation: records what the existing machinery does with an unhandled capability failure", async () => {
    const result = await failure(await driver());
    const [loading, rejected, tick] = result.steps;

    console.info(JSON.stringify({ T3: { ...result, steps: result.steps.map(({ root: _root, ...step }) => step) } }, null, 1));

    expect(loading?.dom[0]).toBe("status: loading");
    // Observed (pinned, not endorsed): the dispatch fiber failed with the capability's typed failure, and nothing else moved.
    expect(result.dispatched[0]).toMatch(/^failure .*WorkFailed/u);
    expect(rejected?.seen).toEqual(["started", "loading-committed"]);
    expect(rejected?.states).toEqual(["idle/0", "loading/0"]);
    expect(rejected?.dom[0]).toBe("status: loading");
    expect(rejected?.status).toBe("Running");
    expect(tick?.dom[2]).toBe("ticks: 1");
    expect(tick?.status).toBe("Running");
  });

  for (const completion of ["resolve", "reject"] as const) {
    it(`T4 scope closure: closing the scope while work is pending; the work ${completion}d afterwards changes nothing`, async () => {
      const result = await closure(await driver(), completion);

      console.info(JSON.stringify({ [`T4 ${completion}`]: result }, null, 1));

      expect(result.before.loadingSeen).toEqual(["started", "loading-committed"]);
      expect(result.before.pendingWhileLoading).toBe(1);

      // At close, before any external completion: the application is stopped, its target unmounted,
      // its platform resource released, and the in-flight work interrupted (its canceller ran).
      expect(result.afterClose.status).toBe("Stopped");
      expect(result.afterClose.dom).toBe("");
      expect(result.afterClose.counts).toMatchObject({ acquired: 1, released: 1, started: 1, cancelled: 1, completions: 0 });
      expect(result.afterClose.seen).toEqual(["started", "loading-committed", "interrupted"]);
      expect(result.afterClose.state.status).toBe("loading");

      // Then the external work completes, and real time passes: no state commit, no PORT operation, no handler step.
      expect(result.afterCompletion.seen).toEqual(result.afterClose.seen);
      expect(result.afterCompletion.state).toEqual(result.afterClose.state);
      expect(result.afterCompletion.emissions).toBe(result.afterClose.emissions);
      expect(result.afterCompletion.operations).toEqual(result.afterClose.operations);
      expect(result.afterCompletion.dom).toBe("");
      expect(result.afterCompletion.counts).toMatchObject({ acquired: 1, released: 1, cancelled: 1, completions: 1 });
      expect(result.afterCompletion.status).toBe("Stopped");
      expect(result.unhandled).toEqual([]);
    });
  }
});

describeShutdown(driver);
