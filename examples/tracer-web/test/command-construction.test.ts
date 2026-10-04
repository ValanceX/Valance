// INTERFACE EXPERIMENT. After name-keyed commands (slice one), what is the smallest SAFE way to declare an ordinary command?
//   C  current:      commands: (state) => { const command = Valance.command(state); return { increment: command(Schema.Struct({}), (_i, s) => …) } }
//   A  declared:     commands: () => ({ increment: command((s) => …), add: command(Schema.Struct({ amount }), ({ amount }, s) => …) })
//                    `command` returns a BRANDED value (an instance of a VALANCE-owned class). The table holds three kinds of value, each unambiguous at run time:
//                    a binding (a function, under "component/name"), a NEXUS command (a plain object), a declared command (an instance of `Declared`).
//   B  shape-only:   commands: () => ({ increment: { run: (s) => … } })   a plain object told apart from a NEXUS command by its keys (rejected below)
// Everything in the "prototype" section is an ADAPTER over the real `Valance.define` of slice one. No production code changes.
import type { Mesh } from "@valancex/nexus";

import { compileProgram } from "@valancex/mesh-compiler";
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Cause, Deferred, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import { textTarget } from "./non-dom-target.js";

// ---- prototype -------------------------------------------------------------------------------------------------------------------------------------
type Fields = Record<string, Schema.Schema.All>;
/** A command declared without a state handle: what `command(...)` returns. The class IS the brand: `instanceof` is the whole discrimination. */
class Declared<S, I> {
  constructor(readonly input: Schema.Schema<any> | undefined, readonly transition: (input: I, state: S) => S) {}
}
function command<S>(transition: (state: S) => S): Declared<S, void>;
function command<S, F extends Fields>(input: Schema.Struct<F>, transition: (input: Schema.Struct.Type<F>, state: S) => S): Declared<S, Schema.Struct.Type<F>>;
function command(a: unknown, b?: unknown): unknown {
  return b === undefined ? new Declared(undefined, (_input: unknown, state: unknown) => (a as (s: unknown) => unknown)(state)) : new Declared(a as Schema.Schema<any>, b as never);
}
type Entry<S, E, R extends Valance.Ambient> = Valance.CommandTable<E, R>[string] | Declared<S, any>;
/** Resolve declared commands against the application's state, then hand the ordinary table to the real `define`. */
const defineA = <S, E, R extends Valance.Ambient, V extends string>(def: Omit<Valance.ApplicationDefinition<S, E, R, V>, "commands"> & { readonly commands: (state: Nexus.State.StateHandle<S>) => Readonly<Record<string, Entry<S, E, R>>> }) =>
  Valance.define({
    ...def,
    commands: (state) => Object.fromEntries(Object.entries(def.commands(state)).map(([key, value]) =>
      [key, value instanceof Declared ? Valance.command(state)(value.input ?? Schema.Struct({}), value.transition as never) : value])) as Valance.CommandTable<E, R>,
  } as Valance.ApplicationDefinition<S, E, R, V>);

// ---- the application -------------------------------------------------------------------------------------------------------------------------------
const manifest = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} }, text: { props: {}, events: {}, commands: {}, scope: {} }, button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
  counter: { props: {}, events: {}, commands: { increment: { parameters: [] }, add: { parameters: [{ name: "amount", type: { kind: "number" } }] }, reload: { parameters: [] } }, scope: { label: { kind: "string" }, step: { kind: "number" } } },
} });
const program: Mesh.Program = (await compileProgram({ model: { manifest, path: "components.json" }, root: "counter", components: [{ component: "counter", path: "counter.mprx", source:
  `<page><text>{label}</text><button on.click={increment()}>Increment</button><button on.click={add(step)}>Add</button><button on.click={reload()}>Reload</button></page>` }] })).program!;

const State = Schema.Struct({ count: Schema.Number, phase: Schema.Literal("idle", "loading", "ready", "failed") });
type State = typeof State.Type;
const views = { counter: { program, scope: ({ count, phase }: State) => ({ label: `Count: ${count} (${phase})`, step: 5 }) } };

interface Feed { readonly get: Effect.Effect<number, { readonly _tag: "Offline" }> }
const Feed = Nexus.Capability.define<Feed>("example/feed");

/** C. Today, after slice one. */
const current = Valance.define({
  name: "construction-c", state: { schema: State, initial: { count: 0, phase: "idle" } }, views, view: () => "counter",
  commands: (state) => {
    const command = Valance.command(state);

    return {
      increment: command(Schema.Struct({}), (_input, current) => ({ ...current, count: current.count + 1 })),
      add: command(Schema.Struct({ amount: Schema.Number }), ({ amount }, current) => ({ ...current, count: current.count + amount })),
      reload: Nexus.Command.define("reload", Schema.Struct({}), () => Effect.void),
    };
  },
});
void current;

/** A. Declared. The async command is the same NEXUS command as ever, in the same table. */
const declared = defineA({
  name: "construction-a", state: { schema: State, initial: { count: 0, phase: "idle" } }, views, view: () => "counter",
  commands: (state) => {
    let latest = 0;

    return {
      increment: command((s) => ({ ...s, count: s.count + 1 })),                                                  // S inferred; no state, no schema, no unused input
      add: command(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ ...s, count: s.count + amount })),
      reload: Nexus.Command.define("reload", Schema.Struct({}), () => Effect.gen(function* () {                  // effects: unchanged, and unavoidable
        const mine = ++latest;
        const feed = yield* Nexus.Capability.require(Feed).pipe(Effect.orDie);   // NOTE: a table cannot mix commands that fail DIFFERENTLY (see the report); one failure type per table

        yield* state.update((s) => Effect.succeed({ ...s, phase: "loading" as const }));
        const result = yield* feed.get.pipe(Effect.either);

        if (mine !== latest) { return; }
        yield* state.update((s) => Effect.succeed(result._tag === "Right" ? { count: result.right, phase: "ready" as const } : { ...s, phase: "failed" as const }));
      })),
      "app/reset": Valance.entry(Nexus.Command.define("reset", Schema.Struct({}), () => Effect.asVoid(state.update((s) => Effect.succeed({ ...s, count: 0 })))), () => ({})),   // an exact binding, as ever
    };
  },
  start: "reload",
});

// ---- tests ----------------------------------------------------------------------------------------------------------------------------------------
const until = async (done: () => boolean | Promise<boolean>) => { for (let i = 0; !(await done()); i += 1) { if (i > 400) { throw new Error("timed out"); } await new Promise((r) => setTimeout(r, 5)); } };
const world = () => {
  const gates: Array<Deferred.Deferred<number, { _tag: "Offline" }>> = [];
  const interrupted: Array<boolean> = [];
  const feed: Feed = { get: Effect.suspend(() => {
    const gate = Effect.runSync(Deferred.make<number, { _tag: "Offline" }>());
    const index = gates.push(gate) - 1;

    interrupted.push(false);

    return Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { interrupted[index] = true; })));
  }) };

  return { gates, interrupted, platform: Nexus.Capability.EnvironmentLive(new Map([[Feed.id, { _tag: "Available" as const, implementation: feed }]])) };
};
const boot = async (definition: typeof declared = declared) => {
  const w = world();
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(definition, { platform: w.platform }).pipe(Scope.extend(scope)));
  const factory = textTarget();
  let screen!: ReturnType<typeof factory>;

  await Effect.runPromise(Valance.mount(handle, (report) => (screen = factory(report))).pipe(Scope.extend(scope)));

  return { ...w, handle, screen: () => screen.screen(), click: (l: string) => screen.activate(l), state: () => Effect.runPromise(handle.state),
    invoke: (key: string, ...values: ReadonlyArray<unknown>) => Effect.runPromise(Effect.exit(handle.invoke(key, values.map((value) => ({ value })) as never))), close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

describe("A: declared commands on the real runtime", () => {
  it("simple, argumented, async (startup, failure, success), and an exact binding, all in one table", async () => {
    const x = await boot();

    await until(() => x.gates.length === 1);                                    // `start: "reload"`: the bare name
    expect(x.screen()).toContain("loading");
    await Effect.runPromise(Deferred.fail(x.gates[0]!, { _tag: "Offline" as const }));
    await until(() => x.screen().includes("failed"));
    x.click("Increment");                                                       // simple: one property
    await until(async () => (await x.state()).count === 1);
    x.click("Add");                                                             // argumented: add(step) with step = 5
    await until(async () => (await x.state()).count === 6);
    x.click("Reload");
    await until(() => x.gates.length === 2);
    await Effect.runPromise(Deferred.succeed(x.gates[1]!, 40));
    await until(() => x.screen().includes("Count: 40 (ready)"));
    await x.invoke("app/reset");                                                // the exact `app/reset` binding is unchanged
    await until(async () => (await x.state()).count === 0);
    await x.close();
  });

  it("safety: wrong input is rejected with the typed error and nothing commits; an unmapped declared command is still the conformance failure", async () => {
    const x = await boot();

    await x.invoke("app/increment");
    const bad = await x.invoke("app/add", "five");
    expect(Exit.isFailure(bad) && JSON.stringify(bad.cause)).toContain("CommandValidationError");
    expect((await x.state()).count).toBe(1);
    await x.close();

    const missing = await Effect.runPromise(Effect.scoped(Effect.exit(Valance.start(defineA({ name: "m", state: { schema: State, initial: { count: 0, phase: "idle" } }, views, view: () => "counter", commands: (_state) => ({ increment: command((s: State) => s) }) })))));

    expect(Exit.isFailure(missing) && Cause.failureOption(missing.cause)).toMatchObject({ _tag: "Some", value: { _tag: "ConformanceViolation" } });
  });

  it("safety: cancellation on close still interrupts the async command in the same table", async () => {
    const x = await boot();

    await until(() => x.gates.length === 1);
    await x.close();
    expect(x.interrupted[0]).toBe(true);
  });

  it("discrimination is by identity, never by guess: a bare function, a binding or a plain object under a declared slot is not accepted as a declared command", async () => {
    // compile time: a function with the shape of a transition is not a table value (this is the previous experiment's rejected form)
    void defineA({
      name: "x", state: { schema: State, initial: { count: 0, phase: "idle" } }, views, view: () => "counter",
      // @ts-expect-error a bare `(state) => state` is neither a binding, a NEXUS command nor a declared command
      commands: (_state) => ({ increment: (s: State) => s }),
    });
    // run time: `instanceof Declared` is the only test; an `any`-typed function reaches the existing "bare name must hold a command" defect, and is never run as a transition
    const sneaky = defineA({
      name: "x", state: { schema: State, initial: { count: 0, phase: "idle" } }, views, view: () => "counter",
      commands: (_state) => ({ increment: ((s: State) => s) as never, add: command(Schema.Struct({ amount: Schema.Number }), (_i, s) => s) }),
    });
    const exit = await Effect.runPromise(Effect.scoped(Effect.exit(Valance.start(sneaky))));

    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("is a bare command name");
  });
});

describe("B: shape-discriminated plain objects (rejected)", () => {
  it("a declaration `{ run }` is indistinguishable from a NEXUS command `{ name, input, handler }` except by key names: a typo silently changes which kind it is", () => {
    const isCommand = (v: object) => "handler" in v && "input" in v && "name" in v;
    const isDeclaration = (v: object) => "run" in v;

    expect(isDeclaration({ run: () => 1 })).toBe(true);
    expect(isDeclaration({ rnu: () => 1 })).toBe(false);                      // a typo is not a declaration…
    expect(isCommand({ rnu: () => 1 })).toBe(false);                          // …and not a command: it falls through to the same defect, with no brand to point at
    // by contrast the brand is a nominal identity: a look-alike is simply not an instance
    expect({ input: undefined, transition: () => 1 } instanceof Declared).toBe(false);
  });
});

describe("types: what the developer sees", () => {
  it("S is inferred from the schema; the transition's parameter is the whole state; the input type comes from the struct", () => {
    defineA({
      name: "types", state: { schema: State, initial: { count: 0, phase: "idle" } }, views, view: () => "counter",
      commands: (_state) => ({
        a: command((s) => { expectTypeOf(s).toEqualTypeOf<State>(); return s; }),
        b: command(Schema.Struct({ amount: Schema.Number }), (input, s) => { expectTypeOf(input).toEqualTypeOf<{ readonly amount: number }>(); expectTypeOf(s).toEqualTypeOf<State>(); return s; }),
      }),
    });
    expect(true).toBe(true);
  });
});

// ---- A': keep the curried, state-bound constructor and let it take the no-input form --------------------------------------------------------------------
/** Prototype of `Valance.command(state)` with one more overload: `command((current) => next)`. S is bound by the state handle, exactly as today. */
function bound<S>(state: Nexus.State.StateHandle<S>) {
  const make = Valance.command(state);

  function command(transition: (current: S) => S): Nexus.Command.Command<{}, void, never, never>;
  function command<F extends Fields>(input: Schema.Struct<F>, transition: (input: Schema.Struct.Type<F>, current: S) => S): Nexus.Command.Command<Schema.Struct.Type<F>, void, never, never>;
  function command(a: unknown, b?: unknown): unknown { return b === undefined ? make(Schema.Struct({}), (_input, current) => (a as (s: S) => S)(current)) : make(a as Schema.Schema<any>, b as never); }

  return command;
}

describe("A': the curried constructor with a no-input form", () => {
  const prime = Valance.define({
    name: "construction-a-prime", state: { schema: State, initial: { count: 0, phase: "idle" } }, views: { counter: { program, scope: ({ count }: State) => ({ label: `Count: ${count}`, step: 5 }) } }, view: () => "counter",
    commands: (state) => {
      const command = bound(state);                                               // the same line as today

      return {
        increment: command((s) => ({ ...s, count: s.count + 1 })),                // no schema, no unused input; S comes from the handle
        add: command(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ ...s, count: s.count + amount })),
        reload: command((s) => s),
      };
    },
  });

  it("types and runs on the real runtime: a click, an argumented click, wrong input rejected", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(prime).pipe(Scope.extend(scope)));
    const factory = textTarget();
    let screen!: ReturnType<typeof factory>;

    await Effect.runPromise(Valance.mount(handle, (report) => (screen = factory(report))).pipe(Scope.extend(scope)));
    screen.activate("Increment");
    await until(() => screen.screen().includes("Count: 1"));
    screen.activate("Add");
    await until(() => screen.screen().includes("Count: 6"));
    const bad = await Effect.runPromise(Effect.exit(handle.invoke("app/add", [{ value: "five" }])));

    expect(Exit.isFailure(bad) && JSON.stringify(bad.cause)).toContain("CommandValidationError");
    expect((await Effect.runPromise(handle.state)).count).toBe(6);
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("a transition that does not return the state is still a compile error", () => {
    void Valance.define({
      name: "x", state: { schema: State, initial: { count: 0, phase: "idle" } }, views, view: () => "counter",
      commands: (state) => {
        const command = bound(state);

        // @ts-expect-error the transition must return the state
        return { increment: command((s) => ({ count: "x" })), add: command(Schema.Struct({ amount: Schema.Number }), (_i, s) => s), reload: command((s) => s) };
      },
    });
  });
});
