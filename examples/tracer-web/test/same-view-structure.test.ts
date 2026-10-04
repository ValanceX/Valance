// Stage 35 — same-view structural change is an update; see structure-fixture.ts for the application.
import { describe, expect, it } from "vitest";

import { boot } from "./structure-fixture.js";
import { until } from "./helpers.js";

describe("same-view structural change is an update", () => {
  it("conditional appears and disappears; keyed repeat adds, removes and reorders: each is one update, never a draw", async () => {
    const b = await boot();
    const m = await b.mountOn();

    expect(m.ops).toEqual(["draw"]);
    expect(m.shown()).toBe(false);
    expect(m.rows()).toEqual(["A", "B"]);

    const step = async (key: string, expectOps: number, arg?: ReadonlyArray<string>) => {
      await b.invoke(key, ...(arg === undefined ? [] : [arg]));
      await until(() => m.ops.length === expectOps);
    };

    await step("app/show", 2);                       // 1 appears
    expect(m.shown()).toBe(true);
    await step("app/hide", 3);                       // 2 disappears
    expect(m.shown()).toBe(false);
    await step("app/ids", 4, ["A", "B", "C"]);       // 3 add
    expect(m.rows()).toEqual(["A", "B", "C"]);
    await step("app/ids", 5, ["A", "C"]);            // 3 remove
    expect(m.rows()).toEqual(["A", "C"]);
    await step("app/ids", 6, ["C", "A"]);            // 4 reorder, same keys: ONE update (no DOM identity claim)
    expect(m.rows()).toEqual(["C", "A"]);
    expect(m.ops).toEqual(["draw", "update", "update", "update", "update", "update"]);
    expect(await m.standing()).toBe("following");
    await m.close();
  });

  it("different views with structurally identical output: draw, never inferred continuity", async () => {
    const b = await boot({ view: "a", show: true, ids: ["A"], n: 0 });
    const m = await b.mountOn();
    const before = m.rowEls()[0];

    await b.invoke("app/toggleView");
    await until(() => m.ops.length === 2);
    expect(m.ops).toEqual(["draw", "draw"]);
    expect(m.title()).toBe("B0");
    expect(before!.isConnected).toBe(false);          // a fresh realization, not a reconcile of the similar tree
    await b.invoke("app/bump");                       // and within B again: update
    await until(() => m.ops.length === 3);
    expect(m.ops).toEqual(["draw", "draw", "update"]);
    await m.close();
  });

  it("skipped intermediates: the presented structure is an update from what was actually presented, ending at the latest", async () => {
    const burst = await boot();
    const n = await burst.mountOn();

    // S1, S2, S3 committed together: whichever the follower skips, every presentation after the first is an update.
    await Promise.all([burst.invoke("app/show"), burst.invoke("app/ids", ["A", "B", "C"]), burst.invoke("app/ids", ["C"])]);
    await until(() => n.rows().length === 1);
    expect(n.shown()).toBe(true);
    expect(n.rows()).toEqual(["C"]);
    expect(n.ops[0]).toBe("draw");
    expect(n.ops.slice(1).every((op) => op === "update")).toBe(true);
    expect(n.ops.length).toBeLessThanOrEqual(4);
    await n.close();
  });

  it("two mounts with different structural progress each continue from their own presented render", async () => {
    const b = await boot();
    const lag = await b.mountOn();
    let once = false;
    const eager = await b.mountOn({ onUpdate: () => { if (!once) { once = true; void b.invoke("app/show"); void b.invoke("app/ids", ["Z"]); } } });

    await b.invoke("app/ids", ["A", "B", "C"]);       // eager's first update triggers two more commits from inside its own target
    await until(() => eager.rows().length === 1 && lag.rows().length === 1);
    for (const m of [lag, eager]) {
      expect(m.rows()).toEqual(["Z"]);
      expect(m.shown()).toBe(true);
      expect(m.ops[0]).toBe("draw");
      expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);
    }
    await lag.close();
    await eager.close();
  });
});

describe("failure and events", () => {
  it("a same-view structural update that fails at MESH: the mount goes inert on its last good render; repair does not resume it; a fresh mount draws normally", async () => {
    const b = await boot();
    const m = await b.mountOn();

    await b.invoke("app/ids", ["A", "A"]);            // duplicate declared key: runtime-duplicate-key, no render
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await m.standing()).toBe("failed MeshDiagnostics");
    expect(m.ops).toEqual(["draw"]);
    expect(m.rows()).toEqual(["A", "B"]);
    await b.invoke("app/ids", ["A", "B", "C"]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(m.rows()).toEqual(["A", "B"]);             // never resumes
    expect(await m.standing()).toBe("failed MeshDiagnostics");

    const fresh = await b.mountOn();

    expect(fresh.ops).toEqual(["draw"]);
    expect(fresh.rows()).toEqual(["A", "B", "C"]);
    await fresh.close();
    await m.close();
  });

  it("events after a structural update resolve against the newly presented render; removed nodes give no dispatch path", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const removed = m.rowEls()[1]!.querySelector("button")!;

    await b.invoke("app/ids", ["A", "C"]);
    await until(() => m.rows().length === 2 && m.rows()[1] === "C");
    m.page.click(m.rowEls()[1]!.querySelector("button")!);       // C: only exists in the new render
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["C"]);
    m.page.click(removed);                                       // B: removed from the render
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(b.taps).toEqual(["C"]);
    expect(m.mounted.dispatched.length).toBe(1);
    await m.close();
  });
});
