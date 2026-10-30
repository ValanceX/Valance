// Task 29 (audit I2): a bare command whose call site names every argument with a field of its struct input is bound BY NAME (MESH's `IntentArgument.name`); any other call is by position.
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import type { Mesh } from "@valancex/nexus";

import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ from: Schema.String, to: Schema.String });
const app = Valance.define({
  name: "named-binding",
  state: { schema: State, initial: { from: "", to: "" } },
  views: { main: { program: eventFreeProgram, scope: () => ({}) } },
  commands: (state) => ({
    move: Valance.command(state)(Schema.Struct({ from: Schema.String, to: Schema.String }), ({ from, to }, s) => ({ ...s, from, to })),
    set: Valance.command(state)(Schema.String, (to, s) => ({ ...s, to })),
  }),
});

const run = async (key: string, args: ReadonlyArray<Mesh.IntentArgument>) => {
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
  const exit = await Effect.runPromise(Effect.exit(handle.invoke(key, args)));
  const state = await Effect.runPromise(handle.state);

  await Effect.runPromise(Scope.close(scope, Exit.void));
  return { exit, state };
};

describe("a bare command's arguments", () => {
  it("fill the fields they are named after, in any order", async () => {
    const { state } = await run("app/move", [{ value: "b", name: "to" }, { value: "a", name: "from" }]);

    expect(state).toEqual({ from: "a", to: "b" });
  });

  it("fall back to position when a name is missing, not a field, or repeated", async () => {
    for (const args of [
      [{ value: "a", name: "to" }, { value: "b" }],
      [{ value: "a", name: "x" }, { value: "b", name: "to" }],
      [{ value: "a", name: "to" }, { value: "b", name: "to" }],
      [{ value: "a" }, { value: "b" }],
    ] as ReadonlyArray<ReadonlyArray<Mesh.IntentArgument>>) {
      expect((await run("app/move", args)).state).toEqual({ from: "a", to: "b" });
    }
  });

  it("give a non-struct input its first argument whole, named or not", async () => {
    expect((await run("app/set", [{ value: "z", name: "other" }])).state.to).toBe("z");
  });
});
