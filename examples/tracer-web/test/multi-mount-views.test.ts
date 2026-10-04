// One application, several mounts, several views. Real stack (MESH compiler/runtime, NEXUS, Valance, PORT Web in jsdom), the fixture
// of composition.test.ts: views A and B over ONE state, one application-owned capability. Each mount is a real `Valance.mount` in ITS OWN Scope.
//
// What is observed: which of these the application owns (one) and which each mount owns (a target, a drawn render, a continuity), and
// whether the view is selected per mount or by the application (it is `view(state)`: the application's, so every mount shows it).
import { Effect, Exit, Scope } from "effect";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import { describe, expect, it } from "vitest";

import { load, until } from "./helpers.js";
import { definition, platformOf, recording, type Operation, type Resource } from "./two-views.js";

type Page = ReturnType<typeof load>;
const buttons = (page: Page): ReadonlyArray<Element> => Array.from(page.container.querySelectorAll("button"));
const shown = (page: Page): string => page.container.querySelector("span")?.textContent ?? "";

/** The application in its Scope, and `mountIn(page)`: a mount in its own Scope (closed by the caller, or with the application's). */
const scenario = async <A>(body: (context: {
  readonly handle: Valance.ApplicationHandle<{ readonly view: "a" | "b"; readonly n: number; readonly via: string }, unknown>;
  readonly mountIn: (page: Page) => Effect.Effect<{ readonly mounted: Valance.Mounted<unknown>; readonly operations: Array<Operation>; readonly close: Effect.Effect<void> }, unknown>;
  readonly seen: Array<Resource>;
  readonly counts: { acquired: number; released: number };
}) => Effect.Effect<A, unknown>): Promise<A> => {
  const seen: Array<Resource> = [];
  const app = await definition(seen);
  const { counts, platform } = platformOf();

  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const handle = yield* Valance.start(app, { platform });
    const mountIn = (page: Page) => Effect.gen(function* () {
      const scope = yield* Scope.make();
      const operations: Array<Operation> = [];
      const mounted = yield* Valance.mount(handle, recording(page.container, operations)).pipe(Scope.extend(scope));

      return { mounted, operations, close: Scope.close(scope, Exit.void) };
    });

    return yield* body({ handle, mountIn, seen, counts });
  })));
};

const press = (page: Page, mounted: Valance.Mounted<unknown>, index: number, expected: string) => Effect.gen(function* () {
  page.click(buttons(page)[index]!);
  yield* mounted.settled;
  yield* Effect.promise(() => until(() => shown(page) === expected));
});

describe("one application, several mounts", () => {
  it("M1 state is the application's: one command, one commit, every mount updates once; the clicking mount alone holds the dispatch", async () => {
    const result = await scenario(({ handle, mountIn, seen }) => Effect.gen(function* () {
      const [p1, p2] = [load(""), load("")];
      const m1 = yield* mountIn(p1);
      const m2 = yield* mountIn(p2);

      yield* press(p1, m1.mounted, 0, "A 1 via resource-1");
      yield* Effect.promise(() => until(() => shown(p2) === "A 1 via resource-1"));
      yield* Effect.sleep("30 millis");

      return { state: yield* handle.state, resolved: seen.length, ops: [m1.operations, m2.operations], dispatched: [m1.mounted.dispatched.length, m2.mounted.dispatched.length], texts: [shown(p1), shown(p2)] };
    }));

    expect(result.state).toEqual({ view: "a", n: 1, via: "resource-1" });
    expect(result.resolved).toBe(1);                                          // the command ran once
    expect(result.texts).toEqual(["A 1 via resource-1", "A 1 via resource-1"]);
    expect(result.ops).toEqual([["draw", "update"], ["draw", "update"]]);     // each mount: its own continuity
    expect(result.dispatched).toEqual([1, 0]);                                // the event belongs to the mount that reported it
  });

  it("M2 the view is the application's, not the mount's: navigating from either mount draws in all of them, and a later mount draws the current view", async () => {
    const result = await scenario(({ handle, mountIn }) => Effect.gen(function* () {
      const [p1, p2, p3] = [load(""), load(""), load("")];
      const m1 = yield* mountIn(p1);
      const m2 = yield* mountIn(p2);

      yield* press(p2, m2.mounted, 1, "B 0 via -");                           // to B, from mount 2
      yield* Effect.promise(() => until(() => shown(p1) === "B 0 via -"));
      const m3 = yield* mountIn(p3);                                          // after the navigation
      yield* press(p1, m1.mounted, 0, "B 1 via resource-1");                  // a mutation in B, from mount 1
      yield* Effect.promise(() => until(() => shown(p2) === "B 1 via resource-1" && shown(p3) === "B 1 via resource-1"));

      return { view: (yield* handle.state).view, ops: [m1.operations, m2.operations, m3.operations] };
    }));

    expect(result.view).toBe("b");
    expect(result.ops).toEqual([["draw", "draw", "update"], ["draw", "draw", "update"], ["draw", "update"]]);
  });

  it("M3 a report is dispatched against ITS OWN mount's drawn render, even while another mount has already drawn the new view", async () => {
    const result = await scenario(({ handle, mountIn, seen }) => Effect.gen(function* () {
      const [p1, p2] = [load(""), load("")];
      const m1 = yield* mountIn(p1);
      const m2 = yield* mountIn(p2);
      const bumpInTwo = buttons(p2)[0]!;

      // One turn: mount 1 asks for B; mount 2, whose target has not drawn B yet, reports a click on A's bump.
      p1.click(buttons(p1)[1]!);
      p2.click(bumpInTwo);
      yield* m1.mounted.settled;
      yield* m2.mounted.settled;
      yield* Effect.promise(() => until(() => shown(p1) === "B 1 via resource-1" && shown(p2) === "B 1 via resource-1"));

      return { state: yield* handle.state, resolved: seen.length, exits: [m1.mounted.dispatched.map((e) => e._tag), m2.mounted.dispatched.map((e) => e._tag)] };
    }));

    expect(result.state).toEqual({ view: "b", n: 1, via: "resource-1" });
    expect(result.resolved).toBe(1);
    expect(result.exits).toEqual([["Success"], ["Success"]]);                 // no render/handler mismatch from either mount
  });

  it("M4 closing a mount ends that presentation only: the other mount, the state, the resource and the runtime go on; the resource is released with the application", async () => {
    const observed: Array<{ step: string; one: string; two: string; status: string; acquired: number; released: number; n: number }> = [];

    const counts = await scenario(({ handle, mountIn, counts: c }) => Effect.gen(function* () {
      const [p1, p2] = [load(""), load("")];
      const m1 = yield* mountIn(p1);
      const m2 = yield* mountIn(p2);
      const observe = (step: string) => Effect.gen(function* () {
        observed.push({ step, one: shown(p1), two: shown(p2), status: (yield* Nexus.Application.status(runningOf(handle).nexus))._tag, ...c, n: (yield* handle.state).n });
      });

      yield* observe("both");
      yield* m1.close;
      yield* observe("mount 1 closed");
      yield* press(p2, m2.mounted, 0, "A 1 via resource-1");                 // mount 2 still works: its own event, its own update
      yield* Effect.sleep("30 millis");
      yield* observe("mount 2 after a click");
      yield* m2.close;
      yield* handle.invoke("a/bump", []);                                    // no mounts at all: the application still runs commands
      yield* observe("no mounts");

      return c;                                                              // the live counters: read after the application's Scope has closed
    }));

    // The closed mount's elements are gone and it is no longer updated; the other mount carries on; nothing of the application was touched.
    expect(observed.map((o) => [o.step, o.one, o.two, o.status, o.acquired, o.released, o.n])).toEqual([
      ["both", "A 0 via -", "A 0 via -", "Running", 1, 0, 0],
      ["mount 1 closed", "", "A 0 via -", "Running", 1, 0, 0],
      ["mount 2 after a click", "", "A 1 via resource-1", "Running", 1, 0, 1],
      ["no mounts", "", "", "Running", 1, 0, 2],
    ]);
    expect(counts).toEqual({ acquired: 1, released: 1 });                      // released by the application's Scope, after every mount
  });
});
