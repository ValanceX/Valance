// The Application Model tracer in Chromium, on NEXUS 0.10.1 / MESH 0.7.0 / PORT Web 0.2.2:
//
//   application state → view(state) → MESH 0.7 (keyed repeat) → PORT → DOM → click / history → application state → update | draw
//
// Part 1: a keyed list inside the `home` view: DOM OBJECT identity (not just text) through reorder, insertion, removal and
//         reappearance. No history anywhere: the application runs without it.
// Part 2: `Web.history` bound to the same union state through the application's own `urlOf` / `stateOf`.

import type { WebPort } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Effect, Layer } from "effect";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { application, stateOf, urlOf, type AppState, type Item } from "../src/catalog/app.js";
import { initialStateAt, primitives } from "../src/catalog/web.js";

const { catalog, catalogServed } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const item = (id: string): Item => ({ id, name: { A: "Alpha", B: "Beta", C: "Gamma", D: "Delta" }[id]! });
const items = (ids: string): ReadonlyArray<Item> => [...ids].map(item);
const ABC = items("ABC");

type Operation = "hydrate" | "draw" | "update";

const recording = (root: Element, operations: Array<Operation>): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container: root, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => { operations.push("hydrate"); return port.hydrate(tree); },
    unmount: () => { port.unmount(); },
  };
};

const countingPlatform = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(new Map()),
    Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
  );

  return { platform, counts };
};

const rows = (main: Element): ReadonlyArray<Element> => [...main.querySelectorAll("div")];

type Running = Valance.Running<AppState, unknown, never>;

interface Context {
  readonly main: HTMLElement;
  readonly running: Running;
  readonly operations: Array<Operation>;
  readonly counts: { acquired: number; released: number };
  /** The server's own row elements, captured before the application started (empty when nothing was served). */
  readonly server: ReadonlyArray<Element>;
  readonly serverSection: Element | null;
  /** PORT's own report of what hydration did; undefined when the application was mounted, not hydrated. */
  readonly hydration: unknown;
  /** Every binding key entered through `invoke`, from outside MESH: what history (and this test) asked of the application. */
  readonly invoked: Array<string>;
  readonly writes: Array<string>;
  /** What the application's own first act wrote, before Web.history existed. */
  readonly initialWrites: ReadonlyArray<string>;
  readonly entriesAtStart: number;
  readonly external: (key: string, value?: unknown) => Effect.Effect<void>;
}

/** One application, started in a scope, mounted in Chromium. `history` binds `Web.history` to it; without it nothing touches `window.history`. */
const run = async <A>(options: { readonly startUrl: string; readonly items?: ReadonlyArray<Item>; readonly history: boolean; readonly served?: typeof catalogServed }, body: (context: Context) => Effect.Effect<A>) => {
  window.history.replaceState(null, "", options.startUrl);
  const main = document.createElement("main");
  main.innerHTML = options.served?.html ?? "";                            // the page as the server sent it, before any script runs
  document.body.append(main);
  const server = rows(main);
  const serverSection = main.firstElementChild;
  const operations: Array<Operation> = [];
  const invoked: Array<string> = [];
  const writes: Array<string> = [];
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  window.history.pushState = (data: unknown, unused: string, target?: string | URL | null) => { writes.push(`push ${String(target)}`); push(data, unused, target); };
  window.history.replaceState = (data: unknown, unused: string, target?: string | URL | null) => { writes.push(`replace ${String(target)}`); replace(data, unused, target); };
  const { platform, counts } = countingPlatform();
  const entriesAtStart = window.history.length;

  try {
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      // The application's policy, before anything starts: what the URL means, and its canonical form.
      const state = options.served !== undefined ? options.served.state : options.history ? initialStateAt(window, options.items) : { view: "home" as const, items: options.items ?? ABC };
      const started = yield* Valance.start(application(catalog), { platform, state });
      const running = started as unknown as Running;
      // `invoke` is the one way in from outside MESH; recording it shows what enters the application and how.
      const watched: Running = { ...running, invoke: (key, args) => { invoked.push(key); return running.invoke(key, args); } };

      const mounted = options.served === undefined ? undefined : yield* Valance.hydrate(watched, recording(main, operations));

      if (options.served === undefined) {
        yield* Valance.mount(watched, recording(main, operations));
      }

      if (options.history) {
        yield* Web.history(watched, { window, urlOf, stateOf, navigate: "app/navigate" });
      }

      const external = (key: string, value?: unknown) => watched.invoke(key, value === undefined ? [] : [{ value: value as never }]).pipe(Effect.orDie, Effect.asVoid);
      const initialWrites = [...writes];                                   // the application's own canonicalization, before Web.history
      writes.length = 0;

      return yield* body({ main, running: watched, operations, counts, server, serverSection, hydration: mounted?.hydration, invoked, writes, initialWrites, entriesAtStart, external });
    })));

    return { result, counts, operations, writes };
  } finally {
    window.history.pushState = push;
    window.history.replaceState = replace;
    main.remove();
  }
};

const until = (check: () => boolean) => Effect.promise(async () => { await expect.poll(check).toBe(true); });
const url = (): string => window.location.pathname;
const rowOf = (main: Element, name: string): Element | undefined => rows(main).find((row) => row.querySelector("span")?.textContent === name);
const order = (main: Element): ReadonlyArray<string | null | undefined> => rows(main).map((row) => row.querySelector("span")?.textContent);
const clickRow = (main: Element, name: string) => Effect.promise(() => userEvent.click(rowOf(main, name)!.querySelector("button")!));

describe("Part 1: a keyed list inside the application's home view (no history)", () => {
  it("DOM objects follow the item's identity: reorder, insert, unrelated removal; removed and reappearing items are new", async () => {
    const { result, counts, operations } = await run({ startUrl: "/", history: false }, ({ main, external, running }) => Effect.gen(function* () {
      const settle = (names: ReadonlyArray<string>) => until(() => JSON.stringify(order(main)) === JSON.stringify(names));
      const el = (name: string) => rowOf(main, name);
      yield* settle(["Alpha", "Beta", "Gamma"]);
      const first = { A: el("Alpha")!, B: el("Beta")!, C: el("Gamma")! };

      // [A B C] → [C A B]: all kept (the same DOM objects), moved.
      yield* external("app/changeItems", items("CAB"));
      yield* settle(["Gamma", "Alpha", "Beta"]);
      expect([el("Alpha"), el("Beta"), el("Gamma")]).toEqual([first.A, first.B, first.C]);
      expect(el("Alpha") === first.A && el("Beta") === first.B && el("Gamma") === first.C).toBe(true);

      // [C A B] → [A C]: B removed (its element leaves the document); A and C, the unrelated items, keep their objects.
      yield* external("app/changeItems", items("AC"));
      yield* settle(["Alpha", "Gamma"]);
      expect(el("Alpha")).toBe(first.A);
      expect(el("Gamma")).toBe(first.C);
      expect(first.B.isConnected).toBe(false);

      // [A C] → [A C D]: D created; A and C untouched.
      yield* external("app/changeItems", items("ACD"));
      yield* settle(["Alpha", "Gamma", "Delta"]);
      expect(el("Alpha")).toBe(first.A);
      expect(el("Gamma")).toBe(first.C);
      const d = el("Delta")!;
      expect([first.A, first.B, first.C].includes(d)).toBe(false);

      // [A C D] → [D]: A and C removed; D keeps its object.
      yield* external("app/changeItems", items("D"));
      yield* settle(["Delta"]);
      expect(el("Delta")).toBe(d);
      expect(first.A.isConnected || first.C.isConnected).toBe(false);

      // [D] → [A C D]: A and C reappear as NEW occurrences (a new realization, nothing retained); D keeps its object.
      yield* external("app/changeItems", items("ACD"));
      yield* settle(["Alpha", "Gamma", "Delta"]);
      expect(el("Delta")).toBe(d);
      expect(el("Alpha")).not.toBe(first.A);
      expect(el("Gamma")).not.toBe(first.C);
      expect(first.A.isConnected || first.C.isConnected).toBe(false);

      // A moved/kept row's handler still belongs to its item: clicking D's button opens D... through MESH dispatch, in the application.
      const before = (yield* running.state).view;
      yield* clickRow(main, "Gamma");
      yield* until(() => main.textContent?.startsWith("Item C: Gamma") === true);

      return { before, after: (yield* running.state) };
    }));

    expect(result.before).toBe("home");
    expect(result.after).toEqual({ view: "details", items: items("ACD"), selectedId: "C" });
    // Every keyed change was an update of the same program; only the view change drew.
    expect(operations).toEqual(["draw", "update", "update", "update", "update", "update", "draw"]);
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });
});

describe("Part 2: Web.history bound to the union state, through the application's own urlOf / stateOf", () => {
  it("initial URL → canonical state; each transition → one push; Back/Forward → the application's navigate binding → draw; same-URL data change → update, no write", async () => {
    const trace: Array<{ step: string; url: string; view: string; state: AppState }> = [];

    const { result, counts, operations, writes } = await run({ startUrl: "/", items: ABC, history: true }, ({ main, running, external, invoked, writes: w, operations: ops }) => Effect.gen(function* () {
      const observe = (step: string) => Effect.gen(function* () {
        const state = yield* running.state;
        trace.push({ step, url: url(), view: state.view, state });
        // The application's state is authoritative: the browser URL is what `urlOf` says of it (nothing else is stored).
        expect(url(), step).toBe(urlOf(state));
      });
      const entries = window.history.length;

      // Initial canonical URL: state from the URL, nothing written.
      yield* until(() => order(main).length === 3);
      expect(w).toEqual([]);
      yield* observe("initial /");

      // Same view, URL unchanged: a data change updates, writes nothing.
      const a = rowOf(main, "Alpha")!;
      yield* external("app/changeItems", items("CAB"));
      yield* until(() => order(main)[0] === "Gamma");
      expect(rowOf(main, "Alpha")).toBe(a);
      expect(w).toEqual([]);
      expect(window.history.length).toBe(entries);
      expect(ops).toEqual(["draw", "update"]);
      yield* observe("home, items C A B");

      // View change by a MESH intent (a row's button): one push, a draw.
      yield* clickRow(main, "Alpha");
      yield* until(() => main.textContent?.startsWith("Item A: Alpha") === true);
      expect(w).toEqual(["push /items/A"]);
      expect(ops).toEqual(["draw", "update", "draw"]);
      yield* observe("details A");

      // Same view, same URL: items change while on details(A): update, no new entry.
      const detailsSection = main.firstElementChild;
      yield* external("app/changeItems", items("AC"));
      yield* until(() => main.textContent?.includes("2 items: Alpha, Gamma") === true);
      expect(main.firstElementChild).toBe(detailsSection);
      expect(w).toEqual(["push /items/A"]);
      expect(ops).toEqual(["draw", "update", "draw", "update"]);
      yield* observe("details A, items A C");

      // Back (a MESH intent) to home, then another item: two more pushes.
      yield* Effect.promise(() => userEvent.click(main.querySelector("button")!));
      yield* until(() => url() === "/" && order(main).length === 2);
      yield* clickRow(main, "Gamma");
      yield* until(() => main.textContent?.startsWith("Item C: Gamma") === true);
      expect(w).toEqual(["push /items/A", "push /", "push /items/C"]);
      yield* observe("details C");
      expect(invoked).toEqual(["app/changeItems", "app/changeItems"]);       // so far nothing but the two data changes came from outside MESH

      // Browser Back: popstate → stateOf(url) → "app/navigate" (the existing binding) → state → draw. No write.
      window.history.back();
      yield* until(() => url() === "/" && order(main).length === 2);
      expect((yield* running.state)).toEqual({ view: "home", items: items("AC") });     // the data the URL does not carry survived
      expect(invoked.slice(2)).toEqual(["app/navigate"]);
      expect(w).toEqual(["push /items/A", "push /", "push /items/C"]);
      yield* observe("Back → home");

      // Forward: the other direction, same mechanism.
      window.history.forward();
      yield* until(() => main.textContent?.startsWith("Item C: Gamma") === true);
      expect(invoked.slice(2)).toEqual(["app/navigate", "app/navigate"]);
      yield* observe("Forward → details C");

      // No loop: left alone, no further write, no further navigation, no further render.
      const settled = { writes: [...w], invoked: [...invoked], operations: [...ops], entries: window.history.length };
      yield* Effect.sleep("150 millis");
      expect({ writes: w, invoked, operations: ops, entries: window.history.length }).toEqual(settled);

      return { entries: window.history.length - entries, popstateOps: ops.slice(4) };
    }));

    // History: three pushes (A, home, C), and Back/Forward added none.
    expect(writes).toEqual(["push /items/A", "push /", "push /items/C"]);
    expect(result.entries).toBe(3);
    // PORT: data changes update; every view change, including those caused by popstate, draws.
    expect(operations).toEqual(["draw", "update", "draw", "update", "draw", "draw", "draw", "draw"]);
    expect(trace.map((t) => `${t.view} ${t.url}`)).toEqual(["home /", "home /", "details /items/A", "details /items/A", "details /items/C", "home /", "details /items/C"]);
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });

  for (const [served, view, canonical] of [["/", "home", null], ["/items/B", "details", null], ["/items/zzz", "not-found", "replace /not-found"], ["/nope", "not-found", "replace /not-found"]] as const) {
    it(`canonicalization is the application's: initial URL ${served} → ${view}${canonical === null ? ", nothing written" : `, ${canonical}, never a push`}`, async () => {
      const { result } = await run({ startUrl: served, items: ABC, history: true }, ({ running, writes: w, initialWrites, entriesAtStart }) => Effect.gen(function* () {
        const state = yield* running.state;
        yield* Effect.sleep("50 millis");

        return { state, initialWrites, after: [...w], url: url(), entries: window.history.length - entriesAtStart };
      }));

      expect(result.state.view).toBe(view);
      // The application's first act wrote exactly this (a replace, never a push): its policy, not Web.history's.
      expect(result.initialWrites).toEqual(canonical === null ? [] : [canonical]);
      expect(result.url).toBe(canonical === null ? served : "/not-found");
      expect(result.entries).toBe(0);
      // Web.history then wrote nothing, at start or on a settled state.
      expect(result.after).toEqual([]);
    });
  }
});

describe("Part 3: SSR → hydration → keyed update (server DOM, adopted, then updated by application transitions)", () => {
  it("the server's keyed nodes are adopted, and keep their identity through reorder, removal and insertion; a view change draws afresh", async () => {
    // What the server sent: the page's DOM exists before the application starts.
    const probe = document.createElement("main");
    probe.innerHTML = catalogServed.html;
    expect(order(probe)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(probe.querySelectorAll("div button")).toHaveLength(3);

    const { result, counts, operations } = await run({ startUrl: "/", history: false, served: catalogServed }, ({ main, external, running, hydration, server, serverSection }) => Effect.gen(function* () {
      const settle = (names: ReadonlyArray<string>) => until(() => JSON.stringify(order(main)) === JSON.stringify(names));
      const el = (name: string) => rowOf(main, name);

      // 1. Adoption (PORT's report), and the DOM is the server's.
      expect(hydration).toEqual({ adopted: true });
      const adopted = { A: el("Alpha")!, B: el("Beta")!, C: el("Gamma")! };
      const sectionAdopted = main.firstElementChild;

      // The server's own DOM objects ARE the hydrated ones: adopted, not replaced.
      expect(server).toHaveLength(3);
      expect([adopted.A, adopted.B, adopted.C]).toEqual([...server]);
      expect(adopted.A).toBe(server[0]);
      expect(adopted.B).toBe(server[1]);
      expect(adopted.C).toBe(server[2]);
      expect(sectionAdopted).toBe(serverSection);

      // 2. [A B C] → [C A B]: the adopted server nodes survive, reordered.
      yield* external("app/changeItems", items("CAB"));
      yield* settle(["Gamma", "Alpha", "Beta"]);
      expect(el("Alpha")).toBe(adopted.A);
      expect(el("Beta")).toBe(adopted.B);
      expect(el("Gamma")).toBe(adopted.C);
      expect(main.firstElementChild).toBe(sectionAdopted);

      // 3. [C A B] → [A C D]: A and C survive, B is removed, D is new.
      yield* external("app/changeItems", items("ACD"));
      yield* settle(["Alpha", "Gamma", "Delta"]);
      expect(el("Alpha")).toBe(adopted.A);
      expect(el("Gamma")).toBe(adopted.C);
      expect(adopted.B.isConnected).toBe(false);
      expect(el("Delta")).not.toBe(adopted.B);
      expect([adopted.A, adopted.B, adopted.C].includes(el("Delta")!)).toBe(false);

      // 4. A view change draws afresh: nothing of the keyed realization is reused by the other view.
      const rowsBefore = rows(main);
      yield* clickRow(main, "Delta");
      yield* until(() => main.textContent?.startsWith("Item D: Delta") === true);
      expect(main.firstElementChild).not.toBe(sectionAdopted);
      expect(sectionAdopted!.isConnected).toBe(false);
      expect(rowsBefore.every((row) => !row.isConnected)).toBe(true);
      expect(rows(main)).toEqual([]);

      return yield* running.state;
    }));

    expect(result).toEqual({ view: "details", items: items("ACD"), selectedId: "D" });
    expect(operations).toEqual(["hydrate", "update", "update", "draw"]);
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });

  it("an adopted repeated node's handler is live: clicking the server's own Beta button opens Beta", async () => {
    const { result, operations } = await run({ startUrl: "/", history: false, served: catalogServed }, ({ main, running, hydration }) => Effect.gen(function* () {
      expect(hydration).toEqual({ adopted: true });
      const beta = rowOf(main, "Beta")!;

      yield* clickRow(main, "Beta");
      yield* until(() => main.textContent?.startsWith("Item B: Beta") === true);
      expect(beta.isConnected).toBe(false);

      return yield* running.state;
    }));

    expect(result).toMatchObject({ view: "details", selectedId: "B" });
    expect(operations).toEqual(["hydrate", "draw"]);
  });
});
