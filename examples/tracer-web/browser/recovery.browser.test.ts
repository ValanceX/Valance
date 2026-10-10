// Stage 10: deliberate recovery after a mount went inert (C31), in real Chromium, public API only. The host closes the failed mount's Scope and
// mounts afresh against the SAME application handle: nothing in Valance retries, remounts or repairs; nothing in the application changes.
import type { HydrationResult } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Scope } from "effect";
import { beforeAll, expect, it } from "vitest";

import { application, following, label, roots, run } from "./inert-fixture.js";
import { primitives } from "../src/catalog/web.js";

beforeAll(async () => { await init(wasmUrl); });

const healthy = (root: Element): Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> => Web.target({ container: root, primitives });

it("a shared invalid state: the mount goes inert; a mount cannot start while the state is invalid; after an ordinary repair command, close → mount again renders the current state and follows", async () => {
  const [root] = roots();

  try {
    const [appScope, firstScope] = await Promise.all([Scope.make(), Scope.make()].map(run));
    const handle = await run(Valance.start(application()).pipe(Scope.extend(appScope!)));
    const first = await run(Valance.mount(handle, healthy(root)).pipe(Scope.extend(firstScope!)));

    await run(handle.invoke("app/break", []));
    await expect.poll(() => following(first)).toBe("failed: diagnostics");
    expect(label(root)).toBe("n0");                                                    // inert, last good DOM

    // While the state is still invalid, a replacement mount fails BY ITSELF (its first render): nothing is mounted, the application is untouched.
    const blocked = await run(Scope.make());
    const attempt = await run(Effect.exit(Valance.mount(handle, healthy(document.createElement("main"))).pipe(Scope.extend(blocked))));

    expect(Exit.isFailure(attempt) && Cause.isFailType(attempt.cause)).toBe(true);     // a typed MESH diagnostic from `mount`
    await run(Scope.close(blocked, Exit.void));
    expect(await run(handle.state)).toEqual({ n: 0, bad: true });

    // The repair is an ordinary application command; the inert mount does not notice it.
    await run(handle.invoke("app/bump", []));
    await run(handle.invoke("app/fix", []));
    expect(await run(handle.state)).toEqual({ n: 1, bad: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(label(root)).toBe("n0");

    // The host's recovery: close the failed mount's Scope, then mount again against the same handle (the same container, now free).
    await run(Scope.close(firstScope!, Exit.void));
    expect(root.innerHTML).toBe("");
    const secondScope = await run(Scope.make());
    const second = await run(Valance.mount(handle, healthy(root)).pipe(Scope.extend(secondScope)));

    expect(label(root)).toBe("n1");                                                    // the current state
    await run(handle.invoke("app/bump", []));
    await expect.poll(() => label(root)).toBe("n2");                                   // and it follows again
    expect(await following(second)).toBe("following");
    expect(await run(handle.state)).toEqual({ n: 2, bad: false });

    await run(Scope.close(appScope!, Exit.void));
    await run(Scope.close(secondScope, Exit.void));
  } finally {
    root.remove();
  }
});

it("several mounts failed by the shared state are recovered one by one; a PORT-local failure is repaired by replacing that mount's target alone, while the other mount carries on", async () => {
  const [rootA, rootB] = roots();

  try {
    const [appScope, scopeA, scopeB] = await Promise.all([Scope.make(), Scope.make(), Scope.make()].map(run));
    const handle = await run(Valance.start(application()).pipe(Scope.extend(appScope!)));
    const mountedA = await run(Valance.mount(handle, healthy(rootA)).pipe(Scope.extend(scopeA!)));
    const mountedB = await run(Valance.mount(handle, healthy(rootB)).pipe(Scope.extend(scopeB!)));

    // Shared state: both go inert; after the repair, A is replaced and B is still inert until it is replaced too.
    await run(handle.invoke("app/break", []));
    await expect.poll(async () => (await Promise.all([following(mountedA), following(mountedB)])).join()).toBe("failed: diagnostics,failed: diagnostics");   // both ended: the invalid state WAS presented (it was not superseded)
    await run(handle.invoke("app/fix", []));
    await run(handle.invoke("app/bump", []));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect([label(rootA), label(rootB)]).toEqual(["n0", "n0"]);
    await run(Scope.close(scopeA!, Exit.void));
    const scopeA2 = await run(Scope.make());
    const mountedA2 = await run(Valance.mount(handle, healthy(rootA)).pipe(Scope.extend(scopeA2)));

    expect([label(rootA), label(rootB)]).toEqual(["n1", "n0"]);                        // each mount is recovered on its own
    await run(handle.invoke("app/bump", []));
    await expect.poll(() => label(rootA)).toBe("n2");
    expect(label(rootB)).toBe("n0");
    await run(Scope.close(scopeB!, Exit.void));
    const scopeB2 = await run(Scope.make());
    const mountedB2 = await run(Valance.mount(handle, healthy(rootB)).pipe(Scope.extend(scopeB2)));

    expect(label(rootB)).toBe("n2");

    // PORT-local: B's target fails to realize an update; only B ends. The host replaces B's target (same application, same container), A never notices.
    let failing = true;
    const flaky = (root: Element): Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> => (report) => {
      const port = Web.target({ container: root, primitives })(report);

      return { draw: (tree) => { port.draw(tree); }, update: (tree) => { if (failing) { throw new Error("the target could not realize the update"); } port.update(tree); }, hydrate: (tree) => port.hydrate(tree), unmount: () => { port.unmount(); } };
    };
    await run(Scope.close(scopeB2, Exit.void));
    const scopeB3 = await run(Scope.make());
    const flakyB = await run(Valance.mount(handle, flaky(rootB)).pipe(Scope.extend(scopeB3)));

    await run(handle.invoke("app/bump", []));
    await expect.poll(() => label(rootA)).toBe("n3");
    await expect.poll(() => following(flakyB)).toBe("failed: defect");
    expect(label(rootB)).toBe("n2");
    expect(await following(mountedA2)).toBe("following");

    failing = false;                                                                    // the host's repair of the target, then its replacement
    await run(Scope.close(scopeB3, Exit.void));
    const scopeB4 = await run(Scope.make());
    await run(Valance.mount(handle, healthy(rootB)).pipe(Scope.extend(scopeB4)));

    expect([label(rootA), label(rootB)]).toEqual(["n3", "n3"]);
    await run(handle.invoke("app/bump", []));
    await expect.poll(() => [label(rootA), label(rootB)]).toEqual(["n4", "n4"]);
    expect(await following(mountedA2)).toBe("following");
    expect(mountedB2).toBeDefined();

    await run(Scope.close(appScope!, Exit.void));
    await run(Scope.close(scopeA2, Exit.void));
    await run(Scope.close(scopeB4, Exit.void));
  } finally {
    rootA.remove();
    rootB.remove();
  }
});
