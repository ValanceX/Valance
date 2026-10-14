import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./todo-add.mprx";

// One component for both targets: it is written with the portable core only (`row`, `textfield`, `button`), whose names, props, events and payloads are the same on the web and in a window.
export default component(template, {
  props: { entry: Schema.String },
  events: { type: Schema.String, add: Schema.Void },
});
