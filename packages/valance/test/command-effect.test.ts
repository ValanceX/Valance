// `Valance.command(state).effect`: the one way to write a command whose body is an Effect (several steps, the state read between them, a typed failure), beside the pure transition and `waiting`.
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ count: Schema.Number, log: Schema.Array(Schema.String) });

class Refused {
  readonly _tag = "Refused";
}

const app = Valance.define({
  name: "command-effect",
  state: { schema: State, initial: { count: 0, log: [] } },
  views: { main: { program: eventFreeProgram, scope: () => ({}) } },
  view: () => "main" as const,
  commands: (state) => {
    const command = Valance.command(state);

    return {
      // no input: reads the state, then changes it in a second step that depends on the first
      double: command.effect(() =>
        Effect.gen(function* () {
          const { count } = yield* state.get;

          yield* state.update((current) => Effect.succeed({ ...current, count: count * 2, log: [...current.log, "doubled"] }));
        }),
      ),
      // with an input, validated before the body runs, and a typed failure of its own
      take: command.effect(Schema.Struct({ amount: Schema.Number }), ({ amount }) =>
        amount > 10 ? Effect.fail(new Refused()) : state.update((current) => Effect.succeed({ ...current, count: current.count + amount })).pipe(Effect.asVoid),
      ),
    };
  },
});

const boot = async () => {
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));

  return {
    state: () => Effect.runPromise(handle.state),
    exit: (key: string, ...values: ReadonlyArray<unknown>) => Effect.runPromise(Effect.exit(handle.invoke(key, values.map((value) => ({ value })) as never))),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

describe("Valance.command(state).effect", () => {
  it("runs an Effect body with and without an input, and the body sees the state as it is", async () => {
    const running = await boot();

    await running.exit("app/take", 4);
    await running.exit("app/double");
    expect(await running.state()).toEqual({ count: 8, log: ["doubled"] });
    await running.close();
  });

  it("validates the input before the body, and a typed failure is the command's failure with nothing committed", async () => {
    const running = await boot();

    expect(Exit.isFailure(await running.exit("app/take", "x"))).toBe(true);
    expect(Exit.isFailure(await running.exit("app/take", 11))).toBe(true);
    expect(await running.state()).toEqual({ count: 0, log: [] });
    await running.close();
  });
});
