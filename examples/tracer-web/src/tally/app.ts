// A small realistic application, written only against the public API (`@valancex/valance`, `@valancex/valance/web`) and NEXUS for behavior.
// It names no MESH host, no PORT target, no draw/update, no render, no handler id, and imports nothing from `./internal`.
//
//   state        one record; `path` says where the user is, the rest is data the views share
//   views        home / details / settings: one MESH program each, a scope function from the state
//   view(state)  the path selects the view
//   commands     increment (in every view), relabel (details), navigate (every intent and the browser's Back go through it)
//   capability   `Ticker`: the application's contract; the platform supplies the implementation and owns its resource
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

export const Ticker = Nexus.Capability.define<{ readonly next: () => number }>("tally/ticker");

export const AppState = Schema.Struct({ path: Schema.Literal("/", "/details", "/settings"), label: Schema.String, count: Schema.Number, tick: Schema.Number });
export type AppState = Schema.Schema.Type<typeof AppState>;
export type Path = AppState["path"];

export const initial: AppState = { path: "/", label: "Tally", count: 0, tick: 0 };

const BASE = "/tally";

/** state → URL, and URL → the part of the state it names. What a URL means is the application's. */
export const urlOf = ({ path }: AppState): string => `${BASE}${path === "/" ? "/" : path}`;
export const stateOf = (url: URL): { readonly path: Path } => {
  const path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) || "/" : "/";

  return { path: path === "/details" || path === "/settings" ? path : "/" };
};
/** What a request URL means: the state the application starts in, for the server and the client alike. */
export const stateFor = (url: string): AppState => ({ ...initial, ...stateOf(new URL(url, "http://localhost")) });

export interface Programs {
  readonly home: Mesh.Program;
  readonly details: Mesh.Program;
  readonly settings: Mesh.Program;
}

const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

export const application = (programs: Programs) => Valance.define({
  name: "tally",
  state: { schema: AppState, initial },
  views: {
    home: { program: programs.home, scope: ({ label, count, tick }) => ({ label, count, tick }) },
    details: { program: programs.details, scope: ({ label, count, tick }) => ({ label, count, tick }) },
    settings: { program: programs.settings, scope: ({ label, count }) => ({ label, count }) },
  },
  view: ({ path }) => path === "/" ? "home" : path === "/details" ? "details" : "settings",
  commands: (state) => {
    const increment = Nexus.Command.define("tally.increment", Schema.Struct({}), () => Effect.gen(function* () {
      const ticker = yield* Nexus.Capability.require(Ticker);
      const tick = ticker.next();

      yield* state.update((current) => Effect.succeed({ ...current, count: current.count + 1, tick }));
    }));
    const relabel = Nexus.Command.define("tally.relabel", Schema.Struct({}), () =>
      state.update((current) => Effect.succeed({ ...current, label: current.label === "Tally" ? "Totals" : "Tally" })).pipe(Effect.asVoid));
    const navigate = Nexus.Command.define("tally.navigate", Schema.Struct({ path: Schema.Literal("/", "/details", "/settings") }), ({ path }) =>
      state.update((current) => Effect.succeed({ ...current, path })).pipe(Effect.asVoid));
    const go = (path: Path) => Nexus.Mesh.bind(navigate, () => ({ path }));

    return {
      "home/increment": Nexus.Mesh.bind(increment, () => ({})),
      "details/increment": Nexus.Mesh.bind(increment, () => ({})),
      "settings/increment": Nexus.Mesh.bind(increment, () => ({})),
      "details/relabel": Nexus.Mesh.bind(relabel, () => ({})),
      "home/goDetails": go("/details"),
      "details/goSettings": go("/settings"),
      "settings/goHome": go("/"),
      // For input that is not a rendered intent: the browser's Back. The same command.
      "app/navigate": Nexus.Mesh.bind(navigate, (args) => firstValue(args)),
    };
  },
});
