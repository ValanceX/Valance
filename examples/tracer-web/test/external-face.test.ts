// The application's external face, as a real API: a producer that is neither the definition nor a MESH render reaches
// the application through the public handle (`ApplicationHandle`: `state` and `invoke`), and nothing else of it.
// A host page announces data as a window event ("catalog:open"); the producer (../src/catalog/host.ts) enters it at
// `app/open`, which is bound to the same command a MESH intent reaches (`home/open`, `catalog.open`).
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, type AppState, type Item } from "../src/catalog/app.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { fromWindowEvent } from "../src/catalog/host.js";
import { primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";

const items = (ids: string): ReadonlyArray<Item> => [...ids].map((id) => ({ id, name: { A: "Alpha", B: "Beta", C: "Gamma" }[id]! }));

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
const scenario = async () => {
  const app = application(await compilePrograms());
  const p = page();
  const states: Array<{ readonly via: string; readonly state: AppState }> = [];

  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const handle = yield* Valance.start(app, { platform, state: { view: "home", items: items("ABC") } });
    yield* Valance.mount(handle, Web.target({ container: p.container, primitives }));
    yield* fromWindowEvent(handle, p.win, "catalog:open", "app/open");
    expect(p.live.size).toBe(1);

    // A host observes state through the handle alone: one read, no internal composition, no runtime.
    const seen = (via: string) => handle.state.pipe(Effect.map((state) => { states.push({ via, state }); }));

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
    yield* handle.invoke("app/home", []);
    yield* handle.invoke("app/changeItems", [{ value: [] as never }]);
    yield* settle(() => p.container.textContent?.startsWith("0 items") === true);
    p.click(p.button("Open first"));                                          // firstId "" -> home/open ""
    yield* settle(() => p.container.textContent?.startsWith("Not found") === true);
    yield* seen("mesh: home/open ''");
    yield* handle.invoke("app/home", []);
    yield* settle(() => p.container.textContent?.startsWith("0 items") === true);
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
  expect(p.container.innerHTML).toBe("");
};

describe("an external producer through the application's public handle", () => {
  it("enters the same command a MESH intent does, and reads the same resulting state", scenario);
});
