import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./order-detail.mprx";
import { Detail, Phase, Status } from "./orders.js";

// The screen of /orders/:id, drawn in the slot of /orders.
export default component(template, {
  props: {
    detail: Detail,
    detailPhase: Phase,
    choice: Status,
    changed: Schema.Boolean,
    saving: Schema.Boolean,
    saveError: Schema.String,
  },
  events: { choose: Status, saveStatus: Schema.Void },
});
