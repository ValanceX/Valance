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

export const AppState = Schema.Struct({ title: Schema.String, count: Schema.Number, stamp: Schema.Number, path: Schema.String, tab: Schema.String });
export type AppState = Schema.Schema.Type<typeof AppState>;

export const initial: AppState = { title: "Tracer", count: 0, stamp: 0, path: "/", tab: "overview" };

// The URL the application is shown at is NOT its `path`: it has a fixed base path, and the query holds `tab`.
// What a URL means is the application's: these two functions are all of it. (`count`, `stamp`, `title` are not in the URL.)
const BASE = "/tracer";

/** The part of the state the URL represents. */
export type Navigation = Pick<AppState, "path" | "tab">;

/** state → URL (path and query, as `location.pathname + location.search` will read it back). */
export const urlOf = ({ path, tab }: AppState): string => `${BASE}${path}?tab=${encodeURIComponent(tab)}`;

/** The paths the application has a view for. Everything else is, explicitly, "/not-found". */
const KNOWN = ["/", "/about"];
export const NOT_FOUND = "/not-found";

/** URL → the part of the state it represents. Total: a URL naming no view is the explicit state `/not-found`. */
export const stateOf = (url: URL): Navigation => {
  const path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) || "/" : url.pathname;

  return { path: KNOWN.includes(path) ? path : NOT_FOUND, tab: url.searchParams.get("tab") ?? initial.tab };
};

/** What a request URL means: the state the application starts in. The server and the client both start from it. */
export const stateFor = (url: string): AppState => ({ ...initial, ...stateOf(new URL(url, "http://localhost")) });

/** Published by the one navigate command, whoever asked for it: a MESH intent or the browser's Back. */
export const Navigated = Nexus.Event.define("Navigated", Schema.Struct({ path: Schema.String, tab: Schema.String }));

/** The one argument of "app/navigate", as MESH's boundary gives it. Whether it is a path is the command's schema's to say. */
const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

export interface Programs {
  readonly counter: Mesh.Program;
  readonly about: Mesh.Program;
  readonly missing: Mesh.Program;
}

/**
 * The page's first act, BEFORE `Valance.start` and `Web.history`: what the URL means, and a canonical URL for it.
 * If the URL is not already `urlOf(state)` it is replaced (never pushed): the visitor did not navigate anywhere.
 * That decision, and this being the moment for it, are the application's.
 */
export const initialStateAt = (win: Window): AppState => {
  const state = stateFor(win.location.pathname + win.location.search);

  if (win.location.pathname + win.location.search !== urlOf(state)) {
    win.history.replaceState(null, "", urlOf(state));
  }

  return state;
};

export const application = (programs: Programs) => Valance.define({
  name: "tracer-web",
  state: { schema: AppState, initial },
  views: {
    counter: { program: programs.counter, scope: ({ title, count, stamp }) => ({ title, count, stamp }) },
    about: { program: programs.about, scope: ({ title, count, tab }) => ({ title, count, tab }) },
    missing: { program: programs.missing, scope: ({ title }) => ({ title }) },
  },
  // Route state is application state; the active program is derived from it.
  view: (state) => state.path === "/" ? "counter" : state.path === "/about" ? "about" : "missing",
  commands: (state) => {
    // Behavior: the platform's Clock (application code sees it; the caller never does).
    const increment = Nexus.Command.define("counter.increment", Schema.Struct({}), () =>
      Effect.flatMap(Clock.currentTimeMillis, (stamp) => state.update((current) => Effect.succeed({ ...current, count: current.count + 1, stamp }))).pipe(Effect.asVoid));
    const navigate = Nexus.Command.define("app.navigate", Schema.Struct({ path: Schema.String, tab: Schema.String }), ({ path, tab }) =>
      state.update((current) => Effect.succeed({ ...current, path, tab })).pipe(Effect.andThen(Nexus.Event.publish(Navigated, { path, tab }))));

    return {
      "counter/increment": Nexus.Mesh.bind(increment, () => ({})),
      "counter/goAbout": Nexus.Mesh.bind(navigate, () => ({ path: "/about", tab: initial.tab })),
      "about/goHome": Nexus.Mesh.bind(navigate, () => ({ path: "/", tab: initial.tab })),
      "missing/goHome": Nexus.Mesh.bind(navigate, () => ({ path: "/", tab: initial.tab })),
      // Not a MESH component: the same command, for input that is not a MESH intent (the browser's popstate).
      // Its argument is `stateOf(url)`: the part of the state the URL represents.
      "app/navigate": Nexus.Mesh.bind(navigate, (args) => firstValue(args)),
    };
  },
});

/** The Web realization of the application's primitives. Target configuration: Valance's definition never sees it. */
export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
};
