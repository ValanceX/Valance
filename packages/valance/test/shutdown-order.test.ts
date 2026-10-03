// Shutdown with several admitted commands (C20 to C23, C33), through the public handle and the caller's Scope. Controlled gates; one timeline of body starts,
// interruptions, commits and "close resolved". What is contractual is the BOUNDARY: every commit precedes the close's resolution and the state is exactly the commits
// that happened. What these tests record without promising: the drain interrupts admitted commands one at a time, in admission order, awaiting each one's real exit,
// so an uninterruptible command delays the interruption of commands admitted after it; commits then follow each command's own progress (release order).
import * as Nexus from "@valancex/nexus";
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";
import * as Valance from "../src/index.js";

const State = Schema.Struct({ commits: Schema.Array(Schema.String) });
type State = Schema.Schema.Type<typeof State>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "success" : Cause.isDieType(exit.cause) ? `defect: ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";

type Mode = "i" | "u";
const rig = async (modes: Record<string, Mode>) => {
  const timeline: Array<string> = [];
  const gates = Object.fromEntries(Object.keys(modes).map((name) => [name, Effect.runSync(Deferred.make<void>())]));
  const app = Valance.define({
    name: "shutdown", state: { schema: State, initial: { commits: [] } },
    views: { main: { program: { root: "main", templates: [], model: "{}" }, scope: () => ({}) } }, view: () => "main" as const,
    commands: (state: Nexus.State.StateHandle<State>) => Object.fromEntries(Object.entries(modes).map(([name, mode]) => {
      const wait = Deferred.await(gates[name]!).pipe(Effect.onInterrupt(() => Effect.sync(() => { timeline.push(`${name} interrupted`); })));
      const body = Effect.gen(function* () {
        timeline.push(`${name} started`);
        yield* wait;
        yield* state.update((c): Effect.Effect<State> => Effect.succeed({ commits: [...c.commits, name] }));
        timeline.push(`${name} commit`);
      });
      return [`app/${name}`, Nexus.Mesh.bind(Nexus.Command.define(`t.${name}`, Schema.Struct({}), () => Effect.asVoid(mode === "u" ? Effect.uninterruptible(body) : body)), () => ({}))];
    })) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
  });
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
  const callers: Record<string, Fiber.RuntimeFiber<Exit.Exit<unknown, unknown>>> = {};
  const exits: Record<string, string> = {};
  const admit = async (name: string) => { callers[name] = Effect.runFork(Effect.exit(handle.invoke(`app/${name}`, []))); while (!timeline.includes(`${name} started`)) { await sleep(1); } };
  let closed = false;
  const close = () => { const p = Effect.runPromise(Scope.close(scope, Exit.void)).then(() => { closed = true; timeline.push("close resolved"); }); return p; };
  const release = (name: string) => { Effect.runSync(Deferred.succeed(gates[name]!, undefined)); };
  const collect = async () => { for (const [name, fiber] of Object.entries(callers)) { exits[name] = show(await Effect.runPromise(Fiber.join(fiber))); } };
  return { timeline, handle, admit, close, release, collect, exits, isClosed: () => closed, state: () => Effect.runPromise(handle.state) };
};

const commitsOf = (timeline: ReadonlyArray<string>): Array<string> => timeline.filter((entry) => entry.endsWith(" commit")).map((entry) => entry[0]!);
const closeIsLast = (timeline: ReadonlyArray<string>): boolean => timeline.at(-1) === "close resolved" && timeline.filter((entry) => entry === "close resolved").length === 1;

describe("shutdown with several admitted commands", () => {
  it("A interruptible, B uninterruptible (A admitted first): A is interrupted at once, the close waits for B, B commits before the close resolves, both callers see Interrupted", async () => {
    const r = await rig({ A: "i", B: "u" });

    await r.admit("A");
    await r.admit("B");
    const closing = r.close();

    await sleep(60);
    expect(r.timeline).toEqual(["A started", "B started", "A interrupted"]);              // admission order = start order; A interrupted first
    expect(r.isClosed()).toBe(false);                                                     // the close waits for B
    r.release("B");
    await closing;
    await r.collect();
    expect(r.timeline).toEqual(["A started", "B started", "A interrupted", "B commit", "close resolved"]);
    expect(r.exits).toEqual({ A: "interrupted", B: "interrupted" });                      // B's caller: Interrupted although B committed
    expect(await r.state()).toEqual({ commits: ["B"] });                                  // the state is the record
  });

  it("A uninterruptible, B interruptible (A admitted first): B is NOT interrupted while A holds the drain (it can still commit, and its caller sees success); if it does not finish it is interrupted after A's exit", async () => {
    const released = await rig({ A: "u", B: "i" });

    await released.admit("A");
    await released.admit("B");
    const closing = released.close();

    await sleep(60);
    expect(released.timeline).toEqual(["A started", "B started"]);                        // B has not been interrupted: the drain is still waiting on A
    released.release("B");
    await sleep(40);
    expect(released.timeline).toEqual(["A started", "B started", "B commit"]);            // B committed DURING the drain, before the close resolved
    expect(released.isClosed()).toBe(false);
    released.release("A");
    await closing;
    await released.collect();
    expect(released.timeline).toEqual(["A started", "B started", "B commit", "A commit", "close resolved"]);
    expect(released.exits).toEqual({ A: "interrupted", B: "success" });
    expect(await released.state()).toEqual({ commits: ["B", "A"] });

    const held = await rig({ A: "u", B: "i" });

    await held.admit("A");
    await held.admit("B");
    const closing2 = held.close();

    await sleep(60);
    held.release("A");
    await closing2;
    await held.collect();
    expect(held.timeline).toEqual(["A started", "B started", "A commit", "B interrupted", "close resolved"]);   // B is interrupted only after A's actual exit
    expect(held.exits).toEqual({ A: "interrupted", B: "interrupted" });
    expect(await held.state()).toEqual({ commits: ["A"] });
  });

  it("two uninterruptible commands: commits follow their own progress (release order), whichever was admitted first; the close resolves after both; each caller's outcome depends on whether the drain reached it first", async () => {
    for (const order of [["A", "B"], ["B", "A"]] as const) {
      const r = await rig({ A: "u", B: "u" });

      await r.admit("A");
      await r.admit("B");
      const closing = r.close();

      await sleep(60);
      r.release(order[0]);
      await sleep(30);
      r.release(order[1]);
      await closing;
      await r.collect();
      expect(commitsOf(r.timeline)).toEqual([...order]);                                   // release order, not admission order
      expect(closeIsLast(r.timeline)).toBe(true);
      expect(await r.state()).toEqual({ commits: [...order] });
      // admitted A first: the drain interrupts A, awaits it, then reaches B: B finished before that (success) only if it was released first.
      expect(r.exits).toEqual(order[0] === "A" ? { A: "interrupted", B: "interrupted" } : { A: "interrupted", B: "success" });
    }
  });

  it("admission is decided when the Effect RUNS, not when invoke() is called: every call that runs once the drain began is refused by admission, whoever built it and whichever command, and none commits", async () => {
    const r = await rig({ A: "u", B: "i" });

    await r.admit("A");
    const built = r.handle.invoke("app/B", []);                                            // built before the close
    const closing = r.close();

    await sleep(30);
    const refusals = [
      show(await Effect.runPromise(Effect.exit(built))),
      show(await Effect.runPromise(Effect.exit(r.handle.invoke("app/B", [])))),
      show(await Effect.runPromise(Effect.exit(r.handle.invoke("app/A", [])))),
    ];

    expect(refusals).toEqual(Array(3).fill("defect: VALANCE: admission is closed (draining)"));
    r.release("A");
    await closing;
    expect(show(await Effect.runPromise(Effect.exit(r.handle.invoke("app/B", []))))).toBe("defect: NEXUS: the runtime has begun terminating");   // after the close: the other refusal
    expect(r.timeline).toEqual(["A started", "A commit", "close resolved"]);              // nothing but A ever ran; nothing committed after the close
    expect(await r.state()).toEqual({ commits: ["A"] });
  });
});
