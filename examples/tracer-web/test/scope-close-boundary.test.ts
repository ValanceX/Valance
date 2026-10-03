// Is `Scope.close` resolution a clean boundary for a mount's and a history's OWN externally observable activity (as it is for application commits)?
//   mount    target operations are synchronous (`void`), so nothing can be suspended INSIDE a draw/update when a Scope closes; what can be in flight is the follower between
//            a wake-up and its target call, which close interrupts and awaits before `unmount`. After the close resolves: no draw, update or unmount.
//   history  `pushState` is synchronous too; close removes the listener and interrupts the follower, including a popstate navigation in flight (an `invoke`, interrupted with
//            its caller), so nothing is written or committed by the follower afterwards.
//   not covered here: an event command a mount dispatched is the APPLICATION's once admitted (C25, lifecycle-races P3).
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Fiber, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";
import { run, sleep, world } from "./lifecycle-world.js";

describe("a mount's Scope.close", () => {
  it("M1 with a presentation pending (a commit just made, at several offsets): no draw, update or unmount follows the close; the application keeps committing; a fresh mount renders the current state", async () => {
    for (const delay of [-1, 0, 1, 3]) {
      const w = await world();
      const app = await w.startApp();
      const m = await w.mountIn(app.handle);

      await run(app.handle.invoke("app/bump", []));
      if (delay >= 0) { await sleep(delay); }
      await m.close();
      const atClose = [...m.ops];

      await sleep(60);
      expect(m.ops).toEqual(atClose);                                                  // nothing after the close resolved
      expect(m.ops.filter((op) => op === "unmount")).toHaveLength(1);
      expect(m.ops.at(-1)).toBe("unmount");                                             // unmount is the last operation the mount ever made
      expect(m.container.innerHTML).toBe("");

      await run(app.handle.invoke("app/bump", []));                                    // the mount's closure prevents no commit
      expect(await run(app.handle.state)).toEqual({ path: "/", n: 2 });
      const fresh = await w.mountIn(app.handle);

      expect(fresh.text()).toBe("n2/");                                                // the authoritative state, not the closed mount's last presentation
      await fresh.close();
      await app.close();
    }
  });

  it("M2 the mount effect is still running when its Scope closes (its first draw pending): draw and unmount, if they happen, happen before the close resolves; nothing after", async () => {
    for (const delay of [0, 1, 3]) {
      const w = await world();
      const app = await w.startApp();
      const container = w.win.document.createElement("main");
      const ops: Array<string> = [];
      const target: Valance.TargetFactory<ReturnType<ReturnType<typeof Web.target>>> = (report) => {
        const port = Web.target({ container, primitives })(report);

        return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
      };
      const scope = await run(Scope.make());
      const mounting = Effect.runFork(Effect.exit(Valance.mount(app.handle, target).pipe(Scope.extend(scope))));

      await sleep(delay);
      await run(Scope.close(scope, Exit.void));
      const atClose = [...ops];

      await Effect.runPromise(Fiber.join(mounting));
      await sleep(60);
      expect(ops).toEqual(atClose);                                                    // no operation after the close resolved
      expect(ops.length === 0 || (ops[0] === "draw" && ops.at(-1) === "unmount")).toBe(true);   // nothing, or a draw that was then unmounted: never a draw left behind
      expect(container.innerHTML).toBe("");
      await app.close();
    }
  });

  /** A mount or hydrate effect over a recording target; `closeWhen` closes the Scope from inside the target factory, i.e. at a controlled point of the mount's own start. */
  const attempt = async (kind: "mount" | "hydrate", closeWhen: "already" | "sync" | "microtask" | "none") => {
    const w = await world();
    const app = await w.startApp();
    const container = w.win.document.createElement("main");
    const ops: Array<string> = [];
    const scope = await run(Scope.make());
    const factory: Valance.TargetFactory<ReturnType<ReturnType<typeof Web.target>> & { hydrate: (tree: never) => unknown }> = (report) => {
      const port = Web.target({ container, primitives })(report);
      const close = () => { void Effect.runPromise(Scope.close(scope, Exit.void)); };

      if (closeWhen === "sync") { close(); }
      if (closeWhen === "microtask") { queueMicrotask(close); }

      return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); }, hydrate: (t) => { ops.push("hydrate"); return port.hydrate(t); }, unmount: () => { port.unmount(); ops.push("unmount"); } };
    };

    if (closeWhen === "already") { await run(Scope.close(scope, Exit.void)); }
    const effect = kind === "mount" ? Valance.mount(app.handle, factory) : Valance.hydrate(app.handle, factory as never);
    const exit = await Effect.runPromise(effect.pipe(Scope.extend(scope), Effect.exit, Effect.timeoutTo({ duration: "1 seconds", onSuccess: (e) => e as Exit.Exit<unknown, unknown> | "hung", onTimeout: () => "hung" as const })));

    await sleep(40);
    const html = container.innerHTML;

    await app.close();

    return { exit, ops, html, scope };
  };

  for (const kind of ["mount", "hydrate"] as const) {
    it(`M2b ${kind} into an already-closed Scope settles with the Scope's interruption instead of hanging; no target operation, nothing drawn`, async () => {
      const { exit, ops, html } = await attempt(kind, "already");

      expect(exit).not.toBe("hung");
      expect(exit !== "hung" && Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true);   // the existing lifecycle signal: what closing a Scope during start already gives
      expect(ops).toEqual([]);                                                          // no draw, update, hydrate or unmount
      expect(html).toBe("");
    });

    it(`M2c ${kind} racing its own Scope's close at the start (same step, next microtask) always settles; if it drew, it was unmounted before the close resolved`, async () => {
      for (const closeWhen of ["sync", "microtask"] as const) {
        const { exit, ops, html } = await attempt(kind, closeWhen);

        expect(exit).not.toBe("hung");
        if (exit !== "hung" && Exit.isFailure(exit)) {
          expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
        }
        expect(ops.length === 0 || (ops[0] === (kind === "mount" ? "draw" : "hydrate") && ops.at(-1) === "unmount")).toBe(true);   // nothing, or a first render that was then unmounted
        expect(html).toBe("");
      }
    });
  }

  it("M2d an open Scope is unchanged: the mount performs its first draw and returns; closing it later unmounts once; a fresh mount afterwards works", async () => {
    const { exit, ops, scope } = await attempt("mount", "none");

    expect(exit !== "hung" && Exit.isSuccess(exit)).toBe(true);
    expect(ops).toEqual(["draw"]);
    await run(Scope.close(scope, Exit.void));
    expect(ops).toEqual(["draw", "unmount"]);

    const again = await attempt("mount", "none");

    expect(again.exit !== "hung" && Exit.isSuccess(again.exit)).toBe(true);
    expect(again.ops).toEqual(["draw"]);
  });
});

describe("a history's Scope.close", () => {
  it("H1 with a push pending (a navigation just committed, at several offsets): any push happens before the close resolves, none after; the listener is gone; a popstate afterwards does nothing; the application keeps navigating", async () => {
    for (const delay of [-1, 0, 1, 3]) {
      const w = await world();
      const app = await w.startApp();
      const history = await w.attachHistory(app.handle);

      await run(app.handle.invoke("app/navigate", [{ value: { path: "/a" } }]));
      if (delay >= 0) { await sleep(delay); }
      await history.close();
      const writesAtClose = [...w.writes];

      await sleep(60);
      expect(w.writes).toEqual(writesAtClose);                                         // nothing written after the close resolved
      expect(w.listeners.size).toBe(0);
      const before = await run(app.handle.state);

      w.win.history.back();
      await sleep(60);
      expect(await run(app.handle.state)).toEqual(before);                             // no listener: the popstate reached nothing
      await run(app.handle.invoke("app/navigate", [{ value: { path: "/b" } }]));       // application commands stay usable
      expect(await run(app.handle.state)).toMatchObject({ path: "/b" });
      expect(w.writes).toEqual(writesAtClose);
      await app.close();
    }
  });

  it("H2 a popstate navigation in flight when history closes is INTERRUPTED with the follower (invoke semantics), unlike a mount's admitted event command (C25): it never commits and nothing is written; a fresh history starts from the current state", async () => {
    const w = await world();
    const app = await w.startApp();
    const history = await w.attachHistory(app.handle, "app/gated-navigate");

    await run(app.handle.invoke("app/navigate", [{ value: { path: "/a" } }]));        // an ordinary navigation (history's own key is the gated one, reached only by popstate)
    await sleep(40);
    const written = [...w.writes];

    w.win.history.back();
    await until(() => w.log.some((entry) => entry.startsWith("gated-navigate started")));
    await history.close();
    expect(w.log.at(-1)).toBe("gated-navigate interrupted");                           // interrupted before the close resolved
    w.releaseHold();
    await sleep(60);
    expect(w.log.filter((entry) => entry.startsWith("commit gated-navigate"))).toEqual([]);   // it never commits
    expect(await run(app.handle.state)).toMatchObject({ path: "/a" });
    expect(w.writes).toEqual(written);
    expect(w.listeners.size).toBe(0);

    await run(app.handle.invoke("app/navigate", [{ value: { path: "/b" } }]));        // while no history is attached
    const fresh = await w.attachHistory(app.handle);

    expect(w.writes).toEqual(written);                                                 // C30: the current state is the baseline, nothing is written at attach
    await run(app.handle.invoke("app/navigate", [{ value: { path: "/c" } }]));
    await sleep(40);
    expect(w.writes).toEqual([...written, "/x/c"]);
    await fresh.close();
    await app.close();
  });
});

describe("an event command admitted before the mount closes", () => {
  it("M3 the close resolves WITHOUT waiting for it; the command is not interrupted, commits afterwards as the application's (C25), and presents nothing through the closed mount", async () => {
    const w = await world();
    const app = await w.startApp();
    const m = await w.mountIn(app.handle);

    m.click();
    await until(() => w.log.includes("gated started"));
    await m.close();
    w.log.push("mount close resolved");
    expect(w.log).not.toContain("gated interrupted");
    w.release();
    await until(() => w.log.includes("commit gated"));
    expect(w.log).toEqual(["gated started", "mount close resolved", "commit gated"]);   // the commit followed the close's resolution: it is the application's, not the mount's
    await sleep(40);
    expect(m.ops).toEqual(["draw n0/", "unmount"]);                                    // nothing was presented through the closed mount
    expect(await run(app.handle.state)).toEqual({ path: "/", n: 100 });
    await app.close();
  });
});
