// URL ↔ application state, in Chromium, with real clicks and real history traversal.
//
//   user navigation:  click → MESH intent → NEXUS navigate command → path state → view(path) → history.pushState
//   browser Back/Fwd: popstate → the SAME navigate command (via Valance's binding table) → path state → view(path)
//
// One Valance.start, one NEXUS application, one state, one platform lifetime, two MESH programs. The harness cannot
// load this page at an arbitrary URL, so `replaceState` stands in for "the server served this URL"; the server HTML
// for each path comes from ./setup.ts.
import type { WebPort } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Effect, Fiber, Layer, Stream } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

import { Navigated, application, primitives, stateFor } from "../src/app.js";

const page = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const container = (html: string): HTMLElement => {
  const main = document.createElement("main");
  main.innerHTML = html;
  document.body.append(main);

  return main;
};

const recording = (root: Element, operations: Array<string>): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container: root, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => { operations.push("hydrate"); return port.hydrate(tree); },
    unmount: () => { port.unmount(); },
  };
};

/** A platform whose one scoped resource counts its acquisition and release: the application's lifetime, observed. */
const countingPlatform = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(new Map()),
    Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
  );

  return { platform, counts };
};

/** Starts the application at the URL the "server" served, hydrates, and keeps URL and path in step. */
const run = async <A>(served: typeof page.home, body: (context: {
  readonly main: HTMLElement;
  readonly running: Valance.Running<typeof served.state, Nexus.Command.CommandValidationError, Nexus.Event.EventBusShape>;
  readonly operations: Array<string>;
  readonly navigated: Array<string>;
  readonly counts: { acquired: number; released: number };
  readonly hydration: unknown;
  readonly entriesAtStart: number;
}) => Effect.Effect<A>): Promise<{ readonly result: A; readonly counts: { acquired: number; released: number }; readonly operations: ReadonlyArray<string> }> => {
  window.history.replaceState(null, "", served.state.path);
  const main = container(served.html);
  const operations: Array<string> = [];
  const navigated: Array<string> = [];
  const { platform, counts } = countingPlatform();
  const entriesAtStart = window.history.length;

  const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    expect(stateFor(window.location.pathname)).toMatchObject({ path: served.state.path });          // initial URL → initial state: exact path
    const running = yield* Valance.start(application(page.programs), { platform, state: served.state });
    const mounted = yield* Valance.hydrate(running, recording(main, operations));
    yield* Web.history(running, { window, path: (state) => state.path, navigate: "app/navigate" });
    // Every Navigated, whoever asked for it.
    const watcher = Nexus.Runtime.runFork(running.nexus.runtime, Stream.runForEach(Nexus.Event.subscribe(Navigated), ({ path }) => Effect.sync(() => { navigated.push(path); })));
    yield* Effect.sleep("20 millis");

    const value = yield* body({ main, running, operations, navigated, counts, hydration: mounted.hydration, entriesAtStart });
    yield* Fiber.interrupt(watcher);

    return value;
  })));
  main.remove();

  return { result, counts, operations };
};

const text = (main: Element): string => main.textContent ?? "";
const url = (): string => window.location.pathname;
const until = (check: () => boolean) => Effect.promise(async () => { await expect.poll(check).toBe(true); });
const click = (main: Element, index: number) => Effect.promise(() => userEvent.click(main.querySelectorAll("button")[index]!));

it("/ → About → Back → Forward → Back: URL, path and program stay in step; the application never restarts", async () => {
  const trace: Array<{ step: string; url: string; path: string; text: string; acquired: number; released: number; status: string }> = [];

  const { result, counts, operations } = await run<{ state: typeof page.home.state; navigated: Array<string>; entries: number }>(page.home, ({ main, running, navigated, counts: c, hydration, entriesAtStart }) => Effect.gen(function* () {
    expect(hydration).toEqual({ adopted: true });
    expect(window.history.length).toBe(entriesAtStart);                   // starting at its own URL pushed nothing

    const observe = (step: string) => Effect.gen(function* () {
      const state = yield* running.state;
      const status = yield* Nexus.Application.status(running.nexus);
      trace.push({ step, url: url(), path: state.path, text: text(main), acquired: c.acquired, released: c.released, status: status._tag });
    });

    yield* observe("start");
    yield* click(main, 0);                                                // Click ×2
    yield* click(main, 0);
    yield* until(() => text(main).startsWith("2 clicks"));
    yield* click(main, 1);                                                // About: intent → command → state → pushState
    yield* until(() => text(main).startsWith("About") && url() === "/about");
    yield* observe("about (pushed)");
    window.history.back();                                                // popstate → the same command
    yield* until(() => url() === "/" && text(main).startsWith("2 clicks"));
    yield* observe("back to /");
    window.history.forward();
    yield* until(() => url() === "/about" && text(main).startsWith("About"));
    yield* observe("forward to /about");
    window.history.back();
    yield* until(() => url() === "/" && text(main).startsWith("2 clicks"));
    yield* observe("back to / again");
    yield* click(main, 0);
    yield* until(() => text(main).startsWith("3 clicks"));
    yield* observe("counter, 3 clicks");

    return { state: yield* running.state, navigated: [...navigated], entries: window.history.length - entriesAtStart };
  }));

  // Application and platform lifetime: one start, one acquisition, Running throughout, released only when the scope closed.
  expect(trace.map((t) => [t.status, t.acquired, t.released])).toEqual(Array(6).fill(["Running", 1, 0]));
  expect(counts).toEqual({ acquired: 1, released: 1 });
  // URL and application path agree at every observation, and the program is the one the path selects.
  expect(trace.map((t) => [t.url, t.path])).toEqual([["/", "/"], ["/about", "/about"], ["/", "/"], ["/about", "/about"], ["/", "/"], ["/", "/"]]);
  expect(trace.map((t) => t.text.startsWith("About"))).toEqual([false, true, false, true, false, false]);
  // State continuity: the count survives /, /about, /, /about, / (about shows it too).
  expect(trace.map((t) => t.text.match(/\d+(?= clicks)/)?.[0])).toEqual(["0", "2", "2", "2", "2", "3"]);
  expect(result.state.count).toBe(3);
  // One navigate command for every navigation (one MESH intent, three popstates), and exactly one history entry pushed (Back and Forward add none).
  expect(result.navigated).toEqual(["/about", "/", "/about", "/"]);
  expect(result.entries).toBe(1);
  // PORT: same program → update; each program change → draw. (Two Clicks, About, Back, Forward, Back, Click.)
  expect(operations).toEqual(["hydrate", "update", "update", "draw", "draw", "draw", "draw", "update"]);
});

it("an initial URL of /about hydrates the about program, pushes nothing, and Back/Forward then cross programs", async () => {
  const { result, counts, operations } = await run<{ path: string; navigated: Array<string> }>(page.about, ({ main, running, navigated, hydration, entriesAtStart }) => Effect.gen(function* () {
    expect(hydration).toEqual({ adopted: true });
    expect(url()).toBe("/about");
    expect(window.history.length).toBe(entriesAtStart);

    yield* click(main, 0);                                                // the About page's Back button: intent → command → pushState("/")
    yield* until(() => url() === "/" && text(main).startsWith("3 clicks"));
    window.history.back();                                                // popstate → /about
    yield* until(() => url() === "/about" && text(main).startsWith("About Tracer: 3 clicks"));

    return { path: (yield* running.state).path, navigated: [...navigated] };
  }));

  expect(result).toEqual({ path: "/about", navigated: ["/", "/about"] });
  expect(operations).toEqual(["hydrate", "draw", "draw"]);
  expect(counts).toEqual({ acquired: 1, released: 1 });
});

it("the popstate listener lives exactly as long as the scope: one while running, none after", async () => {
  // Count the window's live popstate listeners by wrapping add/remove for the duration of the test.
  const live = new Set<EventListenerOrEventListenerObject>();
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    if (type === "popstate") { live.add(listener); }
    add(type, listener, options);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
    if (type === "popstate") { live.delete(listener); }
    remove(type, listener, options);
  }) as typeof window.removeEventListener;

  try {
    const { result } = await run<{ whileRunning: number }>(page.home, ({ main }) => Effect.gen(function* () {
      yield* click(main, 1);
      yield* until(() => url() === "/about" && text(main).startsWith("About"));

      return { whileRunning: live.size };
    }));

    expect(result.whileRunning).toBe(1);
    expect(live.size).toBe(0);
  } finally {
    window.addEventListener = add as typeof window.addEventListener;
    window.removeEventListener = remove as typeof window.removeEventListener;
  }
});

it("probe: Back the moment the push lands, while the about program may still be rendering, settles consistent", async () => {
  const { operations } = await run(page.home, ({ main, running }) => Effect.gen(function* () {
    yield* Effect.promise(() => userEvent.click(main.querySelectorAll("button")[1]!));
    yield* until(() => url() === "/about");
    window.history.back();                                                // not waiting for the about render
    yield* until(() => url() === "/");
    yield* Effect.promise(async () => { await expect.poll(() => text(main)).toMatch(/^0 clicks/); });

    expect((yield* running.state).path).toBe("/");
  }));

  // Every commit is rendered, in order, and none is coalesced or skipped: the about program was drawn, then the counter again.
  expect(operations).toEqual(["hydrate", "draw", "draw"]);
});
