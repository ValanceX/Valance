// What a template may say, and what each screen may read and do. The components (`window`, `column`, `text`, `button`…) are the Desktop PORT's own: they come from its `vocabulary.json`, not from
// anything in this file. What this file adds is the application's screens: for each, the values it reads (its scope) and the commands it can run.
import desktop from "./desktop-vocabulary.json" with { type: "json" };

type Type =
  | { readonly kind: "string" | "number" | "boolean" }
  | { readonly kind: "list"; readonly element: Type }
  | { readonly kind: "record"; readonly fields: Readonly<Record<string, { readonly type: Type; readonly required: boolean }>> };

const string: Type = { kind: "string" };
const number: Type = { kind: "number" };
const boolean: Type = { kind: "boolean" };
const list = (element: Type): Type => ({ kind: "list", element });
const record = (fields: Readonly<Record<string, Type>>): Type => ({
  kind: "record",
  fields: Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, { type, required: true }])),
});

const commands = (declared: Readonly<Record<string, Readonly<Record<string, Type>>>>) =>
  Object.fromEntries(
    Object.entries(declared).map(([name, parameters]) => [name, { parameters: Object.entries(parameters).map(([parameter, type]) => ({ name: parameter, type })) }]),
  );

const screen = (scope: Readonly<Record<string, Type>>, declared: Readonly<Record<string, Readonly<Record<string, Type>>>>) => ({
  props: {},
  events: {},
  commands: commands(declared),
  scope,
});

const ListRow = record({ id: string, name: string, href: string, open: number, total: number });
const ItemRow = record({ id: string, title: string, href: string, done: boolean });

/** The screens: the roots the router chooses between. Each states what it reads (scope) and what it can do (commands). */
export const SCREENS = ["lists", "list", "item", "listEdit", "notFound"] as const;
export type ScreenName = (typeof SCREENS)[number];

/** The Desktop PORT's own components (a copy of its `vocabulary.json`, which a test in `native/` holds to the original), and the application's screens on top. */
export const manifest = {
  ...desktop,
  components: {
    ...desktop.components,
    lists: screen({ lists: list(ListRow), entry: string, none: boolean }, { go: { to: string }, setEntry: { text: string }, createList: {} }),
    list: screen(
      { name: string, editHref: string, items: list(ItemRow), entry: string, none: boolean, nothingDone: boolean, summary: string },
      { go: { to: string }, setEntry: { text: string }, addItem: {}, setDone: { itemId: string, done: boolean }, deleteItem: { itemId: string }, clearDone: {}, deleteList: {} },
    ),
    item: screen(
      { listHref: string, listName: string, value: string, dirty: boolean, clean: boolean },
      { go: { to: string }, setDraft: { text: string }, saveItem: {}, discard: {} },
    ),
    listEdit: screen({ listHref: string, value: string, dirty: boolean, clean: boolean }, { go: { to: string }, setDraft: { text: string }, saveList: {}, discard: {} }),
    notFound: screen({}, { go: { to: string } }),
  },
};
