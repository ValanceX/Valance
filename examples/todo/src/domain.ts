// The to-do domain: lists of items, and the pure changes to them. Nothing here knows a screen, a route or a target.
export interface Item {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

export interface TodoList {
  readonly id: string;
  readonly name: string;
  readonly items: ReadonlyArray<Item>;
}

export const TITLE_LIMIT = 200;

/** What a person typed, as a title or a name: trimmed, whitespace collapsed, bounded. Empty means "not a title". */
export const cleanText = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, TITLE_LIMIT);

export const listOf = (lists: ReadonlyArray<TodoList>, id: string): TodoList | undefined => lists.find((list) => list.id === id);

export const itemOf = (lists: ReadonlyArray<TodoList>, listId: string, itemId: string): Item | undefined => listOf(lists, listId)?.items.find((item) => item.id === itemId);

const inList = (lists: ReadonlyArray<TodoList>, id: string, change: (list: TodoList) => TodoList): ReadonlyArray<TodoList> =>
  lists.map((list) => (list.id === id ? change(list) : list));

export const addList = (lists: ReadonlyArray<TodoList>, id: string, name: string): ReadonlyArray<TodoList> => [...lists, { id, name, items: [] }];

export const renameList = (lists: ReadonlyArray<TodoList>, id: string, name: string): ReadonlyArray<TodoList> => inList(lists, id, (list) => ({ ...list, name }));

export const removeList = (lists: ReadonlyArray<TodoList>, id: string): ReadonlyArray<TodoList> => lists.filter((list) => list.id !== id);

export const addItem = (lists: ReadonlyArray<TodoList>, listId: string, id: string, title: string): ReadonlyArray<TodoList> =>
  inList(lists, listId, (list) => ({ ...list, items: [...list.items, { id, title, done: false }] }));

const inItem = (lists: ReadonlyArray<TodoList>, listId: string, itemId: string, change: (item: Item) => Item): ReadonlyArray<TodoList> =>
  inList(lists, listId, (list) => ({ ...list, items: list.items.map((item) => (item.id === itemId ? change(item) : item)) }));

export const toggleItem = (lists: ReadonlyArray<TodoList>, listId: string, itemId: string): ReadonlyArray<TodoList> =>
  inItem(lists, listId, itemId, (item) => ({ ...item, done: !item.done }));

export const retitleItem = (lists: ReadonlyArray<TodoList>, listId: string, itemId: string, title: string): ReadonlyArray<TodoList> =>
  inItem(lists, listId, itemId, (item) => ({ ...item, title }));

export const removeItem = (lists: ReadonlyArray<TodoList>, listId: string, itemId: string): ReadonlyArray<TodoList> =>
  inList(lists, listId, (list) => ({ ...list, items: list.items.filter((item) => item.id !== itemId) }));

export const clearDone = (lists: ReadonlyArray<TodoList>, listId: string): ReadonlyArray<TodoList> =>
  inList(lists, listId, (list) => ({ ...list, items: list.items.filter((item) => !item.done) }));

export const openCount = (list: TodoList): number => list.items.filter((item) => !item.done).length;
