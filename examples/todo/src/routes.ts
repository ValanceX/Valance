// Where the application can be: the lists, one list, a list being renamed, an item being edited. The guards are the application's rules, not a screen's: a list or item that does not exist is the
// lists again, and a screen with unsaved edits cannot be left until they are saved or discarded.
import { createRouter, redirect, route } from "@valancex/router";
import type { RouteState } from "@valancex/router";
import { Schema } from "effect";

import { itemOf, listOf } from "./domain.js";
import type { TodoList } from "./domain.js";

export interface TodoState {
  readonly lists: ReadonlyArray<TodoList>;
  readonly route: RouteState;
  /** The text of the "new list" / "new item" field. */
  readonly entry: string;
  /** Edits not yet saved on the edit screens; `null` when there are none. */
  readonly draft: string | null;
  /** The next identifier number. */
  readonly seq: number;
}

const ListParams = Schema.Struct({ id: Schema.String });
const ItemParams = Schema.Struct({ id: Schema.String, itemId: Schema.String });

const idOf = (params: Readonly<Record<string, unknown>>, name: string): string => String(params[name] ?? "");
const listExists = ({ to, state }: { readonly to: RouteState; readonly state: TodoState }) => (listOf(state.lists, idOf(to.params, "id")) === undefined ? redirect("lists") : true);
const itemExists = ({ to, state }: { readonly to: RouteState; readonly state: TodoState }) =>
  itemOf(state.lists, idOf(to.params, "id"), idOf(to.params, "itemId")) === undefined ? redirect("lists") : true;
const saved = ({ state }: { readonly state: TodoState }) => state.draft === null;

export const router = createRouter<TodoState>({
  routes: [
    route("/", { name: "lists", title: "To-do" }),
    route("/lists/:id", { name: "list", params: ListParams, title: "List", canActivate: listExists }),
    route("/lists/:id/edit", { name: "listEdit", params: ListParams, title: "Rename list", canActivate: listExists, canDeactivate: saved }),
    route("/lists/:id/items/:itemId", { name: "item", params: ItemParams, title: "Edit item", canActivate: itemExists, canDeactivate: saved }),
  ],
  notFound: { name: "notFound", title: "Not found" },
});

export const hrefs = {
  lists: "/",
  list: (id: string): string => `/lists/${encodeURIComponent(id)}`,
  listEdit: (id: string): string => `/lists/${encodeURIComponent(id)}/edit`,
  item: (listId: string, itemId: string): string => `/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
} as const;
