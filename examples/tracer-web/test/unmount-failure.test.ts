// A mount's final target cleanup fails: `target.unmount()` throws while the mount's Scope closes. The target API is synchronous, so this is a plain defect in the target's own cleanup.
//   Scope.close   runs every finalizer and FAILS with the target's defect (it is not swallowed); finalizers registered in the same Scope still run (the application's, when shared)
//   the mount     its follower had already ended, `unmount` was called exactly once and is still the last target operation, a second close does nothing (no second unmount),
//                 `followed` is unchanged (an inert mount keeps its own cause), no mount activity follows
//   VALANCE's own bookkeeping is NOT a casualty of the target's defect: a closed mount holds no dispatches (C26: `settled` returns at once), whether or not `unmount` threw
//   other mounts and the application are untouched, and a fresh mount recovers
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Layer, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";
import { world } from "./lifecycle-world.js";
import { definition, rig, run, sleep } from "./render-fixture.js";

const shape = (exit: Exit.Exit<unknown, unknown> | "hung"): string => exit === "hung" ? "hung" : Exit.isSuccess(exit) ? "success" : Cause.isDieType(exit.cause) ? `defect ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const bounded = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect.pipe(Effect.exit, Effect.timeoutTo({ duration: "800 millis", onSuccess: (e) => e as Exit.Exit<unknown, unknown> | "hung", onTimeout: () => "hung" as const })));

for (const kind of ["mount", "hydrate"] as const) {
  const first = kind === "mount" ? "draw" : "hydrate";

  describe(`${kind}: unmount throws while the Scope closes`, () => {
    it("Scope.close fails with the target's defect; unmount ran exactly once and last; the follower had ended; a second close does nothing; the application and a fresh mount are unaffected", async () => {
      const r = await rig();
      const m = await r.open(kind, { unmountThrows: () => true });

      await run(r.handle.invoke("app/bump", []));
      await sleep(40);
      expect(shape(await bounded(Scope.close(m.scope, Exit.void)))).toBe("defect unmount failed");
      expect(m.ops).toEqual([first, "update", "unmount"]);                                // exactly one unmount, the last operation
      expect(await r.standing(m.mounted)).toBe("interrupted");                              // the follower ended before the cleanup ran
      expect(shape(await bounded(Scope.close(m.scope, Exit.void)))).toBe("success");       // a Scope's finalizers run once
      await sleep(30);
      expect(m.ops).toEqual([first, "update", "unmount"]);                                 // no second unmount, nothing else

      await run(r.handle.invoke("app/bump", []));                                          // application commands are independent of the mount's cleanup
      expect(await r.state()).toEqual({ n: 2, bad: false });
      const fresh = await r.recovers();

      expect(fresh.text).toBe("n2");
      expect(fresh.followed).toBe("following");
      await fresh.close();
    });
  });
}

describe("unmount throws in other situations", () => {
  it("an inert mount (its follower failed an update) keeps its own cause; closing it with a throwing unmount fails the close with the target's defect and changes nothing else", async () => {
    const r = await rig();
    let unmountThrows = false;
    const m = await r.open("mount", { updateThrows: () => true, unmountThrows: () => unmountThrows });

    await run(r.handle.invoke("app/bump", []));
    await sleep(40);
    expect(await r.standing(m.mounted)).toBe("defect update failed");
    unmountThrows = true;
    expect(shape(await bounded(Scope.close(m.scope, Exit.void)))).toBe("defect unmount failed");
    expect(m.ops).toEqual(["draw", "unmount"]);
    expect(await r.standing(m.mounted)).toBe("defect update failed");                     // `followed` still says why it stopped following
  });

  it("another mount keeps following and the application stays usable when one mount's cleanup fails", async () => {
    const r = await rig();
    const bad = await r.open("mount", { unmountThrows: () => true });
    const good = await r.open("mount");

    expect(shape(await bounded(Scope.close(bad.scope, Exit.void)))).toBe("defect unmount failed");
    await run(r.handle.invoke("app/bump", []));
    await sleep(40);
    expect(good.ops).toEqual(["draw", "update"]);
    expect(good.label()).toBe("n1");
    expect(await r.standing(good.mounted)).toBe("following");
    expect(await r.state()).toEqual({ n: 1, bad: false });
    await good.close();
  });

  it("in a Scope shared with the application, the target's defect propagates out of the close and the application's own finalizers still run", async () => {
    const counts = { acquired: 0, released: 0 };
    const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; }))));
    const shared = await run(Scope.make());
    const handle = await run(Valance.start(definition({ n: 0, bad: false }), { platform }).pipe(Scope.extend(shared)));
    const container = new JSDOM("<!doctype html><body></body>").window.document.createElement("main");
    const ops: Array<string> = [];

    const factory: Valance.TargetFactory<Valance.HydratableTarget<{ readonly adopted: boolean }>> = (report) => {
      const port = Web.target({ container, primitives })(report);

      return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); }, hydrate: (t) => port.hydrate(t), unmount: () => { ops.push("unmount"); throw new Error("unmount failed"); } };
    };

    await run(Valance.mount(handle, factory).pipe(Scope.extend(shared)));
    expect(shape(await bounded(Scope.close(shared, Exit.void)))).toBe("defect unmount failed");
    expect(ops).toEqual(["draw", "unmount"]);
    expect(counts).toEqual({ acquired: 1, released: 1 });                                  // the platform resource was still released
  });

  it("a closed mount holds no dispatches whether or not its unmount threw: `settled` returns at once while the mount's event command is still in flight (C26); the command is the application's and still commits", async () => {
    for (const throws of [false, true]) {
      const w = await world();
      const app = await w.startApp();
      const m = await w.mountIn(app.handle, { unmountThrows: () => throws });

      m.click();
      await until(() => w.log.includes("gated started"));
      expect(shape(await bounded(Scope.close(m.scope, Exit.void)))).toBe(throws ? "defect unmount failed" : "success");
      expect(shape(await bounded(m.mounted.settled))).toBe("success");                      // returns at once, the command still held at its gate
      w.release();
      await until(() => w.log.includes("commit gated"));
      expect(await run(app.handle.state)).toEqual({ path: "/", n: 100 });
      expect(m.mounted.dispatched.map((e) => e._tag)).toEqual(["Success"]);                 // the mount-owned ledger still records the exit
      await app.close();
    }
  });
});
