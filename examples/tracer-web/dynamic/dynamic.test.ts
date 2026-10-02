// VALANCE composition tracer for MESH dynamic structure (spec §9.10) and PORT keyed reconciliation. Every layer real:
//
//   NEXUS state ──(app.views[..].scope)──▶ MESH snapshot ──▶ MESH runtime (mesh-each / mesh-if) ──▶ render-v1
//        ──▶ Valance (`connect`: draw / update, nothing else) ──▶ PORT Web (keyed update) ──▶ DOM objects
//
// and back for events: DOM click → PORT → (handler, payload) → Valance dispatch (with the DRAWN render) → MESH
// dispatch → intent → NEXUS command → state.
//
// What it asserts is composition, not the substrates: a state change made through the application reaches MESH; the
// opaque key MESH gave a node is the key Valance hands PORT, unchanged; and PORT keeps or replaces the target object
// the way that key says. Valance is not told what a repeat or a conditional is, and has no node identity of its own.
//
// MESH (mesh-if, mesh-each) and PORT (keyed update) are resolved from local checkouts, not the published 0.6.0 /
// 0.2.1: see vitest.dynamic.config.ts. It is its own script (`test:dynamic`), not part of `test`, and needs both builds.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, compilePrograms, initial, primitives } from "./app.js";
import type { AppState, Item } from "./app.js";


type Operation = "draw" | "update";

const items = (...labels: string[]): Item[] => labels.map((label) => ({ id: label.toLowerCase(), label }));

/** The label a node shows: its text runs. */
const labelOf = (node: RenderNode): string => node.children.filter((child) => child.type === "text").map((child) => child.text).join("");

interface Part { readonly key: string; readonly element: Element; readonly component: string }

const session = async <A>(initialState: Partial<AppState>, body: (h: Harness) => Promise<A>): Promise<A> => {
  const app = application(await compilePrograms());
  const { window } = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "http://localhost/" });
  const container = window.document.querySelector("main")!;
  // What Valance handed PORT, in order, as it did: the target is PORT Web, recorded and otherwise untouched.
  const handoffs: Array<{ readonly operation: Operation; readonly tree: RenderTree }> = [];
  const create: Valance.TargetFactory<WebPort> = (report) => {
    const web = Web.target({ container, primitives })(report);

    return {
      draw: (tree) => { handoffs.push({ operation: "draw", tree }); web.draw(tree); },
      update: (tree) => { handoffs.push({ operation: "update", tree }); web.update(tree); },
      hydrate: (tree) => web.hydrate(tree),
      unmount: () => { web.unmount(); },
    };
  };

  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const running = yield* Valance.start(app, { state: { ...initial, ...initialState } });
    const mounted = yield* Valance.mount(running, create);
    const run = <X, F>(effect: Effect.Effect<X, F, Nexus.Event.EventBusShape | Nexus.Capability.EnvironmentShape>) => Nexus.Runtime.run(running.nexus.runtime, effect);

    /** Changes application state the application's way (a NEXUS command), and waits until Valance has handed PORT the render of it. */
    const change = async (key: "app/setItems" | "app/setFlags" | "app/setMode", value: unknown): Promise<void> => {
      const before = handoffs.length;
      await run(running.invoke(key, [{ value: value as never }]));

      for (let tries = 0; handoffs.length === before; tries += 1) {
        if (tries > 400) { throw new Error("no render followed the state change"); }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };

    /** Each node of the tree Valance last handed PORT, by `component:text`: its key, and the element PORT holds for it. Observation only (tree and DOM are paired by child index); no assertion takes identity from it. */
    const parts = (): ReadonlyMap<string, Part> => {
      const found = new Map<string, Part>();
      const walk = (node: RenderNode, element: Element): void => {
        found.set(`${node.component}:${labelOf(node)}`, { key: node.key, element, component: node.component });
        node.children.forEach((child, index) => { if (child.type === "node") { walk(child, element.childNodes[index] as Element); } });
      };

      walk(handoffs.at(-1)!.tree.root, container.firstElementChild!);

      return found;
    };

    const harness: Harness = {
      container, handoffs, parts, change,
      state: () => Effect.runPromise(running.state),
      render: () => Effect.runPromise(running.render),
      settle: () => Effect.runPromise(mounted.settled),
      click: (element) => element.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
      dispatched: () => mounted.dispatched,
      order: (selector) => Array.from(container.querySelectorAll(selector)).map((element) => element.textContent!),
      snapshotOf: (state) => app.views[app.view(state)].scope(state),
    };

    return yield* Effect.promise(() => body(harness));
  })));
};

interface Harness {
  readonly container: Element;
  readonly handoffs: ReadonlyArray<{ readonly operation: Operation; readonly tree: RenderTree }>;
  readonly parts: () => ReadonlyMap<string, Part>;
  readonly change: (key: "app/setItems" | "app/setFlags" | "app/setMode", value: unknown) => Promise<void>;
  readonly state: () => Promise<AppState>;
  readonly render: () => Promise<Valance.Viewed>;
  readonly settle: () => Promise<void>;
  readonly click: (element: Element) => void;
  readonly dispatched: () => ReadonlyArray<Valance.DispatchExit<unknown>>;
  readonly order: (selector: string) => string[];
  readonly snapshotOf: (state: AppState) => Record<string, unknown>;
}

const row = (label: string) => `row:${label}`;

describe("Valance composes MESH dynamic structure and PORT keyed reconciliation", () => {
  it("V1 repeat reorder: [A,B,C] → [C,A,B] keeps every target object, under the same MESH keys", async () => {
    await session({ items: items("A", "B", "C") }, async (h) => {
      const before = h.parts();
      await h.change("app/setItems", { items: items("C", "A", "B") });
      const after = h.parts();

      expect(h.order("button")).toEqual(["C", "A", "B"]);
      for (const label of ["A", "B", "C"]) {
        expect(after.get(row(label))!.key).toBe(before.get(row(label))!.key);
        expect(after.get(row(label))!.element).toBe(before.get(row(label))!.element);
      }
      expect(h.handoffs.map((handoff) => handoff.operation)).toEqual(["draw", "update"]);
    });
  });

  it("V2 repeat insert: [A,B] → [A,X,B] keeps A and B and creates X", async () => {
    await session({ items: items("A", "B") }, async (h) => {
      const before = h.parts();
      await h.change("app/setItems", { items: items("A", "X", "B") });
      const after = h.parts();

      expect(h.order("button")).toEqual(["A", "X", "B"]);
      expect(after.get(row("A"))!.element).toBe(before.get(row("A"))!.element);
      expect(after.get(row("B"))!.element).toBe(before.get(row("B"))!.element);
      expect([...before.values()].map((part) => part.element)).not.toContain(after.get(row("X"))!.element);
      expect(after.get("note:tail")!.element).toBe(before.get("note:tail")!.element);
    });
  });

  it("V3 repeat removal: [A,B,C] → [A,C] keeps A and C and disposes B", async () => {
    await session({ items: items("A", "B", "C") }, async (h) => {
      const before = h.parts();
      await h.change("app/setItems", { items: items("A", "C") });
      const after = h.parts();

      expect(h.order("button")).toEqual(["A", "C"]);
      expect(after.get(row("A"))!.element).toBe(before.get(row("A"))!.element);
      expect(after.get(row("C"))!.element).toBe(before.get(row("C"))!.element);
      expect(before.get(row("B"))!.element.isConnected).toBe(false);
    });
  });

  it("V4 repeat reappearance: [A] → [] → [A] is the same MESH key and a fresh target object", async () => {
    await session({ items: items("A") }, async (h) => {
      const first = h.parts().get(row("A"))!;
      await h.change("app/setItems", { items: [] });
      expect(first.element.isConnected).toBe(false);
      await h.change("app/setItems", { items: items("A") });
      const again = h.parts().get(row("A"))!;

      expect(again.key).toBe(first.key);
      expect(again.element).not.toBe(first.element);
    });
  });

  it("V5 conditional: true → false → true disposes the realization, then makes a fresh one under the same key", async () => {
    await session({ mode: "cond", show: true }, async (h) => {
      const first = h.parts().get(row("shown"))!;
      await h.change("app/setFlags", { show: false, lead: false });
      expect(h.parts().has(row("shown"))).toBe(false);
      expect(first.element.isConnected).toBe(false);
      await h.change("app/setFlags", { show: true, lead: false });
      const again = h.parts().get(row("shown"))!;

      expect(again.key).toBe(first.key);
      expect(again.element).not.toBe(first.element);
    });
  });

  it("V6 conditional continuity: an unrelated sibling inserted before a present conditional leaves its key and object alone", async () => {
    await session({ mode: "cond", show: true, lead: false }, async (h) => {
      const before = h.parts();
      await h.change("app/setFlags", { show: true, lead: true });
      const after = h.parts();

      expect(after.has("note:lead")).toBe(true);
      expect(after.get(row("shown"))!.key).toBe(before.get(row("shown"))!.key);
      expect(after.get(row("shown"))!.element).toBe(before.get(row("shown"))!.element);
      expect(after.get("note:fixed")!.element).toBe(before.get("note:fixed")!.element);
    });
  });

  it("V7 handlers: after [A,B] → [B,A] each element reports its own item, through PORT, MESH dispatch and a NEXUS command", async () => {
    await session({ items: items("A", "B") }, async (h) => {
      const before = h.parts();
      await h.change("app/setItems", { items: items("B", "A") });

      // The element that was A, now second, is clicked: the intent and the state say "a", not "the first button".
      h.click(before.get(row("A"))!.element);
      await h.settle();
      expect((await h.state()).picked).toBe("a");
      h.click(before.get(row("B"))!.element);
      await h.settle();
      expect((await h.state()).picked).toBe("b");
      // And the button that is first now is B's.
      h.click(h.container.querySelectorAll("button")[0]!);
      await h.settle();
      expect((await h.state()).picked).toBe("b");

      const intents = h.dispatched().map((exit) => (exit._tag === "Success" ? exit.value.intent : undefined));
      expect(intents.map((intent) => [intent?.command.name, intent?.arguments])).toEqual([
        ["pick", [{ value: "a" }]], ["pick", [{ value: "b" }]], ["pick", [{ value: "b" }]],
      ]);
    });
  });

  it("V8 program switch: dynamic structure is program-scoped; a change of program draws afresh, as before", async () => {
    await session({ items: items("A", "B") }, async (h) => {
      const inList = h.parts();
      await h.change("app/setItems", { items: items("B", "A") });
      expect(h.handoffs.map((handoff) => handoff.operation)).toEqual(["draw", "update"]);
      expect(h.parts().get(row("A"))!.element).toBe(inList.get(row("A"))!.element);

      await h.change("app/setMode", { mode: "other" });
      const inOther = h.parts();
      // Another program: PORT is told to draw, nothing is reused, and the same item has another key (keys are program-scoped).
      expect(h.handoffs.map((handoff) => handoff.operation)).toEqual(["draw", "update", "draw"]);
      expect(inList.get(row("A"))!.element.isConnected).toBe(false);
      expect(h.order("span")).toEqual(["B", "A"]);
      const keyInOther = inOther.get("note:A")!.key;
      expect(keyInOther).not.toBe(inList.get(row("A"))!.key);

      // An update inside the other program reconciles by its keys.
      const noteA = inOther.get("note:A")!.element;
      await h.change("app/setItems", { items: items("A", "B") });
      expect(h.handoffs.map((handoff) => handoff.operation)).toEqual(["draw", "update", "draw", "update"]);
      expect(h.parts().get("note:A")!.element).toBe(noteA);

      // And back: a draw again, so nothing from the first visit survives, and the keys are the program's again.
      await h.change("app/setMode", { mode: "list" });
      expect(h.handoffs.at(-1)!.operation).toBe("draw");
      expect(h.parts().get(row("A"))!.element).not.toBe(inList.get(row("A"))!.element);
      expect(h.parts().get(row("A"))!.key).toBe(inList.get(row("A"))!.key);
    });
  });

  it("the key is the same at every boundary: MESH's render, Valance's handoff, and what PORT acts on", async () => {
    await session({ items: items("A", "B") }, async (h) => {
      const keysOf = (tree: RenderTree): string[] => {
        const keys: string[] = [];
        const walk = (node: RenderNode): void => { keys.push(node.key); node.children.forEach((child) => { if (child.type === "node") { walk(child); } else { keys.push(child.key); } }); };
        walk(tree.root);

        return keys;
      };
      const before = h.parts();
      await h.change("app/setItems", { items: items("B", "A", "C") });
      const state = await h.state();

      // NEXUS state → MESH snapshot, as Valance's view function derives it.
      const snapshot = h.snapshotOf(state);
      expect(snapshot).toEqual({ items: [{ id: "b", label: "B" }, { id: "a", label: "A" }, { id: "c", label: "C" }] });
      // MESH's render of that state, rendered independently of the follower, has the keys Valance handed PORT: same, unchanged.
      const rendered = (await h.render()).render.tree;
      const handed = h.handoffs.at(-1)!.tree;
      expect(handed).toEqual(rendered);
      expect(keysOf(handed)).toEqual(keysOf(rendered));
      // PORT acted on exactly those keys: the objects it kept are the ones whose keys MESH kept (A, B), and C is new.
      const after = h.parts();
      expect(after.get(row("A"))!.key).toBe(before.get(row("A"))!.key);
      expect(after.get(row("A"))!.element).toBe(before.get(row("A"))!.element);
      expect(after.get(row("B"))!.element).toBe(before.get(row("B"))!.element);
      expect(before.has(row("C"))).toBe(false);
      // None of them is an array position: no key mentions the item, its id, or an index.
      for (const key of keysOf(handed)) {
        expect(key).toMatch(/^k[A-Za-z0-9_-]{22}$/);
      }
      expect(new Set(keysOf(handed)).size).toBe(keysOf(handed).length);
    });
  });
});
