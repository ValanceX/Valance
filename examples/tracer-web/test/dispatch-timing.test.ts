// Stage 41 — when is what captured between a mount's report and the command's execution?
//   at REPORT (synchronously, in the target's callback): the mount's retained render is read (`drawn.current`); handler identity, intent and arguments are fixed by it from then on
//   at EXECUTION: the command reads the application state it finds then (`state.get`/`update`), whatever has committed or been presented since
//   admission and lifecycle after the report are the application's (C20/C26/C33): the mount closing does not stop it, the application closing interrupts it
// A tap is held (`gate`) before it reads state, so presentations and commits can happen between report and execution. The tap's argument is `tag + id`.
import { Cause, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { boot, sleep } from "./structure-fixture.js";
import { until } from "./helpers.js";

const settle = () => sleep(40);
const start = { view: "a", show: false, ids: ["A"], n: 0, tag: "a" } as const;
const press = (m: { readonly page: { click: (e: Element) => unknown }; readonly rowEls: () => ReadonlyArray<Element> }) => { m.page.click(m.rowEls()[0]!.querySelector("button")!); };
const hold = (b: { readonly gate: { current?: Promise<void> } }) => {
  let release!: () => void;

  b.gate.current = new Promise<void>((resolve) => { release = resolve; });

  return release;
};

describe("report time vs execution time", () => {
  it("A. state committed between report and execution: the argument stays the reported render's; the command observes the state current when it runs", async () => {
    const b = await boot(start);
    const m = await b.mountOn();
    const release = hold(b);

    press(m);                                                            // reported against A(a); the tap is now waiting
    await settle();
    await b.invoke("app/bump");
    await b.invoke("app/note", "later");
    await settle();
    expect(b.taps).toEqual([]);
    release();
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["aA"]);                                      // report-time argument
    expect(b.seen).toEqual([{ id: "aA", n: 1, tag: "a", view: "a" }]);   // execution-time state
    await m.close();
  });

  it("B. a successful presentation between report and execution cannot change the reported interaction; the next report uses the new render", async () => {
    const b = await boot(start);
    const m = await b.mountOn();
    const release = hold(b);

    press(m);
    await settle();
    await b.invoke("app/tag", "b");                                      // presented while the tap waits: the retained render is now B(b)
    await settle();
    expect(m.ops).toEqual(["draw", "update"]);
    release();
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["aA"]);
    expect(b.seen[0]).toEqual({ id: "aA", n: 0, tag: "b", view: "a" });  // old argument, new state
    press(m);
    await until(() => b.taps.length === 2);
    expect(b.taps).toEqual(["aA", "bA"]);
    await m.close();
  });

  it("B'. a view change presented between report and execution: the already-reported interaction still carries the reported render's identity and argument", async () => {
    const b = await boot(start);
    const m = await b.mountOn();
    const release = hold(b);

    press(m);
    await settle();
    await b.invoke("app/toggleView");
    await settle();
    expect(m.ops).toEqual(["draw", "draw"]);
    release();
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["aA"]);
    expect(Exit.isSuccess(m.mounted.dispatched[0]!)).toBe(true);        // not resolved against view b's render, which has no such handler
    expect(b.seen[0]!.view).toBe("b");
    await m.close();
  });

  for (const when of ["before", "after"] as const) {
    it(`C. a presentation failing ${when} the target mutated, between report and execution: the reported interaction is unaffected; physical residue is no source`, async () => {
      const b = await boot(start);
      let fails: "before" | "after" | undefined;
      const m = await b.mountOn({ updateThrows: () => fails });
      const release = hold(b);

      press(m);
      await settle();
      fails = when;
      await b.invoke("app/tag", "b");
      await settle();
      expect(m.ops).toEqual(["draw"]);
      release();
      await until(() => b.taps.length === 1);
      expect(b.taps).toEqual(["aA"]);
      expect(b.seen[0]!.tag).toBe("b");                                  // the command still runs against the committed application state
      press(m);                                                          // and the retained render is still the first one
      await until(() => b.taps.length === 2);
      expect(b.taps).toEqual(["aA", "aA"]);
      await m.close();
    });
  }

  it("D. another mount advancing cannot affect a reported interaction; each mount's own retained render is used", async () => {
    const b = await boot(start);
    let fails = false;
    const stuck = await b.mountOn({ updateThrows: () => fails ? "after" : undefined });
    const moves = await b.mountOn();
    const release = hold(b);

    press(stuck);
    await settle();
    fails = true;
    await b.invoke("app/tag", "b");                                      // `moves` presents it; `stuck` fails and retains the first render
    await settle();
    expect(moves.ops).toEqual(["draw", "update"]);
    expect(stuck.ops).toEqual(["draw"]);
    release();
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["aA"]);
    press(moves);
    await until(() => b.taps.length === 2);
    expect(b.taps).toEqual(["aA", "bA"]);
    await stuck.close();
    await moves.close();
  });

  it("E. mount closed after the report: the admitted command is the application's and completes; the closed mount's `dispatched` still receives its exit", async () => {
    const b = await boot(start);
    const m = await b.mountOn();
    const release = hold(b);

    press(m);
    await settle();
    await m.close();
    expect(m.ops).toEqual(["draw", "unmount"]);
    release();
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["aA"]);
    await until(() => m.mounted.dispatched.length === 1);
    expect(Exit.isSuccess(m.mounted.dispatched[0]!)).toBe(true);
    await b.invoke("app/bump");                                          // the application is untouched
    expect((await b.state()).n).toBe(1);
  });

  it("F. application closed after the report: the admitted command is interrupted by the close and never runs; an interaction reported afterwards is refused", async () => {
    const b = await boot(start);
    const m = await b.mountOn();
    const release = hold(b);

    press(m);
    await settle();
    await Promise.race([import("effect").then(({ Effect, Scope }) => Effect.runPromise(Scope.close(b.appScope, Exit.void))), sleep(1500).then(() => { throw new Error("application close hung"); })]);
    await until(() => m.mounted.dispatched.length === 1);
    const exit = m.mounted.dispatched[0]!;

    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true);
    release();
    await settle();
    expect(b.taps).toEqual([]);                                          // never ran, even after the gate opened
    press(m);                                                            // the mount is inert on its retained render; the application is closed
    await until(() => m.mounted.dispatched.length === 2);
    expect(Exit.isFailure(m.mounted.dispatched[1]!)).toBe(true);
    expect(b.taps).toEqual([]);
    await m.close();
  });
});
