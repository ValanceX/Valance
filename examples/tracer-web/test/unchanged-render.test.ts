// Stage 39 — is there any render-equality or no-op presentation semantics? There is none. A mount presents the latest committed state it reaches, and each presentation is
// `update` (same view) or `draw` (another view), whatever the resulting render looks like:
//   a state change outside the render, an equal-valued but distinct state, a repeat of either: each reaching state is an update with the identical tree
//   the ONE state the mount does not present again is the same state object it last read (reference identity, C32's "a state already presented is not presented again")
//   an update whose tree is unchanged still replaces the retained render (its handler table / arguments), so events resolve against the newest one
//   a view change with output-equivalent renders is a draw
// Whether PORT or MESH do any work for an unchanged tree is theirs and not a VALANCE guarantee.
import { Exit } from "effect";
import { describe, expect, it } from "vitest";

import { boot, sleep } from "./structure-fixture.js";
import { until } from "./helpers.js";

const settle = () => sleep(40);

describe("an unchanged render is still a presentation", () => {
  it("state outside the render, an equal-valued new state, and repeats each give an update with an identical tree", async () => {
    const b = await boot();
    const m = await b.mountOn();

    for (const [key, args] of [["app/note", ["x"]], ["app/note", ["x"]], ["app/copy", []], ["app/copy", []]] as const) {
      await b.invoke(key, ...args);
      await settle();
    }
    expect(m.ops).toEqual(["draw", "update", "update", "update", "update"]);
    expect(new Set(m.trees).size).toBe(1);                              // five presentations, one tree
    expect((await b.state()).note).toBe("x");
    await m.close();
  });

  it("the same state object is not presented again; any other state is, even an equal one (reference identity, not render or state equality)", async () => {
    const b = await boot();
    const m = await b.mountOn();

    await b.invoke("app/same");
    await b.invoke("app/same");
    await settle();
    expect(m.ops).toEqual(["draw"]);                                    // nothing new to present
    await b.invoke("app/copy");
    await settle();
    expect(m.ops).toEqual(["draw", "update"]);                          // equal content, new state: presented
    await b.invoke("app/same");
    await settle();
    expect(m.ops).toEqual(["draw", "update"]);
    await m.close();
  });

  it("coalescing is distinct from equality: awaited, an equivalent intermediate is presented (R1, R1', R2 → three updates); in a burst only the latest-state rule applies", async () => {
    const b = await boot();
    const m = await b.mountOn();

    await b.invoke("app/ids", ["A", "C"]);
    await settle();
    await b.invoke("app/copy");
    await settle();
    await b.invoke("app/ids", ["A", "D"]);
    await settle();
    expect(m.ops).toEqual(["draw", "update", "update", "update"]);
    expect(m.trees[1]).toBe(m.trees[2]);                                // R1 and R1' are the same tree...
    expect(m.trees[2]).not.toBe(m.trees[3]);                            // ...and R2 is not

    const c = await boot();
    const n = await c.mountOn();

    await Promise.all([c.invoke("app/ids", ["A", "C"]), c.invoke("app/copy"), c.invoke("app/ids", ["A", "D"])]);
    await until(() => n.rows().join() === "A,D");
    await settle();
    expect(n.ops[0]).toBe("draw");
    expect(n.ops.slice(1).every((op) => op === "update")).toBe(true);
    expect(n.ops.length).toBeLessThanOrEqual(4);                        // some states may have been skipped (C32); none is ever suppressed for being equal
    expect(n.trees.at(-1)).toBe(m.trees.at(-1));
    await m.close();
    await n.close();
  });

  it("an update with an unchanged tree still installs the new render: an event argument that changed under identical visible output resolves against the newest retained render", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.page.click(m.rowEls()[1]!.querySelector("button")!);
    await until(() => b.taps.length === 1);                             // "B"
    await b.invoke("app/tag", "z");                                     // same tree, new event argument
    await settle();
    expect(m.ops).toEqual(["draw", "update"]);
    expect(m.trees[0]).toBe(m.trees[1]);
    m.page.click(m.rowEls()[1]!.querySelector("button")!);
    await until(() => b.taps.length === 2);
    await b.invoke("app/tag", "y");
    await settle();
    m.reports[0]!.send();                                               // an interaction reported earlier is still resolved against what is retained NOW
    await until(() => b.taps.length === 3);
    expect(b.taps).toEqual(["B", "zB", "yB"]);
    expect(m.mounted.dispatched.map(Exit.isSuccess)).toEqual([true, true, true]);
    await m.close();
  });

  it("two views with output-equivalent renders: A → B is a draw (view identity, never equality), and so is B → A", async () => {
    const b = await boot({ view: "a", show: true, ids: ["A"], n: 0, plain: true });
    const m = await b.mountOn();
    const before = m.page.container.textContent;

    await b.invoke("app/toggleView");
    await until(() => m.ops.length === 2);
    expect(m.page.container.textContent).toBe(before);                 // the same visible output
    await b.invoke("app/note", "x");                                    // same view: update
    await settle();
    await b.invoke("app/toggleView");
    await until(() => m.ops.length === 4);
    expect(m.ops).toEqual(["draw", "draw", "update", "draw"]);
    await m.close();
  });

  it("mounts with different presentation timing follow C32 independently over unchanged renders", async () => {
    const b = await boot();
    let once = false;
    const slow = await b.mountOn();
    const eager = await b.mountOn({ onUpdate: () => { if (!once) { once = true; void b.invoke("app/copy"); void b.invoke("app/tag", "q"); } } });

    await b.invoke("app/note", "n");
    await settle();
    await settle();
    for (const m of [slow, eager]) {
      expect(m.ops[0]).toBe("draw");
      expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);
      expect(new Set(m.trees).size).toBe(1);                            // every presentation was the same tree
      m.page.click(m.rowEls()[0]!.querySelector("button")!);
    }
    await until(() => b.taps.length === 2);
    expect(b.taps).toEqual(["qA", "qA"]);                                // both end on the latest state's event arguments
    await slow.close();
    await eager.close();
  });
});
