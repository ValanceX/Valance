// INTERFACE EXPERIMENT (not a feature). Question: is a name-keyed, typed map of things the application can do a better public composition
// model than `commands: { "component/name": Valance.entry(command, (args) => input) }`?
// Everything in the "prototype" section is an ADAPTER written only with today's public API (`Valance.define/command/entry/start`, NEXUS `Command.define`).
// It changes no production code. It exists so that the shapes can be compared on the same application and the same runtime semantics.
//   A  current:      commands: { "counter/increment": Valance.entry(increment), "app/reload": Valance.entry(reload) }, start: "app/reload"
//   B  name-keyed:   commands: (can) => ({ increment: can.update((s) => …), reload: can.run(…) }),                    start: "reload"
//   C  token-typed:  const Increment = token<void>("increment");  implement: [Increment.with((s) => …)]               start: Reload
import type { Mesh } from "@valancex/nexus";

import { compileProgram } from "@valancex/mesh-compiler";
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Deferred, Effect, Exit, Layer, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { textTarget } from "./non-dom-target.js";

// ---- prototype -------------------------------------------------------------------------------------------------------------------------------------
type Fields = Record<string, Schema.Schema.All>;
/** What the application can do, named by its property. `I` is the input the caller supplies (`void` when none). */
interface Cap<I = any> { readonly _input?: I | undefined; readonly fields: ReadonlyArray<string>; readonly make: (state: any) => Nexus.Command.Command<any, any, any, any> }
interface Can<S> {
  /** A pure change of state. */
  update(transition: (state: S) => S): Cap<void>;
  update<F extends Fields>(input: Schema.Struct<F>, transition: (input: Schema.Struct.Type<F>, state: S) => S): Cap<Schema.Struct.Type<F>>;
  /** Work that may wait, fail and commit several times. */
  run<E, R extends Valance.Ambient>(body: (state: Nexus.State.StateHandle<S>) => Effect.Effect<void, E, R>): Cap<void>;
  run<F extends Fields, E, R extends Valance.Ambient>(input: Schema.Struct<F>, body: (input: Schema.Struct.Type<F>, state: Nexus.State.StateHandle<S>) => Effect.Effect<void, E, R>): Cap<Schema.Struct.Type<F>>;
}
const canFor = <S>(): Can<S> => ({
  update: ((a: any, b?: any): Cap => {
    const [input, transition] = b === undefined ? [Schema.Struct({}), (_i: unknown, current: unknown) => a(current)] : [a, b];

    return { fields: Object.keys(input.fields), make: (state) => Valance.command<S>(state)(input, transition) };
  }) as never,
  run: ((a: any, b?: any): Cap => {
    const [input, body] = b === undefined ? [Schema.Struct({}), (_i: unknown, state: unknown) => a(state)] : [a, b];

    return { fields: Object.keys(input.fields), make: (state) => Nexus.Command.define("capability", input, (i: unknown) => body(i, state)) };
  }) as never,
});
const manifestOf = (program: Mesh.Program) => (JSON.parse(program.model) as { components: Record<string, { commands: Record<string, { parameters: ReadonlyArray<{ name: string }> }> }> }).components;
const named = (names: ReadonlyArray<string>, values: ReadonlyArray<unknown>) => Object.fromEntries(names.map((name, i) => [name, values[i]]));

type Spec<S> = Cap | ((state: S) => S);
interface AppDefinition<S, V extends string, Caps extends Record<string, Spec<S>>> {
  readonly name: string;
  readonly state: { readonly schema: Schema.Schema<S>; readonly initial: NoInfer<S> };
  readonly views: { readonly [K in V]: Valance.View<S> };
  readonly view: (state: S) => V;
  /** An object of capabilities, or a function of the helpers `can`. A bare `(state) => state` is a pure capability with no input. */
  readonly commands: Caps | ((can: Can<S>) => Caps);
  readonly start?: keyof Caps & string;
}
type Call<Caps> = { readonly [K in keyof Caps]: Caps[K] extends (...args: any) => any ? () => Effect.Effect<unknown, unknown> : Caps[K] extends Cap<infer I> ? ([I] extends [void] ? () => Effect.Effect<unknown, unknown> : (input: I) => Effect.Effect<unknown, unknown>) : never };

/** B: capabilities become today's command table, derived from the property names and each program's own manifest. Returns the definition and a typed `call`. */
const defineB = <S, V extends string, Caps extends Record<string, Spec<S>>>(def: AppDefinition<S, V, Caps>) => {
  const capsOf = (): Record<string, Cap> => Object.fromEntries(Object.entries<Spec<S>>(typeof def.commands === "function" ? def.commands(canFor<S>()) : def.commands).map(([name, spec]) => [name, typeof spec === "function" ? canFor<S>().update(spec) : spec]));
  const caps = capsOf();
  const application = Valance.define({
    name: def.name, state: def.state, views: def.views, view: def.view,
    commands: (state) => {
      const table: Record<string, Nexus.Mesh.Binding<never, never>> = {};

      for (const [name, cap] of Object.entries(capsOf())) {
        const command = cap.make(state);

        table[`app/${name}`] = Valance.entry(command, (...values) => named(cap.fields, values)) as never;                   // `invoke`: positional, in field order
        for (const view of Object.values<Valance.View<S>>(def.views)) {
          for (const [component, { commands }] of Object.entries(manifestOf(view.program))) {
            if (name in commands) { table[`${component}/${name}`] = Valance.entry(command, (...values) => named(commands[name]!.parameters.map((p) => p.name), values)) as never; }
          }
        }
      }

      return table as never;
    },
    ...(def.start === undefined ? {} : { start: `app/${def.start}` }),
  });
  const call = (handle: Valance.ApplicationHandle<any, any>): Call<Caps> => Object.fromEntries(Object.entries(caps).map(([name, cap]) =>
    [name, (input?: Record<string, unknown>) => handle.invoke(`app/${name}`, cap.fields.map((field) => ({ value: input?.[field] })) as never)])) as never;

  return { application, call };
};

// ---- the application, once, in the shapes -----------------------------------------------------------------------------------------------------------
const manifest = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} }, text: { props: {}, events: {}, commands: {}, scope: {} }, button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
  counter: { props: {}, events: {}, commands: { increment: { parameters: [] }, add: { parameters: [{ name: "amount", type: { kind: "number" } }] }, reload: { parameters: [] } }, scope: { label: { kind: "string" }, step: { kind: "number" } } },
} });
const built = await compileProgram({ model: { manifest, path: "components.json" }, root: "counter", components: [{ component: "counter", path: "counter.mprx", source:
  `<page><text>{label}</text><button on.click={increment()}>Increment</button><button on.click={add(step)}>Add</button><button on.click={reload()}>Reload</button></page>` }] });

if (built.program === undefined) { throw new Error(JSON.stringify(built.assembly ?? built.components)); }

const State = Schema.Struct({ count: Schema.Number, phase: Schema.Literal("idle", "loading", "ready", "failed"), note: Schema.String });
type State = typeof State.Type;
const initial = { count: 0, phase: "idle", note: "" } as const;
const label = ({ count, phase, note }: State) => `Count: ${count} (${phase}${note === "" ? "" : `: ${note}`})`;
const views = { counter: { program: built.program, scope: (s: State) => ({ label: label(s), step: 5 }) } };

interface Feed { readonly get: (topic: string) => Effect.Effect<string, { readonly _tag: "Offline" }> }
const Feed = Nexus.Capability.define<Feed>("example/feed");     // the PLATFORM's capability: a service the environment supplies
interface Owner { readonly own: <A, E, R>(acquire: Effect.Effect<A, E, R | Scope.Scope>) => Effect.Effect<A, E, Exclude<R, Scope.Scope>> }
const Owner = Nexus.Capability.define<Owner>("example/owner");

/** B: the application. Every name below is the identity: the same word as `increment()` in the view. */
const b = defineB({
  name: "capability-shape", state: { schema: State, initial }, views, view: () => "counter",
  commands: (can) => {
    let latest = 0;
    const load = (topic: string) => (state: Nexus.State.StateHandle<State>) => Effect.gen(function* () {
      const mine = ++latest;
      const feed = yield* Nexus.Capability.require(Feed);

      yield* state.update((s) => Effect.succeed({ ...s, phase: "loading" as const }));
      const result = yield* feed.get(topic).pipe(Effect.either);

      if (mine !== latest) { return; }
      yield* state.update((s) => Effect.succeed(result._tag === "Right" ? { ...s, phase: "ready" as const, note: result.right } : { ...s, phase: "failed" as const, note: "offline" }));
    });

    return {
      increment: can.update((s) => ({ ...s, count: s.count + 1 })),                                          // no input
      add: can.update(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ ...s, count: s.count + amount })),   // input, named like the view's parameter
      reload: can.run((state) => load("general")(state)),                                                    // the Reload button
      startup: can.run((state) => Effect.flatMap(state.get, (s) => s.phase === "idle" ? load("general")(state) : Effect.void)),   // the guard is ordinary code
      fetch: can.run(Schema.Struct({ topic: Schema.String }), ({ topic }, state) => load(topic)(state)),
      keep: can.run(Schema.Struct({ id: Schema.String }), ({ id }, state) => Effect.gen(function* () {       // a longer-lived thing: owned by the application
        const owner = yield* Nexus.Capability.require(Owner);

        yield* owner.own(Effect.acquireRelease(Effect.sync(() => { log.push(`open ${id}`); }), () => Effect.sync(() => { log.push(`close ${id}`); })));
        yield* state.update((s) => Effect.succeed({ ...s, note: `kept ${id}` }));
      })),
    };
  },
  start: "startup",
});
const log: Array<string> = [];

/** A: the same application, today's shape (only the pieces that differ are written out: the table). */
const a = Valance.define({
  name: "capability-shape-a", state: { schema: State, initial }, views, view: () => "counter",
  commands: (state) => {
    const command = Valance.command(state);
    const increment = command(Schema.Struct({}), (_input, s) => ({ ...s, count: s.count + 1 }));
    const add = command(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ ...s, count: s.count + amount }));

    return { "counter/increment": Valance.entry(increment), "counter/add": Valance.entry(add, (amount) => ({ amount })), "app/add": Valance.entry(add, (amount) => ({ amount })) };
  },
});
void a;

// ---- C: tokens (Effect-inspired): a typed identity object per operation, declared apart from its implementation ----------------------------------------
interface Token<I> { readonly name: string; readonly _input?: I }
const token = <I>(name: string): Token<I> => ({ name });
const implement = <I, S>(t: Token<I>, cap: Cap<I>): readonly [string, Cap<I>] => [t.name, cap];
const Increment = token<void>("increment");
const Add = token<{ readonly amount: number }>("add");

// ---- tests -------------------------------------------------------------------------------------------------------------------------------------
const until = async (done: () => boolean) => { for (let i = 0; !done(); i += 1) { if (i > 400) { throw new Error("timed out"); } await new Promise((r) => setTimeout(r, 5)); } };

const world = () => {
  const calls: Array<{ topic: string; answer: Deferred.Deferred<string, { _tag: "Offline" }>; interrupted: boolean }> = [];
  const feed: Feed = { get: (topic) => Effect.suspend(() => {
    const call = { topic, answer: Effect.runSync(Deferred.make<string, { _tag: "Offline" }>()), interrupted: false };

    calls.push(call);

    return Deferred.await(call.answer).pipe(Effect.onInterrupt(() => Effect.sync(() => { call.interrupted = true; })));
  }) };
  const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.gen(function* () {
    const scope = yield* Scope.make();

    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

    return { resolutions: new Map<string, Nexus.Capability.CapabilityResolution<unknown>>([
      [Feed.id, { _tag: "Available", implementation: feed }],
      [Owner.id, { _tag: "Available", implementation: { own: (acquire) => Scope.extend(acquire, scope) } satisfies Owner }],
    ]) };
  }));

  return { calls, platform, answer: (n: number, v: string) => Effect.runPromise(Deferred.succeed(calls[n]!.answer, v)), refuse: (n: number) => Effect.runPromise(Deferred.fail(calls[n]!.answer, { _tag: "Offline" as const })) };
};
const boot = async () => {
  const w = world();
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(b.application, { platform: w.platform }).pipe(Scope.extend(scope)));
  const factory = textTarget();
  let screen!: ReturnType<typeof factory>;

  await Effect.runPromise(Valance.mount(handle, (report) => (screen = factory(report))).pipe(Scope.extend(scope)));

  return { ...w, handle, call: b.call(handle), scope, screen: () => screen.screen(), click: (l: string) => screen.activate(l), close: () => Effect.runPromise(Scope.close(scope, Exit.void)), state: () => Effect.runPromise(handle.state) };
};

describe("B: the capability-shaped (name-keyed) model on the real runtime", () => {
  it("1+10. several capabilities on one component; an event runs a capability by its name; a sync increment", async () => {
    const x = await boot();

    await until(() => x.calls.length === 1);                       // startup ran `reload` (guarded: idle -> load)
    x.click("Increment"); x.click("Increment");
    await until(() => x.screen().includes("Count: 2"));
    await x.close();
  });

  it("2. a capability with arguments: from an event (the view's parameter is the input field) and from a typed call", async () => {
    const x = await boot();

    x.click("Add");                                                   // add(step) with step = 5 in the view's scope
    await until(() => x.screen().includes("Count: 5"));
    await Effect.runPromise(x.call.add({ amount: 2 }));
    await until(() => x.screen().includes("Count: 7"));
    // @ts-expect-error the typed call knows the input type
    void x.call.add({ amount: "two" });
    // @ts-expect-error and that there is no such capability
    void x.call.nope;
    await x.close();
  });

  it("3+4+5. startup loads; loading, success and failure are state; the Reload button runs a different capability from startup", async () => {
    const x = await boot();

    await until(() => x.calls.length === 1);
    expect(x.screen()).toContain("loading");
    await x.refuse(0);
    await until(() => x.screen().includes("failed: offline"));
    x.click("Reload");
    await until(() => x.calls.length === 2);
    await x.answer(1, "recovered");
    await until(() => x.screen().includes("ready: recovered"));
    await x.close();
  });

  it("6+7. cancellation on close; a stale answer is ignored", async () => {
    const x = await boot();

    await until(() => x.calls.length === 1);
    const first = Effect.runPromise(x.call.fetch({ topic: "life" }));
    const second = Effect.runPromise(x.call.fetch({ topic: "work" }));
    await until(() => x.calls.length === 3);
    await x.answer(2, "newest");
    await until(() => x.screen().includes("ready: newest"));
    await x.answer(1, "older"); await x.answer(0, "oldest");
    await Promise.all([first, second]);
    expect(x.screen()).toContain("ready: newest");
    const third = Effect.runPromise(Effect.exit(x.call.fetch({ topic: "never" })));
    await until(() => x.calls.length === 4);
    await x.close();
    expect(x.calls[3]!.interrupted).toBe(true);
    expect(Exit.isInterrupted(await third)).toBe(true);
  });

  it("8. a longer-lived thing: acquired through the platform's capability, owned by the application, released when it closes", async () => {
    const x = await boot();

    await Effect.runPromise(x.call.keep({ id: "conn" }));
    expect(log).toContain("open conn");
    expect(log).not.toContain("close conn");
    await x.close();
    expect(log).toContain("close conn");
  });

  it("9. an event runs a capability that composes ordinary effects (the shared `load`), and a view command with no capability still fails `start`", async () => {
    const empty = defineB({ name: "x", state: { schema: State, initial }, views, view: () => "counter", commands: (can) => ({ increment: can.update((s) => s) }) });
    const exit = await Effect.runPromise(Effect.scoped(Effect.exit(Valance.start(empty.application))));

    expect(exit._tag === "Failure" && JSON.stringify(exit.cause)).toContain("ConformanceViolation");   // `add` and `reload` have no capability: the existing D ⊆ B check, unchanged
  });
});

describe("C: tokens (an Effect-inspired typed identity)", () => {
  it("a token is typed, but its name must still equal the view's `increment()`: the word is written twice, and nothing here B cannot also type", () => {
    const [name] = implement(Increment, canFor<State>().update((s) => s));
    const [addName] = implement(Add, canFor<State>().update(Schema.Struct({ amount: Schema.Number }), ({ amount }, s) => ({ ...s, count: s.count + amount })));

    expect([name, addName]).toEqual(["increment", "add"]);
    // @ts-expect-error a token for `add` only accepts an add implementation
    implement(Add, canFor<State>().update((s) => s));
  });
});

describe("B, smallest form: a bare function is a pure capability", () => {
  it("the whole counter's behavior is one property; S is inferred from the schema, the state parameter is contextually typed, and a click works", async () => {
    const tiny = JSON.stringify({ version: 1, types: {}, components: {
      page: { props: {}, events: {}, commands: {}, scope: {} }, text: { props: {}, events: {}, commands: {}, scope: {} }, button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
      counter: { props: {}, events: {}, commands: { increment: { parameters: [] } }, scope: { count: { kind: "number" } } },
    } });
    const program = (await compileProgram({ model: { manifest: tiny, path: "c.json" }, root: "counter", components: [{ component: "counter", path: "counter.mprx", source:
      `<page><text>Count: {count}</text><button on.click={increment()}>Add one</button></page>` }] })).program!;
    const Count = Schema.Struct({ count: Schema.Number });
    const counter = defineB({
      name: "counter-smallest", state: { schema: Count, initial: { count: 0 } }, views: { counter: { program, scope: ({ count }) => ({ count }) } }, view: () => "counter",
      commands: { increment: (s) => ({ count: s.count + 1 }) },              // no wrapper, no schema, no entry, no "counter/increment"
    });
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(counter.application).pipe(Scope.extend(scope)));
    const factory = textTarget();
    let screen!: ReturnType<typeof factory>;

    await Effect.runPromise(Valance.mount(handle, (report) => (screen = factory(report))).pipe(Scope.extend(scope)));
    screen.activate("Add one");
    await until(() => screen.screen().includes("Count: 1"));
    await Effect.runPromise(counter.call(handle).increment());                 // the same capability, called by name, typed
    await until(() => screen.screen().includes("Count: 2"));
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
