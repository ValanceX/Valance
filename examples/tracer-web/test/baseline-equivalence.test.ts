// Stage 38 — after the first presentation succeeds, a mount established by `hydrate` and one established by `mount` have ONE VALANCE presentation model:
// same view → update, another view → draw, events against the mount's own retained render, a later failure → the same inert mount, state authority shared, fresh mounts start
// from current state. VALANCE keeps no "was hydrated" fact (`connect` takes the first presentation as a callback and nothing else differs). Physical DOM facts stay PORT's.
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { A0, boot, hydrateOn, served, sleep } from "./structure-fixture.js";
import { until } from "./helpers.js";

/** One application with a drawn mount (`d`) and a hydrated mount (`h`) over the same initial render, seen through one interface. */
const pair = async (options: { readonly dFails?: () => boolean; readonly hFails?: () => boolean } = {}) => {
  const b = await boot();
  const d = await b.mountOn({ updateThrows: () => options.dFails?.() === true ? "after" : undefined });
  const h = await hydrateOn(b, await served(b, A0), options.hFails === undefined ? {} : { updateThrows: options.hFails });
  const view = (m: typeof d | typeof h, first: "draw" | "hydrate") => m === d
    ? { first, ops: d.ops, rows: d.rows, click: (i: number) => { d.page.click(d.rowEls()[i]!.querySelector("button")!); }, dispatched: () => d.mounted.dispatched, reports: d.reports, followed: d.mounted.followed, close: d.close }
    : { first, ops: h.ops, rows: h.rows, click: h.click, dispatched: () => h.ok!.dispatched, reports: h.reports, followed: h.ok!.followed, close: h.close };
  const mounts = { drawn: view(d, "draw"), hydrated: view(h, "hydrate") };

  return { b, d, h, mounts, all: Object.values(mounts) };
};
const standing = (followed: Effect.Effect<Exit.Exit<void, unknown>>) => Effect.runPromise(Effect.race(Effect.map(followed, (e): string => Exit.isSuccess(e) ? "ended" : Cause.isDieType(e.cause) ? `defect ${(e.cause.defect as Error).message}` : "other"), Effect.succeed("following")));

describe("draw-origin and hydrate-origin mounts share one presentation model", () => {
  it("same view (value and structure) → update for both; events resolve against each one's newest render; the previous render's handlers are refused by both", async () => {
    const { b, mounts, all } = await pair();

    for (const m of all) { m.click(1); }                                  // B (first render): both resolve
    await until(() => b.taps.length === 2);
    expect(all.map((m) => m.ops)).toEqual([["draw"], ["hydrate"]]);
    await b.invoke("app/show");                                          // conditional appears
    await b.invoke("app/ids", ["A", "C"]);                               // keyed repeat changes
    await until(() => all.every((m) => m.rows().join() === "A,C"));
    for (const m of all) {
      expect(m.ops[0]).toBe(m.first);
      expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);   // never a draw
      expect(m.ops.length).toBeGreaterThan(1);
    }
    for (const m of all) { m.click(1); }                                  // C: only the new render
    await until(() => b.taps.length === 4);
    for (const m of all) { m.reports[0]!.send(); }                        // B's handler: only the first render
    await until(() => all.every((m) => m.dispatched().length === 3));
    expect(b.taps).toEqual(["B", "B", "C", "C"]);
    expect(mounts.drawn.dispatched().map(Exit.isSuccess)).toEqual([true, true, false]);
    expect(mounts.hydrated.dispatched().map(Exit.isSuccess)).toEqual([true, true, false]);
    await Promise.all(all.map((m) => m.close()));
  });

  it("a view change is a draw for both, and so is returning; structural similarity between the views changes nothing", async () => {
    const { b, all } = await pair();

    await b.invoke("app/toggleView");
    await until(() => all.every((m) => m.ops.length === 2));
    await b.invoke("app/toggleView");
    await until(() => all.every((m) => m.ops.length === 3));
    expect(all.map((m) => m.ops)).toEqual([["draw", "draw", "draw"], ["hydrate", "draw", "draw"]]);
    await Promise.all(all.map((m) => m.close()));
  });

  it("a later update failure is the same inert mount for both, each keeping its own last presented render; inert events keep the retained intent and run against current state; no resume", async () => {
    let dFails = false;
    let hFails = false;
    const { b, d, h, mounts, all } = await pair({ dFails: () => dFails, hFails: () => hFails });

    for (const m of all) { m.click(1); }
    await until(() => b.taps.length === 2);                              // B on both, from the first renders
    await b.invoke("app/ids", ["A", "C"]);
    await until(() => all.every((m) => m.rows().join() === "A,C"));      // both updated: retained A1
    for (const m of all) { m.click(1); }
    await until(() => b.taps.length === 4);                              // C on both
    dFails = true;                                                       // different times: the drawn mount fails first
    await b.invoke("app/ids", ["A", "C", "D"]);
    await until(() => d.rows().length === 3);
    await sleep(40);
    expect(await standing(mounts.drawn.followed)).toBe("defect update failed after mutation");
    expect(await standing(mounts.hydrated.followed)).toBe("following");
    expect(h.rows()).toEqual(["A", "C", "D"]);
    hFails = true;
    await b.invoke("app/ids", ["A", "C", "D", "E"]);
    await until(() => h.rows().length === 4);
    await sleep(40);
    expect(await standing(mounts.hydrated.followed)).toBe("defect update failed after mutation");

    // The mounts failed at different renders, so each retains its own last presented one: drawn → A1 (A,C); hydrated → A2 (A,C,D). Nothing is shared.
    expect(mounts.drawn.ops).toEqual(["draw", "update"]);
    expect(mounts.hydrated.ops).toEqual(["hydrate", "update", "update"]);
    mounts.drawn.click(2);                                                // physically D: not in the drawn mount's retained render
    mounts.drawn.reports[1]!.send();                                      // C: in it
    mounts.hydrated.click(3);                                             // physically E: not in the hydrated mount's retained render
    mounts.hydrated.click(2);                                             // D: in it
    await b.invoke("app/bump");                                           // application state moves on
    await sleep(40);
    await until(() => mounts.drawn.dispatched().length === 4 && mounts.hydrated.dispatched().length === 4);
    expect(mounts.drawn.dispatched().slice(-2).map(Exit.isSuccess)).toEqual([false, true]);
    expect(mounts.hydrated.dispatched().slice(-2).map(Exit.isSuccess)).toEqual([false, true]);
    expect(mounts.drawn.ops).toEqual(["draw", "update"]);                 // never resumed
    expect(mounts.hydrated.ops).toEqual(["hydrate", "update", "update"]);
    expect((await b.state()).n).toBe(1);
    await Promise.all(all.map((m) => m.close()));
  });

  it("a hydrated and a drawn mount converge independently on the current state across a burst; neither has a state baseline of its own; fresh mounts start from current state with a normal draw", async () => {
    const { b, d, h, all } = await pair();

    await Promise.all([b.invoke("app/ids", ["A", "C"]), b.invoke("app/show"), b.invoke("app/ids", ["Z"]), b.invoke("app/bump")]);
    await until(() => all.every((m) => m.rows().join() === "Z" && m.ops.length >= 2));
    for (const m of all) {
      expect(m.rows()).toEqual(["Z"]);
      expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);
    }
    expect(d.title()).toBe("A1");
    expect(h.page.container.querySelector("section")?.getAttribute("aria-label")).toBe("A1");
    await Promise.all(all.map((m) => m.close()));

    const freshD = await b.mountOn({ page: d.page });
    const freshH = await b.mountOn({ page: h.page });                     // a fresh mount (not a hydrate) in the formerly hydrated container

    for (const f of [freshD, freshH]) {
      expect(f.ops).toEqual(["draw"]);
      expect(f.rows()).toEqual(["Z"]);
      expect(f.title()).toBe("A1");
    }
    await freshD.close();
    await freshH.close();
  });
});
