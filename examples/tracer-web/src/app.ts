// The tracer's application, written against Valance. It names NEXUS for behavior (state, commands, Clock)
// and nothing of MESH hosts or PORT: the Web realization table is target configuration, below.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import * as Nexus from "@valancex/nexus";
import { Clock, Effect, Schema } from "effect";

export const Counter = Schema.Struct({ title: Schema.String, count: Schema.Number, stamp: Schema.Number });
export type Counter = Schema.Schema.Type<typeof Counter>;

export const initial: Counter = { title: "Tracer", count: 0, stamp: 0 };

export const application = (program: Mesh.Program) => Valance.define({
  name: "tracer-web",
  program,
  state: { schema: Counter, initial },
  scope: ({ title, count, stamp }) => ({ title, count, stamp }),
  commands: (state) => {
    // Behavior: the platform's Clock (application code sees it; the caller never does).
    const increment = Nexus.Command.define("counter.increment", Schema.Struct({}), () =>
      Effect.flatMap(Clock.currentTimeMillis, (stamp) => state.update((current) => Effect.succeed({ ...current, count: current.count + 1, stamp }))).pipe(Effect.asVoid));

    return { "counter/increment": Nexus.Mesh.bind(increment, () => ({})) };
  },
});

/** The Web realization of the application's primitives. Target configuration: Valance's definition never sees it. */
export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
};
