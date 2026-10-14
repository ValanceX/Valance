import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./theme-toggle.mprx";

// The interface of `<theme-toggle>`, stated once, where it is defined: what the template reads (`theme`) and what it raises (`toggle`, which carries nothing). Whoever uses it names only that
// they use it. `.valance/templates.d.ts` gives the template its keys as a type, so a contract that disagrees with the template is an error in the editor.
export default component(template, {
  props: { theme: Schema.Literal("light", "dark") },
  events: { toggle: Schema.Void },
});
