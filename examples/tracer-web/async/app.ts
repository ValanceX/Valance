// The async ownership tracer's application: one MESH program, one NEXUS state, one platform capability.
//
// Written in the most direct NEXUS form: `data.load` is a command whose handler commits `loading`, awaits the
// capability, and commits `loaded`. Nothing here is a Valance construct. `seen` is tracer instrumentation: it records
// what the handler did and when, so a test can tell whether any of it happened after the application was closed.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

export const AppState = Schema.Struct({ status: Schema.String, data: Schema.String, ticks: Schema.Number });
export type AppState = Schema.Schema.Type<typeof AppState>;

export const initial: AppState = { status: "idle", data: "", ticks: 0 };

/** The one way the capability's work can fail. */
export type WorkFailed = { readonly _tag: "WorkFailed" };

/** The capability: work that completes when the platform says so. */
export const Source = Nexus.Capability.define<{ readonly fetch: Effect.Effect<string, WorkFailed> }>("async-tracer.source");

export const application = (program: Mesh.Program, seen: Array<string>) => Valance.define({
  name: "async-tracer",
  state: { schema: AppState, initial },
  views: { page: { program, scope: ({ status, data, ticks }) => ({ status, data, ticks }) } },
  view: () => "page" as const,
  commands: (state) => {
    const load = Nexus.Command.define("data.load", Schema.Struct({}), () => Effect.gen(function* () {
      seen.push("started");
      yield* state.update((current) => Effect.succeed({ ...current, status: "loading", data: "" }));
      seen.push("loading-committed");

      const source = yield* Nexus.Capability.require(Source);
      const data = yield* source.fetch;

      seen.push("fetched");
      yield* state.update((current) => Effect.succeed({ ...current, status: "loaded", data }));
      seen.push("loaded-committed");
    }).pipe(Effect.onInterrupt(() => Effect.sync(() => { seen.push("interrupted"); }))));
    const tick = Nexus.Command.define("data.tick", Schema.Struct({}), () =>
      state.update((current) => Effect.succeed({ ...current, ticks: current.ticks + 1 })).pipe(Effect.asVoid));

    return {
      "asyncapp/load": Nexus.Mesh.bind(load, () => ({})),
      "asyncapp/tick": Nexus.Mesh.bind(tick, () => ({})),
    };
  },
});

/** The Web realization of the application's primitives. */
export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
};
