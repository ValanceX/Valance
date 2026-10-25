import { component, snippet } from "@valancex/common";
import { Schema } from "effect";
import template from "./data-list.mprx";

export const Row = Schema.Struct({ id: Schema.String, label: Schema.String, detail: Schema.String });

/** A list whose rows the caller draws: `<data-list items={…}>{#snippet row(r)}…{/snippet}</data-list>`. The list owns the structure (a list of items); the caller owns what is in a row. */
export const dataList = component(template, {
  props: { items: Schema.Array(Row), row: snippet(Row) },
  events: {},
});
