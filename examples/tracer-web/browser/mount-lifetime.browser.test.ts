// Stage 38: whose lifetime is a mount's? One real mount in Chromium (real PORT web target, real clicks), placed in its OWN Scope, independent
// of the application's. The sequence: application alive -> mount alive -> close one mount (application stays usable, a new mount draws the
// current state) -> close the application -> observe the surviving mount -> try events/commands -> finally close the mount's own Scope.
import type { HydrationResult } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Cause, Effect, Exit, Scope } from "effect";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { application, type AppState } from "../src/catalog/app.js";
import { primitives } from "../src/catalog/web.js";

const { catalog } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const names = (root: Element) => [...root.querySelectorAll("div span")].map((span) => span.textContent);
const reverse = (root: Element) => [...root.querySelectorAll("button")].find((button) => button.textContent === "Reverse")!;

describe("mount lifetime, in Chromium, with independent Scopes", () => {
  it("a mount follows its OWN Scope: it survives another mount closing, and it outlives the application as a drawn, inert page until its Scope closes", async () => {
    const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
    const rootA = document.createElement("main");
    const rootB = document.createElement("main");

    document.body.append(rootA, rootB);

    try {
      const state: AppState = { view: "home", items: [{ id: "A", name: "Alpha" }, { id: "B", name: "Beta" }] };
      const appScope = await run(Scope.make());
      const scopeA = await run(Scope.make());
      const scopeB = await run(Scope.make());
      const handle = await run(Valance.start(application(catalog), { state }).pipe(Scope.extend(appScope)));
      const target = (root: Element): Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> => (report) => Web.target({ container: root, primitives })(report);

      // 1. application alive, mount A alive: a real click reaches the application and the page follows.
      const mountedA = await run(Valance.mount(handle, target(rootA)).pipe(Scope.extend(scopeA)));

      expect(names(rootA)).toEqual(["Alpha", "Beta"]);
      await userEvent.click(reverse(rootA));
      await expect.poll(() => names(rootA)).toEqual(["Beta", "Alpha"]);
      expect(mountedA.dispatched.map(show)).toEqual(["succeeded"]);

      // 2. close mount A: the application is untouched and fully usable; a new mount B draws the current state.
      await run(Scope.close(scopeA, Exit.void));
      expect(rootA.innerHTML).toBe("");                                                         // A's target is gone
      await run(handle.invoke("app/changeItems", [{ value: [{ id: "C", name: "Gamma" }, { id: "D", name: "Delta" }] as never }]));
      expect((await run(handle.state)).items.map((item) => item.id)).toEqual(["C", "D"]);
      const mountedB = await run(Valance.mount(handle, target(rootB)).pipe(Scope.extend(scopeB)));

      expect(names(rootB)).toEqual(["Gamma", "Delta"]);

      // 3. close the APPLICATION; mount B's own Scope stays open.
      await run(Scope.close(appScope, Exit.void));
      expect(names(rootB)).toEqual(["Gamma", "Delta"]);                                          // still drawn: nothing unmounted it
      expect(show(await run(mountedB.followed) as never)).toBe("succeeded");                     // the follower ended because the application ended (the documented outcome)
      expect((await run(handle.state)).items.map((item) => item.id)).toEqual(["C", "D"]);        // state is still readable

      // 5. events and commands after the application ended: reported, reach admission, refused; nothing changes.
      await userEvent.click(reverse(rootB));
      await expect.poll(() => mountedB.dispatched.length).toBe(1);
      expect(mountedB.dispatched.map(show)).toEqual(["died: NEXUS: the runtime has begun terminating"]);
      expect(show(await run(Effect.exit(handle.invoke("app/changeItems", [{ value: [] as never }]))) as never)).toBe("died: NEXUS: the runtime has begun terminating");
      expect(names(rootB)).toEqual(["Gamma", "Delta"]);                                          // inert: the page did not change

      // 6. finally close the mount's own Scope: it releases its target, cleanly, once.
      await run(Scope.close(scopeB, Exit.void));
      expect(rootB.innerHTML).toBe("");
    } finally {
      rootA.remove();
      rootB.remove();
    }
  });
});
