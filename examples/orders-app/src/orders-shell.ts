import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./orders-shell.mprx";
import { Filter, Phase, Row } from "./orders.js";

// The screen of /orders: the filter, the list, and the place the order beside it is drawn (the slot).
export default component(template, {
  props: { filter: Filter, rows: Schema.Array(Row), listPhase: Phase, empty: Schema.Boolean },
  events: {},
});
