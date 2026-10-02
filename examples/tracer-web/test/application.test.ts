// Application Model tracer: what is an application? Only the ownership tripwires, not a matrix.
//
//   home(items 1) → home(items 2) → details(A) → details(A, items 3) → home → not-found → details(A)
//   draw            update          draw          update                draw    draw        draw
//
// The same scenario runs twice: against a bare PORT-shaped Target (no DOM, no window, no history: the application
// is meaningful without the browser), and against the Web target in jsdom (MESH intents as real clicks).
import type { BoundaryValue } from "@valancex/mesh-runtime";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Exit, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { application, type AppState, type Item } from "../src/catalog/app.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { readFileSync } from "node:fs";
import { load, until } from "./helpers.js";

const ONE: ReadonlyArray<Item> = [{ id: "A", name: "Alpha" }];
const TWO: ReadonlyArray<Item> = [{ id: "A", name: "Alpha" }, { id: "B", name: "Beta" }];
const THREE: ReadonlyArray<Item> = [{ id: "A", name: "Alpha" }, { id: "B", name: "Beta" }, { id: "C", name: "Gamma" }];

type Operation = "draw" | "update";


/** A platform whose one scoped resource counts acquisition and release: the NEXUS runtime's lifetime, observed. */
const countingPlatform = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(new Map()),
    Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
  );

  return { platform, counts };
};

/** What the scenario does, in order, and what it must produce: the selected view and the PORT operation. */
interface Step {
  readonly name: string;
  readonly act: (ctx: Ctx) => Promise<void> | void;
  readonly view: AppState["view"];
  readonly operation: Operation;
}

interface Ctx {
  /** An event that does not come from a MESH render: `Running.invoke`, in the application's runtime. */
  readonly invoke: (key: string, value?: BoundaryValue) => Promise<void>;
  /** The user's "open the first item" / "back" on whatever is rendered. */
  readonly openFirst: () => Promise<void>;
  readonly back: () => Promise<void>;
}

const steps: ReadonlyArray<Step> = [
  { name: "changeItems(2) on home", act: (c) => c.invoke("app/changeItems", TWO as never), view: "home", operation: "update" },
  { name: "open A", act: (c) => c.openFirst(), view: "details", operation: "draw" },
  { name: "changeItems(3) on details", act: (c) => c.invoke("app/changeItems", THREE as never), view: "details", operation: "update" },
  { name: "back", act: (c) => c.back(), view: "home", operation: "draw" },
  { name: "open unknown", act: (c) => c.invoke("app/open", "nope"), view: "not-found", operation: "draw" },
  { name: "open A", act: (c) => c.invoke("app/open", "A"), view: "details", operation: "draw" },
];

/** Runs the scenario against a target, counting how often the application's own definition was asked to build behavior. */
const run = async (makeTarget: (operations: Array<Operation>) => Valance.TargetFactory<Valance.Target>, ctxOf: (running: Valance.Running<AppState, unknown, never>) => Pick<Ctx, "openFirst" | "back">, observe?: (step: string, state: AppState) => void) => {
  const base = application(await compilePrograms());
  const built: Array<Nexus.State.StateHandle<AppState>> = [];
  const app = { ...base, commands: (state: Nexus.State.StateHandle<AppState>) => { built.push(state); return base.commands(state); } };
  const operations: Array<Operation> = [];
  const shown: Array<string> = [];
  const { platform, counts } = countingPlatform();
  const status: Array<string> = [];
  let ended!: { running: Valance.Running<AppState, unknown, never>; mounted: Valance.Mounted<unknown> };

  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const started = yield* Valance.start(app, { platform });
    const running = started as unknown as Valance.Running<AppState, unknown, never>;
    // Which view each rendered state selected, in order.
    const watched: Valance.Running<AppState, unknown, never> = { ...running, values: Stream.tap(running.values, (viewed) => Effect.sync(() => { shown.push(viewed.view); })) };
    const mounted = yield* Valance.mount(watched, makeTarget(operations));
    ended = { running, mounted: mounted as never };
    const ctx: Ctx = {
      invoke: (key, value) => Effect.runPromise(running.invoke(key, value === undefined ? [] : [{ value }])).then(() => undefined),
      ...ctxOf(running),
    };
    const observeStatus = Effect.gen(function* () { status.push((yield* Nexus.Application.status(running.nexus))._tag); });

    expect(operations).toEqual(["draw"]);
    expect((yield* running.state).view).toBe("home");
    yield* observeStatus;

    for (const [index, step] of steps.entries()) {
      yield* Effect.promise(async () => { await step.act(ctx); await until(() => operations.length === index + 2); });
      const state = yield* running.state;

      // The selected view is the state's: the last thing rendered is the view the one state selects.
      expect(state.view, step.name).toBe(step.view);
      expect(shown.at(-1), step.name).toBe(state.view);
      expect(operations.at(-1), step.name).toBe(step.operation);
      observe?.(step.name, state);
      yield* observeStatus;
    }

    // Data survived every transition: the one state is the only place it lives.
    expect((yield* running.state).items).toEqual(THREE);
    expect(counts).toEqual({ acquired: 1, released: 0 });
  })));

  return { built, operations, shown, counts, status, ended };
};

/** No target at all: PORT's contract as a recording, with no DOM, no window and no history. */
const bare = (operations: Array<Operation>): Valance.TargetFactory<Valance.Target> => () => ({
  draw: () => { operations.push("draw"); },
  update: () => { operations.push("update"); },
  unmount: () => undefined,
});

const expectedOperations = ["draw", "update", "draw", "update", "draw", "draw", "draw"];
const expectedViews = ["home", "home", "details", "details", "home", "not-found", "details"];

describe("the application model", () => {
  it("without a browser: one state, one runtime lifetime, update for data, draw for views, release at shutdown", async () => {
    const result = await run(bare, (running) => ({
      openFirst: () => Effect.runPromise(running.invoke("app/open", [{ value: "A" }])).then(() => undefined),
      back: () => Effect.runPromise(running.invoke("app/home", [])).then(() => undefined),
    }));

    // One application state: the definition's behavior was built once, over one state handle, for every transition.
    expect(result.built).toHaveLength(1);
    // Repeated transitions, one lifetime: Running at every observation, acquired once, and (below) released once, at the end.
    expect(result.status).toEqual(Array(steps.length + 1).fill("Running"));
    // Same view → update; another view → draw. The selected view followed the state at every commit.
    expect(result.operations).toEqual(expectedOperations);
    expect(result.shown).toEqual(expectedViews);
    // Shutdown: the scope closing released the platform's resource, stopped the application, and ended the follower.
    expect(result.counts).toEqual({ acquired: 1, released: 1 });
    expect(await Effect.runPromise(Nexus.Application.status(result.ended.running.nexus))).toEqual({ _tag: "Stopped" });
    expect(Exit.isInterrupted(await Effect.runPromise(result.ended.mounted.followed))).toBe(true);
  });

  it("through PORT Web: MESH intents and external events drive the same state; DOM survives update, is replaced by draw", async () => {
    const page = load("");
    const sections: Array<Element | null> = [];
    const text: Array<string> = [];
    const web = (operations: Array<Operation>): Valance.TargetFactory<Valance.Target> => (report) => {
      const port = Web.target({ container: page.container, primitives })(report);

      return {
        draw: (tree) => { operations.push("draw"); port.draw(tree); sections.push(page.container.firstElementChild); text.push(page.container.textContent ?? ""); },
        update: (tree) => { operations.push("update"); port.update(tree); sections.push(page.container.firstElementChild); text.push(page.container.textContent ?? ""); },
        unmount: () => { port.unmount(); },
      };
    };
    const press = (): Promise<void> => { page.click(page.container.querySelector("button")!); return Promise.resolve(); };
    const result = await run(web, () => ({ openFirst: press, back: press }));

    expect(result.operations).toEqual(expectedOperations);
    expect(result.shown).toEqual(expectedViews);
    expect(result.counts).toEqual({ acquired: 1, released: 1 });
    expect(page.container.innerHTML).toBe("");

    // Identity: an update keeps the section (0→1, 2→3), every draw replaces it.
    const [d0, u1, d2, u3, d4, d5, d6] = sections;
    expect(u1).toBe(d0);
    expect(d2).not.toBe(u1);
    expect(u3).toBe(d2);
    expect(d4).not.toBe(u3);
    expect(d5).not.toBe(d4);
    expect(d6).not.toBe(d5);
    // And the DOM shows what the state says: the data changed on the same view, the view changed with the state.
    expect(text[0]).toContain("1 items: Alpha");
    expect(text[1]).toContain("2 items: Alpha, Beta");
    expect(text[2]).toContain("Item A: Alpha");
    expect(text[3]).toContain("3 items: Alpha, Beta, Gamma");
    expect(text[5]).toBe("Not foundBack");
    // No browser history was involved: nothing in this application touched it.
    expect(page.window.history.length).toBe(1);
  });

  it("a data change can change the view, because the application decides view and data together", async () => {
    const app = application(await compilePrograms());
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app);
      const invoke = (key: string, value?: BoundaryValue) => running.invoke(key, value === undefined ? [] : [{ value }]).pipe(Effect.orDie);

      yield* invoke("app/open", "A");
      yield* invoke("app/changeItems", [{ id: "B", name: "Beta" }] as never);              // A is gone

      return yield* running.state;
    })));

    expect(result).toEqual({ view: "not-found", items: [{ id: "B", name: "Beta" }] });
  });

  it("the definition owns no platform: it imports nothing Web, PORT or history, and keeps no route store", () => {
    const source = readFileSync(new URL("../src/catalog/app.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/valance\/web|port-web|\bwindow\b|\bdocument\b|\bhistory\b|popstate|location/);
    // The URL's two functions are pure, over the one state: no second state for "where we are".
    expect(source).toMatch(/export const urlOf = \(state: AppState\): string/);
    expect(source).toMatch(/export const stateOf = \(url: URL\): Navigation/);
  });
});
