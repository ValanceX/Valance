// `Valance.command(state)` also takes a state-only transition: `command((current) => next)` is `command(Schema.Struct({}), (_input, current) => next)`.
// Same `Command` (same name, same empty-struct input, same handler), so validation, admission, atomicity, cancellation, failure, startup and lifetime are the
// explicit form's, not a new path. S is bound by the state handle, as before: there is no second inference path.
import * as Nexus from "@valancex/nexus";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ count: Schema.Number, label: Schema.Literal("idle", "busy") });
type State = typeof State.Type;

const application = (start?: string) => Valance.define({
  name: "command-no-input",
  state: { schema: State, initial: { count: 0, label: "idle" } },
  views: { main: { program: eventFreeProgram, scope: () => ({}) } },
  view: () => "main" as const,
  commands: (state) => {
    const command = Valance.command(state);

    return {
      increment: command((s) => ({ ...s, count: s.count + 1 })),                                            // the new form
      explicit: command(Schema.Struct({}), (_input, s) => ({ ...s, count: s.count + 1 })),                  // the existing form
      add: command(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ ...s, count: s.count + amount })),
      busy: command((s) => ({ ...s, label: "busy" })),                                                       // a literal in the returned state is not widened
    };
  },
  ...(start === undefined ? {} : { start }),
});

const boot = async (start?: string) => {
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application(start)).pipe(Scope.extend(scope)));

  return { handle, state: () => Effect.runPromise(handle.state), exit: (key: string, ...values: ReadonlyArray<unknown>) => Effect.runPromise(Effect.exit(handle.invoke(key, values.map((value) => ({ value })) as never))), close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

describe("the no-input form of Valance.command(state)", () => {
  it("1+3. a simple no-input command runs, and commits exactly the transition's result", async () => {
    const app = await boot();

    await app.exit("app/increment");
    expect(await app.state()).toEqual({ count: 1, label: "idle" });
    await app.exit("app/busy");
    expect(await app.state()).toEqual({ count: 1, label: "busy" });
    await app.close();
  });

  it("2. the state type comes from the state handle (no second inference path), and a transition must return the state", () => {
    Valance.define({
      name: "inference", state: { schema: State, initial: { count: 0, label: "idle" } }, views: { main: { program: eventFreeProgram, scope: () => ({}) } }, view: () => "main" as const,
      commands: (state) => {
        const command = Valance.command(state);

        expectTypeOf(command((s) => { expectTypeOf(s).toEqualTypeOf<State>(); return s; })).toEqualTypeOf<Nexus.Command.Command<{}, void, never, never>>();
        // @ts-expect-error the next state must be a state
        void command((s) => ({ count: "x", label: s.label }));

        return {};
      },
    });
    expect(true).toBe(true);
  });

  it("4+5. an input-bearing command is unchanged: it works, and a wrong argument is the typed CommandValidationError with nothing committed", async () => {
    const app = await boot();

    await app.exit("app/add", 5);
    expect((await app.state()).count).toBe(5);

    const bad = await app.exit("app/add", "five");

    expect(Exit.isFailure(bad) && Cause.failureOption(bad.cause)).toMatchObject({ _tag: "Some", value: { _tag: "CommandValidationError" } });
    expect((await app.state()).count).toBe(5);
    await app.close();
  });

  it("6+8. it is the same Command as the explicit empty-schema form: same type, same name, an empty struct input, a handler; and the explicit form still works", async () => {
    const made: { bare?: Nexus.Command.Command<{}, void, never, never>; explicit?: Nexus.Command.Command<{}, void, never, never> } = {};
    const scope = await Effect.runPromise(Scope.make());

    await Effect.runPromise(Valance.start(Valance.define({
      name: "capture", state: { schema: State, initial: { count: 0, label: "idle" } }, views: { main: { program: eventFreeProgram, scope: () => ({}) } }, view: () => "main" as const,
      commands: (state) => {
        const command = Valance.command(state);

        made.bare = command((s) => s);
        made.explicit = command(Schema.Struct({}), (_input, s) => s);

        return { bare: made.bare, explicit: made.explicit };
      },
    })).pipe(Scope.extend(scope)));
    await Effect.runPromise(Scope.close(scope, Exit.void));

    const { bare, explicit } = made as { bare: Nexus.Command.Command<{}, void, never, never>; explicit: Nexus.Command.Command<{}, void, never, never> };

    expect(Object.keys(bare).sort()).toEqual(["handler", "input", "name"]);                    // no new field, no new value kind
    expect(Object.keys(explicit).sort()).toEqual(["handler", "input", "name"]);
    expect(bare.name).toBe(explicit.name);
    expect(bare.input.ast).toEqual(explicit.input.ast);                                         // the same empty struct
    expect(typeof bare.handler).toBe("function");

    const app = await boot();

    await app.exit("app/explicit");
    expect((await app.state()).count).toBe(1);
    await app.close();
  });

  it("the same semantics as the explicit form: concurrent invocations all land (atomic update), and an extra argument is ignored", async () => {
    const app = await boot();

    await Promise.all(Array.from({ length: 5 }, () => app.exit("app/increment")));
    await app.exit("app/increment", "ignored", 1);
    expect((await app.state()).count).toBe(6);
    await app.close();
  });

  it("7. startup can run a no-input command, by bare name", async () => {
    const app = await boot("increment");

    for (let i = 0; i < 200 && (await app.state()).count !== 1; i += 1) { await new Promise((r) => setTimeout(r, 5)); }
    expect((await app.state()).count).toBe(1);
    await app.close();
  });
});
