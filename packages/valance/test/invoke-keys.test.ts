// B3 (Tier 1, audit I2): `start` carries the command table's keys to `invoke`: a bare name `n` is `"app/n"` and an exact `"component/name"` key is itself, which an editor
// completes. Additive: any other string is still accepted (an unknown one is the typed `UnmappedCommand` at run time), so a table built by spreading another, whose type does not
// show the spread keys, still compiles. Typos are not caught by the type.
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ count: Schema.Number });
type State = typeof State.Type;
const views = { main: { program: eventFreeProgram, scope: () => ({}) } };

const app = Valance.define({
  name: "invoke-keys",
  state: { schema: State, initial: { count: 0 } },
  views,
  commands: (state) => {
    const command = Valance.command(state);
    const add = command(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ count: s.count + amount }));

    return { add, "app/reset": Valance.entry(command((s) => ({ ...s, count: 0 }))) };
  },
});

// A table composed by spreading one typed `CommandTable`: TypeScript drops the spread's index signature, so its type shows only `app/own`.
const shared = (state: Valance.StateHandle<State>): Valance.CommandTable<never, never> => ({
  add: Valance.command(state)(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ count: s.count + amount })),
});
const spread = Valance.define({
  name: "invoke-keys-spread",
  state: { schema: State, initial: { count: 0 } },
  views,
  commands: (state) => ({ ...shared(state), "app/own": Valance.entry(Valance.command(state)((s) => s)) }),
});

const started = async <K extends string>(definition: Valance.ApplicationDefinition<State, any, never, "main", K>) => {
  const scope = await Effect.runPromise(Scope.make());

  return { handle: await Effect.runPromise(Valance.start(definition).pipe(Scope.extend(scope))), close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

describe("invoke's key, from the command table", () => {
  it("names the table's keys (what an editor completes) and still takes any string", () => {
    type Key = Parameters<Effect.Effect.Success<ReturnType<typeof Valance.start<State, any, never, "main", "app/add" | "app/reset">>>["invoke"]>[0];
    // `define` gives `start` exactly the table's keys
    type Inferred = Parameters<Effect.Effect.Success<ReturnType<typeof startApp>>["invoke"]>[0];
    const startApp = () => Valance.start(app);

    expectTypeOf<Inferred>().toEqualTypeOf<Key>();
    expectTypeOf<Key>().toEqualTypeOf<"app/add" | "app/reset" | (string & {})>();
  });

  it("runs a known key, and an unknown one is the typed failure, not a type error", async () => {
    const { handle, close } = await started(app);

    await Effect.runPromise(handle.invoke("app/add", [{ value: 2 }]));
    expect(await Effect.runPromise(handle.state)).toEqual({ count: 2 });
    expect(Exit.isFailure(await Effect.runPromise(Effect.exit(handle.invoke("app/ad", []))))).toBe(true);
    await close();
  });

  it("compiles and runs a key of a spread-composed table that its type does not show", async () => {
    const { handle, close } = await started(spread);

    await Effect.runPromise(handle.invoke("app/add", [{ value: 3 }]));
    expect(await Effect.runPromise(handle.state)).toEqual({ count: 3 });
    await close();
  });

  it("a typed handle is still an ApplicationHandle<S, E>", () => {
    expectTypeOf<Valance.ApplicationHandle<State, unknown, "app/add">>().toExtend<Valance.ApplicationHandle<State, unknown>>();
  });
});
