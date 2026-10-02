// The tracer's application, written against Valance. It names NEXUS for behavior (state, commands, Clock)
// and nothing of MESH hosts or PORT: the Web realization table is target configuration, below.
//
// One application, one NEXUS state, two MESH programs. Which program is shown is a function of the state:
// `path` is application state, and `view` maps it to a program. Navigation is an ordinary NEXUS command.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import * as Nexus from "@valancex/nexus";
import { Clock, Effect, Schema } from "effect";

export const AppState = Schema.Struct({ title: Schema.String, count: Schema.Number, stamp: Schema.Number, path: Schema.String });
export type AppState = Schema.Schema.Type<typeof AppState>;

export const initial: AppState = { title: "Tracer", count: 0, stamp: 0, path: "/" };

/** What a request URL means: the state the application starts in. The server and the client both start from it. */
export const stateFor = (path: string): AppState => ({ ...initial, path });

/** Published by the one navigate command, whoever asked for it: a MESH intent or the browser's Back. */
export const Navigated = Nexus.Event.define("Navigated", Schema.Struct({ path: Schema.String }));

/** The one argument of "app/navigate", as MESH's boundary gives it. Whether it is a path is the command's schema's to say. */
const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

export interface Programs {
  readonly counter: Mesh.Program;
  readonly about: Mesh.Program;
}

export const application = (programs: Programs) => Valance.define({
  name: "tracer-web",
  state: { schema: AppState, initial },
  views: {
    counter: { program: programs.counter, scope: ({ title, count, stamp }) => ({ title, count, stamp }) },
    about: { program: programs.about, scope: ({ title, count }) => ({ title, count }) },
  },
  // Route state is application state; the active program is derived from it.
  view: (state) => state.path === "/about" ? "about" : "counter",
  commands: (state) => {
    // Behavior: the platform's Clock (application code sees it; the caller never does).
    const increment = Nexus.Command.define("counter.increment", Schema.Struct({}), () =>
      Effect.flatMap(Clock.currentTimeMillis, (stamp) => state.update((current) => Effect.succeed({ ...current, count: current.count + 1, stamp }))).pipe(Effect.asVoid));
    const navigate = Nexus.Command.define("app.navigate", Schema.Struct({ path: Schema.String }), ({ path }) =>
      state.update((current) => Effect.succeed({ ...current, path })).pipe(Effect.andThen(Nexus.Event.publish(Navigated, { path }))));

    return {
      "counter/increment": Nexus.Mesh.bind(increment, () => ({})),
      "counter/goAbout": Nexus.Mesh.bind(navigate, () => ({ path: "/about" })),
      "about/goHome": Nexus.Mesh.bind(navigate, () => ({ path: "/" })),
      // Not a MESH component: the same command, for input that is not a MESH intent (the browser's popstate).
      "app/navigate": Nexus.Mesh.bind(navigate, (args) => ({ path: firstValue(args) })),
    };
  },
});

/** The Web realization of the application's primitives. Target configuration: Valance's definition never sees it. */
export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
};
