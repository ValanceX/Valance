import { component, field, snippet, unit, unitCommand } from "@valancex/common";
import { Schema } from "effect";
import template from "./disclosure.mprx";

/**
 * A trigger and a panel. Open or closed is the component's own state, one per occurrence (a unit); an application that wants to hold it writes `open={…}` and `on.change`, and the component then
 * follows it.
 */
type State = { readonly open: boolean };

export const disclosure = component(template, {
  props: { label: Schema.String, open: Schema.UndefinedOr(Schema.Boolean), children: snippet() },
  events: { change: Schema.Boolean },
  unit: unit({
    state: { open: field(Schema.Boolean, false) },
    controllable: ["open"],
    commands: { toggle: unitCommand({ params: {}, run: (state: State) => ({ open: !state.open }), raises: { change: (next: State) => next.open } }) },
  }),
});
