// Stage 44 — commit → State.values → wake-up → state read → render → presentation, under genuinely concurrent commits. There is no VALANCE queue between them:
//   commits           atomic, every one authoritative; `State.values` delivers each (nothing is dropped from the stream)
//   a mount           wakes per stream element but READS the latest state when it reaches presentation, renders that, presents it (update for the view it has drawn, draw for another)
//                     so it may skip superseded commits, never reorders (presented sequences only increase) or invents a state, and never delays a commit
//   several mounts    pace themselves independently; history is another consumer of `states` and sees every commit regardless of what any mount presents
// A presented state is read from the tree's title ("A"/"B" + n): the observable that tells which state a presentation was of.
import { runningOf } from "@valancex/valance/internal";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Exit, Fiber, Scope, Stream } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { boot, run, sleep } from "./structure-fixture.js";
import { boot as boot2, sleep as sleep2 } from "./two-view-fixture.js";
import { until } from "./helpers.js";

type Booted = Awaited<ReturnType<typeof boot>>;
const presented = (trees: ReadonlyArray<string>): ReadonlyArray<{ readonly view: string; readonly n: number }> => trees.map((t) => { const m = /"title":"([AB])(\d+)"/.exec(t)!; return { view: m[1]!, n: Number(m[2]) }; });
/** Every state the stream delivers, in delivery order. */
const watch = (b: Booted) => { const seen: Array<number> = []; const fiber = Effect.runFork(Stream.runForEach(runningOf(b.handle).states, (s) => Effect.sync(() => { seen.push(s.n); }))); return { seen, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }; };
const increasing = (xs: ReadonlyArray<number>) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);

describe("concurrent commits and presentation", () => {
  it("A/C. concurrent commits are all delivered by the stream; a mount presents an increasing subset ending at the latest, as updates, never a draw after the first", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const w = watch(b);

    await sleep(20);
    await Promise.all(Array.from({ length: 8 }, () => b.invoke("app/bump")));
    await until(() => presented(m.trees).at(-1)!.n === 8);
    await sleep(40);
    expect((await b.state()).n).toBe(8);
    expect(w.seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);                 // every commit is in the stream (the first element is the current state)
    const ns = presented(m.trees).map((p) => p.n);

    expect(ns[0]).toBe(0);
    expect(increasing(ns)).toBe(true);                                   // never reordered, repeated or invented
    expect(ns.every((n) => n >= 0 && n <= 8)).toBe(true);
    expect(m.ops[0]).toBe("draw");
    expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);
    expect(m.ops.length).toBeLessThanOrEqual(9);                         // at most one per commit; how many fewer is not promised
    await w.stop();
    await m.close();
  });

  it("B. a commit during a presentation: the started presentation completes, the next one reads the latest state and skips what was superseded", async () => {
    const b = await boot();
    let once = false;
    const during: Array<number> = [];
    const m = await b.mountOn({ onUpdate: () => {
      if (!once) { once = true; during.push(...presented(m.trees).map((p) => p.n)); void b.invoke("app/bump"); void b.invoke("app/bump"); }   // two more commits while n=1 is being presented
    } });

    await b.invoke("app/bump");
    await until(() => presented(m.trees).at(-1)!.n === 3);
    expect(during).toEqual([0, 1]);                                      // the in-progress presentation (n=1) had completed when the commits landed
    const ns = presented(m.trees).map((p) => p.n);

    expect(ns.slice(0, 2)).toEqual([0, 1]);
    expect(increasing(ns)).toBe(true);
    expect(ns.at(-1)).toBe(3);
    expect(ns.length).toBeLessThanOrEqual(4);                            // n=2 may have been skipped
    await m.close();
  });

  it("D. concurrent view changes: continuity is relative to what was actually presented (first draw, same view update, another view draw), whichever intermediates were skipped", async () => {
    const b = await boot();
    const m = await b.mountOn();

    await Promise.all(Array.from({ length: 5 }, () => b.invoke("app/toggleView")));
    await sleep(80);
    expect((await b.state()).view).toBe("b");
    const states = presented(m.trees);

    expect(states.at(-1)!.view).toBe("B");                               // converged on the latest
    states.forEach((state, i) => { expect(m.ops[i]).toBe(i === 0 ? "draw" : state.view === states[i - 1]!.view ? "update" : "draw"); });
    expect(m.ops.length).toBeLessThanOrEqual(6);
    await m.close();
  });

  it("E. mounts at different paces present different subsets and converge independently on the same latest state; neither delays a commit", async () => {
    const b = await boot();
    let extra = 0;
    const fast = await b.mountOn();
    const slow = await b.mountOn({ onUpdate: () => { if (extra < 3) { extra += 1; void b.invoke("app/bump"); } } });   // the slow mount's own presentations keep committing more

    await Promise.all(Array.from({ length: 6 }, () => b.invoke("app/bump")));
    await sleep(100);
    const final = (await b.state()).n;

    expect(final).toBe(9);
    for (const m of [fast, slow]) {
      const ns = presented(m.trees).map((p) => p.n);

      expect(ns.at(-1)).toBe(final);
      expect(increasing(ns)).toBe(true);
      expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);
    }
    await fast.close();
    await slow.close();
  });

  it("G. history follows every committed state whether or not the mount presents it; neither waits for the other", async () => {
    const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/" });
    const page = { window: dom.window, container: dom.window.document.querySelector("main") as HTMLElement, click: (e: Element) => e.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })), nodes: () => [] as ReadonlyArray<Node> };
    const pushed: Array<string> = [];
    const push = dom.window.history.pushState.bind(dom.window.history);

    dom.window.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
    const b = await boot();
    const m = await b.mountOn({ page: page as never });
    const scope = await run(Scope.make());

    await run(Web.history(b.handle, { window: dom.window as unknown as Window, urlOf: (s: { readonly n: number }) => `/n${s.n}`, stateOf: () => ({}), navigate: "app/bump" } as never).pipe(Scope.extend(scope)));
    await sleep(20);
    await Promise.all(Array.from({ length: 6 }, () => b.invoke("app/bump")));
    await until(() => pushed.length === 6 && presented(m.trees).at(-1)!.n === 6);
    expect(pushed).toEqual(["/n1", "/n2", "/n3", "/n4", "/n5", "/n6"]);  // every commit, in stream order
    expect(presented(m.trees).length).toBeLessThanOrEqual(7);            // the mount presented its own subset
    await run(Scope.close(scope, Exit.void));
    await m.close();
    void Valance;
  });
});

describe("concurrent commits with an invalid intermediate", () => {
  it("F. the mount that renders the invalid state fails, the one that skips it does not; later concurrent valid commits stay in the application, the inert mount never resumes, a fresh mount recovers", async () => {
    const b = await boot2();
    let breaks = false;
    let fixes = false;
    const failing = await b.mountOn({ onUpdate: () => { if (breaks) { breaks = false; Effect.runFork(b.rawInvoke("app/break")); } } });
    const skipping = await b.mountOn({ onUpdate: () => { if (fixes) { fixes = false; Effect.runFork(b.rawInvoke("app/fix")); } } });

    breaks = true;
    fixes = true;
    await b.invoke("app/bump");                                          // valid → (each mount's update of it commits) invalid → valid
    await sleep2(80);
    expect(await failing.standing()).toBe("failed MeshDiagnostics");
    expect(await skipping.standing()).toBe("following");
    await Promise.all(Array.from({ length: 5 }, () => b.invoke("app/bump")));   // concurrent valid commits afterwards
    await sleep2(80);
    expect((await b.state()).n).toBe(6);                                 // all landed in the application
    expect(skipping.label()).toBe("A6");                                 // the live mount converged on the latest
    expect(failing.label()).toBe("A1");                                  // the inert mount holds its last good render and never resumed
    expect(failing.ops).toEqual(["draw A0", "update A1"]);
    const fresh = await b.mountOn();

    expect(fresh.label()).toBe("A6");                                    // a fresh mount draws the current state
    expect(fresh.ops).toEqual(["draw A6"]);
    await failing.close();
    await skipping.close();
    await fresh.close();
  });
});
