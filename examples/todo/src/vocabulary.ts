// The screen vocabulary this application is written against: what a template may say, and what each screen may read and do. It is the application's own, not the web's: a window, columns and rows, text,
// a heading, a button, a checkbox and a text field. A target decides how each is drawn; nothing here is HTML, and nothing names a platform.
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

const props = (declared: Readonly<Record<string, Type>>, optional: ReadonlyArray<string> = []) =>
  Object.fromEntries(Object.entries(declared).map(([name, type]) => [name, { type, required: !optional.includes(name) }]));
const commands = (declared: Readonly<Record<string, Readonly<Record<string, Type>>>>) =>
  Object.fromEntries(
    Object.entries(declared).map(([name, parameters]) => [name, { parameters: Object.entries(parameters).map(([parameter, type]) => ({ name: parameter, type })) }]),
  );

const primitive = (declared: { readonly props?: ReturnType<typeof props>; readonly events?: Readonly<Record<string, { readonly payload?: Type }>> } = {}) => ({
  props: declared.props ?? {},
  events: declared.events ?? {},
  commands: {},
  scope: {},
});

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

export const manifest = {
  version: 1,
  types: {},
  components: {
    window: primitive({ props: props({ title: string }) }),
    column: primitive(),
    row: primitive(),
    heading: primitive(),
    text: primitive(),
    button: primitive({ props: props({ disabled: boolean }, ["disabled"]), events: { press: {} } }),
    checkbox: primitive({ props: props({ checked: boolean }), events: { toggle: {} } }),
    field: primitive({ props: props({ value: string, placeholder: string }, ["placeholder"]), events: { change: { payload: string } } }),
    lists: screen({ lists: list(ListRow), entry: string, none: boolean }, { go: { to: string }, setEntry: { text: string }, createList: {} }),
    list: screen(
      { name: string, editHref: string, items: list(ItemRow), entry: string, none: boolean, nothingDone: boolean, summary: string },
      { go: { to: string }, setEntry: { text: string }, addItem: {}, toggleItem: { itemId: string }, deleteItem: { itemId: string }, clearDone: {}, deleteList: {} },
    ),
    item: screen(
      { listHref: string, listName: string, value: string, dirty: boolean, clean: boolean },
      { go: { to: string }, setDraft: { text: string }, saveItem: {}, discard: {} },
    ),
    listEdit: screen({ listHref: string, value: string, dirty: boolean, clean: boolean }, { go: { to: string }, setDraft: { text: string }, saveList: {}, discard: {} }),
    notFound: screen({}, { go: { to: string } }),
  },
};
