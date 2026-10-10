// Stage 9: what a mount that has stopped following IS, in real Chromium, through the public API only (no `./internal`).
//
//   healthy mount ── a render (or the target) fails ──▶ inert mount + live application
//
// Observed here, not designed: application state after the failure, the other mounts, a fresh mount, and closing the failed mount's Scope.
// Two ways to get there, because they are different owners: a state whose MESH render is invalid (every mount renders the same state, so every
// mount ends), and a PORT target that fails in ONE mount (only that mount ends).
import type { HydrationResult } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Effect, Exit, Scope } from "effect";
import { beforeAll, describe, expect, it } from "vitest";

import { application, following, label, roots, run } from "./inert-fixture.js";
import { primitives } from "../src/catalog/web.js";

beforeAll(async () => { await init(wasmUrl); });

describe("a mount that stopped following", () => {
  it("MESH render failure: every mount ends (they render the same state); the application stays authoritative and alive, nothing recovers by itself, a fresh mount starts from the current state, closing a failed mount touches nothing else", async () => {
    const [rootA, rootB, rootC] = roots();

    try {
      const [appScope, scopeA, scopeB, scopeC] = await Promise.all([Scope.make(), Scope.make(), Scope.make(), Scope.make()].map(run));
      const handle = await run(Valance.start(application()).pipe(Scope.extend(appScope!)));
      const factory = (root: Element): Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> => Web.target({ container: root, primitives });
      const mountedA = await run(Valance.mount(handle, factory(rootA)).pipe(Scope.extend(scopeA!)));
      const mountedB = await run(Valance.mount(handle, factory(rootB)).pipe(Scope.extend(scopeB!)));

      await run(handle.invoke("app/bump", []));
      await expect.poll(() => [label(rootA), label(rootB)]).toEqual(["n1", "n1"]);

      // healthy → inert: the commit whose render is invalid ends BOTH followers; the last good DOM is what remains.
      await run(handle.invoke("app/break", []));
      await expect.poll(() => Promise.all([following(mountedA), following(mountedB)])).toEqual(["failed: diagnostics", "failed: diagnostics"]);
      expect([label(rootA), label(rootB)]).toEqual(["n1", "n1"]);

      // The application is untouched and authoritative: it keeps committing, even to a state that WOULD render; nothing follows it again.
      await run(handle.invoke("app/bump", []));
      await run(handle.invoke("app/fix", []));
      expect(await run(handle.state)).toEqual({ n: 2, bad: false });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect([label(rootA), label(rootB)]).toEqual(["n1", "n1"]);            // no further DOM updates, and no automatic recovery
      expect(await Promise.all([following(mountedA), following(mountedB)])).toEqual(["failed: diagnostics", "failed: diagnostics"]);

      // An event on the inert target still reaches the application (its drawn render is retained), and commits.
      await userEvent.click(rootA.querySelector("button")!);
      await expect.poll(() => mountedA.dispatched.length).toBe(1);
      expect(Exit.isSuccess(mountedA.dispatched[0]!)).toBe(true);
      expect(await run(handle.state)).toEqual({ n: 3, bad: false });
      expect([label(rootA), label(rootB)]).toEqual(["n1", "n1"]);

      // A fresh mount after the application advanced renders the CURRENT state, and follows from there.
      const mountedC = await run(Valance.mount(handle, factory(rootC)).pipe(Scope.extend(scopeC!)));

      expect(label(rootC)).toBe("n3");
      await run(handle.invoke("app/bump", []));
      await expect.poll(() => label(rootC)).toBe("n4");
      expect(await following(mountedC)).toBe("following");

      // Closing a failed mount disposes that mount only.
      await run(Scope.close(scopeA!, Exit.void));
      expect(rootA.innerHTML).toBe("");
      expect(label(rootB)).toBe("n1");                                        // the other failed mount is as it was
      await run(handle.invoke("app/bump", []));
      await expect.poll(() => label(rootC)).toBe("n5");                       // the healthy mount carries on
      expect(await run(handle.state)).toEqual({ n: 5, bad: false });
      expect(await following(mountedC)).toBe("following");

      await run(Scope.close(appScope!, Exit.void));                           // closing the application is still clean, with a failed mount open
      await run(Scope.close(scopeB!, Exit.void));
      await run(Scope.close(scopeC!, Exit.void));
      expect([rootB.innerHTML, rootC.innerHTML]).toEqual(["", ""]);
    } finally {
      rootA.remove(); rootB.remove(); rootC.remove();
    }
  });

  it("PORT target failure in ONE mount: only that mount ends; the other mount and the application are unaffected, and the failed mount's Scope closes cleanly", async () => {
    const [rootA, rootB, rootC] = roots();

    try {
      const [appScope, scopeA, scopeB, scopeC] = await Promise.all([Scope.make(), Scope.make(), Scope.make(), Scope.make()].map(run));
      const handle = await run(Valance.start(application()).pipe(Scope.extend(appScope!)));
      let failing = false;
      // A target that fails to realize an update: PORT's failure, in this mount alone. A wrapper over the public `TargetFactory`; PORT is otherwise real.
      const flaky = (root: Element): Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> => (report) => {
        const port = Web.target({ container: root, primitives })(report);

        return { draw: (tree) => { port.draw(tree); }, update: (tree) => { if (failing) { throw new Error("the target could not realize the update"); } port.update(tree); }, hydrate: (tree) => port.hydrate(tree), unmount: () => { port.unmount(); } };
      };
      const mountedA = await run(Valance.mount(handle, flaky(rootA)).pipe(Scope.extend(scopeA!)));
      const mountedB = await run(Valance.mount(handle, Web.target({ container: rootB, primitives })).pipe(Scope.extend(scopeB!)));

      failing = true;
      await run(handle.invoke("app/bump", []));
      await expect.poll(() => label(rootB)).toBe("n1");                       // the healthy mount followed
      await expect.poll(() => following(mountedA)).toBe("failed: defect");    // the failing one ended, as a defect: PORT's, not MESH's
      expect(label(rootA)).toBe("n0");                                        // last good DOM
      expect(await following(mountedB)).toBe("following");

      await run(handle.invoke("app/bump", []));
      await expect.poll(() => label(rootB)).toBe("n2");                       // B keeps following; A stays inert
      expect(label(rootA)).toBe("n0");
      expect(await run(handle.state)).toEqual({ n: 2, bad: false });

      await run(Scope.close(scopeA!, Exit.void));
      expect(rootA.innerHTML).toBe("");
      await run(handle.invoke("app/bump", []));
      await expect.poll(() => label(rootB)).toBe("n3");
      const mountedC = await run(Valance.mount(handle, Web.target({ container: rootC, primitives })).pipe(Scope.extend(scopeC!)));

      expect(label(rootC)).toBe("n3");
      expect(await Promise.all([following(mountedB), following(mountedC)])).toEqual(["following", "following"]);
      await run(Scope.close(appScope!, Exit.void));
      await run(Scope.close(scopeB!, Exit.void));
      await run(Scope.close(scopeC!, Exit.void));
    } finally {
      rootA.remove(); rootB.remove(); rootC.remove();
    }
  });
});
