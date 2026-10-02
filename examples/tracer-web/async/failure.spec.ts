// The failure tracer: can an application author observe and react to an unhandled command failure through supported
// composition contracts, without relying on dispatch bookkeeping? Written once; run by jsdom and by Chromium.
//
// F1-F2 characterize the unhandled failure (pinned, not endorsed). F3 inventories every surface an author could
// look at, with the label each deserves, and exercises the one deliberate way to handle it (an application-written
// guard). F4 is the paired handled case. Nothing here asks for a Valance change.
import { describe, expect, it } from "vitest";

import { run } from "./failure-scenarios.js";
import type { Driver } from "./scenarios.js";

/** How each surface is labelled, and why. The label is a judgment from the code and docs, argued in the report. */
export const LABELS = {
  "mounted.dispatched": "PUBLIC type (exported, one-line doc: 'every dispatch Valance made, as it settled'); poll-only snapshot of an unbounded array; no document calls it a failure contract; read only by tests",
  "mounted.settled": "PUBLIC type; completes when dispatches settle; carries no outcome",
  "mounted.followed": "PUBLIC type; ends for a render failure or the application ending; says nothing about dispatches",
  "Event.subscribe(CommandFailed)": "PUBLIC (NEXUS Event); only carries what the application itself publishes",
  "command-table guard": "PUBLIC composition (a Binding is a function; State and Event are NEXUS's); application-written",
  "console / unhandled rejection": "PUBLIC platform surfaces; Valance writes nothing to either for a dispatch outcome",
} as const;

export const describeFailure = (driver: () => Promise<Driver> | Driver): void => {
  describe("an unhandled command failure, observed as an application author", () => {
    it("F1 the failure stays isolated: the Exit is a Failure, nothing else moves", async () => {
      const { steps, surfaces } = await run(await driver(), "unhandled", "load-then-reject");
      const [, loading, failed] = steps;

      expect(loading?.states).toEqual(["idle/0", "loading/0"]);
      expect(loading?.operations).toEqual(["draw", "update"]);
      expect(surfaces.dispatched[0]).toBe("failure WorkFailed");

      // After the failure: no state mutation, no PORT operation, the DOM as it was, the application alive.
      expect(failed?.states).toEqual(loading?.states);
      expect(failed?.operations).toEqual(loading?.operations);
      expect(failed?.dom).toEqual(["status: loading", "data: ", "ticks: 0"]);
      expect(failed?.status).toBe("Running");
    });

    it("F2 the application remains usable: a second event succeeds and updates the DOM", async () => {
      const { steps, surfaces } = await run(await driver(), "unhandled", "load-then-reject");
      const second = steps[3];

      expect(second?.status).toBe("Running");
      expect(second?.states).toEqual(["idle/0", "loading/0", "loading/1"]);
      expect(second?.dom).toEqual(["status: loading", "data: ", "ticks: 1"]);
      expect(second?.operations).toEqual(["draw", "update", "update"]);
      expect(surfaces.dispatched).toEqual(["failure WorkFailed", "success"]);
    });

    it("F3 supported observability: what an application author can see, and where", async () => {
      const unhandled = await run(await driver(), "unhandled", "load-then-reject");
      const guarded = await run(await driver(), "guarded", "load-then-reject");
      const unmapped = await run(await driver(), "guarded", "tick", { omitTick: true });

      console.info(JSON.stringify({ LABELS, unhandled: unhandled.surfaces, guarded: { surfaces: guarded.surfaces, last: guarded.steps.at(-1) }, unmapped: { surfaces: unmapped.surfaces, last: unmapped.steps.at(-1) } }));

      // (a) Unhandled, as written: the only trace is `mounted.dispatched`. Everything else is silent.
      expect(unhandled.surfaces).toEqual({ dispatched: ["failure WorkFailed", "success"], settled: "completed", followed: "pending", events: [], logged: [], unhandled: [] });

      // (b) The application's own guard over its own table: the failure is observed (an event) and handled (state),
      //     through public contracts only; the dispatch Exit is then a success, and nothing needed `dispatched`.
      expect(guarded.surfaces.events).toEqual([{ command: "asyncapp/load", failure: "WorkFailed" }]);
      expect(guarded.surfaces.dispatched).toEqual(["success", "success"]);
      expect(guarded.steps[2]?.dom).toEqual(["status: failed", "data: ", "ticks: 0"]);
      expect(guarded.steps[2]?.operations).toEqual(["draw", "update", "update"]);
      expect(guarded.steps[2]?.status).toBe("Running");
      expect(guarded.steps[3]?.dom[2]).toBe("ticks: 1");

      // (c) A failure that happens before any binding runs (an intent no binding answers): the guard has nothing to
      //     wrap. The state is untouched, no event, nothing logged; again the only trace is `mounted.dispatched`.
      expect(unmapped.surfaces.dispatched).toEqual(["failure UnmappedCommand", "failure UnmappedCommand"]);
      expect(unmapped.surfaces.events).toEqual([]);
      expect(unmapped.surfaces.logged).toEqual([]);
      expect(unmapped.surfaces.unhandled).toEqual([]);
      expect(unmapped.steps.at(-1)?.states).toEqual(["idle/0"]);
      expect(unmapped.steps.at(-1)?.status).toBe("Running");
    });

    it("F4 a handled failure is ordinary application state: the command catches it, the view shows it", async () => {
      const { steps, surfaces } = await run(await driver(), "handled", "load-then-reject");
      const [, loading, failed, second] = steps;

      expect(loading?.dom[0]).toBe("status: loading");
      expect(failed?.states).toEqual(["idle/0", "loading/0", "failed/0"]);
      expect(failed?.dom).toEqual(["status: failed", "data: ", "ticks: 0"]);
      expect(failed?.operations).toEqual(["draw", "update", "update"]);
      expect(failed?.status).toBe("Running");
      expect(second?.dom).toEqual(["status: failed", "data: ", "ticks: 1"]);
      expect(second?.operations).toEqual(["draw", "update", "update", "update"]);
      // The dispatch itself succeeded: the command handled it. Nothing unhandled exists to observe.
      expect(surfaces.dispatched).toEqual(["success", "success"]);
      expect(surfaces.events).toEqual([]);
    });
  });
};
