// Stage 45 — a mount's presentation failure (MESH cannot render the state it reached, or its target's draw/update throws) is strictly that mount's: it ends THAT follower and nothing else.
//   application   commands keep admitting and committing, nothing waits for the failed mount, no application-wide "presentation failed" state or error channel exists
//   state stream  keeps delivering every commit;  history keeps following every commit
//   other mounts  keep presenting at their own pace with their own retained render;  each failure is its own boundary
//   the failed mount  is inert on its last SUCCESSFULLY presented render (events still resolve from it, against current state), never resumes; recovery is a fresh mount on the current state
// Application failure (its Scope closing) is a different class: it ends every mount's follower.
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Effect, Exit, Fiber, Scope, Stream } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { boot, run, sleep } from "./two-view-fixture.js";
import { until } from "./helpers.js";

type Booted = Awaited<ReturnType<typeof boot>>;
const settle = () => sleep(60);
/** A mount-and-history world: the stream's every state, and the URLs history wrote. */
const observe = async (b: Booted) => {
  const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/" });
  const pushed: Array<string> = [];
  const push = dom.window.history.pushState.bind(dom.window.history);

  dom.window.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
  const streamed: Array<number> = [];
  const watcher = Effect.runFork(Stream.runForEach(runningOf(b.handle).states, (s) => Effect.sync(() => { streamed.push(s.n); })));
  const scope = await run(Scope.make());

  await run(Web.history(b.handle, { window: dom.window as unknown as Window, urlOf: (s: { readonly n: number }) => `/n${s.n}`, stateOf: () => ({}), navigate: "app/bump" } as never).pipe(Scope.extend(scope)));
  await sleep(20);

  return { pushed, streamed, stop: async () => { await Effect.runPromise(Fiber.interrupt(watcher)); await run(Scope.close(scope, Exit.void)); } };
};

describe("a mount's presentation failure is local", () => {
  it("A/B(target)/D/E/F. a target failure in one mount: it goes inert on its last good render; the application, stream, history and the healthy mount carry on; its events still resolve against current state; a fresh mount recovers", async () => {
    const b = await boot();
    const world = await observe(b);
    let throws = false;
    const failed = await b.mountOn({ updateThrows: () => throws });
    const healthy = await b.mountOn();

    await b.invoke("app/bump");                                          // both present A1
    await settle();
    throws = true;
    await b.invoke("app/bump");                                          // failed's target throws on A2
    await settle();
    expect(await failed.standing()).toBe("defect update failed");
    expect(await healthy.standing()).toBe("following");
    await Promise.all(Array.from({ length: 5 }, () => b.invoke("app/bump")));   // the application keeps committing
    await settle();
    expect((await b.state()).n).toBe(7);
    expect(healthy.label()).toBe("A7");                                  // the healthy mount converged on the latest
    expect(failed.ops).toEqual(["draw A0", "update A1"]);                // the failed mount's last successful presentation
    expect(world.streamed).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);            // the stream delivered every commit
    expect(world.pushed).toEqual(["/n1", "/n2", "/n3", "/n4", "/n5", "/n6", "/n7"]);   // history followed every commit

    failed.click();                                                      // its retained render (A1's button: back-on-a, +10) resolves; the command acts on current state
    await until(() => failed.ledger().length === 1);
    expect(failed.ledger()).toEqual(["succeeded"]);
    await settle();
    expect((await b.state()).n).toBe(17);
    expect(failed.ops).toEqual(["draw A0", "update A1"]);                // and the failed mount did not resume
    expect(healthy.label()).toBe("A17");

    const fresh = await b.mountOn();                                     // recovery: a fresh mount, current state
    expect(fresh.ops).toEqual(["draw A17"]);
    await b.invoke("app/bump");
    await settle();
    expect(fresh.label()).toBe("A18");
    expect(await failed.standing()).toBe("defect update failed");
    await world.stop();
    await Promise.all([failed.close(), healthy.close(), fresh.close()]);
  });

  it("B(MESH). an invalid state fails every mount that renders it, not the application: commits, stream and history go on, inert mounts do not resume on repair, a fresh mount recovers", async () => {
    const b = await boot();
    const world = await observe(b);
    const one = await b.mountOn();
    const two = await b.mountOn();

    await b.invoke("app/break");
    await settle();
    expect([await one.standing(), await two.standing()]).toEqual(["failed MeshDiagnostics", "failed MeshDiagnostics"]);
    await b.invoke("app/fix");
    await Promise.all(Array.from({ length: 3 }, () => b.invoke("app/bump")));   // the application: admits, commits, and has no failure of its own
    await settle();
    expect(await b.state()).toEqual({ view: "a", n: 3, bad: false });
    expect(world.streamed.at(-1)).toBe(3);
    expect(world.pushed.at(-1)).toBe("/n3");
    expect([one.ops, two.ops]).toEqual([["draw A0"], ["draw A0"]]);      // repair revived neither
    const fresh = await b.mountOn();

    expect(fresh.ops).toEqual(["draw A3"]);
    await world.stop();
    await Promise.all([one.close(), two.close(), fresh.close()]);
  });

  it("C. a failure while commands continue: committing never waits for the failing mount's presentation, and the healthy mount keeps progressing", async () => {
    const b = await boot();
    let throws = false;
    const failing = await b.mountOn({ updateThrows: () => throws, onUpdate: () => { if (!throws) { throws = true; Effect.runFork(b.rawInvoke("app/bump")); Effect.runFork(b.rawInvoke("app/bump")); Effect.runFork(b.rawInvoke("app/bump")); } } });
    const healthy = await b.mountOn();

    await b.invoke("app/bump");                                          // failing presents A1 and, in that very presentation, three more commits land; its next presentation throws
    await Promise.all(Array.from({ length: 4 }, () => b.invoke("app/bump")));
    await settle();
    expect((await b.state()).n).toBe(8);
    expect(await failing.standing()).toBe("defect update failed");
    expect(healthy.label()).toBe("A8");
    expect(failing.ops.length).toBe(2);                                  // one update presented (some state between 1 and the latest), then the throw
    expect(failing.ops.at(-1)).not.toBe("update A8");                    // the failed mount holds an earlier render
    await Promise.all([failing.close(), healthy.close()]);
  });

  it("G. several mounts fail independently: each keeps its own last good render and no failure ends another mount's follower", async () => {
    const b = await boot();
    let aThrows = false;
    let bThrows = false;
    const a = await b.mountOn({ updateThrows: () => aThrows });
    const second = await b.mountOn({ updateThrows: () => bThrows });
    const c = await b.mountOn();

    aThrows = true;
    await b.invoke("app/bump");
    await settle();
    bThrows = true;
    await b.invoke("app/bump");
    await settle();
    await b.invoke("app/bump");
    await settle();
    expect(await a.standing()).toBe("defect update failed");
    expect(await second.standing()).toBe("defect update failed");
    expect(await c.standing()).toBe("following");
    expect(a.ops).toEqual(["draw A0"]);                                  // failed at the first presentation
    expect(second.ops).toEqual(["draw A0", "update A1"]);                // failed at the second
    expect(c.ops.at(-1)).toBe("update A3");
    await Promise.all([a.close(), second.close(), c.close()]);
  });

  it("H. application close racing a presentation: nothing commits after Scope.close resolves; a mount may still present a state committed BEFORE the close (the follower drains what the stream delivered, then ends), never a later one, and then ends inert", async () => {
    const b = await boot();
    let closing: Promise<unknown> | undefined;
    const m = await b.mountOn({ onUpdate: () => { closing ??= Effect.runPromise(Scope.close(b.appScope, Exit.void)); } });
    const other = await b.mountOn();

    await b.invoke("app/bump");                                          // m's presentation of A1 starts the application's close
    await closing;
    const atClose = (await b.state()).n;

    await settle();
    expect((await b.state()).n).toBe(atClose);                           // no commit followed the close
    for (const mount of [m, other]) {
      const shown = Number(/A(\d+)/.exec(mount.ops.at(-1)!)![1]);

      expect(shown).toBeLessThanOrEqual(atClose);                        // never a state beyond the last commit (there is none)
      expect(await mount.standing()).toBe("ended");                      // the follower ended with the application (C24)
    }
    await Promise.all([m.close(), other.close()]);
  });
});
