// B3 (Tier 1, audit I2): `start` types `invoke`'s key from the command table. A bare name `n` is `"app/n"`, an exact `"component/name"` key is itself, and a literal key the
// table lacks is a type error. A key that is not a literal (a `string`, a template) still compiles, so a caller that builds keys keeps working, and an `ApplicationHandle<S, E>`
// (the default, any key) still takes a typed handle.
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ count: Schema.Number });

const app = Valance.define({
  name: "invoke-keys",
  state: { schema: State, initial: { count: 0 } },
  views: { main: { program: eventFreeProgram, scope: () => ({}) } },
  commands: (state) => {
    const command = Valance.command(state);
    const add = command(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ count: s.count + amount }));

    return { add, "app/reset": Valance.entry(command((s) => ({ ...s, count: 0 }))) };
  },
});

describe("invoke's key, typed from the command table", () => {
  it("accepts the table's keys and runs them", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));

    await Effect.runPromise(handle.invoke("app/add", [{ value: 2 }]));
    expect(await Effect.runPromise(handle.state)).toEqual({ count: 2 });
    await Effect.runPromise(handle.invoke("app/reset", []));
    expect(await Effect.runPromise(handle.state)).toEqual({ count: 0 });

    // @ts-expect-error a literal key the table does not have
    expect((await Effect.runPromise(Effect.exit(handle.invoke("app/ad", [])))).pipe(Exit.isFailure)).toBe(true);
    // @ts-expect-error a bare name is not a key: from outside a render it is "app/add"
    void (() => handle.invoke("add", []));

    // a key built at run time is not checked (it was a `string` before, and stays one)
    const built: string = "app/add";
    await Effect.runPromise(handle.invoke(built, [{ value: 1 }]));
    await Effect.runPromise(handle.invoke(`app/${"add" as string}`, [{ value: 1 }]));
    expect(await Effect.runPromise(handle.state)).toEqual({ count: 2 });

    // a typed handle is still an `ApplicationHandle<S, E>`, whose keys are any string
    const wide: Valance.ApplicationHandle<{ readonly count: number }, unknown> = handle;
    void (() => wide.invoke("anything/at-all", []));

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("is any string for a definition typed without its keys (the default)", () => {
    const untyped: Valance.ApplicationDefinition<{ readonly count: number }, unknown, never, "main"> = app;
    const started = Valance.start(untyped);

    expectTypeOf(started).toEqualTypeOf<Effect.Effect<Valance.ApplicationHandle<{ readonly count: number }, unknown>, Valance.StartError, Scope.Scope>>();
    void (() => Effect.map(started, (handle) => handle.invoke("anything/at-all", [])));
  });
});
