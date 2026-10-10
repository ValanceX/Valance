// Stage 33: failure at the EVENT boundary. Every command here is triggered by a real click on the rendered page: PORT reports the
// event, `connect` dispatches it through MESH (`running.dispatch` -> `inApplication` -> the command), and nothing awaits it from
// application code. The only places its exit can go are the ones the existing model has: `Mounted.dispatched`, the trace, and state.
// One MESH command intent (`home/open(id)`) is bound to every behavior under test, selected by the id of the row that was clicked.
import type { HydrationResult } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const ids = ["success", "typed", "defect", "asyncTyped", "asyncDefect", "partial", "caught", "slowA", "slowB"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const programs = await compilePrograms();

const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded"
  : Cause.isFailType(exit.cause) ? `failed ${JSON.stringify(exit.cause.error)}` : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}`
  : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : `other: ${exit.cause._tag}`;
const yields = (n: number) => Effect.runPromise(Effect.forEach(Array.from({ length: n }, (_, index) => index), () => Effect.yieldNow(), { discard: true }));
const firstValue = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => { const first = args[0]; return first !== undefined && "value" in first ? first.value : undefined; };
const at = (events: ReadonlyArray<string>, event: string) => events.indexOf(event);

const boot = async () => {
  const events: Array<string> = [];
  const gates = new Map<string, { readonly gate: Deferred.Deferred<string, string>; readonly started: Deferred.Deferred<void> }>();
  const gateOf = (name: string) => {
    let entry = gates.get(name);

    if (entry === undefined) {
      entry = { gate: Effect.runSync(Deferred.make<string, string>()), started: Effect.runSync(Deferred.make<void>()) };
      gates.set(name, entry);
    }

    return entry;
  };
  const initial: State = { items: ids.map((id) => ({ id, name: id })), value: "init" };

  const app = Valance.define({
    name: "async-event",
    state: { schema: State, initial },
    views: { home: { program: programs.home, scope: (state: State) => ({ title: "Events", count: state.items.length, summary: state.value, firstId: state.items[0]?.id ?? "", items: state.items.map(({ id, name }) => ({ id, name })) }) } },
    view: () => "home" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const commit = (value: string) => Effect.gen(function* () {
        yield* state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value }));
        events.push(`commit ${value}`);
      });
      /** Suspend on this id's gate; the test releases a value or fails it. */
      const wait = (name: string): Effect.Effect<string, string> => Effect.gen(function* () {
        const { gate, started } = gateOf(name);

        events.push(`${name} started`);
        yield* Deferred.succeed(started, undefined);

        return yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { events.push(`${name} gate wait interrupted`); })));
      });
      const behavior = (id: string): Effect.Effect<void, string> => {
        switch (id) {
          case "success": return commit("success");
          case "typed": return Effect.fail("typed-boom");
          case "defect": return Effect.die(new Error("defect-boom"));
          case "asyncTyped": return Effect.flatMap(wait("asyncTyped"), commit);                          // the gate is failed by the test: an uncaught typed failure
          case "asyncDefect": return Effect.flatMap(wait("asyncDefect"), () => Effect.die(new Error("async-defect-boom")));
          case "partial": return Effect.gen(function* () { yield* commit("A"); yield* commit(`B:${yield* wait("partial")}`); });
          case "caught": return Effect.catchAll(Effect.fail("caught-boom") as Effect.Effect<void, string>, (error) => commit(`error: ${error}`));   // failure as ordinary state
          case "slowA": return Effect.flatMap(wait("slowA"), (v) => commit(`A:${v}`));
          case "slowB": return Effect.flatMap(wait("slowB"), (v) => commit(`B:${v}`));
          default: return Effect.die(new Error(`no behavior for ${id}`));
        }
      };
      const open = Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), ({ id }) =>
        behavior(id).pipe(Effect.onExit((exit) => Effect.sync(() => { events.push(`open(${id}) exit: ${show(exit)}`); }))));
      const reverse = Nexus.Command.define("t.reverse", Schema.Struct({}), () => Effect.gen(function* () {
        yield* state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, items: [...current.items].reverse(), value: "reversed" }));
        events.push("commit reversed");
      }));

      return {
        "home/open": Nexus.Mesh.bind(open, (args) => ({ id: firstValue(args) })),
        "home/reverse": Nexus.Mesh.bind(reverse, () => ({})),
      } as unknown as Record<string, Nexus.Mesh.Binding<string, never>>;
    },
  });

  const page = load("");
  const label = () => (page.container.querySelector("span")?.textContent ?? "").replace(/^\d+ items: /, "");
  const target: Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> = (report) => {
    const port = Web.target({ container: page.container, primitives })(report);

    return {
      draw: (tree) => { port.draw(tree); events.push(`render draw: ${label()}`); },
      update: (tree) => { port.update(tree); events.push(`render update: ${label()}`); },
      hydrate: (tree) => port.hydrate(tree),
      unmount: () => { port.unmount(); events.push("render unmounted"); },
    };
  };
  const scope = await Effect.runPromise(Scope.make());

  await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { events.push("platform resource released"); })));
  const handle = await Effect.runPromise(Valance.start(app as never, { state: initial }).pipe(Scope.extend(scope))) as Valance.ApplicationHandle<State, string>;

  Effect.runFork(Stream.runForEach(runningOf(handle as never).states as Stream.Stream<State>, (state) => Effect.sync(() => { events.push(`values: ${state.value}`); })).pipe(Effect.onExit(() => Effect.sync(() => { events.push("values ended"); }))));
  const mount = await Effect.runPromise(Valance.mount(handle as never, target).pipe(Scope.extend(scope))) as Valance.Mounted<string>;

  await until(() => events.includes("render draw: init"));
  const rowButton = (id: string) => page.container.querySelectorAll("div")[ids.indexOf(id as never)]!.querySelector("button")!;

  return {
    events, label, page, mount,
    /** A real click on the row's "Open" button: PORT reports, MESH dispatches. */
    click: (id: string) => page.click(rowButton(id)),
    clickReverse: () => page.click([...page.container.querySelectorAll("button")].find((button) => button.textContent === "Reverse")!),
    settled: () => Effect.runPromise(mount.settled),
    closeScope: () => Effect.runFork(Scope.close(scope, Exit.void).pipe(Effect.tap(() => Effect.sync(() => { events.push("scope closed"); })))),
    started: (name: string) => Effect.runPromise(Deferred.await(gateOf(name).started)),
    release: (name: string, value: string) => Effect.runPromise(Deferred.succeed(gateOf(name).gate, value)),
    fail: (name: string, error: string) => Effect.runPromise(Deferred.fail(gateOf(name).gate, error)),
    seen: (event: string) => until(() => events.includes(event)),
    state: async () => Effect.runPromise(handle.state),
    dispatched: () => mount.dispatched.map((exit) => show(exit)),
    values: () => events.filter((event) => event.startsWith("values:")),
    renders: () => events.filter((event) => event.startsWith("render")),
    names: () => [...page.container.querySelectorAll("div span")].map((span) => span.textContent),
  };
};
type Booted = Awaited<ReturnType<typeof boot>>;

/** After a failed command: the application is still the same application: one more event works end to end. */
const stillUsable = async (b: Booted) => {
  const before = b.mount.dispatched.length;

  b.clickReverse();
  await b.seen("render update: reversed");
  await b.settled();
  expect(show(b.mount.dispatched[before]!)).toBe("succeeded");
  expect((await b.state()).value).toBe("reversed");
};

describe("A: the success baseline, through a real click", () => {
  it("click -> PORT report -> MESH dispatch -> command -> state -> values -> render; the exit lands in Mounted.dispatched", async () => {
    const b = await boot();

    b.click("success");
    await b.seen("render update: success");
    await b.settled();

    expect(b.events.filter((event) => !event.startsWith("render draw"))).toEqual(["values: init", "commit success", "open(success) exit: succeeded", "values: success", "render update: success"]);
    expect(b.dispatched()).toEqual(["succeeded"]);
    const exit = b.mount.dispatched[0]!;

    expect(Exit.isSuccess(exit) && exit.value.intent).toEqual({ command: { component: "home", name: "open" }, arguments: [{ value: "success" }] });   // the real MESH intent
  });
});

describe("B, C: synchronous failure and defect", () => {
  it("B typed failure: the command fails; the dispatch exit records it; state, values and render are untouched; the application is usable", async () => {
    const b = await boot();

    b.click("typed");
    await b.settled();

    expect(b.dispatched()).toEqual(['failed "typed-boom"']);                      // the failure lands in Mounted.dispatched, as the typed error
    expect(b.events).toContain('open(typed) exit: failed "typed-boom"');
    expect((await b.state()).value).toBe("init");
    expect(b.values()).toEqual(["values: init"]);
    expect(b.renders()).toEqual(["render draw: init"]);
    await stillUsable(b);
  });

  it("C defect: recorded in Mounted.dispatched as a defect (not typed); nothing else changes; the application is usable", async () => {
    const b = await boot();

    b.click("defect");
    await b.settled();

    expect(b.dispatched()).toEqual(["died: defect-boom"]);
    expect((await b.state()).value).toBe("init");
    expect(b.values()).toEqual(["values: init"]);
    expect(b.renders()).toEqual(["render draw: init"]);
    await stillUsable(b);
  });
});

describe("D, E, G, H: asynchronous failure at the event boundary", () => {
  it("D async typed failure: the command is alive until the gate fails; then the exit is the typed failure; nothing committed; usable", async () => {
    const b = await boot();

    b.click("asyncTyped");
    await b.started("asyncTyped");
    expect(b.mount.dispatched.length).toBe(0);                                    // nothing observes it yet: it is simply running
    await b.fail("asyncTyped", "async-boom");
    await b.settled();

    expect(b.dispatched()).toEqual(['failed "async-boom"']);
    expect(b.values()).toEqual(["values: init"]);
    expect(b.renders()).toEqual(["render draw: init"]);
    await stillUsable(b);
  });

  it("E async defect: the exit is the defect; nothing committed; usable", async () => {
    const b = await boot();

    b.click("asyncDefect");
    await b.started("asyncDefect");
    await b.release("asyncDefect", "x");
    await b.settled();

    expect(b.dispatched()).toEqual(["died: async-defect-boom"]);
    expect(b.values()).toEqual(["values: init"]);
    await stillUsable(b);
  });

  it("G partial commit then failure: the earlier commit stays, is emitted and rendered; the failure is only in the exit; no rollback", async () => {
    const b = await boot();

    b.click("partial");
    await b.seen("render update: A");                                             // A committed before the await
    await b.started("partial");
    await b.fail("partial", "late-boom");
    await b.settled();

    expect(b.dispatched()).toEqual(['failed "late-boom"']);
    expect((await b.state()).value).toBe("A");
    expect(b.values()).toEqual(["values: init", "values: A"]);
    expect(b.renders()).toEqual(["render draw: init", "render update: A"]);
    expect(b.events.some((event) => event.startsWith("commit B"))).toBe(false);
    await stillUsable(b);
  });

  it("H caught inside the command: failure becomes ordinary state; the dispatch SUCCEEDS; the render shows it; the framework saw no error", async () => {
    const b = await boot();

    b.click("caught");
    await b.seen("render update: error: caught-boom");
    await b.settled();

    expect(b.dispatched()).toEqual(["succeeded"]);
    expect(b.values()).toEqual(["values: init", "values: error: caught-boom"]);
    expect(b.label()).toBe("error: caught-boom");                                 // visible in the mounted UI with no framework concept
    await stillUsable(b);
  });
});

describe("I, J: events after a failure, and concurrent event commands", () => {
  it("I sync failure then success: the failure poisons neither the dispatch path, the binding nor admission (same binding, same intent)", async () => {
    const b = await boot();

    b.click("typed");
    await b.settled();
    b.click("success");
    await b.seen("render update: success");
    await b.settled();
    b.click("typed");                                                             // and the failing binding can fail again
    await b.settled();

    expect(b.dispatched()).toEqual(['failed "typed-boom"', "succeeded", 'failed "typed-boom"']);
  });

  it("I async failure, then a success while it is still suspended, then the failure resolves: independent dispatches", async () => {
    const b = await boot();

    b.click("asyncTyped");
    await b.started("asyncTyped");
    b.click("success");                                                           // another event while the first is suspended
    await b.seen("render update: success");
    expect(b.mount.dispatched.length).toBe(1);                                    // only the success has an exit so far
    await b.fail("asyncTyped", "later-boom");
    await b.settled();

    expect(b.dispatched()).toEqual(["succeeded", 'failed "later-boom"']);        // exits are recorded in settle order
    expect((await b.state()).value).toBe("success");
  });

  for (const [order, failing, passing] of [["A fails, B succeeds", "slowA", "slowB"], ["B fails, A succeeds", "slowB", "slowA"]] as const) {
    it(`J two suspended event commands, ${order}: the MESH path runs them concurrently with independent failure scopes`, async () => {
      const b = await boot();

      b.click("slowA");
      b.click("slowB");
      await b.started("slowA");
      await b.started("slowB");                                                   // both in flight at once: the event path does not serialize
      await b.fail(failing, "boom");
      await until(() => b.mount.dispatched.length === 1);
      expect(b.events).not.toContain(`${passing} gate wait interrupted`);          // the sibling is untouched
      await b.release(passing, "ok");
      await b.seen(`render update: ${passing === "slowA" ? "A" : "B"}:ok`);
      await b.settled();

      expect(b.dispatched()).toEqual(['failed "boom"', "succeeded"]);
      expect(b.values()).toEqual(["values: init", `values: ${passing === "slowA" ? "A" : "B"}:ok`]);
    });
  }
});

describe("F, K: drain through the event boundary", () => {
  it("F a suspended event command is interrupted at drain (by the application's registry) and exits before the resource releases; no commit, value or render; the interrupted exit IS recorded", async () => {
    const b = await boot();

    b.click("slowA");
    await b.started("slowA");
    await Effect.runPromise(Fiber.join(b.closeScope()));
    await b.release("slowA", "late");
    await yields(300);

    expect(b.events).toContain("slowA gate wait interrupted");
    expect(at(b.events, "open(slowA) exit: interrupted")).toBeLessThan(at(b.events, "platform resource released"));
    expect(b.events.some((event) => event.startsWith("commit"))).toBe(false);
    expect(b.values()).toEqual(["values: init"]);
    expect(b.renders().filter((event) => event.startsWith("render update"))).toEqual([]);
    expect(b.mount.dispatched.map(show)).toEqual(["interrupted"]);   // the registry interrupts it (Stage 39: the mount does not); the dispatch fiber records the interrupted exit
  });

  it("F after the drain, the old button can no longer report anything: the target was unmounted before the drain began, so no event reaches admission", async () => {
    const b = await boot();
    const button = b.page.container.querySelectorAll("div")[0]!.querySelector("button")!;

    await Effect.runPromise(Fiber.join(b.closeScope()));
    b.page.click(button);                                                         // a held reference to a once-rendered button
    await yields(300);

    expect(b.mount.dispatched.length).toBe(0);
    expect(b.events.some((event) => event.startsWith("open("))).toBe(false);
  });

  it("K the gate opens in the same turn as the close begins (25 repeats): one deterministic outcome through the event boundary", async () => {
    const outcomes = new Set<string>();

    for (let run = 0; run < 25; run += 1) {
      const b = await boot();

      b.click("slowA");
      await b.started("slowA");
      const released = b.release("slowA", "race");
      const closing = b.closeScope();

      await released;
      await Effect.runPromise(Fiber.join(closing));
      const e = b.events;
      const exit = e.find((event) => event.startsWith("open(slowA) exit"))!;

      outcomes.add(`${exit}; committed: ${e.includes("commit A:race")}; exit before release: ${at(e, exit) < at(e, "platform resource released")}; dispatch exits recorded: ${b.mount.dispatched.length}; rendered: ${e.includes("render update: A:race")}`);
    }

    console.log("K race outcomes", JSON.stringify([...outcomes]));
    expect(outcomes.size).toBe(1);
    expect([...outcomes][0]).toContain("exit before release: true");
  });
});
