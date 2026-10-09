// The other side of the `firstDone` boundary (M2b was a follower that never ran): the follower RUNS and the first render fails. `mount` and `hydrate` settle with the
// failure's own cause, and never look like an interruption unless the Scope's close won:
//   MESH diagnostics (a state valid for NEXUS, invalid for the program's manifest)  → typed MeshDiagnostics
//   the target's first draw/hydrate throws                                         → that defect
//   the Scope closes at the start                                                  → the interruption, or whichever of the two happened first; never a hang
//   a hydration MISMATCH                                                           → not a failure: the tree is drawn afresh and `hydration` says why
// A failed attempt leaves no follower, target activity or finalizer behind: a fresh attempt on the repaired state succeeds.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Cause, Effect, Exit, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { primitives } from "../src/catalog/web.js";
import { causeOf, definition, run, sleep, type State } from "./render-fixture.js";

type Variant = { readonly kind: "mount" | "hydrate"; readonly initial: State; readonly drawThrows?: boolean; readonly closeAt?: "sync" | "microtask"; readonly html?: string };

const attempt = async (v: Variant) => {
  const doc = new JSDOM(`<!doctype html><body></body>`, { url: "http://localhost/" }).window.document;
  const scope = await run(Scope.make());
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(definition(v.initial)).pipe(Scope.extend(appScope)));
  const container = doc.createElement("main");
  const ops: Array<string> = [];

  container.innerHTML = v.html ?? "";
  doc.body.append(container);
  const factory: Valance.TargetFactory<Valance.HydratableTarget<{ readonly adopted: boolean }>> = (report) => {
    const port = Web.target({ container, primitives })(report);
    const close = () => { void Effect.runPromise(Scope.close(scope, Exit.void)); };

    if (v.closeAt === "sync") { close(); }
    if (v.closeAt === "microtask") { queueMicrotask(close); }

    return {
      draw: (t) => { if (v.drawThrows === true) { throw new Error("draw failed"); } port.draw(t); ops.push("draw"); },
      update: (t) => { port.update(t); ops.push("update"); },
      hydrate: (t) => { if (v.drawThrows === true) { throw new Error("hydrate failed"); } ops.push("hydrate"); return port.hydrate(t); },
      unmount: () => { port.unmount(); ops.push("unmount"); },
    };
  };
  const effect = v.kind === "mount" ? Valance.mount(handle, factory) : Valance.hydrate(handle, factory);
  const exit = await Effect.runPromise(effect.pipe(Scope.extend(scope), Effect.exit, Effect.timeoutTo({ duration: "800 millis", onSuccess: (e) => e as Exit.Exit<unknown, unknown> | "hung", onTimeout: () => "hung" as const })));

  await sleep(40);

  return { exit, ops, container, handle, scope, factory, appScope };
};

for (const kind of ["mount", "hydrate"] as const) {
  describe(`${kind}: the first render fails after the follower started`, () => {
    it("a MESH render failure settles with MESH's typed diagnostics: nothing drawn, no target operation, the container untouched", async () => {
      const r = await attempt({ kind, initial: { n: 0, bad: true } });

      expect(causeOf(r.exit)).toBe("MeshDiagnostics");
      expect(r.ops).toEqual([]);
      expect(r.container.innerHTML).toBe("");
    });

    it("a target whose first draw/hydrate throws settles with that defect (no new error type)", async () => {
      const r = await attempt({ kind, initial: { n: 0, bad: false }, drawThrows: true });

      expect(causeOf(r.exit)).toBe("defect");
      expect(Exit.isFailure(r.exit as Exit.Exit<unknown, unknown>) && Cause.pretty((r.exit as Exit.Exit<unknown, unknown> & { cause: Cause.Cause<unknown> }).cause)).toContain(kind === "mount" ? "draw failed" : "hydrate failed");
      expect(r.ops).toEqual([]);
      expect(r.container.innerHTML).toBe("");
    });

    it("the Scope closing at the same moment as a first-render failure always settles, with the failure's cause or the interruption (which wins is not promised), and does nothing to the target", async () => {
      for (const closeAt of ["sync", "microtask"] as const) {
        for (const failure of ["render", "draw"] as const) {
          const r = await attempt({ kind, initial: { n: 0, bad: failure === "render" }, drawThrows: failure === "draw", closeAt });

          expect(["interrupted", failure === "render" ? "MeshDiagnostics" : "defect"]).toContain(causeOf(r.exit));
          expect(r.ops).toEqual([]);
          expect(r.container.innerHTML).toBe("");
        }
      }
    });

    it("after a failed attempt, a repaired state and a fresh Scope succeed; the failed attempt left nothing behind, and closing its Scope afterwards does nothing", async () => {
      const failed = await attempt({ kind, initial: { n: 0, bad: true } });

      await run(failed.handle.invoke("app/fix", []));
      const fresh = await run(Scope.make());
      const effect = kind === "mount" ? Valance.mount(failed.handle, failed.factory) : Valance.hydrate(failed.handle, failed.factory);
      const exit = await Effect.runPromise(Effect.exit(effect.pipe(Scope.extend(fresh))));

      expect(causeOf(exit)).toBe("success");
      expect(failed.ops).toEqual([kind === "mount" ? "draw" : "hydrate"]);                // only the fresh attempt acted
      await run(failed.handle.invoke("app/bump", []));
      await sleep(40);
      expect(failed.container.querySelector("section")?.getAttribute("aria-label")).toBe("n1");   // and it follows
      const before = [...failed.ops];

      await run(Scope.close(failed.scope, Exit.void));                                 // the failed attempt's Scope: no finalizer was registered, so nothing unmounts
      expect(failed.ops).toEqual(before);
      await run(Scope.close(fresh, Exit.void));
      expect(failed.ops.at(-1)).toBe("unmount");                                       // the fresh one unmounts once
    });
  });
}

describe("hydrate: a mismatch is not a failure", () => {
  it("server HTML for another state hydrates as a mismatch: the tree is drawn afresh, the effect succeeds and says why", async () => {
    const served = await run(renderToHtml(definition({ n: 5, bad: false }), { primitives, state: { n: 5, bad: false } }));
    const r = await attempt({ kind: "hydrate", initial: { n: 0, bad: false }, html: served.html });

    expect(causeOf(r.exit)).toBe("success");
    expect(r.ops).toEqual(["hydrate"]);
    expect(r.container.querySelector("section")?.getAttribute("aria-label")).toBe("n0");   // the client's render, not the server's
    expect((r.exit as Exit.Exit<{ hydration: { adopted: boolean } }, unknown> & { value: { hydration: { adopted: boolean } } }).value.hydration.adopted).toBe(false);
  });
});
