// Event entry: an external event reaches the application's binding table without the caller touching the NEXUS runtime.
// A real Valance.start over a real NEXUS application; no MESH render, no target: `invoke` only needs the command table.
import type { Mesh } from "@valancex/nexus";

import * as Nexus from "@valancex/nexus";
import { Cause, Clock, Context, Effect, Exit, Fiber, Layer, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ n: Schema.Number, clock: Schema.Number, seen: Schema.String });
type State = Schema.Schema.Type<typeof State>;

// A complete Clock (sleep included) that reads `n`.
const fixed = (n: number): Clock.Clock => {
  const live = Clock.Clock.defaultValue();

  return {
    currentTimeMillis: Effect.succeed(n),
    currentTimeMillisUnsafe: () => n,
    currentTimeNanos: live.currentTimeNanos,
    currentTimeNanosUnsafe: () => live.currentTimeNanosUnsafe(),
    monotonicTimeNanos: live.monotonicTimeNanos,
    monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
    sleep: (duration) => live.sleep(duration),
  };
};

/** A Context reference the application's commands read and write, to observe which direction such values flow (Effect 3's FiberRef). */
const probe = Context.Reference("entry/probe", { defaultValue: () => "initial" });

// What a FiberRef write was in Effect 3: a change to the Context of the fiber that runs it, which every later step of that fiber sees.
const writeIntoFiber = <S>(reference: Context.Reference<S>, value: S): Effect.Effect<void> =>
  Effect.withFiber((fiber) =>
    Effect.sync(() => {
      fiber.setContext(Context.add(fiber.context, reference, value));
    }),
  );

const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

/** Set by the `t.hang` command's finalizer: whether an interrupted caller interrupted the command. */
const hang = { started: false, interrupted: false };

const application = Valance.define({
  name: "entry",
  state: { schema: State, initial: { n: 0, clock: 0, seen: "" } },
  // Never rendered here: a view exists because an application has one.
  views: { main: { program: eventFreeProgram, scope: () => ({}) } },
  view: () => "main" as const,
  commands: (state) => {
    const set = Nexus.Command.define("t.set", Schema.Struct({ n: Schema.Number }), ({ n }) => state.update((current) => Effect.succeed({ ...current, n })).pipe(Effect.asVoid));
    const readClock = Nexus.Command.define("t.readClock", Schema.Struct({}), () =>
      Effect.flatMap(Clock.currentTimeMillis, (clock) => state.update((current) => Effect.succeed({ ...current, clock }))).pipe(Effect.asVoid),
    );
    const readProbe = Nexus.Command.define("t.readProbe", Schema.Struct({}), () =>
      Effect.flatMap(Effect.service(probe), (seen) => state.update((current) => Effect.succeed({ ...current, seen }))).pipe(Effect.asVoid),
    );
    const writeProbe = Nexus.Command.define("t.writeProbe", Schema.Struct({}), () => writeIntoFiber(probe, "written by the application"));

    const hangs = Nexus.Command.define("t.hang", Schema.Struct({}), () =>
      Effect.sync(() => {
        hang.started = true;
      }).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            hang.interrupted = true;
          }),
        ),
      ),
    );
    const dies = Nexus.Command.define("t.dies", Schema.Struct({}), () => Effect.die(new Error("a defect in a command")));

    return {
      "app/hang": Nexus.Mesh.bind(hangs, () => ({})),
      "app/dies": Nexus.Mesh.bind(dies, () => ({})),
      "app/set": Nexus.Mesh.bind(set, (args) => ({ n: firstValue(args) })),
      "app/readClock": Nexus.Mesh.bind(readClock, () => ({})),
      "app/readProbe": Nexus.Mesh.bind(readProbe, () => ({})),
      "app/writeProbe": Nexus.Mesh.bind(writeProbe, () => ({})),
    };
  },
});

const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.succeed(Clock.Clock, fixed(42)));

describe("application event entry", () => {
  it("delivers an event with the caller holding no runtime: invoke, on the default Effect runtime, causes the transition", async () => {
    const state = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const running = yield* Valance.start(application);

          yield* running.invoke("app/set", [{ value: 7 }]);

          return yield* running.state;
        }),
      ),
    );

    expect(state.n).toBe(7);
  });

  it("package surface (Stage 42): `Mounted` is on the entry as the declared result of `mount`/`hydrate`; the diagnostic `DispatchExit` is not (it lives behind ./internal)", () => {
    // @ts-expect-error `DispatchExit` is not exported from the package entry (it is diagnostic, behind ./internal)
    const absent: Valance.DispatchExit<never> | undefined = undefined;

    void absent;
    expectTypeOf<Valance.Mounted<never>["dispatched"]>().not.toBeAny(); // its structure stays readable through `Mounted`
    expect(Object.keys(Valance).sort()).toEqual([
      "UNIT",
      "ValanceError",
      "admit",
      "command",
      "define",
      "entry",
      "hydrate",
      "isRefusal",
      "isUnit",
      "isValanceError",
      "mount",
      "redactedFields",
      "start",
    ]);
  });

  it("the handle is the application's face and nothing else: state, invoke and command, frozen, with no composition or substrate", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* Valance.start(application);

          expect(Object.keys(handle).sort()).toEqual(["command", "invoke", "state"]);
          expect(Object.isFrozen(handle)).toBe(true);
          for (const internal of ["nexus", "values", "dispatch", "render", "states", "runtime", "shutdown", "status"]) {
            expect(internal in handle, internal).toBe(false);
          }
        }),
      ),
    );

    expectTypeOf<keyof Valance.ApplicationHandle<State, never>>().toEqualTypeOf<"state" | "invoke" | "command">();
  });

  it("state is one read of what commands have committed, not a subscription", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* Valance.start(application);
          const before = yield* handle.state;

          yield* handle.invoke("app/set", [{ value: 3 }]);

          expect(before.n).toBe(0); // a value, as of when it ran
          expect((yield* handle.state).n).toBe(3);
        }),
      ),
    );
  });

  it("invalid arguments to a known entry fail as the command's own validation error, and change nothing", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* Valance.start(application);
          const exit = yield* Effect.exit(handle.invoke("app/set", [{ value: "not a number" }]));

          return { exit, state: yield* handle.state };
        }),
      ),
    );

    expect(Exit.isFailure(result.exit) && Cause.hasFails(result.exit.cause) && Cause.squash(result.exit.cause)).toMatchObject({ _tag: "CommandValidationError" });
    expect(result.state.n).toBe(0);
  });

  it("is typed so that no runtime is needed to run it", () => {
    type Entry = ReturnType<Valance.ApplicationHandle<State, never>["invoke"]>;

    expectTypeOf<Entry>().toEqualTypeOf<Effect.Effect<unknown, Mesh.UnmappedCommand, never>>();
    expectTypeOf<Effect.Services<Entry>>().toEqualTypeOf<never>();
  });

  it("an unmapped entry is the existing UnmappedCommand failure", async () => {
    const exit = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const running = yield* Valance.start(application);

          return yield* Effect.exit(running.invoke("nowhere/at-all", []));
        }),
      ),
    );

    expect(exit).toEqual(Exit.fail({ _tag: "UnmappedCommand", component: "nowhere", name: "at-all" }));
  });

  it("platform services reach the command, and the command's Context reference writes never reach the caller (NEXUS I44)", async () => {
    const callerClocks: Array<number> = [];
    const callerProbe: Array<string> = [];
    const observe = Effect.gen(function* () {
      callerClocks.push(yield* Clock.currentTimeMillis);
      callerProbe.push(yield* Effect.service(probe));
    });

    const state = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const running = yield* Valance.start(application, { platform });

          yield* observe;
          yield* running.invoke("app/readClock", []); // the platform's Clock is the application's
          yield* running.invoke("app/writeProbe", []); // an application-side Context reference write
          yield* observe;
          yield* running.invoke("app/readProbe", []); // ... which a later event does not see either: each event runs in the application's own context

          return yield* running.state;
        }),
      ),
    );

    expect(state.clock).toBe(42);
    expect(callerClocks).toHaveLength(2);
    expect(callerClocks.every((t) => t !== 42)).toBe(true);
    expect(callerProbe).toEqual(["initial", "initial"]);
    expect(state.seen).toBe("initial");
  });

  it("the caller's Context references at start flow into the application; later changes in the caller do not reach an event", async () => {
    const state = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* writeIntoFiber(probe, "set by the caller before start");
          const running = yield* Valance.start(application);

          yield* writeIntoFiber(probe, "set by the caller after start");
          yield* running.invoke("app/readProbe", []);

          return yield* running.state;
        }),
      ),
    );

    expect(state.seen).toBe("set by the caller before start");
  });

  it("interrupting the caller interrupts the command; a defect in a command reaches the caller as a defect", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const running = yield* Valance.start(application);
          const event = yield* Effect.forkChild(running.invoke("app/hang", []));

          yield* Effect.promise(async () => {
            for (let i = 0; i < 200 && !hang.started; i += 1) {
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
          });
          expect(hang).toEqual({ started: true, interrupted: false });
          yield* Fiber.interrupt(event);
          yield* Effect.promise(async () => {
            for (let i = 0; i < 200 && !hang.interrupted; i += 1) {
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
          });
          expect(hang.interrupted).toBe(true);

          const exit = yield* Effect.exit(running.invoke("app/dies", []));

          expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
        }),
      ),
    );
  });
});
