// `defineApp`'s `context` returns names the layout reads with the layout's types: a wrong value for a state field or a framework name is a type error; a derived value's name is accepted
// here and checked when the manifest is built.
import { Schema } from "effect";
import { expect, it } from "vitest";

import { defineApp, field } from "../src/index.js";

it("types a context value by the layout name it is given under", () => {
  const ok = defineApp({ state: { theme: field(Schema.Literal("light", "dark"), "light") }, context: (state) => ({ theme: state.theme, colorScheme: state.colorScheme, open: 1 }) });

  defineApp({
    state: { theme: field(Schema.Literal("light", "dark"), "light") },
    // @ts-expect-error: `theme` is "light" | "dark", not a number
    context: () => ({ theme: 3 }),
  });

  expect(ok.context).toBeTypeOf("function");
});
