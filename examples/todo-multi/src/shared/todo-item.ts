import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./todo-item.mprx";

// An item's row, written once: a checkbox, its text and a button, all of the portable core.
export default component(template, {
  props: { title: Schema.String, done: Schema.Boolean },
  events: { tick: Schema.Boolean, remove: Schema.Void },
});
