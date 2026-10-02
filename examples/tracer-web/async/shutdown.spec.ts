// The shutdown regression: the tracer's finding that a dispatch started by a Valance application survived
// `Application.shutdown`, ran to completion after the application was Stopped, and committed state.
// Written once; run by jsdom and by Chromium.
import { describe, expect, it } from "vitest";

import { shutdown } from "./scenarios.js";
import type { Driver } from "./scenarios.js";

export const describeShutdown = (driver: () => Promise<Driver> | Driver): void => {
  describe("Application.shutdown with a dispatch in flight (caller's scope still open)", () => {
    // One real run per `it`: each asserts one invariant, and none depends on another's outcome.
    const run = async () => {
      const { snapshots, logged, unhandled } = await shutdown(await driver());
      const [loading, afterShutdown, afterCompletion, afterScope] = snapshots;

      return { loading: loading!, afterShutdown: afterShutdown!, afterCompletion: afterCompletion!, afterScope: afterScope!, logged, unhandled };
    };

    it("S1 shutdown interrupts the pending dispatch: the work is stopped before the application is Stopped", async () => {
      const { loading, afterShutdown } = await run();

      expect(loading.pending).toBe(1);
      expect(afterShutdown.status).toBe("Stopped");
      // Interrupted by the time shutdown returned: the handler saw it, and the capability's canceller ran.
      expect(afterShutdown.seen).toEqual(["started", "loading-committed", "interrupted"]);
      expect(afterShutdown.counts).toMatchObject({ started: 1, cancelled: 1, completions: 0 });
    });

    it("S2 no late state commit, and the dispatch never completes successfully", async () => {
      const { afterShutdown, afterCompletion, unhandled } = await run();

      expect(afterCompletion.counts.completions).toBe(1);
      expect(afterCompletion.seen).toEqual(afterShutdown.seen);
      expect(afterCompletion.state).toEqual(afterShutdown.state);
      expect(afterCompletion.state.status).toBe("loading");
      expect(afterCompletion.dispatched).not.toContain("success");
      expect(unhandled).toEqual([]);
    });

    it("S3 no late PORT operation", async () => {
      const { loading, afterShutdown, afterCompletion, afterScope } = await run();

      expect(afterShutdown.operations).toEqual(loading.operations);
      expect(afterCompletion.operations).toEqual(loading.operations);
      expect(afterScope.operations).toEqual(loading.operations);
    });

    it("S4 platform resource lifetime stays exactly once, through shutdown and the scope closing after it", async () => {
      const { afterShutdown, afterCompletion, afterScope } = await run();

      for (const snapshot of [afterShutdown, afterCompletion, afterScope]) {
        expect(snapshot.counts).toMatchObject({ acquired: 1, released: 1 });
        expect(snapshot.status).toBe("Stopped");
      }
    });
  });
};
