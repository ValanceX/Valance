// The tracer in Chromium, through @valancex/valance:
//   server HTML (from Node, ./setup.ts) → page → Valance.start (MESH runtime in WebAssembly, init() here)
//   → hydrate (PORT Web) → a real click through Chromium's input pipeline → MESH intent → NEXUS command
//   → state → render → PORT update, in place.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Clock, Effect, Layer } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

import { application, primitives } from "../src/app.js";

const page = inject("page");

beforeAll(async () => { await init(wasmUrl); });

// A complete Clock (sleep included) that reads `n`.
const fixed = (n: number): Clock.Clock => {
  const base = Clock.make();

  return Object.assign(Object.create(Object.getPrototypeOf(base) as object) as Clock.Clock, base, { currentTimeMillis: Effect.succeed(n), unsafeCurrentTimeMillis: () => n });
};

it("hydrates the server's HTML in Chromium, then a real click updates it in place", async () => {
  const container = document.createElement("main");
  container.innerHTML = page.html;
  document.body.append(container);
  const serverSection = container.firstElementChild;
  const serverSpan = container.querySelector("span");
  const callerClocks: Array<number> = [];
  const observe = Effect.flatMap(Clock.currentTimeMillis, (t) => Effect.sync(() => { callerClocks.push(t); }));
  const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.setClock(fixed(42)));

  const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const running = yield* Valance.start(application(page.program), { platform, state: page.state });
    const mounted = yield* Valance.hydrate(running, Web.target({ container, primitives }));

    expect(mounted.hydration).toEqual({ adopted: true });
    expect(container.textContent).toBe("0 clicks, last at 0Click");

    yield* Effect.promise(() => userEvent.click(container.querySelector("button")!));
    yield* mounted.settled;
    yield* Effect.promise(async () => { await expect.poll(() => container.textContent).toBe("1 clicks, last at 42Click"); });
    yield* observe;

    return { sameSection: container.firstElementChild === serverSection, sameSpan: container.querySelector("span") === serverSpan, dispatched: mounted.dispatched.length };
  })));
  await Effect.runPromise(observe);

  expect(result).toEqual({ sameSection: true, sameSpan: true, dispatched: 1 });
  expect(callerClocks.every((t) => t !== 42)).toBe(true);
  expect(container.innerHTML).toBe("");
});
