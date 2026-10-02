// The Application Model tracer: the smallest application that has to say who owns state, view selection and commands.
//
// ONE state, a union whose discriminant IS the selected view. `view(state)` is therefore one line, and a state change
// that changes the view and one that only changes data are the same kind of event: a commit on the one NEXUS state.
// Nothing here names MESH hosts, PORT, a URL or a browser: the application is meaningful without them.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

export const Item = Schema.Struct({ id: Schema.String, name: Schema.String });
export type Item = Schema.Schema.Type<typeof Item>;
const Items = Schema.Array(Item);

export const AppState = Schema.Union(
  Schema.Struct({ view: Schema.Literal("home"), items: Items }),
  Schema.Struct({ view: Schema.Literal("details"), items: Items, selectedId: Schema.String }),
  Schema.Struct({ view: Schema.Literal("not-found"), items: Items })
);
export type AppState = Schema.Schema.Type<typeof AppState>;

export const initial: AppState = { view: "home", items: [{ id: "A", name: "Alpha" }] };

/** The part of the state a URL carries: where the application is, not what it holds. `items` is not in a URL. */
export const Navigation = Schema.Struct({ view: Schema.Literal("home", "details", "not-found"), id: Schema.String });
export type Navigation = Schema.Schema.Type<typeof Navigation>;

/** The state a navigation leads to, given the data the application holds. An unknown item is the not-found view: the application decides. */
export const enter = (items: ReadonlyArray<Item>, navigation: Navigation): AppState =>
  navigation.view === "details"
    ? items.some((item) => item.id === navigation.id) ? { view: "details", items, selectedId: navigation.id } : { view: "not-found", items }
    : { view: navigation.view, items };

/** state → URL. What a URL looks like is the application's; `items` are not in it. */
export const urlOf = (state: AppState): string => state.view === "home" ? "/" : state.view === "details" ? `/items/${encodeURIComponent(state.selectedId)}` : "/not-found";

/** URL → the navigation it names. Total: a URL naming no view is the explicit not-found navigation. */
export const stateOf = (url: URL): Navigation => {
  const [, first, second, ...rest] = url.pathname.split("/");

  if (url.pathname === "/") {
    return { view: "home", id: "" };
  }

  return first === "items" && second !== undefined && second !== "" && rest.length === 0 ? { view: "details", id: decodeURIComponent(second) } : { view: "not-found", id: "" };
};

export interface Programs {
  readonly home: Mesh.Program;
  readonly details: Mesh.Program;
  readonly notfound: Mesh.Program;
}

const summary = (items: ReadonlyArray<Item>): string => items.map((item) => item.name).join(", ");

/** A view's scope is written for its own state variant; the definition hands it the whole union. Tracer scaffolding. */
const at = <V extends AppState["view"]>(view: V, scope: (state: Extract<AppState, { view: V }>) => Record<string, unknown>) => (state: AppState): Record<string, unknown> => {
  if (state.view !== view) {
    throw new Error(`the ${view} view was given a ${state.view} state`);
  }

  return scope(state as Extract<AppState, { view: V }>);
};

const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

export const application = (programs: Programs) => Valance.define({
  name: "catalog",
  state: { schema: AppState, initial },
  views: {
    home: { program: programs.home, scope: at("home", ({ items }) => ({ title: "Catalog", count: items.length, summary: summary(items), firstId: items[0]?.id ?? "", items: items.map(({ id, name }) => ({ id, name })) })) },
    details: { program: programs.details, scope: at("details", ({ items, selectedId }) => ({ title: "Catalog", id: selectedId, name: items.find((item) => item.id === selectedId)?.name ?? "", count: items.length, summary: summary(items) })) },
    "not-found": { program: programs.notfound, scope: at("not-found", () => ({ title: "Catalog" })) },
  },
  // The selected view is the state's own discriminant: derived, never stored separately.
  view: (state) => state.view,
  commands: (state) => {
    // Every transition is a NEXUS command over the one state. What each does to the VIEW is decided here, with the data.
    const open = Nexus.Command.define("catalog.open", Schema.Struct({ id: Schema.String }), ({ id }) =>
      state.update((current): Effect.Effect<AppState> => Effect.succeed(enter(current.items, { view: "details", id }))).pipe(Effect.asVoid));
    const home = Nexus.Command.define("catalog.home", Schema.Struct({}), () =>
      state.update((current): Effect.Effect<AppState> => Effect.succeed(enter(current.items, { view: "home", id: "" }))).pipe(Effect.asVoid));
    // The one entry for input that names a place (a URL): the same transition function, whoever asks.
    const navigate = Nexus.Command.define("catalog.navigate", Navigation, (navigation) =>
      state.update((current): Effect.Effect<AppState> => Effect.succeed(enter(current.items, navigation))).pipe(Effect.asVoid));
    const changeItems = Nexus.Command.define("catalog.changeItems", Schema.Struct({ items: Items }), ({ items }) =>
      state.update((current): Effect.Effect<AppState> => Effect.succeed(current.view === "details" && !items.some((item) => item.id === current.selectedId)
        ? { view: "not-found", items }
        : { ...current, items })).pipe(Effect.asVoid));

    return {
      // From MESH intents ("component/name"): what a rendered program can ask for.
      "home/open": Nexus.Mesh.bind(open, (args) => ({ id: firstValue(args) })),
      "details/back": Nexus.Mesh.bind(home, () => ({})),
      "notfound/back": Nexus.Mesh.bind(home, () => ({})),
      // From outside MESH, through `Running.invoke`: the same commands, the same table.
      "app/open": Nexus.Mesh.bind(open, (args) => ({ id: firstValue(args) })),
      "app/home": Nexus.Mesh.bind(home, () => ({})),
      "app/navigate": Nexus.Mesh.bind(navigate, (args) => firstValue(args)),
      "app/changeItems": Nexus.Mesh.bind(changeItems, (args) => ({ items: firstValue(args) })),
    };
  },
});
