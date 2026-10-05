// Regression: `initial` must not be an inference source for the application's state type. The state type comes from the schema.
// Found by the developer slice: with `initial: S`, a literal such as `{ phase: "loading" }` made TypeScript infer S from the value, narrower than
// the schema, and the failure surfaced far from its cause (inside the schema types) unless `scope` was annotated by hand. Type-level: it is checked by `tsc`
// (`pnpm typecheck` compiles this file); the runtime assertion only keeps the file a test.
import { Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

// The shape the developer slice used: ONE struct whose field is a union of literals. This is the shape that failed.
const Flat = Schema.Struct({ phase: Schema.Literal("loading", "ready", "failed"), quote: Schema.String });
type Flat = typeof Flat.Type;

// A discriminated union of structs. It never failed (its members give `initial` a contextual type), and is kept to say so.
const State = Schema.Union(
  Schema.Struct({ phase: Schema.Literal("loading") }),
  Schema.Struct({ phase: Schema.Literal("ready"), value: Schema.String }),
  Schema.Struct({ phase: Schema.Literal("error"), message: Schema.String })
);
type State = typeof State.Type;

describe("the application's state type is inferred from its schema, not from `initial`", () => {
  it("a struct with a literal-union field and a literal initial state: `scope` needs no annotation and receives the schema's state type", () => {
    const app = Valance.define({
      name: "state-inference-flat",
      state: { schema: Flat, initial: { phase: "loading", quote: "" } },
      views: {
        main: {
          program: eventFreeProgram,
          // Unannotated on purpose. With `initial: S` this made S `{ phase: string; quote: string }` and the definition failed to typecheck.
          scope: (state) => {
            expectTypeOf(state).toEqualTypeOf<Flat>();

            return {};
          },
        },
      },
      view: () => "main" as const,
      commands: () => ({}),
    });

    expectTypeOf(app.state.initial).toEqualTypeOf<Flat>();
    expect(app.state.initial).toEqual({ phase: "loading", quote: "" });
  });

  it("a discriminated union with a literal initial member behaves the same (it was never affected)", () => {
    const app = Valance.define({
      name: "state-inference-union",
      state: { schema: State, initial: { phase: "loading" } },
      views: {
        main: {
          program: eventFreeProgram,
          scope: (state) => {
            expectTypeOf(state).toEqualTypeOf<State>();

            return {};
          },
        },
      },
      view: () => "main" as const,
      commands: () => ({}),
    });

    expectTypeOf(app.state.initial).toEqualTypeOf<State>();
    expect(app.state.initial).toEqual({ phase: "loading" });
  });
});
