// Stage 49 — the lifetime matrix. Three caller-owned Scopes over one application: A (application: runtime, state, command admission), M (a mount: its follower and target),
// H (a history: its listener and follower). Each close ends exactly what that Scope owns and nothing else; none is a child of another, and no close creates an application lifetime.
//   M or H closing   leaves A and every other mount/history alone (the application may live with none);   A closing   does not close M or H: mounts end inert (their followers end),
//   a history keeps its listener (refusing popstate) until H closes; each of M and H can still be closed independently afterwards, at its own boundary
import { Effect, Exit, Logger, Scope } from "effect";
import * as Web from "@valancex/valance/web";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { boot, run, sleep } from "./structure-fixture.js";

type Booted = Awaited<ReturnType<typeof boot>>;
const closeApp = (b: Booted) => Effect.runPromise(Scope.close(b.appScope, Exit.void));
const world = () => {
  const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/n0" });
  const pushed: Array<string> = [];
  const logs: Array<string> = [];
  const push = dom.window.history.pushState.bind(dom.window.history);

  dom.window.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
  const logger = Logger.replace(Logger.defaultLogger, Logger.make(({ message }) => { logs.push(String(message)); }));

  return { win: dom.window, pushed, logs, logger };
};
type World = ReturnType<typeof world>;
const history = async (b: Booted, w: World) => {
  const scope = await run(Scope.make());

  await run(Web.history(b.handle, { window: w.win as unknown as Window, urlOf: (s: { readonly n: number }) => `/n${s.n}`, stateOf: () => ({}), navigate: "app/bump" } as never).pipe(Effect.provide(w.logger), Scope.extend(scope)));
  await sleep(30);                                                       // the baseline (the first state) is taken asynchronously

  return { scope, close: () => run(Scope.close(scope, Exit.void)) };
};
const popstate = async (w: World) => { w.win.history.pushState(null, "", "/foreign"); w.pushed.length = 0; w.win.history.back(); await sleep(60); };
const settle = () => sleep(50);

describe("each Scope closes only what it owns", () => {
  it("A. a mount closing first: the application lives and commits, another mount is untouched, a fresh mount starts from the current state", async () => {
    const b = await boot();
    const first = await b.mountOn();
    const other = await b.mountOn();

    await b.invoke("app/bump");
    await settle();
    await first.close();
    await b.invoke("app/bump");                                          // the application is alive
    await settle();
    expect((await b.state()).n).toBe(2);
    expect(first.ops).toEqual(["draw", "update", "unmount"]);            // nothing after the close
    expect(other.title()).toBe("A2");                                    // the other mount went on presenting
    const fresh = await b.mountOn();

    expect(fresh.ops).toEqual(["draw"]);
    expect(fresh.title()).toBe("A2");
    await Promise.all([other.close(), fresh.close()]);
  });

  it("B. a history closing first: no more history handling, the application and another history are untouched, a fresh history takes the current state as its baseline", async () => {
    const b = await boot();
    const w = world();
    const first = await history(b, w);
    const other = await history(b, w);

    await first.close();
    await b.invoke("app/bump");
    await settle();
    expect(w.pushed).toEqual(["/n1"]);                                   // once: only the other history is left
    await popstate(w);
    expect((await b.state()).n).toBe(2);                                 // handled once, by the other history (the application is alive)
    await other.close();
    w.logs.length = 0;
    await popstate(w);
    expect((await b.state()).n).toBe(2);                                 // none left: no handling
    const fresh = await history(b, w);

    expect(w.pushed).toEqual([]);                                        // baseline = current state: nothing written for attaching
    await b.invoke("app/bump");
    await settle();
    expect(w.pushed).toEqual(["/n3"]);
    expect(w.logs).toEqual([]);
    await fresh.close();
  });

  it("C. the application closing first: mount and history are not closed by it; the mount ends inert, the history keeps its listener and refuses popstate; each then closes at its own boundary", async () => {
    const b = await boot();
    const w = world();
    const m = await b.mountOn();
    const h = await history(b, w);

    await b.invoke("app/bump");
    await settle();
    await closeApp(b);
    await settle();
    expect(await m.standing()).toBe("ended");                            // inert, not unmounted
    expect(m.ops).toEqual(["draw", "update"]);
    expect(m.title()).toBe("A1");
    expect((await b.state()).n).toBe(1);                                 // readable
    await popstate(w);
    expect(w.logs).toEqual(["popstate navigation failed"]);              // the history's listener is alive and its refusal contained
    expect((await b.state()).n).toBe(1);
    expect(w.pushed).toEqual([]);
    await m.close();
    expect(m.ops).toEqual(["draw", "update", "unmount"]);                // the mount's own boundary
    await popstate(w);
    expect(w.logs.length).toBe(2);                                       // still listening: the mount's close did not touch it
    await h.close();
    await popstate(w);
    expect(w.logs.length).toBe(2);                                       // the history's own boundary
  });

  it("D. closing every mount and history leaves the application alive: commits succeed with no presentation or history work, and new consumers start from the current state", async () => {
    const b = await boot();
    const w = world();
    const m = await b.mountOn();
    const h = await history(b, w);

    await Promise.all([m.close(), h.close()]);
    await b.invoke("app/bump");
    await b.invoke("app/bump");
    await settle();
    expect((await b.state()).n).toBe(2);
    expect(m.ops).toEqual(["draw", "unmount"]);
    expect(w.pushed).toEqual([]);
    const m2 = await b.mountOn();
    const h2 = await history(b, w);

    expect(m2.ops).toEqual(["draw"]);
    expect(m2.title()).toBe("A2");
    expect(w.pushed).toEqual([]);                                        // baseline: the current state, nothing written
    await b.invoke("app/bump");
    await settle();
    expect(w.pushed).toEqual(["/n3"]);
    expect(m2.title()).toBe("A3");
    await Promise.all([m2.close(), h2.close()]);
  });

  it("E. an application with no mount and no history is a pure application lifetime: it commits, closes, and its state stays readable", async () => {
    const b = await boot();

    await b.invoke("app/bump");
    await closeApp(b);
    expect((await b.state()).n).toBe(1);
    const refused = await Effect.runPromise(Effect.exit(b.rawInvoke("app/bump")));

    expect(Exit.isFailure(refused)).toBe(true);
    expect((await b.state()).n).toBe(1);
  });

  it("F. repeated attach and detach: every consumer is independent and starts from the current state", async () => {
    const b = await boot();
    const w = world();

    for (let round = 1; round <= 3; round += 1) {
      const m = await b.mountOn();
      const h = await history(b, w);

      expect(m.ops).toEqual(["draw"]);
      expect(m.title()).toBe(`A${round - 1}`);
      await b.invoke("app/bump");
      await settle();
      expect(m.title()).toBe(`A${round}`);
      await Promise.all([m.close(), h.close()]);
    }
    expect((await b.state()).n).toBe(3);
  });

  it("G. the application's close racing a mount's close: both complete, the mount is unmounted exactly once and nothing is presented after its close resolved, no commit follows the application's", async () => {
    for (let round = 0; round < 3; round += 1) {
      const b = await boot();
      const m = await b.mountOn();

      await b.invoke("app/bump");
      const closing = Promise.all([closeApp(b), m.close()]);

      await closing;
      const atClose = [...m.ops];
      const state = await b.state();

      await settle();
      expect(m.ops).toEqual(atClose);                                    // nothing after the mount's close resolved
      expect(atClose.filter((op) => op === "unmount")).toEqual(["unmount"]);
      expect(atClose.at(-1)).toBe("unmount");
      expect(await b.state()).toEqual(state);                            // no commit after the application's
    }
  });
});
