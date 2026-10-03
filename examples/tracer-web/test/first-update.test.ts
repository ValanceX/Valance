// The first presentation AFTER `Mounted` exists (the first-render boundary is first-render-failure.test.ts): the follower is running, and the first state change arrives.
//   one commit → one update, the follower stays alive and takes the next one
//   the first update's MESH render fails → the follower ends with the typed diagnostics (`followed`), the last good DOM stays, nothing more is presented, a fresh mount recovers
//   the first update's target call throws → the follower ends with that defect, the same properties
//   the mount's Scope closes at the follower / render / target boundary → the mount ends inert and unmounts exactly once, never a hang
//   hydrate behaves like mount after its first render; one mount failing its first update does not touch another
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Cause, Effect, Exit, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { primitives } from "../src/catalog/web.js";
import { definition, run, sleep } from "./render-fixture.js";

type Kind = "mount" | "hydrate";

/** One application, a jsdom document, and `open(kind)`: a mount (or hydrate) in a Scope of its own, over a recording target whose update can be made to throw or to act. */
const rig = async () => {
  const doc = new JSDOM(`<!doctype html><body></body>`, { url: "http://localhost/" }).window.document;
  const hooks: { onScope?: () => void } = {};
  const app = definition({ n: 0, bad: false }, hooks);
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const served = await run(renderToHtml(definition({ n: 0, bad: false }), { primitives, state: { n: 0, bad: false } }));

  const open = async (kind: Kind, options: { readonly updateThrows?: () => boolean; readonly inUpdate?: () => void } = {}) => {
    const container = doc.createElement("main");
    const ops: Array<string> = [];
    const scope = await run(Scope.make());

    container.innerHTML = kind === "hydrate" ? served.html : "";
    doc.body.append(container);
    const factory: Valance.TargetFactory<ReturnType<ReturnType<typeof Web.target>>> = (report) => {
      const port = Web.target({ container, primitives })(report);

      return {
        draw: (t) => { port.draw(t); ops.push("draw"); },
        update: (t) => { options.inUpdate?.(); if (options.updateThrows?.() === true) { throw new Error("update failed"); } port.update(t); ops.push("update"); },
        hydrate: (t) => { ops.push("hydrate"); return port.hydrate(t); },
        unmount: () => { port.unmount(); ops.push("unmount"); },
      };
    };
    const mounted = await run((kind === "mount" ? Valance.mount(handle, factory) : Valance.hydrate(handle, factory)).pipe(Scope.extend(scope)));

    return { container, ops, scope, mounted, label: () => container.querySelector("section")?.getAttribute("aria-label"), close: () => run(Scope.close(scope, Exit.void)) };
  };
  /** How the mount's follower stands: still following, or the shape of its exit. */
  const standing = (mounted: Valance.Mounted<unknown>) => Effect.runPromise(Effect.race(
    Effect.map(mounted.followed, (exit): string => Exit.isSuccess(exit) ? "ended" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isFailType(exit.cause) ? `typed ${(exit.cause.error as { _tag: string })._tag}` : Cause.isDieType(exit.cause) ? `defect ${(exit.cause.defect as Error).message}` : "other"),
    Effect.succeed("following")
  ));
  const recovers = async () => {
    const fresh = await open("mount");

    return { text: fresh.label(), close: fresh.close, followed: await standing(fresh.mounted) };
  };

  return { handle, open, standing, recovers, hooks, appScope, state: () => run(handle.state) };
};

for (const kind of ["mount", "hydrate"] as const) {
  const first = kind === "mount" ? "draw" : "hydrate";

  describe(`${kind}: after a successful first render`, () => {
    it("one state change gives exactly one update, the follower stays alive and takes the next commit", async () => {
      const r = await rig();
      const m = await r.open(kind);

      await run(r.handle.invoke("app/bump", []));
      await sleep(40);
      expect(m.ops).toEqual([first, "update"]);
      expect(m.label()).toBe("n1");
      expect(await r.standing(m.mounted)).toBe("following");
      await run(r.handle.invoke("app/bump", []));
      await sleep(40);
      expect(m.ops).toEqual([first, "update", "update"]);
      expect(m.label()).toBe("n2");
      await m.close();
    });

    it("the first update's MESH render fails: the follower ends with the typed diagnostics, the last good DOM stays, nothing more is presented, the application is usable, a fresh mount recovers", async () => {
      const r = await rig();
      const m = await r.open(kind);

      await run(r.handle.invoke("app/break", []));
      await sleep(60);
      expect(await r.standing(m.mounted)).toBe("typed MeshDiagnostics");
      expect(m.label()).toBe("n0");
      expect(m.ops).toEqual([first]);

      await run(r.handle.invoke("app/fix", []));
      await run(r.handle.invoke("app/bump", []));
      await sleep(60);
      expect(m.ops).toEqual([first]);                                                   // nothing more through this mount
      expect(await r.state()).toEqual({ n: 1, bad: false });                            // the application kept committing
      const recovered = await r.recovers();

      expect(recovered.text).toBe("n1");
      expect(recovered.followed).toBe("following");
      await recovered.close();
      await m.close();
      expect(m.ops).toEqual([first, "unmount"]);                                        // the inert mount still unmounts once, on its own Scope's close
    });

    it("the first update's target call throws: the follower ends with that defect, the last good DOM stays, a fresh mount recovers", async () => {
      const r = await rig();
      let throws = false;
      const m = await r.open(kind, { updateThrows: () => throws });

      throws = true;
      await run(r.handle.invoke("app/bump", []));
      await sleep(60);
      expect(await r.standing(m.mounted)).toBe("defect update failed");
      expect(m.label()).toBe("n0");
      expect(m.ops).toEqual([first]);
      await run(r.handle.invoke("app/bump", []));
      await sleep(40);
      expect(m.ops).toEqual([first]);                                                   // inert
      expect(await r.state()).toEqual({ n: 2, bad: false });
      const recovered = await r.recovers();

      expect(recovered.text).toBe("n2");
      await recovered.close();
      await m.close();
    });

    it("the mount's Scope closing around the first update (before the follower wakes, in the render, in the target call) always ends the mount inert: unmounted exactly once, nothing after the close resolved, never a hang", async () => {
      for (const at of ["before the wake", "in the render", "in the target call"] as const) {
        const r = await rig();
        let closing: Promise<void> | undefined;
        const container: { current?: Awaited<ReturnType<typeof r.open>> } = {};
        const closeNow = () => { closing = container.current!.close(); };
        const m = await r.open(kind, { inUpdate: at === "in the target call" ? closeNow : () => undefined });

        container.current = m;
        if (at === "in the render") { r.hooks.onScope = closeNow; }
        await run(r.handle.invoke("app/bump", []));
        if (at === "before the wake") { await m.close(); } else { await sleep(60); await closing; }
        const atClose = [...m.ops];

        await sleep(60);
        expect(m.ops).toEqual(atClose);                                                  // nothing after the close resolved
        expect(m.ops.filter((op) => op === "unmount")).toHaveLength(1);
        expect(m.ops.at(-1)).toBe("unmount");
        expect(m.ops.slice(0, -1).every((op, index) => op === (index === 0 ? first : "update"))).toBe(true);   // before the unmount: the first render, and at most the one update
        expect(await r.standing(m.mounted)).not.toBe("following");                       // the follower ended: settled
        expect(await r.state()).toEqual({ n: 1, bad: false });
        const recovered = await r.recovers();

        expect(recovered.text).toBe("n1");
        await recovered.close();
      }
    });
  });
}

describe("several mounts", () => {
  it("one mount failing its first update becomes inert while another keeps following the application", async () => {
    const r = await rig();
    let throws = false;
    const failing = await r.open("mount", { updateThrows: () => throws });
    const healthy = await r.open("mount");

    throws = true;
    await run(r.handle.invoke("app/bump", []));
    await sleep(60);
    expect(await r.standing(failing.mounted)).toBe("defect update failed");
    expect(await r.standing(healthy.mounted)).toBe("following");
    expect([failing.label(), healthy.label()]).toEqual(["n0", "n1"]);
    await run(r.handle.invoke("app/bump", []));
    await sleep(40);
    expect([failing.label(), healthy.label()]).toEqual(["n0", "n2"]);                  // the healthy mount carries on; the failed one stays at its last good render
    expect(failing.ops).toEqual(["draw"]);
    expect(healthy.ops).toEqual(["draw", "update", "update"]);
    await failing.close();
    await run(r.handle.invoke("app/bump", []));
    await sleep(40);
    expect(healthy.label()).toBe("n3");
    await healthy.close();
  });
});
