import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./greeting.mprx";

// The interface of `<greeting>`, stated once, where it is defined. It is built from the portable core (`column`, `heading`, `text`, `button`), so it runs on every target the package declares.
export const greeting = component(template, {
  props: { title: Schema.String, message: Schema.String },
  events: { dismiss: Schema.Void },
});
