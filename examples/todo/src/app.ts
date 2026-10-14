// The application: state, the commands that change it, and which screen shows for the route. It names no target. The same definition is drawn by the text target in the tests, and by a native
// renderer in the desktop apps.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Effect, Schema } from "effect";

import { addItem, addList, cleanText, clearDone, itemOf, listOf, openCount, removeItem, removeList, renameList, retitleItem, toggleItem } from "./domain.js";
import type { TodoList } from "./domain.js";
import { hrefs, router } from "./routes.js";
import type { TodoState } from "./routes.js";
import type { ScreenName } from "./vocabulary.js";

const ItemSchema = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean });
const ListSchema = Schema.Struct({ id: Schema.String, name: Schema.String, items: Schema.Array(ItemSchema) });

export const TodoState_ = Schema.Struct({
  lists: Schema.Array(ListSchema),
  route: Schema.Unknown,
  entry: Schema.String,
  draft: Schema.NullOr(Schema.String),
  seq: Schema.Number,
}) as unknown as Schema.Schema<TodoState>;

const blank = (at: string): TodoState => ({ lists: [], route: router.match(at), entry: "", draft: null, seq: 1 });

/** The state to start with, for the address the application was opened at: the guards have had their say, so an address for a list that does not exist starts on the lists. */
export const starting = async (state: TodoState, at: string): Promise<TodoState> => ({ ...state, route: await Effect.runPromise(router.enter(at, state)) });

export const initial = (at = "/"): TodoState => blank(at);

/** A starting point with something in it, for the demo and the tests. */
export const sample = (at = "/"): TodoState => ({
  lists: [
    {
      id: "l1",
      name: "Groceries",
      items: [
        { id: "i1", title: "Milk", done: false },
        { id: "i2", title: "Bread", done: true },
      ],
    },
    { id: "l2", name: "Weekend", items: [] },
  ],
  route: router.match(at),
  entry: "",
  draft: null,
  seq: 3,
});

const param = (state: TodoState, name: string): string => String(state.route.params[name] ?? "");

const screenOf = (state: TodoState): ScreenName => {
  const name = state.route.name;

  return name === "lists" || name === "list" || name === "item" || name === "listEdit" ? name : "notFound";
};

const summary = (list: TodoList): string => {
  const open = openCount(list);

  return list.items.length === 0 ? "No items" : `${open} of ${list.items.length} open`;
};

/** What the item and list edit screens show, and whether it differs from what is saved. */
const shown = (state: TodoState, saved: string): { readonly value: string; readonly dirty: boolean } => ({ value: state.draft ?? saved, dirty: state.draft !== null });

export interface Programs {
  readonly lists: Parameters<typeof Valance.define>[0]["views"][string]["program"];
  readonly list: Programs["lists"];
  readonly item: Programs["lists"];
  readonly listEdit: Programs["lists"];
  readonly notFound: Programs["lists"];
}

export const application = (programs: Programs, start: TodoState = initial()) =>
  Valance.define({
    name: "todo",
    state: { schema: TodoState_, initial: start },
    views: {
      lists: {
        program: programs.lists,
        scope: (state: TodoState) => ({
          lists: state.lists.map((list) => ({ id: list.id, name: list.name, href: hrefs.list(list.id), open: openCount(list), total: list.items.length })),
          entry: state.entry,
          none: state.lists.length === 0,
        }),
      },
      list: {
        program: programs.list,
        scope: (state: TodoState) => {
          const list = listOf(state.lists, param(state, "id"));

          return {
            name: list?.name ?? "",
            editHref: hrefs.listEdit(param(state, "id")),
            items: (list?.items ?? []).map((item) => ({ id: item.id, title: item.title, href: hrefs.item(param(state, "id"), item.id), done: item.done })),
            entry: state.entry,
            none: (list?.items.length ?? 0) === 0,
            nothingDone: !(list?.items.some((item) => item.done) ?? false),
            summary: list === undefined ? "" : summary(list),
          };
        },
      },
      item: {
        program: programs.item,
        scope: (state: TodoState) => {
          const list = listOf(state.lists, param(state, "id"));
          const { value, dirty } = shown(state, itemOf(state.lists, param(state, "id"), param(state, "itemId"))?.title ?? "");

          return { listHref: hrefs.list(param(state, "id")), listName: list?.name ?? "", value, dirty, clean: !dirty };
        },
      },
      listEdit: {
        program: programs.listEdit,
        scope: (state: TodoState) => {
          const { value, dirty } = shown(state, listOf(state.lists, param(state, "id"))?.name ?? "");

          return { listHref: hrefs.list(param(state, "id")), value, dirty, clean: !dirty };
        },
      },
      notFound: { program: programs.notFound, scope: () => ({}) },
    },
    view: screenOf,
    commands: (state) => {
      const change = (apply: (current: TodoState) => TodoState): Effect.Effect<void> => state.update((current) => Effect.succeed(apply(current))).pipe(Effect.asVoid);
      const define = <A>(name: string, schema: Schema.Schema<A, A>, run: (input: A) => Effect.Effect<void>) => Nexus.Command.define(name, schema, run);
      const none = Schema.Struct({});
      const goTo = (current: TodoState, path: string): TodoState => ({ ...current, route: router.match(path), entry: "", draft: null });

      return {
        ...router.commands(state as never),
        setEntry: define("setEntry", Schema.Struct({ text: Schema.String }), ({ text }) => change((current) => ({ ...current, entry: text.slice(0, 400) }))),
        createList: define("createList", none, () =>
          change((current) => {
            const name = cleanText(current.entry);

            return name === "" ? current : { ...current, lists: addList(current.lists, `l${current.seq}`, name), entry: "", seq: current.seq + 1 };
          }),
        ),
        addItem: define("addItem", none, () =>
          change((current) => {
            const title = cleanText(current.entry);
            const id = param(current, "id");

            return title === "" || listOf(current.lists, id) === undefined
              ? current
              : { ...current, lists: addItem(current.lists, id, `i${current.seq}`, title), entry: "", seq: current.seq + 1 };
          }),
        ),
        toggleItem: define("toggleItem", Schema.Struct({ itemId: Schema.String }), ({ itemId }) =>
          change((current) => ({ ...current, lists: toggleItem(current.lists, param(current, "id"), itemId) })),
        ),
        deleteItem: define("deleteItem", Schema.Struct({ itemId: Schema.String }), ({ itemId }) =>
          change((current) => ({ ...current, lists: removeItem(current.lists, param(current, "id"), itemId) })),
        ),
        clearDone: define("clearDone", none, () => change((current) => ({ ...current, lists: clearDone(current.lists, param(current, "id")) }))),
        deleteList: define("deleteList", none, () => change((current) => ({ ...goTo(current, hrefs.lists), lists: removeList(current.lists, param(current, "id")) }))),
        // Editing: `setDraft` keeps what was typed apart from what is saved, so leaving with unsaved text is something a guard can see. Typing the saved text back is not an edit.
        setDraft: define("setDraft", Schema.Struct({ text: Schema.String }), ({ text }) =>
          change((current) => {
            const saved =
              current.route.name === "item" ? itemOf(current.lists, param(current, "id"), param(current, "itemId"))?.title : listOf(current.lists, param(current, "id"))?.name;

            return { ...current, draft: text === saved ? null : text.slice(0, 400) };
          }),
        ),
        discard: define("discard", none, () => change((current) => ({ ...current, draft: null }))),
        saveItem: define("saveItem", none, () =>
          change((current) => {
            const text = cleanText(current.draft ?? "");

            return current.draft === null || text === ""
              ? current
              : { ...goTo(current, hrefs.list(param(current, "id"))), lists: retitleItem(current.lists, param(current, "id"), param(current, "itemId"), text) };
          }),
        ),
        saveList: define("saveList", none, () =>
          change((current) => {
            const text = cleanText(current.draft ?? "");

            return current.draft === null || text === ""
              ? current
              : { ...goTo(current, hrefs.list(param(current, "id"))), lists: renameList(current.lists, param(current, "id"), text) };
          }),
        ),
      };
    },
  });
