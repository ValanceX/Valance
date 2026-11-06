import { component, field } from "@valancex/common";
import { Schema } from "effect";
import template from "./badge.mprx";

/** A small label with an intent and a size, both closed sets with defaults. Web only: it is written with `span`, and takes its colors and spacing from the theme's custom properties. */
export const badge = component(template, {
  props: {
    label: Schema.String,
    intent: field(Schema.Literals(["neutral", "accent", "danger"]), "neutral"),
    size: field(Schema.Literals(["sm", "md"]), "md"),
  },
  events: {},
});
