// Stage 36 — the update commit boundary. The ONE linearization point: VALANCE retains a render (`drawn.current`) after `target.update` / `draw` RETURNS.
//   success → the new render is retained, events resolve against it
//   a throwing update (before or after it mutated the physical target) → the mount is inert and the PREVIOUS render stays retained, whatever the physical target now shows
//   VALANCE owns the logical commit; PORT owns the physical realization, including partial effects of a throwing operation. No rollback, no reconciliation.
// A0 = ids [A,B]; A1 = ids [A,C] (C's button exists only in A1, B's only in A0). A handler "resolves against" a render iff dispatch of it succeeds.
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { boot } from "./structure-fixture.js";
import { until } from "./helpers.js";

type Mounted = Awaited<ReturnType<Awaited<ReturnType<typeof boot>>["mountOn"]>>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const state = (m: Mounted): Promise<string> => Effect.runPromise(Effect.race(Effect.map(m.mounted.followed, (e): string => Exit.isSuccess(e) ? "ended" : Cause.isDieType(e.cause) ? `defect ${(e.cause.defect as Error).message}` : "other"), Effect.succeed("following")));
const clickRow = (m: Mounted, index: number) => m.page.click(m.rowEls()[index]!.querySelector("button")!);
/** A mount over A0 whose updates throw (before or after mutating) while `mode.when` says so; B's handler is captured by one click (which taps B). */
const failing = async (when: "before" | "after", initial?: Parameters<typeof boot>[0]) => {
  const b = await boot(initial);
  const mode: { when?: "before" | "after" } = {};
  const m = await b.mountOn({ updateThrows: () => mode.when });

  clickRow(m, 1);                                                     // B (A0 only): captures its handler
  await until(() => b.taps.length === 1);
  mode.when = when;

  return { b, m, mode };
};
const bHandler = (m: Mounted) => m.reports[0]!;                         // B's handler, captured

describe("the update commit boundary", () => {
  it("a successful update retains the new render: its events resolve, the previous render's handlers no longer do", async () => {
    const b = await boot();
    const m = await b.mountOn();

    clickRow(m, 1);
    await until(() => b.taps.length === 1);
    await b.invoke("app/ids", ["A", "C"]);
    await until(() => m.ops.length === 2);
    clickRow(m, 1);                                                    // C: only A1 has it
    await until(() => b.taps.length === 2);
    bHandler(m).send();                                                // B: only A0 had it
    await until(() => m.mounted.dispatched.length === 3);
    expect(b.taps).toEqual(["B", "C"]);
    expect(m.mounted.dispatched.map(Exit.isSuccess)).toEqual([true, true, false]);
    await m.close();
  });

  for (const when of ["before", "after"] as const) {
    describe(`the update throws ${when} mutating the target`, () => {
      it("the mount is inert, no A1 presentation is recorded, and the retained render stays A0 (events resolve against A0, A1's handlers are refused)", async () => {
        const { b, m } = await failing(when);

        await b.invoke("app/ids", ["A", "C"]);
        await sleep(60);
        expect(await state(m)).toBe(when === "before" ? "defect update failed" : "defect update failed after mutation");
        expect(m.ops).toEqual(["draw"]);                                // the failed update is not a presentation
        // physical state is PORT's: untouched before the mutation, A1's rows after it
        expect(m.rows()).toEqual(when === "before" ? ["A", "B"] : ["A", "C"]);
        bHandler(m).send();                                            // A0's handler: still resolves
        await until(() => b.taps.length === 2);
        expect(b.taps).toEqual(["B", "B"]);

        if (when === "after") {
          clickRow(m, 1);                                              // physically C's button, logically not in A0
          await until(() => m.mounted.dispatched.length === 3);
          expect(Exit.isFailure(m.mounted.dispatched[2]!)).toBe(true);
          expect(b.taps).toEqual(["B", "B"]);
        }

        await m.close();
      });

      it("the application keeps committing and the inert mount presents nothing and retains A0; a fresh mount in the same container draws the current state", async () => {
        const { b, m } = await failing(when);

        await b.invoke("app/ids", ["A", "C"]);
        await sleep(40);
        await b.invoke("app/ids", ["A", "C", "D"]);
        await sleep(40);
        expect(m.ops).toEqual(["draw"]);
        expect((await b.state()).ids).toEqual(["A", "C", "D"]);
        bHandler(m).send();
        await until(() => b.taps.length === 2);                         // still A0
        await m.close();
        expect(m.ops).toEqual(["draw", "unmount"]);
        const fresh = await b.mountOn({ page: m.page });

        expect(fresh.ops).toEqual(["draw"]);                            // not inherited: a normal first draw of the current state
        expect(fresh.rows()).toEqual(["A", "C", "D"]);
        clickRow(fresh, 2);
        await until(() => b.taps.length === 3);
        expect(b.taps).toEqual(["B", "B", "D"]);
        await fresh.close();
      });
    });
  }

  it("a same-view structural update that mutates the structure and throws: the logical retained render is still the previous one", async () => {
    const { b, m } = await failing("after");

    await b.invoke("app/show");
    await b.invoke("app/ids", ["A", "B", "C"]);
    await sleep(60);
    expect(await state(m)).toBe("defect update failed after mutation");
    expect(m.ops).toEqual(["draw"]);
    expect(m.rows()).toEqual(["A", "B", "C"]);                           // physically structural change landed (or part of it)
    bHandler(m).send();
    await until(() => b.taps.length === 2);
    expect(b.taps).toEqual(["B", "B"]);
    clickRow(m, 2);                                                      // C exists only in the render that never became retained
    await until(() => m.mounted.dispatched.length === 3);
    expect(Exit.isFailure(m.mounted.dispatched[2]!)).toBe(true);
    await m.close();
  });

  it("two mounts, different update outcomes: the successful one retains A1, the failing one A0, neither affects the other", async () => {
    const b = await boot();
    let fails = false;
    const ok = await b.mountOn();
    const bad = await b.mountOn({ updateThrows: () => fails ? "after" : undefined });

    clickRow(ok, 1);
    clickRow(bad, 1);
    await until(() => b.taps.length === 2);
    fails = true;
    await b.invoke("app/ids", ["A", "C"]);
    await until(() => ok.ops.length === 2);
    await sleep(40);
    expect(await state(ok)).toBe("following");
    expect(await state(bad)).toBe("defect update failed after mutation");
    expect(ok.ops).toEqual(["draw", "update"]);
    expect(bad.ops).toEqual(["draw"]);
    clickRow(ok, 1);                                                     // C: A1
    clickRow(bad, 1);                                                    // physically C, logically A0: refused
    bHandler(bad).send();                                                // B: A0
    bHandler(ok).send();                                                 // B: not in A1
    await until(() => ok.mounted.dispatched.length === 3 && bad.mounted.dispatched.length === 3);
    expect(ok.mounted.dispatched.map(Exit.isSuccess)).toEqual([true, true, false]);
    expect(bad.mounted.dispatched.map(Exit.isSuccess)).toEqual([true, false, true]);
    expect(b.taps).toEqual(["B", "B", "C", "B"]);
    await ok.close();
    await bad.close();
  });

  it("A1 succeeds, then A2's update mutates and throws: the retained render is A1", async () => {
    const b = await boot();
    const mode: { when?: "after" } = {};
    const m = await b.mountOn({ updateThrows: () => mode.when });

    clickRow(m, 1);
    await until(() => b.taps.length === 1);                              // B (A0)
    await b.invoke("app/ids", ["A", "C"]);
    await until(() => m.ops.length === 2);
    clickRow(m, 1);                                                      // C (A1), captured
    await until(() => b.taps.length === 2);
    mode.when = "after";
    await b.invoke("app/ids", ["A", "C", "D"]);
    await sleep(60);
    expect(await state(m)).toBe("defect update failed after mutation");
    expect(m.ops).toEqual(["draw", "update"]);
    expect(m.rows()).toEqual(["A", "C", "D"]);
    clickRow(m, 2);                                                      // D: A2 only
    clickRow(m, 1);                                                      // C: A1
    bHandler(m).send();                                                  // B: A0 only
    await until(() => m.mounted.dispatched.length === 5);
    expect(m.mounted.dispatched.map(Exit.isSuccess)).toEqual([true, true, false, true, false]);
    expect(b.taps).toEqual(["B", "C", "C"]);
    await m.close();
  });
});
