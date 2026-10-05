// A real-application pressure test (an instrument, not a product): a list, a detail whose text must be fetched, URLs that follow state,
// and server rendering, written ONLY as an application author would from the Learn pages. Every place the author needed something
// below VALANCE is recorded in ./FRICTION.md; none was fixed while building (the experiment measures the interface as it is).
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

const Item = Schema.Struct({ id: Schema.String, title: Schema.String });
const Detail = Schema.Struct({ status: Schema.Literal("idle", "loading", "ready", "failed"), text: Schema.String });

export const AppState = Schema.Struct({ items: Schema.Array(Item), selected: Schema.String, detail: Detail });
export type AppState = typeof AppState.Type;

export const initial: AppState = {
  items: [{ id: "a", title: "Alpha" }, { id: "b", title: "Beta" }, { id: "c", title: "Gamma" }],
  selected: "",
  detail: { status: "idle", text: "" },
};

/** state → URL, and URL → the part of the state it names. The application's. */
export const urlOf = ({ selected }: AppState): string => selected === "" ? "/items" : `/items?item=${encodeURIComponent(selected)}`;
export const stateOf = (url: URL): { readonly id: string } => ({ id: url.searchParams.get("item") ?? "" });
/** What a request URL means as a starting state: a named item starts out loading (its text is fetched by the application's startup work). */
export const stateFor = (url: string): AppState => {
  const { id } = stateOf(new URL(url, "http://localhost"));

  return id === "" ? initial : { ...initial, selected: id, detail: { status: "loading", text: "" } };
};

export interface Programs {
  readonly list: Mesh.Program;
  readonly detail: Mesh.Program;
}

/** The one thing the platform provides: where an item's text comes from. A test supplies its own. */
export type FetchDetail = (id: string, signal: AbortSignal) => Promise<string>;

const titleOf = (state: AppState): string | undefined => state.items.find((item) => item.id === state.selected)?.title;
const statusText = ({ detail }: AppState): string =>
  detail.status === "loading" ? "Loading…" : detail.status === "ready" ? detail.text : detail.status === "failed" ? `Failed: ${detail.text}` : "";

export const application = (programs: Programs, fetchDetail: FetchDetail) => Valance.define({
  name: "items",
  state: { schema: AppState, initial },
  views: {
    list: { program: programs.list, scope: (state: AppState) => ({ title: "Items", items: state.items.map(({ id, title }) => ({ id, title })) }) },
    detail: { program: programs.detail, scope: (state: AppState) => ({ title: "Item", heading: titleOf(state) ?? "", status: statusText(state) }) },
  },
  // A selected id that names no item is the list: the application decides.
  view: (state) => titleOf(state) === undefined ? "list" : "detail",
  commands: (state) => {
    let latest = 0;                                    // the newest request; an older result is ignored
    const set = (next: (current: AppState) => AppState) => state.update((current) => Effect.succeed(next(current)));

    const load = (id: string) => Effect.gen(function* () {
      const mine = ++latest;
      yield* set((current) => ({ ...current, selected: id, detail: { status: "loading", text: "" } }));
      const result = yield* Effect.tryPromise({ try: (signal) => fetchDetail(id, signal), catch: String }).pipe(Effect.either);

      if (mine !== latest) return;                     // a newer request started meanwhile: drop this result
      yield* set((current) => ({ ...current, detail: result._tag === "Right" ? { status: "ready", text: result.right } : { status: "failed", text: result.left } }));
    });

    // Going back must also supersede a request still in flight, and the counter that does so is the commands' closure: so this is not a pure `command`.
    const leave = Effect.suspend(() => {
      latest += 1;
      return set((current) => ({ ...current, selected: "", detail: { status: "idle", text: "" } }));
    });
    const back = Nexus.Command.define("items.back", Schema.Struct({}), () => leave);
    // The one way to show an item, for a click and for the browser's Back/Forward alike: no id means the list.
    const select = Nexus.Command.define("items.select", Schema.Struct({ id: Schema.String }), ({ id }) => id === "" ? leave : load(id));
    const reload = Nexus.Command.define("items.reload", Schema.Struct({}), () =>
      Effect.flatMap(state.get, (current) => current.selected === "" ? Effect.void : load(current.selected)));
    const startup = Nexus.Command.define("items.startup", Schema.Struct({}), () =>
      Effect.flatMap(state.get, (current) => current.selected !== "" && current.detail.status === "loading" ? load(current.selected) : Effect.void));

    return {
      select,
      reload,
      startup,
      back,
      "app/navigate": Valance.entry(select, (navigation) => navigation),   // popstate hands over ONE object, which is not unpacked into fields
    };
  },
  start: "startup",
});
