// One application, two MESH programs, one NEXUS runtime: what is shared, what is recreated, what each view switch disposes.
// A tiny application defined here (views A and B, a mutation in each, one application-owned capability with an observable
// identity) over the real stack: MESH compiler and runtime, NEXUS, Valance, PORT Web (jsdom). PORT is not faked: the
// target only records the operation Valance asks for, then calls PORT.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { load, until } from "./helpers.js";
import { definition, platformOf, primitives, recording, type Operation, type Resource, type State } from "./two-views.js";

type Page = ReturnType<typeof load>;
const buttons = (page: Page): ReadonlyArray<Element> => Array.from(page.container.querySelectorAll("button"));
const shown = (page: Page): string => page.container.querySelector("span")!.textContent!;

describe("one application, two MESH programs, one runtime", () => {
  it("state, the NEXUS runtime and the application's resource are the application's; the DOM belongs to the drawn view; a left view receives no events", async () => {
    const seen: Array<Resource> = [];
    const app = await definition(seen);
    const { counts, platform } = platformOf();
    const page = load("");
    const operations: Array<Operation> = [];
    const runtimes = new Set<unknown>();

    const outcome = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform });
      const mounted = yield* Valance.mount(handle, recording(page.container, operations));
      const press = (button: Element, expected: string) => Effect.gen(function* () {
        const before = mounted.dispatched.length;

        page.click(button);
        yield* mounted.settled;
        yield* Effect.promise(() => until(() => shown(page).startsWith(expected)));
        runtimes.add(runningOf(handle).nexus);

        return mounted.dispatched.length - before;
      });

      const [bumpA, toB] = buttons(page);
      yield* press(bumpA!, "A 1");                                  // A: mutate
      yield* press(bumpA!, "A 2");
      yield* press(toB!, "B 2");                                    // → B: the state is still there
      const [bumpB, toA] = buttons(page);
      const viewA = { bump: bumpA!, toB: toB! };                    // A's elements, now left

      yield* press(bumpB!, "B 3");                                  // B: mutate
      const sectionB = page.container.firstElementChild;
      yield* press(toA!, "A 3");                                    // → A: redrawn, with everything accumulated
      const [bumpA2] = buttons(page);

      // A's old elements are not the new ones, are gone from the page, and a report on them reaches nothing.
      const stale = {
        replaced: [bumpA2 !== viewA.bump, !page.container.contains(viewA.bump), !page.container.contains(sectionB)],
        dispatchesFromLeftA: yield* Effect.sync(() => { const before = mounted.dispatched.length; page.click(viewA.bump); page.click(viewA.toB); return before; }),
      };
      yield* mounted.settled;
      yield* Effect.sleep("30 millis");
      const afterStaleClicks = { dispatched: mounted.dispatched.length, text: shown(page), state: yield* handle.state, extra: mounted.dispatched.length - stale.dispatchesFromLeftA };
      yield* press(bumpA2!, "A 4");                                 // the drawn view still works

      return { stale, afterStaleClicks, state: yield* handle.state, status: (yield* Nexus.Application.status(runningOf(handle).nexus))._tag, countsWhileRunning: { ...counts } };
    })));

    // One application: one runtime object across every observation, one acquisition of the resource, still Running, released with the Scope.
    expect(runtimes.size).toBe(1);
    expect(outcome.status).toBe("Running");
    expect(outcome.countsWhileRunning).toEqual({ acquired: 1, released: 0 });
    expect(counts).toEqual({ acquired: 1, released: 1 });
    // The resource: the same instance every command, in either view, resolved the whole time.
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(1);
    expect(outcome.state).toEqual({ view: "a", n: 4, via: "resource-1" });
    // PORT continuity: update within a view, draw on each program change (and on re-entering A).
    expect(operations).toEqual(["draw", "update", "update", "draw", "update", "draw", "update"]);
    // A left view's elements are discarded and report to nothing: no dispatch, no state change.
    expect(outcome.stale.replaced).toEqual([true, true, true]);
    expect(outcome.afterStaleClicks.extra).toBe(0);
    expect(outcome.afterStaleClicks.state).toMatchObject({ view: "a", n: 3 });
    expect(outcome.afterStaleClicks.text).toBe("A 3 via resource-1");
  });

  it("SSR → hydrate B → update in B → navigate (draw) → navigate back (draw): the same model, with no second runtime", async () => {
    const seen: Array<Resource> = [];
    const app = await definition(seen);
    const { counts, platform } = platformOf();
    const initialB: State = { view: "b", n: 5, via: "-" };
    const served = await Effect.runPromise(renderToHtml(app, { primitives, state: initialB }));
    const page = load(served.html);
    const operations: Array<Operation> = [];
    const server = page.nodes();

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform, state: served.state });
      const mounted = yield* Valance.hydrate(handle, recording(page.container, operations));

      expect(mounted.hydration).toEqual({ adopted: true });
      expect(server.every((node) => page.container.contains(node))).toBe(true);
      const press = (index: number, expected: string) => Effect.gen(function* () {
        page.click(buttons(page)[index]!);
        yield* mounted.settled;
        yield* Effect.promise(() => until(() => shown(page).startsWith(expected)));
      });

      yield* press(0, "B 6");
      expect(server.every((node) => page.container.contains(node))).toBe(true);        // an update keeps the adopted nodes
      yield* press(1, "A 6");                                                           // B → A
      yield* press(1, "B 6");                                                           // A → B
    })));

    expect(operations).toEqual(["hydrate", "update", "draw", "draw"]);
    expect(new Set(seen).size).toBe(1);
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });
});
