import * as Valance from "@valancex/valance";
import { Schema } from "effect";

import { program } from "./counter-views.js";

const State = Schema.Struct({ count: Schema.Number });
type State = typeof State.Type;

export const counter = Valance.define({
  name: "counter",
  state: { schema: State, initial: { count: 0 } },
  views: { page: { program, scope: (state: State) => ({ count: state.count }) } },
  view: () => "page" as const,
  commands: (state: Valance.StateHandle<State>) => ({
    increment: Valance.command(state)(Schema.Struct({}), (_input, current) => ({ count: current.count + 1 })),
  }),
});
