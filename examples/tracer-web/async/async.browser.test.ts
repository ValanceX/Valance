// The async ownership tracer in real Chromium: the same scenarios as async.test.ts, with real clicks through
// Chromium's input pipeline and the browser's own timers and promise scheduling. Nothing is asserted here that the
// jsdom run does not assert: the point is that nothing differs.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { closure, deferredCompletion, failure } from "./scenarios.js";
import type { Driver } from "./scenarios.js";
import { describeShutdown } from "./shutdown.spec.js";

beforeAll(async () => { await init(wasmUrl); });

const driver = (): Driver => {
  const container = document.createElement("main");

  document.body.append(container);

  return {
    program: inject("asyncProgram"),
    container,
    press: (index) => userEvent.click(container.querySelectorAll("button")[index]!),
  };
};

describe("async ownership tracer (Chromium)", () => {
  it("T1 deferred completion: loading is observable before completion; completion later produces loaded", async () => {
    const result = await deferredCompletion(driver());
    const [started, loading, loaded] = result.steps;

    expect(started?.dom).toEqual(["status: idle", "data: ", "ticks: 0"]);
    expect(started?.operations).toEqual(["draw"]);
    expect(loading?.dom).toEqual(["status: loading", "data: ", "ticks: 0"]);
    expect(loading?.states).toEqual(["idle/0", "loading/0"]);
    expect(loading?.seen).toEqual(["started", "loading-committed"]);
    expect(loading?.pending).toBe(1);
    expect(loading?.operations).toEqual(["draw", "update"]);
    expect(loaded?.dom).toEqual(["status: loaded", "data: payload", "ticks: 0"]);
    expect(loaded?.states).toEqual(["idle/0", "loading/0", "loaded/0"]);
    expect(loaded?.seen).toEqual(["started", "loading-committed", "fetched", "loaded-committed"]);
    expect(loaded?.operations).toEqual(["draw", "update", "update"]);
    expect(loaded?.root).toBe(started?.root);
  });

  it("T2 application remains usable: after completion another synchronous command succeeds", async () => {
    const result = await deferredCompletion(driver());
    const loaded = result.steps[2];
    const tick = result.steps[3];

    expect(loaded?.status).toBe("Running");
    expect(tick?.dom).toEqual(["status: loaded", "data: payload", "ticks: 1"]);
    expect(tick?.states).toEqual(["idle/0", "loading/0", "loaded/0", "loaded/1"]);
    expect(tick?.operations).toEqual(["draw", "update", "update", "update"]);
    expect(tick?.status).toBe("Running");
    expect(tick?.counts).toMatchObject({ acquired: 1, released: 0, started: 1, cancelled: 0, completions: 1 });
    expect(result.dispatched).toEqual(["success", "success"]);
  });

  it("T3 failure observation: records what the existing machinery does with an unhandled capability failure", async () => {
    const result = await failure(driver());
    const [loading, rejected, tick] = result.steps;

    console.info(JSON.stringify({ T3: { dispatched: result.dispatched, logged: result.logged, unhandled: result.unhandled, steps: result.steps.map(({ root: _root, ...step }) => step) } }));

    expect(loading?.dom[0]).toBe("status: loading");
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
      const result = await closure(driver(), completion);

      console.info(JSON.stringify({ [`T4 ${completion}`]: result }));

      expect(result.before.loadingSeen).toEqual(["started", "loading-committed"]);
      expect(result.before.pendingWhileLoading).toBe(1);
      expect(result.afterClose.status).toBe("Stopped");
      expect(result.afterClose.dom).toBe("");
      expect(result.afterClose.counts).toMatchObject({ acquired: 1, released: 1, started: 1, cancelled: 1, completions: 0 });
      expect(result.afterClose.seen).toEqual(["started", "loading-committed", "interrupted"]);
      expect(result.afterClose.state.status).toBe("loading");
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
