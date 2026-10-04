import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Valance from "@valancex/valance";
import { userEvent } from "@vitest/browser/context";
import { Effect, Exit, Scope } from "effect";
import { beforeAll, describe, expect, it } from "vitest";

import { app, label, recording, run } from "./burst-fixture.js";

beforeAll(async () => { await init(wasmUrl); });

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

/** One application, `mounts` mounts in the application's own Scope, and a timeline of commits and PORT operations in the order they happened. */
const start = async (mounts: number) => {
  const roots = Array.from({ length: mounts }, () => document.createElement("main"));

  document.body.append(...roots);
  const timeline: Array<string> = [];
  const { definition, intents } = app(timeline);
  const scope = await run(Scope.make());
  const handle = await run(Valance.start(definition).pipe(Scope.extend(scope)));
  const logs = roots.map(() => [] as Array<string>);
  const mounted = await Promise.all(roots.map((root, index) => run(Valance.mount(handle, recording(root, logs[index]!, timeline, index)).pipe(Scope.extend(scope)))));

  return {
    roots, handle, logs, mounted, intents, timeline, scope,
    invoke: (key: string) => handle.invoke(key, []),
    close: async () => { await run(Scope.close(scope, Exit.void)); roots.forEach((root) => { root.remove(); }); },
  };
};

/** The presentations a mount made are a subsequence of what presenting EVERY commit would have been: skipped, never reordered or invented. */
const isSubsequence = (seen: ReadonlyArray<string>, all: ReadonlyArray<string>): boolean => {
  let position = 0;

  return seen.every((entry) => { const found = all.indexOf(entry, position); position = found + 1; return found >= 0; });
};

describe("bursty commits: a mount presents the latest state (superseded intermediates may be skipped)", () => {
  it("same view: whatever is presented is in commit order, starts with the draw, ends at the final state; intermediates may be skipped", async () => {
    // Three ways to produce the burst: sequential invokes in one Effect, three invokes started in one turn, three commands from one host event.
    const ways: Array<[string, (t: Awaited<ReturnType<typeof start>>) => Promise<void>]> = [
      ["sequential invokes", (t) => run(Effect.gen(function* () { yield* t.invoke("app/bump"); yield* t.invoke("app/bump"); yield* t.invoke("app/bump"); }))],
      ["one turn", async (t) => { await Promise.all([run(t.invoke("app/bump")), run(t.invoke("app/bump")), run(t.invoke("app/bump"))]); }],
      ["one host event", async (t) => {
        const host = document.createElement("button");

        document.body.append(host);
        host.onclick = () => { for (let count = 0; count < 3; count += 1) { void run(t.invoke("app/bump")); } };
        await userEvent.click(host);
        host.remove();
      }],
    ];

    for (const [name, burst] of ways) {
      const t = await start(1);

      await burst(t);
      await settle();
      expect([name, isSubsequence(t.logs[0]!, ["draw A0", "update A1", "update A2", "update A3"])]).toEqual([name, true]);
      expect(t.logs[0]![0]).toBe("draw A0");
      expect(t.logs[0]!.at(-1)).toBe("update A3");                                        // the last presentation is the last committed state
      expect(label(t.roots[0]!)).toBe("A3");
      expect(await run(t.handle.state)).toEqual({ view: "a", n: 3 });                     // the application committed every one of them
      expect(t.timeline.filter((entry) => entry.startsWith("commit"))).toEqual(["commit bump", "commit bump", "commit bump"]);
      await t.close();
    }
  });

  it("across a view boundary (A1, B1, A1, A2): the final presentation is A2 and a skipped B1 is never an event target; two mounts converge independently", async () => {
    const t = await start(2);

    await run(Effect.gen(function* () { yield* t.invoke("app/bump"); yield* t.invoke("app/toggle"); yield* t.invoke("app/toggle"); yield* t.invoke("app/bump"); }));
    await settle();

    t.logs.forEach((log) => {
      expect(isSubsequence(log, ["draw A0", "update A1", "draw B1", "draw A1", "update A2"])).toBe(true);
      expect(log.at(-1)).toMatch(/A2$/);                                                   // whichever intermediates were skipped, each mount ends on the final state
    });
    expect(t.roots.map(label)).toEqual(["A2", "A2"]);
    expect(await run(t.handle.state)).toEqual({ view: "a", n: 2 });
    expect(t.timeline.filter((entry) => entry.startsWith("commit"))).toEqual(["commit bump", "commit toggle", "commit toggle", "commit bump"]);

    // The drawn render is A's: a click dispatches A's table (the view is whatever was actually drawn), never B's.
    t.roots[0]!.querySelector("button")!.click();
    await settle();
    expect(t.intents.filter((intent) => intent.startsWith("back"))).toEqual(["back-on-a"]);
    await t.close();
  });

  it("an event reported on the drawn render during a burst is dispatched against THAT render's table, even though a newer state (another view) has committed", async () => {
    const t = await start(1);
    const button = t.roots[0]!.querySelector("button")!;

    expect(label(t.roots[0]!)).toBe("A0");
    const toggled = run(t.invoke("app/toggle"));                                           // commit toward B ...
    button.click();                                                                        // ... while A's button is the drawn render's
    await toggled;
    await settle();

    expect(t.intents).toContain("back-on-a");                                              // A's table, by the render the click was reported on
    expect(t.intents).not.toContain("back-on-b");
    expect(t.mounted[0]!.dispatched.map((exit) => exit._tag)).toEqual(["Success"]);
    expect(await run(t.handle.state)).toEqual({ view: "b", n: 10 });                       // its effect is on the one authoritative state
    expect(label(t.roots[0]!)).toBe("B10");                                                // and the final DOM is the final state
    await t.close();
  });

  it("two mounts, a burst of many updates: both converge to exactly the latest state and stay independently live (closing one does not touch the other)", async () => {
    const t = await start(2);

    await run(Effect.forEach(Array.from({ length: 300 }), () => t.invoke("app/bump"), { discard: true }));
    await settle();
    expect(t.roots.map(label)).toEqual(["A300", "A300"]);
    expect(await run(t.handle.state)).toEqual({ view: "a", n: 300 });
    expect(t.logs.every((log) => isSubsequence(log, ["draw A0", ...Array.from({ length: 300 }, (_, index) => `update A${index + 1}`)]))).toBe(true);

    await run(Scope.close(t.scope, Exit.void));                                            // (the application's Scope also holds both mounts)
    t.roots.forEach((root) => { root.remove(); });
  });

  it("DOM-resident state follows the PRESENTED sequence: a skipped round trip A→B→A keeps the elements (and focus); the same round trip presented step by step replaces them", async () => {
    // Skipped: one command commits B then A back to back, so a mount that reaches the stream afterwards reads A and updates A.
    const skipped = await start(1);
    const keep = skipped.roots[0]!.querySelector("button")!;

    keep.focus();
    expect(document.activeElement).toBe(keep);
    await run(skipped.invoke("app/round-trip"));
    await settle();
    expect(skipped.logs[0]).toEqual(["draw A0", "update A0"]);                           // B was never presented, so A→A is an update
    expect(skipped.roots[0]!.querySelector("button")).toBe(keep);                        // same element ...
    expect(document.activeElement).toBe(keep);                                           // ... so the focus the user had is still there
    expect(await run(skipped.handle.state)).toEqual({ view: "a", n: 0 });
    await skipped.close();

    // Presented: the same two commits with the mount reaching each one in between: B is drawn, then A is drawn afresh.
    const presented = await start(1);
    const lost = presented.roots[0]!.querySelector("button")!;

    lost.focus();
    await run(presented.invoke("app/toggle"));
    await settle();
    await run(presented.invoke("app/toggle"));
    await settle();
    expect(presented.logs[0]).toEqual(["draw A0", "draw B0", "draw A0"]);
    expect(presented.roots[0]!.querySelector("button")).not.toBe(lost);                  // a different element ...
    expect(document.activeElement).not.toBe(lost);                                       // ... and the focus did not survive the presented round trip
    await presented.close();
  });
});
