// Stage 16: is there an application-level external face, or is every outside producer a platform binding?
// ONE producer: a host page announces data as a window event ("catalog:open"), and it must reach the same command a MESH
// intent reaches (`home/open` and `app/open` are both bound to `catalog.open`). It is written once, as the smallest thing
// that does the job, and handed (1) the A-style handle { state, invoke } or (2) the full `Running`, as a binding would get.
// It needs ONLY `invoke`. Not an API: a test-local function, to show exactly what an outside producer requires.
import type { Mesh } from "@valancex/nexus";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Layer } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import * as A from "../src/api/shape-a.js";
import { application, type AppState, type Item } from "../src/catalog/app.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";

const items = (ids: string): ReadonlyArray<Item> => [...ids].map((id) => ({ id, name: { A: "Alpha", B: "Beta", C: "Gamma" }[id]! }));

/** The whole of what an outside producer needs from the application: the entry. Nothing else of `Running`. */
interface Entry {
  readonly invoke: (key: string, args: ReadonlyArray<Mesh.IntentArgument>) => Effect.Effect<unknown, unknown>;
}

/**
 * The producer. Machinery it needs: the entry; a Scope (to remove its listener before the application ends); a translation
 * from its own event to (key, args); a decision about failure (here: logged, never thrown into the page's event loop).
 */
const fromWindowEvent = (entry: Entry, win: Window, name: string, key: string) => Effect.gen(function* () {
  const listener = (event: Event): void => {
    void Effect.runPromise(entry.invoke(key, [{ value: (event as CustomEvent<never>).detail }]).pipe(
      Effect.catchAllCause((cause) => Effect.logError("host event failed", Cause.pretty(cause)))
    ));
  };

  win.addEventListener(name, listener);
  yield* Effect.addFinalizer(() => Effect.sync(() => { win.removeEventListener(name, listener); }));
});

const page = () => {
  const dom = new JSDOM(`<!doctype html><html><body><main></main></body></html>`, { url: "http://localhost/" });
  const win = dom.window;
  const container = win.document.querySelector("main")!;
  const live = new Set<unknown>();
  const add = win.addEventListener.bind(win);
  const remove = win.removeEventListener.bind(win);
  win.addEventListener = ((type: string, listener: never, options?: never) => { if (type === "catalog:open") { live.add(listener); } add(type, listener, options); }) as typeof win.addEventListener;
  win.removeEventListener = ((type: string, listener: never, options?: never) => { if (type === "catalog:open") { live.delete(listener); } remove(type, listener, options); }) as typeof win.removeEventListener;

  return {
    win: win as unknown as Window,
    container,
    live,
    announce: (detail: string) => win.dispatchEvent(new win.CustomEvent("catalog:open", { detail })),
    click: (el: Element) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true })),
    button: (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label)!,
    rowButton: (name: string) => [...container.querySelectorAll("div")].find((row) => row.querySelector("span")?.textContent === name)!.querySelector("button")!,
  };
};

const platform: Nexus.Application.Platform = Nexus.Capability.EnvironmentLive(new Map());
const settle = (check: () => boolean) => Effect.promise(() => until(check));

/** The MESH path and the producer path to the SAME command, compared in one running application. */
const scenario = (how: "handle" | "running") => async () => {
  const app = application(await compilePrograms());
  const p = page();
  const states: Array<{ readonly via: string; readonly state: AppState }> = [];

  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const running = yield* Valance.start(app, { platform, state: { view: "home", items: items("ABC") } });
    yield* Valance.mount(running, Web.target({ container: p.container, primitives }));
    // The ONLY difference between the two runs: what the producer is handed.
    const handle: A.Handle<AppState, Nexus.Command.CommandValidationError> = { invoke: running.invoke, state: running.state };
    yield* fromWindowEvent(how === "handle" ? handle : running, p.win, "catalog:open", "app/open");
    expect(p.live.size).toBe(1);

    const seen = (via: string) => running.state.pipe(Effect.map((state) => { states.push({ via, state }); }));

    // MESH intent -> home/open -> catalog.open
    p.click(p.rowButton("Beta"));
    yield* settle(() => p.container.textContent?.startsWith("Item B: Beta") === true);
    yield* seen("mesh: home/open B");
    p.click(p.button("Back"));
    yield* settle(() => p.container.textContent?.startsWith("3 items") === true);

    // Outside producer -> app/open -> the SAME catalog.open
    p.announce("B");
    yield* settle(() => p.container.textContent?.startsWith("Item B: Beta") === true);
    yield* seen("host: app/open B");

    // An id the application does not have: the command decides (not-found), whoever asked. MESH reaches it with an empty list.
    yield* running.invoke("app/home", []);
    yield* running.invoke("app/changeItems", [{ value: [] as never }]);
    yield* settle(() => p.container.textContent?.startsWith("0 items") === true);
    p.click(p.button("Open first"));                                          // firstId "" -> home/open ""
    yield* settle(() => p.container.textContent?.startsWith("Not found") === true);
    yield* seen("mesh: home/open ''");
    yield* running.invoke("app/home", []);
    p.announce("");
    yield* settle(() => p.container.textContent?.startsWith("Not found") === true);
    yield* seen("host: app/open ''");
  })));

  // Same command, same semantics, whichever producer: equal states for equal asks.
  expect(states[0]!.state).toEqual(states[1]!.state);
  expect(states[2]!.state).toEqual(states[3]!.state);
  expect(states[1]!.state).toEqual({ view: "details", items: items("ABC"), selectedId: "B" });
  expect(states[3]!.state).toEqual({ view: "not-found", items: [] });
  // The producer's listener was the producer's to remove, and was removed, before the application ended.
  expect(p.live.size).toBe(0);
};

describe("one outside producer, one command, two ways of being handed the entry", () => {
  it("handed the A-style handle { state, invoke }: a host-page producer", scenario("handle"));
  it("handed the full `Running`, as a platform binding would be: the same function, unchanged", scenario("running"));
});
