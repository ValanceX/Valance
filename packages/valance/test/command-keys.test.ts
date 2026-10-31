// Task 25 (Tier 1, opt-in, audit I2): `handle.command(key, input)` runs a command by a key the type CHECKS (a typo is a type error), with the input typed from the command:
// a bare command takes its input whole, by field name, never by position. An exact `"component/name"` key takes its entry's arguments, as `invoke` does. `invoke` is unchanged.
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ from: Schema.String, to: Schema.String, count: Schema.Number });
type State = typeof State.Type;
const initial: State = { from: "", to: "", count: 0 };
const views = { main: { program: eventFreeProgram, scope: () => ({}) } };

const app = Valance.define({
  name: "command-keys",
  state: { schema: State, initial },
  views,
  commands: (state) => {
    const command = Valance.command(state);

    return {
      move: command(Schema.Struct({ from: Schema.String, to: Schema.String }), ({ from, to }, s) => ({ ...s, from, to })),
      increment: command((s) => ({ ...s, count: s.count + 1 })),
      set: command(Schema.Number, (count, s) => ({ ...s, count })),
      "app/reset": Valance.entry(
        command(Schema.Struct({ count: Schema.Number }), ({ count }, s) => ({ ...s, count })),
        (count) => ({ count }),
      ),
    };
  },
});

// A table typed as the wide `CommandTable`: its keys are not literals, so the accessor takes any string (and an unknown one is the typed `UnmappedCommand` at run time).
const wide = Valance.define({
  name: "command-keys-wide",
  state: { schema: State, initial },
  views,
  commands: (state): Valance.CommandTable<never, never> => ({ increment: Valance.command(state)((s) => ({ ...s, count: s.count + 1 })) }),
});

// A shared table typed by its own literal keys keeps them through a spread.
const shared = (state: Valance.StateHandle<State>) => ({ increment: Valance.command(state)((s) => ({ ...s, count: s.count + 1 })) });
const spread = Valance.define({
  name: "command-keys-spread",
  state: { schema: State, initial },
  views,
  commands: (state) => ({ ...shared(state), "app/own": Valance.entry(Valance.command(state)((s) => s)) }),
});

const started = async <E, K extends string>(definition: Valance.ApplicationDefinition<State, E, never, "main", K>) => {
  const scope = await Effect.runPromise(Scope.make());

  return { handle: await Effect.runPromise(Valance.start(definition).pipe(Scope.extend(scope))), close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

describe("handle.command: a checked key, a typed input", () => {
  it("binds a bare command's struct input by field name, whatever the order it is written in", async () => {
    const { handle, close } = await started(app);

    await Effect.runPromise(handle.command("app/move", { to: "b", from: "a" }));
    expect(await Effect.runPromise(handle.state)).toMatchObject({ from: "a", to: "b" });
    await close();
  });

  it("takes no input for a command that takes none, the whole value for a non-struct input, and an entry's arguments for an exact key", async () => {
    const { handle, close } = await started(app);

    await Effect.runPromise(handle.command("app/increment"));
    expect((await Effect.runPromise(handle.state)).count).toBe(1);
    await Effect.runPromise(handle.command("app/set", 7));
    expect((await Effect.runPromise(handle.state)).count).toBe(7);
    await Effect.runPromise(handle.command("app/reset", [{ value: 0 }]));
    expect((await Effect.runPromise(handle.state)).count).toBe(0);
    await close();
  });

  it("validates the input with the command's schema, as always", async () => {
    const { handle, close } = await started(app);
    const exit = await Effect.runPromise(Effect.exit(handle.command("app/move", { from: 1, to: "b" } as never)));

    expect(exit).toMatchObject({ _tag: "Failure", cause: { error: { _tag: "CommandValidationError" } } });
    await close();
  });

  it("checks the key and the input in the type", () => {
    const startApp = () => Valance.start(app);
    type Handle = Effect.Effect.Success<ReturnType<typeof startApp>>;
    const typed = (handle: Handle) => {
      // @ts-expect-error a typo is a type error
      void handle.command("app/mvoe", { from: "a", to: "b" });
      // @ts-expect-error a field of the wrong type
      void handle.command("app/move", { from: 1, to: "b" });
      // @ts-expect-error a missing field
      void handle.command("app/move", { from: "a" });
      // @ts-expect-error an input is required when the command takes one
      void handle.command("app/set");
      // invoke is unchanged: any string
      void handle.invoke("app/mvoe", []);
    };

    expect(typed).toBeTypeOf("function");
  });

  it("takes any string when the table's keys are not literals, and an unknown key is the typed UnmappedCommand", async () => {
    const { handle, close } = await started(wide);

    await Effect.runPromise(handle.command("app/increment"));
    expect((await Effect.runPromise(handle.state)).count).toBe(1);
    expect(await Effect.runPromise(Effect.exit(handle.command("app/nope")))).toMatchObject({ _tag: "Failure", cause: { error: { _tag: "UnmappedCommand" } } });
    await close();
  });

  it("keeps the keys of a spread table typed by its own keys", async () => {
    const { handle, close } = await started(spread);

    await Effect.runPromise(handle.command("app/increment"));
    await Effect.runPromise(handle.command("app/own", []));
    expect((await Effect.runPromise(handle.state)).count).toBe(1);
    await close();
  });

  it("a typed handle is still an ApplicationHandle<S, E>", () => {
    expectTypeOf<Valance.ApplicationHandle<State, unknown, "app/add", { "app/add": { readonly n: number } }>>().toExtend<Valance.ApplicationHandle<State, unknown>>();
  });
});
