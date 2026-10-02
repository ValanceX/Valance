// The failure tracer's application: the async tracer's application (one MESH program, one NEXUS state, the
// externally-controlled capability) in three variants. The variants are the experiment's subjects, not mutations.
//
//   unhandled  `data.load` fails with the capability's typed failure and nothing in the application catches it.
//   handled    `data.load` catches that failure itself and commits `failed`: ordinary application state.
//   guarded    `data.load` is as `unhandled`, but the application's own command table wraps every binding it
//              wrote in one function that turns a failure into state and an event. Public contracts only:
//              a binding is a plain function, state and events are NEXUS's.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Cause, Effect, Option, Schema } from "effect";

import { AppState, initial, Source } from "./app.js";

export type Mode = "unhandled" | "handled" | "guarded";

/** What a guarded application publishes about a command that failed. */
export const CommandFailed = Nexus.Event.define("CommandFailed", Schema.Struct({ command: Schema.String, failure: Schema.String }));

export interface Options {
  /** The program's `tick` command has no entry in the table: an intent no binding answers. */
  readonly omitTick?: boolean;
}

const describe = (cause: Cause.Cause<unknown>): string => Option.match(Cause.failureOption(cause), {
  onNone: () => "defect",
  onSome: (failure) => typeof failure === "object" && failure !== null && "_tag" in failure ? String((failure as { readonly _tag: unknown })._tag) : String(failure),
});

export const failureApplication = (program: Mesh.Program, seen: Array<string>, mode: Mode, options: Options = {}) => Valance.define({
  name: "failure-tracer",
  state: { schema: AppState, initial },
  views: { page: { program, scope: ({ status, data, ticks }) => ({ status, data, ticks }) } },
  view: () => "page" as const,
  commands: (state) => {
    const failed = state.update((current) => Effect.succeed({ ...current, status: "failed" }));
    const load = Nexus.Command.define("data.load", Schema.Struct({}), () => Effect.gen(function* () {
      seen.push("started");
      yield* state.update((current) => Effect.succeed({ ...current, status: "loading", data: "" }));
      seen.push("loading-committed");

      const source = yield* Nexus.Capability.require(Source);
      const data = yield* source.fetch;

      seen.push("fetched");
      yield* state.update((current) => Effect.succeed({ ...current, status: "loaded", data }));
    }).pipe(
      mode === "handled" ? Effect.catchAll(() => failed) : (effect) => effect,
      Effect.onInterrupt(() => Effect.sync(() => { seen.push("interrupted"); }))
    ));
    const tick = Nexus.Command.define("data.tick", Schema.Struct({}), () =>
      state.update((current) => Effect.succeed({ ...current, ticks: current.ticks + 1 })).pipe(Effect.asVoid));

    // The application's own uniform guard: only for what the application wrote. Nothing here is Valance's.
    const guard = <E, R>(key: string, binding: Mesh.Binding<E, R>): Mesh.Binding<never, R | Nexus.Event.EventBusShape> => (args) =>
      binding(args).pipe(Effect.catchAllCause((cause) => failed.pipe(Effect.andThen(Nexus.Event.publish(CommandFailed, { command: key, failure: describe(cause) })))));
    const bindings = {
      "asyncapp/load": Nexus.Mesh.bind(load, () => ({})),
      ...(options.omitTick === true ? {} : { "asyncapp/tick": Nexus.Mesh.bind(tick, () => ({})) }),
    };

    return mode === "guarded"
      ? Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, guard(key, binding)]))
      : bindings;
  },
});
