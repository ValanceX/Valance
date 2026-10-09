// Event entry: an external event reaches the application's binding table without the caller touching the NEXUS runtime.
// A real Valance.start over a real NEXUS application; no MESH render, no target: `invoke` only needs the command table.
import type { Mesh } from "@valancex/nexus";

import * as Nexus from "@valancex/nexus";
import { Cause, Clock, Effect, Exit, Fiber, FiberRef, Layer, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ n: Schema.Number, clock: Schema.Number, seen: Schema.String });
type State = Schema.Schema.Type<typeof State>;

// A complete Clock (sleep included) that reads `n`.
const fixed = (n: number): Clock.Clock => {
  const base = Clock.make();

  return Object.assign(Object.create(Object.getPrototypeOf(base) as object) as Clock.Clock, base, { currentTimeMillis: Effect.succeed(n), unsafeCurrentTimeMillis: () => n });
};

/** A FiberRef the application's commands read and write, to observe which direction FiberRefs flow. */
const probe = FiberRef.unsafeMake("initial");

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
    const readClock = Nexus.Command.define("t.readClock", Schema.Struct({}), () => Effect.flatMap(Clock.currentTimeMillis, (clock) => state.update((current) => Effect.succeed({ ...current, clock }))).pipe(Effect.asVoid));
    const readProbe = Nexus.Command.define("t.readProbe", Schema.Struct({}), () => Effect.flatMap(FiberRef.get(probe), (seen) => state.update((current) => Effect.succeed({ ...current, seen }))).pipe(Effect.asVoid));
    const writeProbe = Nexus.Command.define("t.writeProbe", Schema.Struct({}), () => FiberRef.set(probe, "written by the application"));

    const hangs = Nexus.Command.define("t.hang", Schema.Struct({}), () => Effect.sync(() => { hang.started = true; }).pipe(Effect.zipRight(Effect.never), Effect.onInterrupt(() => Effect.sync(() => { hang.interrupted = true; }))));
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

const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.setClock(fixed(42)));

describe("application event entry", () => {
  it("delivers an event with the caller holding no runtime: invoke, on the default Effect runtime, causes the transition", async () => {
    const state = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(application);

      yield* running.invoke("app/set", [{ value: 7 }]);

      return yield* running.state;
    })));

    expect(state.n).toBe(7);
  });

  it("package surface (Stage 42): `Mounted` is on the entry as the declared result of `mount`/`hydrate`; the diagnostic `DispatchExit` is not (it lives behind ./internal)", () => {
    // @ts-expect-error `DispatchExit` is not exported from the package entry (it is diagnostic, behind ./internal)
    const absent: Valance.DispatchExit<never> | undefined = undefined;

    void absent;
    expectTypeOf<Valance.Mounted<never>["dispatched"]>().not.toBeAny();         // its structure stays readable through `Mounted`
    expect(Object.keys(Valance).sort()).toEqual(["ValanceError", "command", "define", "entry", "hydrate", "isRefusal", "isValanceError", "mount", "start"]);
  });

  it("the handle is the application's face and nothing else: state and invoke, frozen, with no composition or substrate", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(application);

      expect(Object.keys(handle).sort()).toEqual(["invoke", "state"]);
      expect(Object.isFrozen(handle)).toBe(true);
      for (const internal of ["nexus", "values", "dispatch", "render", "states", "runtime", "shutdown", "status"]) {
        expect(internal in handle, internal).toBe(false);
      }
    })));

    expectTypeOf<keyof Valance.ApplicationHandle<State, never>>().toEqualTypeOf<"state" | "invoke">();
  });

  it("state is one read of what commands have committed, not a subscription", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(application);
      const before = yield* handle.state;

      yield* handle.invoke("app/set", [{ value: 3 }]);

      expect(before.n).toBe(0);                                  // a value, as of when it ran
      expect((yield* handle.state).n).toBe(3);
    })));
  });

  it("invalid arguments to a known entry fail as the command's own validation error, and change nothing", async () => {
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(application);
      const exit = yield* Effect.exit(handle.invoke("app/set", [{ value: "not a number" }]));

      return { exit, state: yield* handle.state };
    })));

    expect(Exit.isFailure(result.exit) && Cause.isFailType(result.exit.cause) && result.exit.cause.error).toMatchObject({ _tag: "CommandValidationError" });
    expect(result.state.n).toBe(0);
  });

  it("is typed so that no runtime is needed to run it", () => {
    type Entry = ReturnType<Valance.ApplicationHandle<State, never>["invoke"]>;

    expectTypeOf<Entry>().toEqualTypeOf<Effect.Effect<unknown, Mesh.UnmappedCommand, never>>();
    expectTypeOf<Effect.Effect.Context<Entry>>().toEqualTypeOf<never>();
  });

  it("an unmapped entry is the existing UnmappedCommand failure", async () => {
    const exit = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(application);

      return yield* Effect.exit(running.invoke("nowhere/at-all", []));
    })));

    expect(exit).toEqual(Exit.fail({ _tag: "UnmappedCommand", component: "nowhere", name: "at-all" }));
  });

  it("platform services reach the command, and the command's FiberRef writes never reach the caller (NEXUS I44)", async () => {
    const callerClocks: Array<number> = [];
    const callerProbe: Array<string> = [];
    const observe = Effect.gen(function* () {
      callerClocks.push(yield* Clock.currentTimeMillis);
      callerProbe.push(yield* FiberRef.get(probe));
    });

    const state = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(application, { platform });

      yield* observe;
      yield* running.invoke("app/readClock", []);                // the platform's Clock is the application's
      yield* running.invoke("app/writeProbe", []);               // an application-side FiberRef write
      yield* observe;
      yield* running.invoke("app/readProbe", []);                // ... which a later event does not see either: each event runs in the application's own context

      return yield* running.state;
    })));

    expect(state.clock).toBe(42);
    expect(callerClocks).toHaveLength(2);
    expect(callerClocks.every((t) => t !== 42)).toBe(true);
    expect(callerProbe).toEqual(["initial", "initial"]);
    expect(state.seen).toBe("initial");
  });

  it("the caller's FiberRefs at start flow into the application; later changes in the caller do not reach an event", async () => {
    const state = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      yield* FiberRef.set(probe, "set by the caller before start");
      const running = yield* Valance.start(application);

      yield* FiberRef.set(probe, "set by the caller after start");
      yield* running.invoke("app/readProbe", []);

      return yield* running.state;
    })));

    expect(state.seen).toBe("set by the caller before start");
  });

  it("interrupting the caller interrupts the command; a defect in a command reaches the caller as a defect", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(application);
      const event = yield* Effect.fork(running.invoke("app/hang", []));

      yield* Effect.promise(async () => { for (let i = 0; i < 200 && !hang.started; i += 1) { await new Promise((resolve) => setTimeout(resolve, 5)); } });
      expect(hang).toEqual({ started: true, interrupted: false });
      yield* Fiber.interrupt(event);
      yield* Effect.promise(async () => { for (let i = 0; i < 200 && !hang.interrupted; i += 1) { await new Promise((resolve) => setTimeout(resolve, 5)); } });
      expect(hang.interrupted).toBe(true);

      const exit = yield* Effect.exit(running.invoke("app/dies", []));

      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
    })));
  });
});
