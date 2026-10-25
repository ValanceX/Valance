import { component, field, snippet, unit, unitCommand } from "@valancex/common";
import { Schema } from "effect";
import template from "./tabs.mprx";

export const Tab = Schema.Struct({ id: Schema.String, title: Schema.String });

/** A strip of tabs and the panel of the chosen one. The chosen tab is the component's own state (a unit); `at` and `on.change` let the application hold it. `initial` is the tab shown until one is chosen. */
type State = { readonly at: string };

export const tabs = component(template, {
  props: { items: Schema.Array(Tab), initial: Schema.String, at: Schema.UndefinedOr(Schema.String), panel: snippet(Tab) },
  events: { change: Schema.String },
  unit: unit({
    state: { at: field(Schema.String, "") },
    controllable: ["at"],
    commands: { select: unitCommand({ params: { id: Schema.String }, run: (_: State, { id }) => ({ at: id }), raises: { change: (next: State) => next.at } }) },
  }),
});
