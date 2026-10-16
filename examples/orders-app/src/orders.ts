import { Schema } from "effect";

export const Status = Schema.Literal("open", "paid", "shipped");
export type Status = typeof Status.Type;

/** What the server sends for each order in the list. */
export const ApiRow = Schema.Struct({ id: Schema.String, customer: Schema.String, status: Status, total: Schema.Number });

/** What the list shows of an order. `href` is the address of its detail: a template cannot build one, so the row carries it (with the filter, so that the list is the same list beside the order). */
export const Row = Schema.Struct({ ...ApiRow.fields, href: Schema.String });

/** What the detail shows. */
export const Detail = Schema.Struct({ id: Schema.String, customer: Schema.String, status: Status, total: Schema.Number, note: Schema.String });

/** What each part of the screen is doing. */
export const Phase = Schema.Literal("idle", "loading", "ready", "failed");

export const Filter = Schema.Literal("all", "open", "paid", "shipped");
