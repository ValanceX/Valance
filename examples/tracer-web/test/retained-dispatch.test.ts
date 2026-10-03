// Stage 40 — the retained render is the sole logical source of interaction identity and arguments. `drawn.current` is the render of the last SUCCESSFUL presentation of THIS mount;
// an interaction PORT reports is dispatched against it: not against current application state, not against the physical DOM, not against what another mount holds.
// The event argument is `tag + id` (visible text is just the id), so identical trees can still carry different arguments.
import { Exit } from "effect";
import { describe, expect, it } from "vitest";

import { boot, sleep } from "./structure-fixture.js";
import { until } from "./helpers.js";

const settle = () => sleep(40);
const one = { view: "a", show: false, ids: ["A"], n: 0 } as const;
const press = (m: { readonly page: { click: (e: Element) => unknown }; readonly rowEls: () => ReadonlyArray<Element> }) => { m.page.click(m.rowEls()[0]!.querySelector("button")!); };

describe("the retained render is the source of interaction identity", () => {
  it("A. a successful same-view update replaces it, even with an identical tree", async () => {
    const b = await boot(one);
    const m = await b.mountOn();

    await b.invoke("app/tag", "a");
    await settle();
    await b.invoke("app/tag", "b");
    await settle();
    expect(m.ops).toEqual(["draw", "update", "update"]);
    expect(new Set(m.trees).size).toBe(1);
    press(m);
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["bA"]);
    await m.close();
  });

  for (const when of ["before", "after"] as const) {
    it(`B. an update failing ${when} the target mutated never replaces it: dispatch stays on the last successful render, whatever the physical target holds`, async () => {
      const b = await boot(one);
      let fails: "before" | "after" | undefined;
      const m = await b.mountOn({ updateThrows: () => fails });

      await b.invoke("app/tag", "a");
      await settle();
      fails = when;
      await b.invoke("app/tag", "b");
      await b.invoke("app/ids", ["A", "C"]);                             // physically (after) there is a row the retained render does not have
      await settle();
      expect(m.ops).toEqual(["draw", "update"]);
      expect(m.rowEls().length).toBe(when === "after" ? 2 : 1);
      press(m);
      await until(() => b.taps.length === 1);
      expect(b.taps).toEqual(["aA"]);                                    // A's argument, not B's
      if (when === "after") {
        m.page.click(m.rowEls()[1]!.querySelector("button")!);           // the B-only artifact: no logical source
        await until(() => m.mounted.dispatched.length === 2);
        expect(Exit.isFailure(m.mounted.dispatched[1]!)).toBe(true);
        expect(b.taps).toEqual(["aA"]);
      }
      await m.close();
    });
  }

  it("C. a view transition replaces it with the new view's render, and a draw back replaces it again: the older render of the original view is never used", async () => {
    const b = await boot(one);
    const m = await b.mountOn();

    press(m);
    await until(() => b.taps.length === 1);                              // A(""): "A"
    const oldA = m.reports[0]!;
    await b.invoke("app/tag", "b");
    await settle();
    await b.invoke("app/toggleView");
    await until(() => m.ops.length === 3);                               // update, draw → view b
    expect(m.ops).toEqual(["draw", "update", "draw"]);
    press(m);
    await until(() => b.taps.length === 2);
    expect(b.taps).toEqual(["A", "bA"]);
    oldA.send();                                                         // the first A render's interaction, reported while B is retained: B's table has no such handler
    await until(() => m.mounted.dispatched.length === 3);
    expect(Exit.isFailure(m.mounted.dispatched[2]!)).toBe(true);
    await b.invoke("app/tag", "c");
    await settle();
    await b.invoke("app/toggleView");
    await until(() => m.ops.length === 5);
    expect(m.ops).toEqual(["draw", "update", "draw", "update", "draw"]);
    press(m);
    oldA.send();                                                         // same handler identity as the first A, resolved against the newly drawn A
    await until(() => b.taps.length === 4);
    expect(b.taps).toEqual(["A", "bA", "cA", "cA"]);                    // never "A": the render from before the transition is gone
    await m.close();
  });

  it("D. A(a) → B(b) → A(c): awaited, all three are presented; as a burst, B may be skipped; either way dispatch uses the final presented render and no event resolves against B", async () => {
    // awaited: presentation history
    const full = await boot(one);
    const f = await full.mountOn();

    await full.invoke("app/tag", "a");
    await settle();
    await full.invoke("app/toggleView");
    await until(() => f.ops.length === 3);
    await full.invoke("app/tag", "b");
    await settle();
    press(f);                                                            // B's handler, retained while B is presented
    await until(() => full.taps.length === 1);
    expect(full.taps).toEqual(["bA"]);
    const bHandler = f.reports.at(-1)!;
    await full.invoke("app/tag", "c");
    await settle();
    await full.invoke("app/toggleView");
    await until(() => f.ops.length === 6);
    expect(f.ops).toEqual(["draw", "update", "draw", "update", "update", "draw"]);
    press(f);
    await until(() => full.taps.length === 2);
    expect(full.taps).toEqual(["bA", "cA"]);

    // burst: the same sequence of commits, latest-state semantics
    const fast = await boot(one);
    const s = await fast.mountOn();

    await Promise.all([fast.invoke("app/tag", "b"), fast.invoke("app/toggleView"), fast.invoke("app/tag", "c"), fast.invoke("app/toggleView")]);
    await until(() => s.ops.length >= 2);
    await settle();
    expect(s.ops[0]).toBe("draw");
    press(s);
    await until(() => fast.taps.length === 1);
    expect(fast.taps).toEqual(["cA"]);                                   // the final presented A(c), whichever intermediates were presented
    s.report(bHandler.handler, bHandler.payload);                        // B's handler (view b): no resolution against any B render
    await until(() => s.mounted.dispatched.length === 2);
    expect(Exit.isFailure(s.mounted.dispatched[1]!)).toBe(true);
    expect(fast.taps).toEqual(["cA"]);
    await f.close();
    await s.close();
  });

  it("E. two mounts retain different renders: the same physical event shape carries each mount's own arguments", async () => {
    const b = await boot(one);
    let fails = false;
    const ok = await b.mountOn();
    const bad = await b.mountOn({ updateThrows: () => fails ? "after" : undefined });

    fails = true;
    await b.invoke("app/tag", "b");
    await settle();
    expect(ok.ops).toEqual(["draw", "update"]);
    expect(bad.ops).toEqual(["draw"]);
    press(ok);
    press(bad);
    await until(() => b.taps.length === 2);
    expect(b.taps).toEqual(["bA", "A"]);                                 // one application state ("b"), two retained renders
    await ok.close();
    await bad.close();
  });

  it("F. direct DOM changes are irrelevant: a changed attribute or text on PORT's element still dispatches the retained render's arguments; a removed or foreign element reaches nothing", async () => {
    const b = await boot(one);
    const m = await b.mountOn();

    await b.invoke("app/tag", "b");
    await settle();
    const button = m.rowEls()[0]!.querySelector("button")!;

    button.setAttribute("data-tag", "evil");
    button.textContent = "changed";
    button.className = "x";
    m.page.click(button);
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["bA"]);                                      // the retained render, not the DOM's attributes or text, nor anything the DOM now says

    const foreign = button.cloneNode(true) as Element;                   // an element PORT did not create

    button.replaceWith(foreign);
    m.page.click(foreign);
    m.page.click(button);                                                // detached
    await settle();
    expect(b.taps).toEqual(["bA"]);
    expect(m.mounted.dispatched.length).toBe(1);
    await m.close();
  });
});
