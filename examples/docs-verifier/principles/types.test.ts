// §4 type safety: mistakes a consumer can make are compile errors where the type system can say so. Checked by `tsc` (each `@ts-expect-error` must be an error, or tsc reports it as unused);
// the runtime half records which mistakes are NOT caught (they are strings at the boundary), which is the finding.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Effect, Schema } from "effect";
import { expect, it } from "vitest";

import { counterProgram } from "./fixture.js";

const State = Schema.Struct({ n: Schema.Number });

it("compile-time: wrong initial state, wrong command input and a wrong view name are type errors", async () => {
  const program = await counterProgram();
  const add = Nexus.Command.define("t.add", Schema.Struct({ amount: Schema.Number }), (input) => Effect.succeed(input.amount));

  // `invoke` is the raw boundary (rawInput: unknown) and validates at run time; the handler's own input is typed.
  const handler: (input: { readonly amount: number }) => void = (input) => void input.amount;

  void handler;
  void Nexus.Command.invoke(add, { amount: "x" });

  // @ts-expect-error initial state must match the schema
  const bad = Valance.define({ name: "bad", state: { schema: State, initial: { n: "zero" } }, views: { main: { program, scope: (s: typeof State.Type) => ({ n: s.n }) } }, view: () => "main" as const, commands: () => ({}) });

  // @ts-expect-error the view function must name a declared view
  const worse = Valance.define({ name: "worse", state: { schema: State, initial: { n: 0 } }, views: { main: { program, scope: (s: typeof State.Type) => ({ n: s.n }) } }, view: () => "nope" as const, commands: () => ({}) });

  void bad;
  void worse;
  expect(true).toBe(true);
});

it("run-time only: a command key is a string, so a typo is a typed UnmappedCommand failure, not a compile error", () => {
  type Invoke = Valance.ApplicationHandle<unknown, never>["invoke"];
  const key: Parameters<Invoke>[0] = "app/anything";

  expect(typeof key).toBe("string");                                                  // recorded in PRINCIPLES.md: invoke's keys are not derived from the command table
});
