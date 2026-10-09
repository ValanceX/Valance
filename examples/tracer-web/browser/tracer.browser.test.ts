// The tracer in Chromium, through @valancex/valance, one application with two MESH programs:
//   server HTML for a request path (from Node, ./setup.ts) → page → Valance.start (MESH runtime in WebAssembly, init() here)
//   → hydrate (PORT Web) → real clicks through Chromium's input pipeline → MESH intent → NEXUS command → state
//   → render → PORT update in place, or draw afresh when the click changed the program.
import type { HydrationResult } from "@valancex/port-web";

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

const container = (html: string): HTMLElement => {
  const main = document.createElement("main");
  main.innerHTML = html;
  document.body.append(main);

  return main;
};

const recording = (root: Element, operations: Array<string>): Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> => (report) => {
  const port = Web.target({ container: root, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => { operations.push("hydrate"); return port.hydrate(tree); },
    unmount: () => { port.unmount(); },
  };
};

it("hydrates the server's /about in Chromium, then real clicks cross the program boundary with the state intact", async () => {
  const main = container(page.about.html);
  const serverSection = main.firstElementChild;
  const operations: Array<string> = [];
  const callerClocks: Array<number> = [];
  const observe = Effect.flatMap(Clock.currentTimeMillis, (t) => Effect.sync(() => { callerClocks.push(t); }));
  const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.setClock(fixed(42)));
  const button = (index: number) => main.querySelectorAll("button")[index]!;
  const press = (index: number, expected: string) => Effect.promise(async () => {
    await userEvent.click(button(index));
    await expect.poll(() => main.textContent).toContain(expected);
  });

  const seen = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const running = yield* Valance.start(application(page.programs), { platform, state: page.about.state });
    const mounted = yield* Valance.hydrate(running, recording(main, operations));
    const sections: Array<Element | null> = [main.firstElementChild];

    expect(mounted.hydration).toEqual({ adopted: true });
    expect(main.textContent).toBe("About Tracer: 3 clickstab: detailsBack");

    yield* press(0, "3 clicks, last at 0");          // Back → counter program; the state (3) came from the server
    sections.push(main.firstElementChild);
    yield* press(0, "4 clicks, last at 42");         // behavior ran under the platform's Clock
    sections.push(main.firstElementChild);
    yield* press(1, "About Tracer: 4 clicks");       // → about program again; the count crossed the switch
    sections.push(main.firstElementChild);
    yield* mounted.settled;
    yield* observe;

    return { sections, state: yield* running.state, dispatched: mounted.dispatched.length };
  })));
  await Effect.runPromise(observe);

  expect(operations).toEqual(["hydrate", "draw", "update", "draw"]);
  expect(seen.sections[0]).toBe(serverSection);                 // adopted
  expect(seen.sections[1]).not.toBe(seen.sections[0]);          // another program: drawn afresh
  expect(seen.sections[2]).toBe(seen.sections[1]);              // same program: updated in place
  expect(seen.sections[3]).not.toBe(seen.sections[2]);
  expect(seen.state).toMatchObject({ count: 4, path: "/about", stamp: 42 });
  expect(seen.dispatched).toBe(3);
  expect(callerClocks.every((t) => t !== 42)).toBe(true);
});

it("hydrates the server's / too, and its About click draws the other program", async () => {
  const main = container(page.home.html);
  const operations: Array<string> = [];

  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const running = yield* Valance.start(application(page.programs), { state: page.home.state });
    const mounted = yield* Valance.hydrate(running, recording(main, operations));

    expect(mounted.hydration).toEqual({ adopted: true });
    yield* Effect.promise(async () => {
      await userEvent.click(main.querySelectorAll("button")[1]!);
      await expect.poll(() => main.textContent).toBe("About Tracer: 0 clickstab: overviewBack");
    });
  })));

  expect(operations).toEqual(["hydrate", "draw"]);
});
