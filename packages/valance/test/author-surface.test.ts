// The two author-surface forms: `command` (validated input, pure transition) and `entry` (named entry, plain-valued arguments).
// No MESH render and no target: `invoke` reaches the same binding function a rendered intent does (`{ value }` / `{ absent: true }` arguments),
// so what is pinned here is the binding boundary. The decisions protected: the pure form is the trusted, atomic `state.update` (never the
// validating `state.set`); the next state is checked against the state's own type; an entry's arguments reach the command as plain values;
// everything else (raw bindings, effectful commands, typed failures, unknown entries) is unchanged.
import * as Nexus from "@valancex/nexus";
import { Cause, Clock, Effect, Exit, Layer, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ count: Schema.Number, label: Schema.String, clock: Schema.Number });
type State = Schema.Schema.Type<typeof State>;

const initial: State = { count: 0, label: "", clock: 0 };

/** Never rendered here: a view exists because an application has one. */
const views = { main: { program: eventFreeProgram, scope: () => ({}) } };

const seen: Array<ReadonlyArray<unknown>> = [];

const application = Valance.define({
  name: "author-surface",
  state: { schema: State, initial },
  views,
  view: () => "main" as const,
  commands: (state) => {
    // Pure commands: no Effect, no id. The state is bound once.
    const command = Valance.command(state);
    const add = command(Schema.Struct({ amount: Schema.Number }), ({ amount }, current) => ({ ...current, count: current.count + amount }));
    const reset = command(Schema.Struct({}), (_input, current) => ({ ...current, count: 0 }));
    const describe = command(Schema.Struct({ note: Schema.optional(Schema.String) }), ({ note }, current) => ({ ...current, label: note ?? "none" }));
    const join = command(Schema.Struct({ label: Schema.String }), ({ label }, current) => ({ ...current, label }));
    // Effectful commands: the unchanged NEXUS path.
    const stamp = Nexus.Command.define("t.stamp", Schema.Struct({}), () =>
      Effect.flatMap(Clock.currentTimeMillis, (clock) => state.update((current) => Effect.succeed({ ...current, clock }))).pipe(Effect.asVoid));
    const fails = Nexus.Command.define("t.fails", Schema.Struct({}), () => Effect.fail("boom" as const));

    return {
      "app/add": Valance.entry(add, (amount) => ({ amount })),                                      // an argument-derived input
      "app/increment": Valance.entry(add, () => ({ amount: 1 })),                                   // a constant input, the same command
      "app/addSeen": Valance.entry(add, (...values) => { seen.push(values); return { amount: values[0] }; }),
      "app/reset": Valance.entry(reset),                                                            // no input
      "app/describe": Valance.entry(describe, (note) => ({ note })),
      "app/join": Valance.entry(join, (first, second) => ({ label: `${String(first)}-${String(second)}` })),
      "app/stamp": Valance.entry(stamp),                                                            // an effectful command, same entry form
      "app/fails": Valance.entry(fails),
      // The raw path, unchanged and side by side with the entries above.
      "app/raw": Nexus.Mesh.bind(add, (args) => ({ amount: args[0] !== undefined && "value" in args[0] ? args[0].value : undefined })),
    };
  },
});

const fixedClock = (n: number): Clock.Clock => {
  const base = Clock.make();

  return Object.assign(Object.create(Object.getPrototypeOf(base) as object) as Clock.Clock, base, { currentTimeMillis: Effect.succeed(n), unsafeCurrentTimeMillis: () => n });
};

const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.setClock(fixedClock(42)));

/** Starts the application, hands its handle to `body`, and returns what `body` returns. */
const within = <A>(body: (handle: Valance.ApplicationHandle<State, unknown>) => Effect.Effect<A, unknown>): Promise<A> =>
  Effect.runPromise(Effect.scoped(Effect.flatMap(Valance.start(application, { platform }), (handle) => body(handle as Valance.ApplicationHandle<State, unknown>))));

/** The typed failure of an exit, or a description of what else it was. */
const typed = (exit: Exit.Exit<unknown, unknown>): unknown => Exit.isFailure(exit) && Cause.isFailType(exit.cause) ? exit.cause.error : exit;

describe("command: validated input and a pure transition", () => {
  it("1. changes state with no Effect in author code, and is an ordinary NEXUS command", async () => {
    const state = await within((handle) => Effect.zipRight(handle.invoke("app/add", [{ value: 3 }]), handle.state));

    expect(state.count).toBe(3);
  });

  it("2. commits the returned value as is: it is not checked against the state's schema (state.update, never state.set)", async () => {
    const calls = { update: 0, set: 0 };
    const Narrow = Schema.Struct({ n: Schema.Number });
    const app = Valance.define({
      name: "trusted",
      state: { schema: Narrow, initial: { n: 0 } },
      views: { main: { ...views.main, scope: () => ({}) } },
      view: () => "main" as const,
      commands: (state) => {
        // A handle that counts which writer was used.
        const spied = {
          ...state,
          update: ((f: never) => { calls.update += 1; return state.update(f); }) as typeof state.update,
          set: ((next: never) => { calls.set += 1; return state.set(next); }) as typeof state.set,
        };
        const corrupt = Valance.command(spied)(Schema.Struct({}), () => ({ n: "not a number" }) as unknown as { readonly n: number });

        return { "app/corrupt": Valance.entry(corrupt) };
      },
    });
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);
      const exit = yield* Effect.exit(handle.invoke("app/corrupt", []));

      return { exit, state: yield* handle.state };
    })));

    expect(Exit.isSuccess(result.exit)).toBe(true);                               // no StateValidationFailed: the trusted writer
    expect(result.state).toEqual({ n: "not a number" });                           // committed as returned
    expect(calls).toEqual({ update: 1, set: 0 });
  });

  it("3. concurrent transitions all land", async () => {
    const count = await within((handle) => Effect.zipRight(
      Effect.all(Array.from({ length: 200 }, () => handle.invoke("app/increment", [])), { concurrency: "unbounded" }),
      Effect.map(handle.state, (state) => state.count)
    ));

    expect(count).toBe(200);
  });

  it("4. a union-shaped state needs no annotation, and the next state is checked against the state's type", async () => {
    const Union = Schema.Union(Schema.Struct({ view: Schema.Literal("a"), n: Schema.Number }), Schema.Struct({ view: Schema.Literal("b") }));
    const app = Valance.define({
      name: "union",
      state: { schema: Union, initial: { view: "a" as const, n: 0 } },
      views,
      view: () => "main" as const,
      commands: (state) => {
        const command = Valance.command(state);
        const toggle = command(Schema.Struct({}), (_input, current) => current.view === "a" ? { view: "b" } : { view: "a", n: 0 });
        const toB = command(Schema.Struct({}), () => ({ view: "b" }));                               // a transition that reads nothing

        // @ts-expect-error the next state is checked against the state's own type: "c" is not a view of this state
        command(Schema.Struct({}), () => ({ view: "c" }));
        // @ts-expect-error nor may a variant be missing its fields
        command(Schema.Struct({}), (_input, current) => current.view === "a" ? { view: "a" } : { view: "b" });

        return { "app/toggle": Valance.entry(toggle), "app/toB": Valance.entry(toB) };
      },
    });
    const order = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);
      const seenViews: Array<string> = [];

      yield* handle.invoke("app/toggle", []);
      seenViews.push((yield* handle.state).view);
      yield* handle.invoke("app/toggle", []);
      seenViews.push((yield* handle.state).view);
      yield* handle.invoke("app/toB", []);
      seenViews.push((yield* handle.state).view);

      return seenViews;
    })));

    expect(order).toEqual(["b", "a", "b"]);
  });

  it("an invalid input fails as the command's own typed validation error, the transition is not run, and nothing changes", async () => {
    const result = await within((handle) => Effect.gen(function* () {
      const exit = yield* Effect.exit(handle.invoke("app/add", [{ value: "not a number" }]));

      return { exit, state: yield* handle.state };
    }));

    expect(typed(result.exit)).toMatchObject({ _tag: "CommandValidationError" });
    expect(result.state).toEqual(initial);
  });

  it("its types: a NEXUS command and a table entry, with no Effect or MESH type in the author's code", () => {
    const state = undefined as unknown as Nexus.State.StateHandle<State>;
    const add = Valance.command(state)(Schema.Struct({ amount: Schema.Number }), ({ amount }, current) => ({ ...current, count: current.count + amount }));

    expectTypeOf(add).toEqualTypeOf<Nexus.Command.Command<{ readonly amount: number }, void, never, never>>();
    expectTypeOf(Valance.entry(add)).toEqualTypeOf<Nexus.Mesh.Binding<Nexus.Command.CommandValidationError, never>>();
  });
});

describe("command: the type contract is the state's own type", () => {
  // Each case is a compile-time claim (checked by `tsc`, not by vitest): what a transition may return is exactly a value of the state's type.
  const Item = Schema.Struct({ id: Schema.String });
  const Readonly = Schema.Union(Schema.Struct({ kind: Schema.Literal("a"), items: Schema.Array(Item) }), Schema.Struct({ kind: Schema.Literal("b"), items: Schema.Array(Item) }));
  const Mutable = Schema.Union(Schema.Struct({ kind: Schema.Literal("a"), items: Schema.mutable(Schema.Array(Item)) }), Schema.Struct({ kind: Schema.Literal("b"), items: Schema.mutable(Schema.Array(Item)) }));
  const Plain = Schema.Struct({ count: Schema.Number, tags: Schema.mutable(Schema.Array(Schema.String)) });

  it("a union state: narrowing, a literal member, a transition that reads nothing, and spread/append, for readonly and for mutable arrays", () => {
    const readonlyCommands = (state: Nexus.State.StateHandle<Schema.Schema.Type<typeof Readonly>>) => {
      const command = Valance.command(state);

      return [
        command(Schema.Struct({}), (_input, current) => current),
        command(Schema.Struct({}), (_input, current) => ({ ...current })),
        command(Schema.Struct({}), (_input, current) => ({ kind: "b", items: current.items })),         // a narrowed member, as a literal
        command(Schema.Struct({}), () => ({ kind: "b", items: [] })),                                    // reads nothing
        command(Schema.Struct({}), (_input, current) => ({ ...current, items: [...current.items, { id: "x" }] })),
        command(Schema.Struct({}), (_input, current) => ({ ...current, items: current.items.map(({ id }) => ({ id: `${id}!` })) })),
        // @ts-expect-error a view this state does not have
        command(Schema.Struct({}), (_input, current) => ({ kind: "c", items: current.items })),
        // @ts-expect-error a member without its fields
        command(Schema.Struct({}), () => ({ kind: "b" })),
      ];
    };
    const mutableCommands = (state: Nexus.State.StateHandle<Schema.Schema.Type<typeof Mutable>>) => {
      const command = Valance.command(state);
      const existing: Array<{ id: string }> = [];

      return [
        command(Schema.Struct({}), () => ({ kind: "b", items: [] })),                                    // an array literal stays a mutable array
        command(Schema.Struct({}), (_input, current) => ({ ...current, items: ["x"].map((id) => ({ id })) })),
        command(Schema.Struct({}), (_input, current) => ({ ...current, items: [...current.items, { id: "x" }] })),   // spread-append: a mutable array
        command(Schema.Struct({}), (_input, current) => ({ ...current, items: existing })),
        // @ts-expect-error still the state's type: "c" is not a view of it
        command(Schema.Struct({}), () => ({ kind: "c", items: [] })),
      ];
    };

    expect(typeof readonlyCommands).toBe("function");
    expect(typeof mutableCommands).toBe("function");
  });

  it("a plain state with a mutable array: replace, literal and append all type-check, and a wrong field type is rejected", () => {
    const plainCommands = (state: Nexus.State.StateHandle<Schema.Schema.Type<typeof Plain>>) => {
      const command = Valance.command(state);

      return [
        command(Schema.Struct({}), (_input, current) => ({ ...current, tags: ["x"] })),
        command(Schema.Struct({}), (_input, current) => ({ ...current, tags: [...current.tags, "y"] })),
        command(Schema.Struct({}), () => ({ count: 1, tags: [] })),
        // @ts-expect-error count is a number
        command(Schema.Struct({}), (_input, current) => ({ ...current, count: "1" })),
      ];
    };

    expect(typeof plainCommands).toBe("function");
  });

  it("a mutable-array state commits an array literal and a spread-append, as plain arrays", async () => {
    const app = Valance.define({
      name: "arrays", state: { schema: Plain, initial: { count: 0, tags: [] } }, views, view: () => "main" as const,
      commands: (state) => {
        const command = Valance.command(state);

        return {
          "app/set": Valance.entry(command(Schema.Struct({}), (_input, current) => ({ ...current, tags: ["x"] }))),
          "app/append": Valance.entry(command(Schema.Struct({ tag: Schema.String }), ({ tag }, current) => ({ ...current, tags: [...current.tags, tag] })), (tag) => ({ tag })),
        };
      },
    });
    const tags = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);

      yield* handle.invoke("app/set", []);
      yield* handle.invoke("app/append", [{ value: "y" }]);

      return (yield* handle.state).tags;
    })));

    expect(tags).toEqual(["x", "y"]);
    expect(Array.isArray(tags)).toBe(true);
  });

  it("an extra property is not flagged, the same as returning it from state.update (the contract does not narrow what update accepts)", () => {
    const extra = (state: Nexus.State.StateHandle<Schema.Schema.Type<typeof Plain>>) =>
      Valance.command(state)(Schema.Struct({}), (_input, current) => ({ ...current, extra: 1 }));

    expect(typeof extra).toBe("function");
  });
});

describe("diagnostic identity (decision: a pure command's validation failure carries the shared id, and no entry key)", () => {
  it("two pure commands behind two entries fail with the same command id, and neither failure names its entry; the caller of invoke knows the key it passed", async () => {
    const app = Valance.define({
      name: "identity", state: { schema: State, initial }, views, view: () => "main" as const,
      commands: (state) => {
        const command = Valance.command(state);
        const openMessage = command(Schema.Struct({ id: Schema.Number }), (_input, current) => current);
        const archiveMessage = command(Schema.Struct({ id: Schema.String }), (_input, current) => current);

        return { "mail/open": Valance.entry(openMessage, (id) => ({ id })), "mail/archive": Valance.entry(archiveMessage) };
      },
    });
    const failures = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);

      return [yield* Effect.exit(handle.invoke("mail/open", [{ value: "A" }])), yield* Effect.exit(handle.invoke("mail/archive", []))].map(typed);
    })));

    expect(failures).toMatchObject([{ _tag: "CommandValidationError", command: "valance.command" }, { _tag: "CommandValidationError", command: "valance.command" }]);
    expect(JSON.stringify(failures)).not.toMatch(/mail\/open|mail\/archive/);     // nothing in a failure names the entry (the same holds for a NEXUS command's own id)
  });
});

describe("entry: a named entry runs a command with plain-valued arguments", () => {
  it("5. a plain-valued argument reaches the command as the plain value ({ value: x } is x)", async () => {
    const label = await within((handle) => Effect.zipRight(handle.invoke("app/describe", [{ value: "hello" }]), Effect.map(handle.state, (state) => state.label)));

    expect(label).toBe("hello");
  });

  it("6. an absent argument reaches the command as undefined ({ absent: true } is undefined)", async () => {
    seen.length = 0;
    const label = await within((handle) => Effect.gen(function* () {
      yield* handle.invoke("app/describe", [{ absent: true }]);
      yield* handle.invoke("app/addSeen", [{ absent: true }]).pipe(Effect.exit);   // undefined is not an amount: the command's schema says so

      return (yield* handle.state).label;
    }));

    expect(label).toBe("none");                                                    // `note` was undefined
    expect(seen).toEqual([[undefined]]);
    expect(seen[0]).toHaveLength(1);
    expect(0 in (seen[0] ?? [])).toBe(true);                                       // a present argument that is undefined, not a missing one
  });

  it("every argument is passed, in order, as a plain value", async () => {
    const label = await within((handle) => Effect.zipRight(handle.invoke("app/join", [{ value: "x" }, { value: "y" }]), Effect.map(handle.state, (state) => state.label)));

    expect(label).toBe("x-y");
  });

  it("7. an entry can run a command with no input, whatever arguments it is given", async () => {
    const counts = await within((handle) => Effect.gen(function* () {
      yield* handle.invoke("app/add", [{ value: 5 }]);
      yield* handle.invoke("app/reset", []);
      const afterNone = (yield* handle.state).count;

      yield* handle.invoke("app/add", [{ value: 5 }]);
      yield* handle.invoke("app/reset", [{ value: 99 }]);

      return [afterNone, (yield* handle.state).count];
    }));

    expect(counts).toEqual([0, 0]);
  });

  it("8. several entries run the same command: a constant input and an argument-derived one", async () => {
    const count = await within((handle) => Effect.gen(function* () {
      yield* handle.invoke("app/increment", []);
      yield* handle.invoke("app/add", [{ value: 10 }]);
      yield* handle.invoke("app/increment", [{ value: "ignored" }]);

      return (yield* handle.state).count;
    }));

    expect(count).toBe(12);
  });

  it("9. an unknown entry is the existing typed UnmappedCommand, and nothing runs", async () => {
    const result = await within((handle) => Effect.gen(function* () {
      const exit = yield* Effect.exit(handle.invoke("nowhere/at-all", []));

      return { exit, state: yield* handle.state };
    }));

    expect(typed(result.exit)).toEqual({ _tag: "UnmappedCommand", component: "nowhere", name: "at-all" });
    expect(result.state).toEqual(initial);
  });
});

describe("regression: the existing paths are unchanged", () => {
  it("10. an effectful command (a NEXUS command over an Effect, reading the platform's clock) runs through the same entry form", async () => {
    const clock = await within((handle) => Effect.zipRight(handle.invoke("app/stamp", []), Effect.map(handle.state, (state) => state.clock)));

    expect(clock).toBe(42);
  });

  it("10. a command's own typed failure passes through an entry unchanged, and commits nothing", async () => {
    const result = await within((handle) => Effect.gen(function* () {
      const exit = yield* Effect.exit(handle.invoke("app/fails", []));

      return { exit, state: yield* handle.state };
    }));

    expect(typed(result.exit)).toBe("boom");
    expect(result.state).toEqual(initial);
  });

  it("11. a raw binding (Mesh.bind over raw IntentArguments) still works in the same table, and invoke is unchanged", async () => {
    const count = await within((handle) => Effect.gen(function* () {
      yield* handle.invoke("app/raw", [{ value: 4 }]);
      yield* handle.invoke("app/add", [{ value: 3 }]);

      return (yield* handle.state).count;
    }));

    expect(count).toBe(7);
  });
});
