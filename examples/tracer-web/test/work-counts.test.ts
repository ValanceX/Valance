// Tracer: how much work does one state commit cause? COUNTS, not milliseconds. Nothing under src/ or packages/ changed.
//   view evaluations   app.view(state)                       wrapped after start (renderOf reads it live)
//   view scopes        views[v].scope(state), render path    wrapped after start (renderOf reads it live)
//   all scope calls    scopeHook: the ORIGINAL scope function, whoever calls it (the render path, and anything else)
//   MESH renders       MESH `render`, wrapped with vi.mock (test-only; vitest.config inlines @valancex/nexus)
//   presentations      the target's draw/update (PORT Web, jsdom)
//   DOM mutations      MutationObserver records on the container: what PORT actually changed
import { describe, expect, it, vi } from "vitest";

const meshCalls = vi.hoisted(() => ({ renders: [] as Array<string> }));

vi.mock("@valancex/mesh-runtime", async (importOriginal) => {
  const real = await importOriginal<typeof import("@valancex/mesh-runtime")>();

  return { ...real, render: (input: Parameters<typeof real.render>[0]) => { meshCalls.renders.push(`${input.program.root}`); return real.render(input); } };
});

import { boot, scopeHook, sleep } from "./structure-fixture.js";
import { until } from "./helpers.js";

type Booted = Awaited<ReturnType<typeof boot>>;

/** Wrap the live-read functions and observe the DOM; `measure(act)` runs `act` then returns every count since just before it. */
const instrument = (b: Booted) => {
  const c = { views: 0, scopesA: 0, scopesB: 0, scopeHook: 0 };
  const app = b.app as unknown as { view: (s: never) => string; views: Record<"a" | "b", { scope: (s: never) => unknown }> };
  const view = app.view;
  const scopeA = app.views.a.scope;
  const scopeB = app.views.b.scope;

  app.view = (s) => { c.views += 1; return view(s); };
  app.views.a.scope = (s) => { c.scopesA += 1; return scopeA(s); };
  app.views.b.scope = (s) => { c.scopesB += 1; return scopeB(s); };
  scopeHook.current = () => { c.scopeHook += 1; };

  return {
    c,
    measure: async (act: () => Promise<unknown>, mounts: ReadonlyArray<{ readonly ops: Array<string>; readonly page: { readonly container: Element; readonly window: unknown } }>) => {
      const observers = mounts.map((m) => { let n = 0; const o = new (m.page.window as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver((records) => { n += records.length; }); o.observe(m.page.container, { subtree: true, childList: true, attributes: true, characterData: true }); return { o, count: () => { n += o.takeRecords().length; return n; } }; });
      const before = { ...c, renders: meshCalls.renders.length, ops: mounts.map((m) => m.ops.length) };

      await act();
      await sleep(60);

      return {
        viewEvals: c.views - before.views, scopesA: c.scopesA - before.scopesA, scopesB: c.scopesB - before.scopesB, scopeHookTotal: c.scopeHook - before.scopeHook,
        meshRenders: meshCalls.renders.length - before.renders, presentations: mounts.map((m, i) => m.ops.length - before.ops[i]!), domMutations: observers.map((x) => x.count()),
      };
    },
  };
};
type Counts = Awaited<ReturnType<ReturnType<typeof instrument>["measure"]>>;
const none = { viewEvals: 0, scopesA: 0, scopesB: 0, scopeHookTotal: 0, meshRenders: 0 };
const one = { viewEvals: 1, scopesA: 1, scopesB: 0, scopeHookTotal: 1, meshRenders: 1 };
const work = (c: Counts) => ({ viewEvals: c.viewEvals, scopesA: c.scopesA, scopesB: c.scopesB, scopeHookTotal: c.scopeHookTotal, meshRenders: c.meshRenders });
/** Commit and wait until the mount has presented it (so the burst rule cannot coalesce awaited commits). */
const present = (b: Booted, m: { readonly ops: Array<string> }, key: string, ...args: ReadonlyArray<unknown>) => async () => { const before = m.ops.length; await b.invoke(key, ...args); await until(() => m.ops.length > before); };

describe("model: every commit a mount reaches evaluates the view and renders in full; PORT decides what changed", () => {
  it("0: no mount, no work: commits cost no view evaluation, no scope, no render (the host selectors are lazy)", async () => {
    const b = await boot();
    const i = instrument(b);

    expect(await i.measure(async () => { for (let n = 0; n < 5; n += 1) { await b.invoke("app/bump"); } }, [])).toEqual({ ...none, presentations: [], domMutations: [] });
    scopeHook.current = undefined;
  });

  it("1: a commit the mount reaches costs one view evaluation, one scope, one MESH render, one presentation, whether or not anything visible changed; PORT then changes the DOM only for a visible change", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const i = instrument(b);
    const a = await i.measure(present(b, m, "app/bump"), [m]);
    const note = await i.measure(present(b, m, "app/note", "x"), [m]);        // outside the render
    const copy = await i.measure(present(b, m, "app/copy"), [m]);              // equal value, new object
    const same = await i.measure(() => b.invoke("app/same"), [m]);             // the very same object

    expect(work(a)).toEqual(one); expect(a.presentations).toEqual([1]); expect(a.domMutations[0]).toBeGreaterThan(0);                       // the title changed
    expect(work(note)).toEqual(one); expect(note.presentations).toEqual([1]); expect(note.domMutations).toEqual([0]);                        // full pipeline, zero DOM change
    expect(work(copy)).toEqual(one); expect(copy.presentations).toEqual([1]); expect(copy.domMutations).toEqual([0]);                        // no state equality anywhere
    expect({ ...work(same), p: same.presentations, d: same.domMutations }).toEqual({ ...none, p: [0], d: [0] });                              // dropped before any work: reference identity
    expect(a.scopesB).toBe(0);                                                                                                              // the view that is not shown is never evaluated
    scopeHook.current = undefined;
    await m.close();
  });

  it("2: a burst is coalesced by the latest-state read: one evaluation per presentation, never more than the commits; awaited commits are not coalesced", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const i = instrument(b);
    const burst = await i.measure(() => Promise.all([1, 2, 3, 4].map(() => b.invoke("app/bump"))), [m]);
    const awaited = await i.measure(async () => { for (let n = 0; n < 4; n += 1) { await present(b, m, "app/bump")(); } }, [m]);

    expect(burst.meshRenders).toBeGreaterThanOrEqual(1); expect(burst.meshRenders).toBeLessThanOrEqual(4);
    expect([burst.viewEvals, burst.scopesA, burst.scopeHookTotal, burst.presentations[0]]).toEqual([burst.meshRenders, burst.meshRenders, burst.meshRenders, burst.meshRenders]);   // no hidden evaluation
    expect((await b.state()).n).toBe(8);
    expect(work(awaited)).toEqual({ viewEvals: 4, scopesA: 4, scopesB: 0, scopeHookTotal: 4, meshRenders: 4 });
    scopeHook.current = undefined;
    await m.close();
  });

  it("3: two mounts: the work is duplicated per mount, not shared (each owns its read, its render and its retained render)", async () => {
    const b = await boot();
    const m1 = await b.mountOn();
    const m2 = await b.mountOn();
    const i = instrument(b);
    const two = await i.measure(() => b.invoke("app/bump"), [m1, m2]);

    expect(work(two)).toEqual({ viewEvals: 2, scopesA: 2, scopesB: 0, scopeHookTotal: 2, meshRenders: 2 });
    expect(two.presentations).toEqual([1, 1]);
    expect(two.domMutations.every((n) => n > 0)).toBe(true);                     // two targets, two DOMs: that part is required
    scopeHook.current = undefined;
    await m1.close(); await m2.close();
  });

  it("4: views: only the SHOWN view's scope runs; a view change evaluates the new view's scope and not the old one's", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const i = instrument(b);
    const toggled = await i.measure(present(b, m, "app/toggleView"), [m]);
    const after = await i.measure(present(b, m, "app/bump"), [m]);

    expect({ a: toggled.scopesA, b: toggled.scopesB, renders: toggled.meshRenders }).toEqual({ a: 0, b: 1, renders: 1 });
    expect({ a: after.scopesA, b: after.scopesB, renders: after.meshRenders }).toEqual({ a: 0, b: 1, renders: 1 });
    scopeHook.current = undefined;
    await m.close();
  });
});

describe("keyed structure (PORT Web, jsdom: target-specific): the render is whole, the DOM change is minimal", () => {
  it("5: 50 keyed rows: an unchanged tree changes no DOM, an append touches one node, a swap of two keys touches a few; MESH renders the whole list every time", async () => {
    const ids = Array.from({ length: 50 }, (_, n) => `k${n}`);
    const b = await boot({ view: "a", show: false, ids, n: 0 });
    const m = await b.mountOn();
    const i = instrument(b);
    const unchanged = await i.measure(present(b, m, "app/note", "x"), [m]);
    const append = await i.measure(present(b, m, "app/ids", [...ids, "k50"]), [m]);
    const swap = await i.measure(present(b, m, "app/ids", [ids[1]!, ids[0]!, ...ids.slice(2), "k50"]), [m]);

    expect(unchanged.domMutations).toEqual([0]);
    expect(append.domMutations).toEqual([1]);
    expect(swap.domMutations[0]).toBeGreaterThan(0); expect(swap.domMutations[0]).toBeLessThan(10);       // not 51 rows rewritten
    for (const c of [unchanged, append, swap]) { expect(work(c)).toEqual(one); }                          // the same fixed pipeline for each
    expect(m.rows()).toEqual([ids[1], ids[0], ...ids.slice(2), "k50"]);
    scopeHook.current = undefined;
    await m.close();
  });
});
