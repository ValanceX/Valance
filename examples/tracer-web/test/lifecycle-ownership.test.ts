// Lifecycle ownership beyond what scope-topology/lifecycle/multi-mount-views already pin (application close order, command drain,
// mounts outliving or preceding the application, resources released by the application's Scope only). Added here, on real
// resources and real windows:
//   O1  a container is reusable after its mount closed (the supported "mount, close, mount again")
//   O2  mount and hydrate are per-mount choices over one application: they mix, and stale server HTML is PORT's mismatch, not the application's
//   O3  Web.history belongs to the Scope it was given: with the application's, it is gone first; in its own, it outlives the application, still listening (a popstate is attempted and refused: lifecycle-races P5)
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect, Exit, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, stateOf, urlOf } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { load, until } from "./helpers.js";
import { definition, platformOf, primitives, recording, type Operation, type State } from "./two-views.js";

const shown = (page: ReturnType<typeof load>): string => page.container.querySelector("span")?.textContent ?? "";

describe("lifecycle ownership", () => {
  it("O1 a mount closes into an empty container, and the same container takes a new mount of the same application, which owns its own continuity", async () => {
    const app = await definition([]);
    const { counts, platform } = platformOf();
    const page = load("");
    const operations: Array<Array<Operation>> = [[], []];

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform });
      const first = yield* Scope.make();

      yield* Valance.mount(handle, recording(page.container, operations[0]!)).pipe(Scope.extend(first));
      yield* handle.invoke("a/bump", []);
      yield* Effect.promise(() => until(() => shown(page) === "A 1 via resource-1"));
      yield* Scope.close(first, Exit.void);
      expect(page.container.innerHTML).toBe("");                                    // the closed mount took its presentation with it

      const second = yield* Scope.make();
      const mounted = yield* Valance.mount(handle, recording(page.container, operations[1]!)).pipe(Scope.extend(second));

      expect(shown(page)).toBe("A 1 via resource-1");                               // the application's state, not the first mount's
      page.click(page.container.querySelectorAll("button")[0]!);
      yield* mounted.settled;
      yield* Effect.promise(() => until(() => shown(page) === "A 2 via resource-1"));
      expect(counts).toEqual({ acquired: 1, released: 0 });                         // neither mount's life touched the resource
    })));

    expect(operations).toEqual([["draw", "update"], ["draw", "update"]]);
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });

  it("O2 hydrate and mount mix over one application: each is its own connection, and server HTML for another view is PORT's mismatch, drawn over with the current render", async () => {
    const app = await definition([]);
    const { platform } = platformOf();
    const initialA: State = { view: "a", n: 0, via: "-" };
    const served = await Effect.runPromise(renderToHtml(app, { primitives, state: initialA }));
    const [adopting, mounting, stale] = [load(served.html), load(""), load(served.html)];
    const operations: Record<string, Array<Operation>> = { adopting: [], mounting: [], stale: [] };

    const hydrations = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform, state: served.state });
      const first = yield* Valance.hydrate(handle, recording(adopting.container, operations.adopting!));

      yield* Valance.mount(handle, recording(mounting.container, operations.mounting!));
      yield* handle.invoke("a/toB", []);
      yield* Effect.promise(() => until(() => shown(adopting) === "B 0 via -" && shown(mounting) === "B 0 via -"));
      const late = yield* Valance.hydrate(handle, recording(stale.container, operations.stale!));      // the server's HTML is view A; the application is on B

      return { first: first.hydration, late: late.hydration, drawn: shown(stale) };
    })));

    expect(hydrations.first).toEqual({ adopted: true });
    expect(hydrations.late).toMatchObject({ adopted: false, mismatch: { class: "attribute", expected: 'aria-label="B"', found: 'aria-label="A"' } });
    expect(hydrations.drawn).toBe("B 0 via -");                                      // the client's render, never the server's
    expect(operations).toEqual({ adopting: ["hydrate", "draw"], mounting: ["draw", "draw"], stale: ["hydrate"] });
  });

  /** A real window whose popstate listeners are counted. */
  const counted = () => {
    const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/tracer/?tab=overview" });
    const win = dom.window as unknown as Window;
    const live = new Set<unknown>();
    const add = win.addEventListener.bind(win);
    const remove = win.removeEventListener.bind(win);

    win.addEventListener = ((type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => { if (type === "popstate") { live.add(listener); } add(type, listener, options); }) as typeof win.addEventListener;
    win.removeEventListener = ((type: string, listener: EventListener, options?: boolean | EventListenerOptions) => { if (type === "popstate") { live.delete(listener); } remove(type, listener, options); }) as typeof win.removeEventListener;

    return { win, live, location: () => win.location.pathname + win.location.search };
  };

  it("O3 history ends with the Scope it was given: in the application's Scope its listener is gone when it closes; in its own Scope it outlives the application, still listening (a popstate is attempted and refused: see lifecycle-races P5), until that Scope closes", async () => {
    const app = application(await compilePrograms());
    const options = { urlOf, stateOf, navigate: "app/navigate" } as const;
    const navigateAbout = (handle: { readonly invoke: Valance.ApplicationHandle<never, unknown>["invoke"] }) => handle.invoke("app/navigate", [{ value: { path: "/about", tab: "overview" } }]);
    const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

    // Shared Scope: the one close ends history (first), then the application. Back afterwards reaches nothing.
    const shared = counted();
    const sharedHandle = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);

      yield* Web.history(handle, { window: shared.win, ...options });
      yield* Effect.sleep("40 millis");
      yield* navigateAbout(handle);
      yield* Effect.sleep("40 millis");
      expect(shared.live.size).toBe(1);

      return handle;
    })));

    expect(shared.live.size).toBe(0);
    shared.win.history.back();
    await settle();
    expect(shared.location()).toBe("/tracer/?tab=overview");                       // the browser moved; nothing was listening
    expect(await Effect.runPromise(sharedHandle.state)).toMatchObject({ path: "/about" });

    // Independent Scopes: the application ends first. The listener is still there (it is history's Scope's), but there is nothing to
    // navigate: the popstate changes no state, writes no URL, and the listener goes with its own Scope.
    const own = counted();
    const [appScope, historyScope] = await Promise.all([Effect.runPromise(Scope.make()), Effect.runPromise(Scope.make())]);
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(appScope)));
    const writes: Array<string> = [];
    const push = own.win.history.pushState.bind(own.win.history);

    own.win.history.pushState = (data, unused, target) => { writes.push(String(target)); push(data, unused, target); };
    await Effect.runPromise(Web.history(handle, { window: own.win, ...options }).pipe(Scope.extend(historyScope)));
    await settle();                                                                 // the follower takes its baseline (the first state it sees) before the navigation
    await Effect.runPromise(navigateAbout(handle));
    await settle();
    await Effect.runPromise(Scope.close(appScope, Exit.void));
    expect(own.live.size).toBe(1);
    own.win.history.back();
    await settle();

    expect(await Effect.runPromise(handle.state)).toMatchObject({ path: "/about", tab: "overview" });
    expect(writes).toEqual(["/tracer/about?tab=overview"]);                          // the one navigation before the close, nothing after
    await Effect.runPromise(Scope.close(historyScope, Exit.void));
    expect(own.live.size).toBe(0);
  });
});
