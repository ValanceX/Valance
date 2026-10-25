import { component, field } from "@valancex/common";
import { Schema } from "effect";
import template from "./labeled-field.mprx";

/** A caption and a text field, named by containment (the caption is the field's accessible name). The application owns the value. */
export const labeledField = component(template, {
  props: { caption: Schema.String, value: Schema.String, invalid: field(Schema.Boolean, false) },
  events: { change: Schema.String },
});
