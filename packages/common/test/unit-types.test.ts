// What a library author writes (Bet 12, friction F-3): a unit whose command takes parameters, in strict TypeScript. Before `unit` accepted any parameters, this file did not typecheck
// (`Property 'id' is missing in type '{ readonly [x: string]: unknown }'`), so every component with a parametrized command needed a cast. `pnpm typecheck` is the test.
import { Schema } from "effect";
import { expect, it } from "vitest";

import { field, unit, unitCommand } from "../src/index.js";

type State = { readonly at: string };

it("takes a command with parameters, typed where it is written", () => {
  const tabs = unit({
    state: { at: field(Schema.String, "") },
    controllable: ["at"],
    commands: {
      reset: (state: State) => ({ at: state.at === "" ? "" : "" }),
      select: unitCommand({ params: { id: Schema.String }, run: (_: State, { id }) => ({ at: id }), raises: { change: (next: State) => next.at } }),
    },
  });

  expect(Object.keys(tabs.commands)).toEqual(["reset", "select"]);
});
