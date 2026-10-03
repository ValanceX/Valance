// One application, two MESH programs, one NEXUS runtime: what is shared, what is recreated, what each view switch disposes.
// A tiny application defined here (views A and B, a mutation in each, one application-owned capability with an observable
// identity) over the real stack: MESH compiler and runtime, NEXUS, Valance, PORT Web (jsdom). PORT is not faked: the
// target only records the operation Valance asks for, then calls PORT.
import type { Mesh } from "@valancex/nexus";
import type { WebPort } from "@valancex/port-web";

import { compile } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect, Layer, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { load, until } from "./helpers.js";

interface Resource { readonly id: string }

const Shared = Nexus.Capability.define<Resource>("example/shared");

const State = Schema.Struct({ view: Schema.Literal("a", "b"), n: Schema.Number, via: Schema.String });
type State = Schema.Schema.Type<typeof State>;

const manifest = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: { props: { title: { type: { kind: "string" }, required: true } }, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    a: { props: {}, events: {}, commands: { bump: { parameters: [] }, toB: { parameters: [] } }, scope: { n: { kind: "number" }, via: { kind: "string" } } },
    b: { props: {}, events: {}, commands: { bump: { parameters: [] }, toA: { parameters: [] } }, scope: { n: { kind: "number" }, via: { kind: "string" } } },
  },
});
const sources = {
  a: `<page title="A"><text>A {n} via {via}</text><button on.click={bump()}>bump</button><button on.click={toB()}>to B</button></page>`,
  b: `<page title="B"><text>B {n} via {via}</text><button on.click={bump()}>bump</button><button on.click={toA()}>to A</button></page>`,
};

const program = async (root: "a" | "b"): Promise<Mesh.Program> => {
  const result = await compile({ source: sources[root], path: `${root}.mprx`, model: { manifest, path: "components.json", component: root } });

  if (result.template === undefined) {
    throw new Error(`${root} doesn't compile: ${JSON.stringify(result.diagnostics)}`);
  }

  return { root, templates: [JSON.stringify(result.template)], model: manifest };
};

const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
};

/** The application: its commands resolve the shared capability and record the instance they got. */
const definition = async (seen: Array<Resource>) => {
  const programs = { a: await program("a"), b: await program("b") };
  const initial: State = { view: "a", n: 0, via: "-" };

  return Valance.define({
    name: "composition",
    state: { schema: State, initial },
    views: {
      a: { program: programs.a, scope: ({ n, via }) => ({ n, via }) },
      b: { program: programs.b, scope: ({ n, via }) => ({ n, via }) },
    },
    view: (state) => state.view,
    commands: (state) => {
      const bump = Nexus.Command.define("t.bump", Schema.Struct({}), () => Effect.gen(function* () {
        const resource = yield* Nexus.Capability.require(Shared);

        seen.push(resource);
        yield* state.update((current) => Effect.succeed({ ...current, n: current.n + 1, via: resource.id }));
      }));
      const to = (view: "a" | "b") => Nexus.Command.define(`t.to.${view}`, Schema.Struct({}), () => state.update((current) => Effect.succeed({ ...current, view })).pipe(Effect.asVoid));

      return {
        "a/bump": Nexus.Mesh.bind(bump, () => ({})),
        "b/bump": Nexus.Mesh.bind(bump, () => ({})),
        "a/toB": Nexus.Mesh.bind(to("b"), () => ({})),
        "b/toA": Nexus.Mesh.bind(to("a"), () => ({})),
      };
    },
  });
};

/** The platform: one resource per application start, counted. Its identity is the instance, not a name. */
const platformOf = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.acquireRelease(
      Effect.sync((): Resource => { counts.acquired += 1; return { id: `resource-${counts.acquired}` }; }),
      () => Effect.sync(() => { counts.released += 1; })
    ),
    (implementation) => ({ resolutions: new Map([[Shared.id, { _tag: "Available" as const, implementation }]]) })
  ));

  return { counts, platform };
};

type Operation = "hydrate" | "draw" | "update";

const recording = (container: Element, operations: Array<Operation>): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => { operations.push("hydrate"); return port.hydrate(tree); },
    unmount: () => { port.unmount(); },
  };
};

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
