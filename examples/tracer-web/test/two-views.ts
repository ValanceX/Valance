// Shared fixture for composition.test.ts and multi-mount-views.test.ts: a tiny two-view application (views A and B, a mutation in each, one application-owned capability with an observable
// identity) over the real stack: MESH compiler and runtime, NEXUS, Valance, PORT Web (jsdom). PORT is not faked: the
// target only records the operation Valance asks for, then calls PORT.
import type { Mesh } from "@valancex/nexus";
import type { WebPort } from "@valancex/port-web";

import { compileProgram } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Layer, Schema } from "effect";

export interface Resource { readonly id: string }

export const Shared = Nexus.Capability.define<Resource>("example/shared");

export const State = Schema.Struct({ view: Schema.Literal("a", "b"), n: Schema.Number, via: Schema.String });
export type State = Schema.Schema.Type<typeof State>;

export const manifest = JSON.stringify({
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
export const sources = {
  a: `<page title="A"><text>A {n} via {via}</text><button on.click={bump()}>bump</button><button on.click={toB()}>to B</button></page>`,
  b: `<page title="B"><text>B {n} via {via}</text><button on.click={bump()}>bump</button><button on.click={toA()}>to A</button></page>`,
};

export const program = async (root: "a" | "b"): Promise<Mesh.Program> => {
  const result = await compileProgram({ model: { manifest, path: "components.json" }, root, components: [{ component: root, source: sources[root], path: `${root}.mprx` }] });

  if (result.program === undefined) {
    throw new Error(`${root} doesn't compile: ${JSON.stringify(result.assembly ?? result.components)}`);
  }

  return result.program;
};

export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
};

/** The application: its commands resolve the shared capability and record the instance they got. */
export const definition = async (seen: Array<Resource>) => {
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
export const platformOf = () => {
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

export type Operation = "hydrate" | "draw" | "update";

export const recording = (container: Element, operations: Array<Operation>): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => { operations.push("hydrate"); return port.hydrate(tree); },
    unmount: () => { port.unmount(); },
  };
};

