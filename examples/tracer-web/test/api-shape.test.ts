// API-shape tracer (Stage 15): the SAME application definition driven through two candidate shapes. Deliberately tiny: one
// same-view update (a MESH intent), one view change (draw, history push), one popstate, one scope close, and, in A only,
// one external entry plus a state read, which B has no way to express. Not a coverage suite: the existing matrix is that.
import * as Nexus from "@valancex/nexus";
import { Effect, Layer } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import * as A from "../src/api/shape-a.js";
import * as B from "../src/api/shape-b.js";
import { application, stateOf, urlOf, type Item } from "../src/catalog/app.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { initialStateAt, primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";

const items = (ids: string): ReadonlyArray<Item> => [...ids].map((id) => ({ id, name: { A: "Alpha", B: "Beta", C: "Gamma" }[id]! }));

/** A page at a real URL (so history works), with the container the platform realizes into. */
const page = () => {
  const dom = new JSDOM(`<!doctype html><html><body><main></main></body></html>`, { url: "http://localhost/" });
  const win = dom.window;
  const container = win.document.querySelector("main")!;
  const click = (el: Element) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const rows = () => [...container.querySelectorAll("div")].map((row) => row.querySelector("span")?.textContent);
  const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label)!;
  const rowButton = (name: string) => [...container.querySelectorAll("div")].find((row) => row.querySelector("span")?.textContent === name)!.querySelector("button")!;

  return { win: win as unknown as Window, container, click, rows, button, rowButton };
};

const counting = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(new Map()),
    Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
  );

  return { counts, platform };
};

const historyOptions = (win: Window) => ({ window: win, urlOf, stateOf, navigate: "app/navigate" });
const same = (a: Element | null, b: Element | null) => expect(a).toBe(b);

describe("API tracer: one definition, two shapes", () => {
  it("A: the caller starts it and holds a handle; bindings attach to the handle; the caller delivers an entry and reads state", async () => {
    const app = application(await compilePrograms());
    const p = page();
    const { counts, platform } = counting();
    const writes: Array<string> = [];
    const push = p.win.history.pushState.bind(p.win.history);
    p.win.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => { writes.push(`push ${String(url)}`); push(data, unused, url); };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* A.start(app, { platform, state: initialStateAt(p.win, items("ABC")) });
      yield* A.mount(handle, { container: p.container, primitives });
      yield* A.history(handle, historyOptions(p.win));
      const section = p.container.firstElementChild;
      const alpha = p.container.querySelectorAll("div")[0];

      // The handle's whole surface: no runtime, no render, no dispatch. An external entry, on the default Effect runtime.
      expect(Object.keys(handle).sort()).toEqual(["invoke", "state"]);
      yield* handle.invoke("app/changeItems", [{ value: items("CAB") as never }]);
      yield* Effect.promise(() => until(() => p.rows()[0] === "Gamma"));
      same(p.container.firstElementChild, section);                          // same view: update, the same section
      expect((yield* handle.state).items.map((item) => item.id)).toEqual(["C", "A", "B"]);

      // A MESH intent, same view: update again, and the keyed row keeps its element.
      p.click(p.button("Reverse"));
      yield* Effect.promise(() => until(() => p.rows()[0] === "Beta"));
      same(p.container.firstElementChild, section);
      expect(p.rows()).toEqual(["Beta", "Alpha", "Gamma"]);
      expect([...p.container.querySelectorAll("div")][1]).toBe(alpha);

      // A MESH intent, another view: draw, and the platform binding pushes history.
      p.click(p.rowButton("Beta"));
      yield* Effect.promise(() => until(() => p.container.textContent?.startsWith("Item B: Beta") === true));
      expect(p.container.firstElementChild).not.toBe(section);
      expect(writes).toEqual(["push /items/B"]);

      // The browser's Back: popstate enters through the application's binding; home is drawn afresh; the data outlived the view.
      p.win.history.back();
      yield* Effect.promise(() => until(() => p.win.location.pathname === "/" && p.rows().length === 3));
      expect(p.rows()).toEqual(["Beta", "Alpha", "Gamma"]);
      expect(writes).toEqual(["push /items/B"]);
    })));

    expect(p.container.innerHTML).toBe("");                                  // the caller's scope closed: unmounted
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });

  it("B: the platform owns the run; no handle exists; external entry is only what the platform itself originates", async () => {
    const app = application(await compilePrograms());
    const p = page();
    const { counts, platform } = counting();
    const writes: Array<string> = [];
    const push = p.win.history.pushState.bind(p.win.history);
    p.win.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => { writes.push(`push ${String(url)}`); push(data, unused, url); };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const result = yield* B.run(app, { container: p.container, primitives, platform, state: initialStateAt(p.win, items("ABC")), history: historyOptions(p.win) });
      const section = p.container.firstElementChild;
      const alpha = p.container.querySelectorAll("div")[0];

      // Nothing to hold: the application cannot be told anything, or asked its state, from outside.
      expect(result).toBeUndefined();

      // The same MESH intent, same view: update; the same keyed element.
      p.click(p.button("Reverse"));
      yield* Effect.promise(() => until(() => p.rows()[0] === "Gamma"));
      same(p.container.firstElementChild, section);
      expect(p.rows()).toEqual(["Gamma", "Beta", "Alpha"]);
      expect([...p.container.querySelectorAll("div")][2]).toBe(alpha);

      // The same view change: draw, and the platform's own history push.
      p.click(p.rowButton("Beta"));
      yield* Effect.promise(() => until(() => p.container.textContent?.startsWith("Item B: Beta") === true));
      expect(p.container.firstElementChild).not.toBe(section);
      expect(writes).toEqual(["push /items/B"]);

      // The platform-originated entry: popstate. It is the only way something outside MESH reaches the application here.
      p.win.history.back();
      yield* Effect.promise(() => until(() => p.win.location.pathname === "/" && p.rows().length === 3));
      expect(p.rows()).toEqual(["Gamma", "Beta", "Alpha"]);
    })));

    expect(p.container.innerHTML).toBe("");
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });
});
