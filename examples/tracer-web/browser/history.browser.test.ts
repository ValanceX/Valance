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

import { Navigated, application, initialStateAt, primitives, stateFor, stateOf, urlOf } from "../src/app.js";

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
const run = async <A>(served: typeof page.home, startUrl: string, options: { readonly canonicalize: boolean }, body: (context: {
  readonly main: HTMLElement;
  readonly running: Valance.Running<typeof served.state, Nexus.Command.CommandValidationError, Nexus.Event.EventBusShape>;
  readonly navigated: Array<string>;
  readonly counts: { acquired: number; released: number };
  readonly hydration: unknown;
  readonly entriesAtStart: number;
  readonly writes: Array<string>;
}) => Effect.Effect<A>): Promise<{ readonly result: A; readonly counts: { acquired: number; released: number }; readonly operations: ReadonlyArray<string> }> => {
  window.history.replaceState(null, "", startUrl);                       // the harness's stand-in for "this URL was served"
  const main = container(served.html);
  const operations: Array<string> = [];
  const navigated: Array<string> = [];
  // Every history write from here on, by whom it is made: the application's entry, Web.history, or a navigation.
  const writes: Array<string> = [];
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  window.history.pushState = (data: unknown, unused: string, target?: string | URL | null) => { writes.push(`push ${String(target)}`); push(data, unused, target); };
  window.history.replaceState = (data: unknown, unused: string, target?: string | URL | null) => { writes.push(`replace ${String(target)}`); replace(data, unused, target); };
  const { platform, counts } = countingPlatform();
  const entriesAtStart = window.history.length;

  try {
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      // Initial URL → initial state, by the application's own function, before anything starts. The application
      // canonicalizes the URL there (replace), or, in the control runs, does not.
      const initialState = options.canonicalize ? initialStateAt(window) : stateFor(window.location.pathname + window.location.search);
      expect(initialState).toMatchObject({ path: served.state.path, tab: served.state.tab });
      const running = yield* Valance.start(application(page.programs), { platform, state: served.state });
      const mounted = yield* Valance.hydrate(running, recording(main, operations));
      yield* Web.history(running, { window, urlOf, stateOf, navigate: "app/navigate" });
      // Every Navigated, whoever asked for it.
      const watcher = Nexus.Runtime.runFork(running.nexus.runtime, Stream.runForEach(Nexus.Event.subscribe(Navigated), ({ path, tab }) => Effect.sync(() => { navigated.push(`${path}|${tab}`); })));
      yield* Effect.sleep("20 millis");

      const value = yield* body({ main, running, navigated, counts, hydration: mounted.hydration, entriesAtStart, writes });
      yield* Fiber.interrupt(watcher);

      return value;
    })));

    return { result, counts, operations };
  } finally {
    window.history.pushState = push;
    window.history.replaceState = replace;
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

  const { result, counts, operations } = await run<{ navigated: Array<string>; writes: Array<string>; entries: number }>(page.about, ABOUT, { canonicalize: true }, ({ main, running, navigated, counts: c, hydration, entriesAtStart, writes }) => Effect.gen(function* () {
    expect(hydration).toEqual({ adopted: true });
    expect(url()).toBe(ABOUT);
    expect(writes).toEqual([]);                                           // a canonical initial URL is not written at all
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

    return { navigated: [...navigated], writes: [...writes], entries: window.history.length - entriesAtStart };
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
  expect(result.writes).toEqual([`push ${HOME}`]);
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
    const { result } = await run<{ whileRunning: number }>(page.home, HOME, { canonicalize: true }, ({ main }) => Effect.gen(function* () {
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

// The initial URL, three ways. The application interprets it (stateOf, total) and canonicalizes it (replace, never
// push) BEFORE Valance.start and Web.history; Web.history treats the first state as a baseline and writes nothing.
const cases = [
  { name: "A: canonical", served: page.about, start: "/tracer/about?tab=details", state: { path: "/about", tab: "details" }, program: "About Tracer", writes: [], url: "/tracer/about?tab=details" },
  { name: "B: valid, not canonical", served: page.plainAbout, start: "/tracer/about", state: { path: "/about", tab: "overview" }, program: "About Tracer", writes: ["replace /tracer/about?tab=overview"], url: "/tracer/about?tab=overview" },
  { name: "C: no view", served: page.notFound, start: "/tracer/not-a-view", state: { path: "/not-found", tab: "overview" }, program: "Not found", writes: ["replace /tracer/not-found?tab=overview"], url: "/tracer/not-found?tab=overview" },
] as const;

it.each(cases)("initial URL $name ($start): the application's entry canonicalizes with replace; nothing is ever pushed", async ({ served, start, state, program, writes, url: finalUrl }) => {
  const { result, counts, operations } = await run<{ record: unknown; hydration: unknown; status: string }>(served, start, { canonicalize: true }, ({ main, running, hydration, writes: log }) => Effect.gen(function* () {
    const current = yield* running.state;
    const status = yield* Nexus.Application.status(running.nexus);

    return { record: { initial: start, state: { path: current.path, tab: current.tab }, program: text(main).slice(0, program.length), writes: [...log], finalUrl: url() }, hydration, status: status._tag };
  }));

  expect(result.record).toEqual({ initial: start, state, program, writes, finalUrl });
  expect(result.hydration).toEqual({ adopted: true });
  expect(result.status).toBe("Running");
  expect(operations).toEqual(["hydrate"]);                                // no render, draw or update was needed to start
  expect(counts).toEqual({ acquired: 1, released: 1 });
});

// The guard: when does Web.history push? Never because the URL merely differs from urlOf(state); only when the
// application's own URL (urlOf(state)) changes between synchronized states. Popstate re-baselines and never writes.
const ABOUT_OVERVIEW = "/tracer/about?tab=overview";
const increment = (running: Valance.Running<typeof page.home.state, Nexus.Command.CommandValidationError, Nexus.Event.EventBusShape>) =>
  Effect.promise(() => Nexus.Runtime.run(running.nexus.runtime, running.invoke("counter/increment", [])));

// Case A: the page sits at a noncanonical URL (the application did not canonicalize it); an unrelated commit is not a navigation.
it.each([cases[1], cases[2]])("guard A, $name: an unrelated state change at a noncanonical URL writes nothing", async ({ served, start }) => {
  const { result } = await run<{ writes: Array<string>; url: string; navigated: Array<string>; count: number }>(served, start, { canonicalize: false }, ({ running, writes, navigated }) => Effect.gen(function* () {
    yield* increment(running);                                            // count + 1: nothing to do with the URL
    yield* Effect.sleep("50 millis");

    return { writes: [...writes], url: url(), navigated: [...navigated], count: (yield* running.state).count };
  }));

  expect(result).toEqual({ writes: [], url: start, navigated: [], count: served.state.count + 1 });
});

// Case B: Back to a history entry whose URL is noncanonical. popstate → stateOf → the navigate command; no write; the browser stays where history put it.
it("guard B: popstate to a noncanonical history entry navigates, and writes nothing", async () => {
  const { result, operations } = await run<{ afterBack: { url: string; path: string; writes: Array<string> }; afterUnrelated: { url: string; writes: Array<string>; text: string }; afterForward: { url: string; writes: Array<string> }; navigated: Array<string> }>(
    page.plainAbout, "/tracer/about", { canonicalize: false }, ({ main, running, writes, navigated }) => Effect.gen(function* () {
      yield* click(main, 0);                                              // the page's Back button: application navigation → push HOME
      yield* until(() => url() === HOME && text(main).startsWith("3 clicks"));
      window.history.back();                                              // popstate to "/tracer/about"
      yield* until(() => url() === "/tracer/about" && text(main).startsWith("About Tracer: 3 clicks"));
      const afterBack = { url: url(), path: (yield* running.state).path, writes: [...writes] };

      yield* increment(running);                                          // an unrelated commit while sitting at the noncanonical entry
      yield* until(() => text(main).startsWith("About Tracer: 4 clicks"));
      yield* Effect.sleep("50 millis");
      const afterUnrelated = { url: url(), writes: [...writes], text: text(main).slice(0, 22) };

      window.history.forward();                                           // popstate back to HOME
      yield* until(() => url() === HOME && text(main).startsWith("4 clicks"));

      return { afterBack, afterUnrelated, afterForward: { url: url(), writes: [...writes] }, navigated: [...navigated] };
    }));

  const pushedHome = [`push ${HOME}`];                                    // the only write: the one application navigation
  expect(result.afterBack).toEqual({ url: "/tracer/about", path: "/about", writes: pushedHome });
  expect(result.afterUnrelated).toEqual({ url: "/tracer/about", writes: pushedHome, text: "About Tracer: 4 clicks" });
  expect(result.afterForward).toEqual({ url: HOME, writes: pushedHome });
  expect(result.navigated).toEqual(["/|overview", "/about|overview", "/|overview"]);   // one intent, two popstates, one command
  expect(operations).toEqual(["hydrate", "draw", "draw", "update", "draw"]);
});

// Case C: application navigation pushes once per distinct application URL; unrelated commits push nothing.
it("guard C: each distinct application URL is pushed exactly once; unrelated commits are not pushed", async () => {
  const { result, operations } = await run<{ writes: Array<string>; navigated: Array<string>; url: string }>(page.home, HOME, { canonicalize: true }, ({ main, running, writes, navigated }) => Effect.gen(function* () {
    yield* increment(running);                                            // unrelated, on the counter
    yield* click(main, 1);                                                // → About: push 1
    yield* until(() => url() === ABOUT_OVERVIEW && text(main).startsWith("About"));
    yield* increment(running);                                            // unrelated, on the about program: update, not a push
    yield* until(() => text(main).startsWith("About Tracer: 2 clicks"));
    yield* click(main, 0);                                                // Back → Home: push 2
    yield* until(() => url() === HOME && text(main).startsWith("2 clicks"));
    yield* click(main, 1);                                                // → About again: push 3 (the same URL as push 1, still a new navigation)
    yield* until(() => url() === ABOUT_OVERVIEW && text(main).startsWith("About"));
    yield* Effect.sleep("50 millis");

    return { writes: [...writes], navigated: [...navigated], url: url() };
  }));

  expect(result.writes).toEqual([`push ${ABOUT_OVERVIEW}`, `push ${HOME}`, `push ${ABOUT_OVERVIEW}`]);
  expect(result.navigated).toEqual(["/about|overview", "/|overview", "/about|overview"]);
  expect(result.url).toBe(ABOUT_OVERVIEW);
  expect(operations).toEqual(["hydrate", "update", "draw", "update", "draw", "draw"]);
});

it("probe: Back the moment the push lands, while the about program may still be rendering, settles consistent", async () => {
  const { operations } = await run(page.home, HOME, { canonicalize: true }, ({ main, running }) => Effect.gen(function* () {
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
