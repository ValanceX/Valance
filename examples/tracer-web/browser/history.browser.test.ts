// URL ↔ application state, in Chromium, with real clicks and real history traversal, where the URL is NOT the state:
//
//   browser URL   /tracer/about?tab=details            (base path + query)
//   state         { path: "/about", tab: "details", count, stamp, title }     (count, stamp, title are not in the URL)
//
//   user navigation:  click → MESH intent → NEXUS navigate command → state → view(state) → history.pushState(urlOf(state))
//   browser Back/Fwd: popstate → stateOf(url) → the SAME navigate command (Valance's binding table) → state → view(state)
//   `urlOf` and `stateOf` are the application's own functions (../src/app.ts); Web.history only reads and writes the URL.
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

import { Navigated, application, primitives, stateFor, stateOf, urlOf } from "../src/app.js";

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

/** Starts the application at the URL the "server" served, hydrates, and keeps URL and state in step. */
const run = async <A>(served: typeof page.home, startUrl: string, body: (context: {
  readonly main: HTMLElement;
  readonly running: Valance.Running<typeof served.state, Nexus.Command.CommandValidationError, Nexus.Event.EventBusShape>;
  readonly navigated: Array<string>;
  readonly counts: { acquired: number; released: number };
  readonly hydration: unknown;
  readonly entriesAtStart: number;
  readonly pushes: Array<string>;
}) => Effect.Effect<A>): Promise<{ readonly result: A; readonly counts: { acquired: number; released: number }; readonly operations: ReadonlyArray<string> }> => {
  window.history.replaceState(null, "", startUrl);
  const main = container(served.html);
  const operations: Array<string> = [];
  const navigated: Array<string> = [];
  const pushes: Array<string> = [];
  const push = window.history.pushState.bind(window.history);
  window.history.pushState = (data: unknown, unused: string, target?: string | URL | null) => { pushes.push(String(target)); push(data, unused, target); };
  const { platform, counts } = countingPlatform();
  const entriesAtStart = window.history.length;

  try {
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      // Initial URL → initial state, by the application's own function: it says what the URL represents (not count or stamp).
      expect(stateFor(window.location.pathname + window.location.search)).toMatchObject({ path: served.state.path, tab: served.state.tab });
      const running = yield* Valance.start(application(page.programs), { platform, state: served.state });
      const mounted = yield* Valance.hydrate(running, recording(main, operations));
      yield* Web.history(running, { window, urlOf, stateOf, navigate: "app/navigate" });
      // Every Navigated, whoever asked for it.
      const watcher = Nexus.Runtime.runFork(running.nexus.runtime, Stream.runForEach(Nexus.Event.subscribe(Navigated), ({ path, tab }) => Effect.sync(() => { navigated.push(`${path}|${tab}`); })));
      yield* Effect.sleep("20 millis");

      const value = yield* body({ main, running, navigated, counts, hydration: mounted.hydration, entriesAtStart, pushes });
      yield* Fiber.interrupt(watcher);

      return value;
    })));

    return { result, counts, operations };
  } finally {
    window.history.pushState = push;
    main.remove();
  }
};

const text = (main: Element): string => main.textContent ?? "";
const url = (): string => window.location.pathname + window.location.search;
const until = (check: () => boolean) => Effect.promise(async () => { await expect.poll(check).toBe(true); });
const click = (main: Element, index: number) => Effect.promise(() => userEvent.click(main.querySelectorAll("button")[index]!));

const ABOUT = "/tracer/about?tab=details";
const HOME = "/tracer/?tab=overview";

it("/tracer/about?tab=details → navigate (application) → Back → Forward: URL, state and program agree; state outside the URL survives", async () => {
  const trace: Array<{ step: string; url: string; path: string; tab: string; count: number; about: boolean; acquired: number; released: number; status: string }> = [];

  const { result, counts, operations } = await run<{ navigated: Array<string>; pushes: Array<string>; entries: number }>(page.about, ABOUT, ({ main, running, navigated, counts: c, hydration, entriesAtStart, pushes }) => Effect.gen(function* () {
    expect(hydration).toEqual({ adopted: true });
    expect(url()).toBe(ABOUT);
    expect(pushes).toEqual([]);                                           // the initial URL is not pushed
    expect(window.history.length).toBe(entriesAtStart);

    const observe = (step: string) => Effect.gen(function* () {
      const state = yield* running.state;
      const status = yield* Nexus.Application.status(running.nexus);
      trace.push({ step, url: url(), path: state.path, tab: state.tab, count: state.count, about: text(main).startsWith("About"), acquired: c.acquired, released: c.released, status: status._tag });
    });

    yield* observe("initial /about, details");
    yield* click(main, 0);                                                // the About page's Back button: intent → command → pushState(urlOf(state))
    yield* until(() => url() === HOME && text(main).startsWith("3 clicks"));
    yield* observe("navigated to /, overview");
    yield* click(main, 0);                                                // state the URL does not carry: count 3 → 4. No URL change.
    yield* until(() => text(main).startsWith("4 clicks"));
    yield* observe("count 4, URL unchanged");
    window.history.back();                                                // popstate → stateOf(url) → the same command
    yield* until(() => url() === ABOUT && text(main).startsWith("About Tracer: 4 clicks"));
    yield* observe("Back: /about, details");
    window.history.forward();
    yield* until(() => url() === HOME && text(main).startsWith("4 clicks"));
    yield* observe("Forward: /, overview");

    return { navigated: [...navigated], pushes: [...pushes], entries: window.history.length - entriesAtStart };
  }));

  // URL ≠ state, and they agree at every observation (the tab came back from the URL, not from memory).
  expect(trace.map((t) => [t.url, t.path, t.tab])).toEqual([
    [ABOUT, "/about", "details"], [HOME, "/", "overview"], [HOME, "/", "overview"], [ABOUT, "/about", "details"], [HOME, "/", "overview"],
  ]);
  expect(trace.map((t) => t.about)).toEqual([true, false, false, true, false]);
  // State the URL does not represent is intact across every transition.
  expect(trace.map((t) => t.count)).toEqual([3, 3, 4, 4, 4]);
  // Application and platform lifetime: one start, one acquisition, Running throughout, released only when the scope closed.
  expect(trace.map((t) => [t.status, t.acquired, t.released])).toEqual(Array(5).fill(["Running", 1, 0]));
  expect(counts).toEqual({ acquired: 1, released: 1 });
  // One navigate command for every navigation (one MESH intent, two popstates); one push, none for popstate.
  expect(result.navigated).toEqual(["/|overview", "/about|details", "/|overview"]);
  expect(result.pushes).toEqual([HOME]);
  expect(result.entries).toBe(1);
  // PORT: same program → update; each program change → draw, including both caused by popstate.
  expect(operations).toEqual(["hydrate", "draw", "update", "draw", "draw"]);
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
    const { result } = await run<{ whileRunning: number }>(page.home, HOME, ({ main }) => Effect.gen(function* () {
      yield* click(main, 1);
      yield* until(() => url() === ABOUT.replace("details", "overview") && text(main).startsWith("About"));

      return { whileRunning: live.size };
    }));

    expect(result.whileRunning).toBe(1);
    expect(live.size).toBe(0);
  } finally {
    window.addEventListener = add as typeof window.addEventListener;
    window.removeEventListener = remove as typeof window.removeEventListener;
  }
});

it("observation: an invalid path, /tracer/not-a-view (no query)", async () => {
  const { result, operations } = await run<{ url: string; state: { path: string; tab: string }; text: string; pushes: Array<string> }>(page.invalid, "/tracer/not-a-view", ({ main, running, pushes }) => Effect.gen(function* () {
    const state = yield* running.state;

    return { url: url(), state: { path: state.path, tab: state.tab }, text: text(main), pushes: [...pushes] };
  }));

  // The application takes the URL at its word: the path is kept as given, `view` falls back to the counter, and the
  // URL is not canonical (no `?tab=`), so the first state commit pushes the canonical one. Nothing here decided that.
  expect(result.state).toEqual({ path: "/not-a-view", tab: "overview" });
  expect(result.text.startsWith("0 clicks")).toBe(true);
  expect(result.pushes).toEqual(["/tracer/not-a-view?tab=overview"]);
  expect(result.url).toBe("/tracer/not-a-view?tab=overview");
  expect(operations).toEqual(["hydrate"]);
});

it("probe: Back the moment the push lands, while the about program may still be rendering, settles consistent", async () => {
  const { operations } = await run(page.home, HOME, ({ main, running }) => Effect.gen(function* () {
    yield* Effect.promise(() => userEvent.click(main.querySelectorAll("button")[1]!));
    yield* until(() => url() !== HOME);
    window.history.back();                                                // not waiting for the about render
    yield* until(() => url() === HOME);
    yield* Effect.promise(async () => { await expect.poll(() => text(main)).toMatch(/^0 clicks/); });

    expect((yield* running.state).path).toBe("/");
  }));

  // Every commit is rendered, in order, and none is coalesced or skipped.
  expect(operations).toEqual(["hydrate", "draw", "draw"]);
});
