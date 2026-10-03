// Lifecycle tripwires (constraint C6, C7): who creates, who owns the lifetime, what the caller sees.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { handleOf, runningOf, type Running, type Viewed } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Clock, Effect, Exit, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { application, primitives } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { load, until } from "./helpers.js";

// A complete Clock (sleep included) that reads `n`.
const fixed = (n: number): Clock.Clock => {
  const base = Clock.make();

  return Object.assign(Object.create(Object.getPrototypeOf(base) as object) as Clock.Clock, base, { currentTimeMillis: Effect.succeed(n), unsafeCurrentTimeMillis: () => n });
};
const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.setClock(fixed(42)));

const clickHandler = (viewed: Viewed): string => (viewed.render.tree.root as unknown as { children: ReadonlyArray<{ events: { click: string } }> }).children[1]!.events.click;

describe("lifecycle", () => {
  it("platform services reach application behavior, and never the caller (NEXUS I44, through Valance)", async () => {
    const app = application(await compilePrograms());
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
    const app = application(await compilePrograms());
    const page = load("");
    let out!: { running: Running<unknown, unknown>; mounted: Valance.Mounted<unknown> };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);
      const mounted = yield* Valance.mount(handle, Web.target({ container: page.container, primitives }));
      out = { running: runningOf(handle) as never, mounted: mounted as never };

      expect(page.container.querySelector("button")).not.toBeNull();
    })));

    expect(page.container.innerHTML).toBe("");
    // Valance's own finalizer stopped the follower: interrupted, not completed.
    expect(Exit.isInterrupted(await Effect.runPromise(out.mounted.followed))).toBe(true);
    expect(await Effect.runPromise(Nexus.Application.status(out.running.nexus))).toEqual({ _tag: "Stopped" });
  });

  // SUBSTRATE-LEVEL, outside the VALANCE model (Stage 14). The owner scope is the application's only lifetime; nothing in
  // VALANCE asks an application to end early. This pins a TOLERANCE, not a promise: if NEXUS ends the application while the
  // scope is open (reachable only through `running.nexus`), the follower ends cleanly and the target is left for the scope.
  it("substrate: if NEXUS ends the application while the scope is open, the follower ends cleanly and the target stays until the scope closes", async () => {
    const app = application(await compilePrograms());
    const page = load("");

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);
      const mounted = yield* Valance.mount(handle, Web.target({ container: page.container, primitives }));

      yield* Nexus.Application.shutdown(runningOf(handle).nexus);

      expect(Exit.isSuccess(yield* mounted.followed)).toBe(true);
      expect(page.container.querySelector("button")).not.toBeNull();
    })));
  });

  it("a commit between subscription and first render is not lost (NEXUS `values`)", async () => {
    const app = application(await compilePrograms());
    const page = load("");

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);
      const running = runningOf(handle);
      const initial = yield* running.render;
      let committed = false;
      // The host's first element arrives (subscription made, first render about to be produced), and a click commits.
      const racing = handleOf({ ...running, values: Stream.tap(running.values, () => Effect.suspend(() => {
        if (committed) {
          return Effect.void;
        }

        committed = true;

        return running.dispatch(initial, clickHandler(initial)).pipe(Effect.orDie, Effect.asVoid);
      })) });
      yield* Valance.mount(racing, Web.target({ container: page.container, primitives }));
      yield* Effect.promise(() => until(() => page.container.textContent!.startsWith("1 clicks")));

      expect((yield* running.state).count).toBe(1);
    })));
  });

  it("initial render + immediate state change never leaves state 1 and DOM 0 (repeated, at several offsets)", async () => {
    const app = application(await compilePrograms());
    let stale = 0;
    let runs = 0;

    for (const offset of [-1, 0, 1, 2, 4]) {
      for (let i = 0; i < 20; i += 1) {
        const page = load("");
        runs += 1;
        await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
          const handle = yield* Valance.start(app);
          const running = runningOf(handle);
          const initial = yield* running.render;
          const commit = () => { void Effect.runPromise(running.dispatch(initial, clickHandler(initial))); };

          if (offset < 0) {
            commit();
          } else {
            setTimeout(commit, offset);
          }

          yield* Valance.mount(handle, Web.target({ container: page.container, primitives }));
          yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 25)));
          const { count } = yield* running.state;

          if (!page.container.textContent!.startsWith(`${count} clicks`)) {
            stale += 1;
          }
        })));
      }
    }

    expect(runs).toBe(100);
    expect(stale).toBe(0);
  }, 30_000);
});
