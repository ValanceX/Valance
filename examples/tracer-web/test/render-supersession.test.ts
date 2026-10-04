// Tracer: what happens when application state changes faster than rendering can realize it? The render is gated, not timed.
// The one async step of presenting a state is MESH's `render` (an awaited promise); the target call after it is synchronous. This file wraps ONLY that
// call (test-only, `vi.mock`) so a test can hold a render open, commit meanwhile, and release in an adversarial order. Nothing under src/ or packages/ changed.
//   questions: does a later render overlap, cancel or wait for an earlier one? can an older render present after a newer one? who owns the pending render?
//   what keeps keyed identity when an intermediate state is skipped? does a pending render ever touch application state?
import { Effect, Exit, Scope } from "effect";
import { describe, expect, it, vi } from "vitest";

const gates = vi.hoisted(() => {
  const holds = new Map<string, Array<Promise<void>>>();
  const log: Array<string> = [];

  return { holds, log };
});

vi.mock("@valancex/mesh-runtime", async (importOriginal) => {
  const real = await importOriginal<typeof import("@valancex/mesh-runtime")>();

  return {
    ...real,
    render: async (input: Parameters<typeof real.render>[0]) => {
      const title = String((input.snapshot as { title?: string }).title);
      const held = gates.holds.get(title)?.shift();

      gates.log.push(`start ${title}`);
      if (held !== undefined) { await held; }
      const result = await real.render(input);

      gates.log.push(`done ${title}`);

      return result;
    },
  };
});

import { boot } from "./structure-fixture.js";
import { until } from "./helpers.js";

/** Holds the NEXT render whose title is `title`; the returned function releases it. */
const hold = (title: string): (() => void) => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });

  gates.holds.set(title, [...(gates.holds.get(title) ?? []), promise]);

  return release;
};
const reset = () => { gates.holds.clear(); gates.log.length = 0; };
const tick = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
const titles = (trees: ReadonlyArray<string>) => trees.map((t) => /"title":"([AB]\d+)"/.exec(t)![1]);

describe("render supersession, gated", () => {
  it("1: renders never overlap; a commit during a held render is neither cancelled nor awaited; the held render still presents; the next one reads the LATEST state; older never presents after newer", async () => {
    reset();
    const b = await boot();
    const m = await b.mountOn();
    const [r1, r2, r3] = [hold("A1"), hold("A2"), hold("A3")];       // gates for every state; only the first can ever be reached while it is held

    await b.invoke("app/bump");                                      // n=1: the follower reads it and starts rendering A1, which is held
    await until(() => gates.log.includes("start A1"));
    await b.invoke("app/bump");                                      // n=2, n=3 commit while A1 is in flight
    await b.invoke("app/bump");

    expect((await b.state()).n).toBe(3);                              // authority: the application is at 3 though nothing newer than A0 is presented
    expect(titles(m.trees)).toEqual(["A0"]);
    await tick();
    expect(gates.log).toEqual(["start A0", "done A0", "start A1"]);   // A2 and A3 did not start: no overlap, and the held render was not cancelled

    r3(); r2();                                                      // adversarial: release the newer gates first. Nothing is waiting on them
    await tick();
    expect(titles(m.trees)).toEqual(["A0"]);
    r1();                                                            // now the oldest
    await until(() => titles(m.trees).at(-1) === "A3");
    await tick();

    expect(titles(m.trees)).toEqual(["A0", "A1", "A3"]);             // A1 presented (it had started), A2 skipped, A3 last; never A3 before A1
    expect(gates.log.filter((e) => e.startsWith("start"))).toEqual(["start A0", "start A1", "start A3"]);
    expect(m.ops).toEqual(["draw", "update", "update"]);
    expect((await b.state()).n).toBe(3);
    await m.close();
  });

  it("2: a render in flight when its MOUNT closes is the mount's: nothing is presented after unmount, the application is unaffected and keeps committing", async () => {
    reset();
    const b = await boot();
    const m = await b.mountOn();
    const release = hold("A1");

    await b.invoke("app/bump");
    await until(() => gates.log.includes("start A1"));
    await m.close();
    release();
    await tick();

    expect(m.ops).toEqual(["draw", "unmount"]);                       // nothing after the unmount: the released render presented nowhere
    expect(gates.log).toContain("done A1");                           // the underlying render promise is not cancellable: it finishes and is discarded
    await b.invoke("app/bump");
    expect((await b.state()).n).toBe(2);                              // the application is alive and authoritative
    const m2 = await b.mountOn();                                     // a fresh mount draws the current state
    expect(titles(m2.trees)).toEqual(["A2"]);
    await m2.close();
  });

  it("3: closing the APPLICATION with a render in flight: nothing is presented afterwards", async () => {
    reset();
    const b = await boot();
    const m = await b.mountOn();
    const release = hold("A1");

    await b.invoke("app/bump");
    await until(() => gates.log.includes("start A1"));
    const closing = Effect.runPromise(Scope.close(b.appScope, Exit.void));

    release();
    await closing;
    await tick();
    expect(m.ops.filter((op) => op !== "draw").length).toBeLessThanOrEqual(1);   // at most the render that had already started
    expect(await m.standing()).toBe("ended");
    await m.close();
  });

  it("4: two mounts: a held render in one does not delay the other; each presents the latest, independently", async () => {
    reset();
    const b = await boot();
    const m1 = await b.mountOn();
    const m2 = await b.mountOn();
    const release = hold("A1");                                       // holds exactly ONE render of A1 (whichever mount reaches it first)

    await b.invoke("app/bump");
    await until(() => gates.log.filter((e) => e === "start A1").length >= 1);
    await b.invoke("app/bump");
    await until(() => titles(m1.trees).at(-1) === "A2" || titles(m2.trees).at(-1) === "A2");
    const [free, stuck] = titles(m1.trees).at(-1) === "A2" ? [m1, m2] : [m2, m1];

    expect(titles(stuck.trees).at(-1)).toBe("A0");                    // the held mount has not moved
    release();
    await until(() => titles(stuck.trees).at(-1) === "A2");
    expect(titles(free.trees).at(-1)).toBe("A2");
    expect((await b.state()).n).toBe(2);
    await m1.close(); await m2.close();
  });

  it("5: keyed identity is relative to what was PRESENTED: skipped intermediates neither create nor destroy elements; surviving keys keep their DOM nodes", async () => {
    reset();
    const b = await boot();                                           // ids [A, B]
    const m = await b.mountOn();
    const byKey = () => new Map(m.rowEls().map((el) => [el.querySelector("span")!.textContent!, el]));
    const first = byKey();
    const release = hold("A1");

    await b.invoke("app/bump");                                       // s1 (n=1, ids [A,B]): the follower starts rendering it; held
    await until(() => gates.log.includes("start A1"));
    await b.invoke("app/ids", ["A", "B", "C"]);                       // s2, s3: committed behind the held render, never rendered
    await b.invoke("app/ids", ["D", "B"]);                            //   (A removed, C and D added)
    await b.invoke("app/ids", ["B", "A", "E"]);                       // s4: the latest; reorders B, brings A back
    release();
    await until(() => m.rows().join() === "B,A,E");

    const after = byKey();
    expect(m.ops.every((op, i) => (i === 0 ? op === "draw" : op === "update"))).toBe(true);
    expect(after.get("B")).toBe(first.get("B"));                      // survived, and moved
    expect(after.get("A")).toBe(first.get("A"));                      // removed only in a state that was never presented, so it is the same node
    expect(byKey().has("D")).toBe(false);                             // D never existed in the DOM
    expect(m.ops).toEqual(["draw", "update", "update"]);              // s1 (held, then presented), then s4: s2 and s3 never presented
    await m.close();
  });

  it("5b: control: the same final state reached WITHOUT skipping does recreate A (it was removed in a presented state)", async () => {
    reset();
    const b = await boot();
    const m = await b.mountOn();
    const first = new Map(m.rowEls().map((el) => [el.querySelector("span")!.textContent!, el]));

    for (const ids of [["A", "B", "C"], ["D", "B"], ["B", "A", "E"]]) {
      const n = m.ops.length;

      await b.invoke("app/ids", ids);
      await until(() => m.ops.length > n);
    }

    const after = new Map(m.rowEls().map((el) => [el.querySelector("span")!.textContent!, el]));

    expect(m.rows()).toEqual(["B", "A", "E"]);
    expect(after.get("B")).toBe(first.get("B"));
    expect(after.get("A")).not.toBe(first.get("A"));                  // presented removal then re-add: a new node
    await m.close();
  });
});
