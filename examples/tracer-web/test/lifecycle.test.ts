// Lifecycle tripwires (constraint C6, C7): who creates, who owns the lifetime, what the caller sees.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Clock, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { application, primitives } from "../src/app.js";
import { compileProgram } from "../src/compile.js";
import { load, until } from "./helpers.js";

// A complete Clock (sleep included) that reads `n`.
const fixed = (n: number): Clock.Clock => {
  const base = Clock.make();

  return Object.assign(Object.create(Object.getPrototypeOf(base) as object) as Clock.Clock, base, { currentTimeMillis: Effect.succeed(n), unsafeCurrentTimeMillis: () => n });
};
const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.setClock(fixed(42)));

const clickHandler = (render: Nexus.Mesh.Render): string => (render.tree.root as unknown as { children: ReadonlyArray<{ events: { click: string } }> }).children[1]!.events.click;

describe("lifecycle", () => {
  it("platform services reach application behavior, and never the caller (NEXUS I44, through Valance)", async () => {
    const app = application(await compileProgram());
    const page = load("");
    const callerClocks: Array<number> = [];
    const observe = Effect.flatMap(Clock.currentTimeMillis, (t) => Effect.sync(() => { callerClocks.push(t); }));

    const stamp = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      yield* observe;
      const running = yield* Valance.start(app, { platform });
      const mounted = yield* Valance.mount(running, Web.target({ container: page.container, primitives }));
      yield* observe;
      page.click(page.container.querySelector("button")!);
      yield* mounted.settled;
      yield* observe;

      return (yield* running.state).stamp;
    })));
    await Effect.runPromise(observe);

    expect(stamp).toBe(42);
    expect(callerClocks).toHaveLength(4);
    expect(callerClocks.every((t) => t !== 42)).toBe(true);
  });

  it("closing the caller's scope ends Valance's follower, unmounts the target, then ends the application", async () => {
    const app = application(await compileProgram());
    const page = load("");
    let out!: { running: Valance.Running<unknown, unknown, never>; mounted: Valance.Mounted<unknown> };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app);
      const mounted = yield* Valance.mount(running, Web.target({ container: page.container, primitives }));
      out = { running: running as never, mounted: mounted as never };

      expect(page.container.querySelector("button")).not.toBeNull();
    })));

    expect(page.container.innerHTML).toBe("");
    // Valance's own finalizer stopped the follower: interrupted, not completed.
    expect(Exit.isInterrupted(await Effect.runPromise(out.mounted.followed))).toBe(true);
    expect(await Effect.runPromise(Nexus.Application.status(out.running.nexus))).toEqual({ _tag: "Stopped" });
  });

  it("Application.shutdown ends the render follower cleanly; the target stays until the scope closes", async () => {
    const app = application(await compileProgram());
    const page = load("");

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app);
      const mounted = yield* Valance.mount(running, Web.target({ container: page.container, primitives }));

      yield* Nexus.Application.shutdown(running.nexus);

      expect(Exit.isSuccess(yield* mounted.followed)).toBe(true);
      expect(page.container.querySelector("button")).not.toBeNull();
    })));
  });

  it("a commit during the first render is not lost (NEXUS `renders` is future-only)", async () => {
    const app = application(await compileProgram());
    const page = load("");

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app);
      const initial = yield* running.render;
      // The first render is taken (so it reflects 0 clicks), and THEN a commit lands, before anything is drawn.
      const gated: typeof running = { ...running, render: Effect.gen(function* () {
        const stale = yield* running.render;
        yield* Effect.promise(() => Nexus.Runtime.run(running.nexus.runtime, running.host.dispatch(initial, clickHandler(initial))));

        // Long enough for the follower to deliver that commit's render before the first draw: the held path.
        yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 30)));

        return stale;
      }) };
      const mounted = yield* Valance.mount(gated, Web.target({ container: page.container, primitives }));
      yield* Effect.promise(() => until(() => page.container.textContent!.startsWith("1 clicks")));

      expect(mounted.dispatched).toEqual([]);
    })));
  });
});
