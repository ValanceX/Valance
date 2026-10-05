// `command(state).waiting`: a command that waits. Every semantic the V1 async gate required, against the real runtime: failure kept as received, latest-wins per command, `wanted`
// (relevance to the state) as a separate, REQUIRED question, what a superseded run does and what its caller sees, interruption versus success, application close, start-time
// work, server rendering, and the cases where the author's own functions misbehave.
import { Cause, Effect, Exit, Fiber, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { renderToHtml } from "../src/web-server.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ page: Schema.String, query: Schema.String, status: Schema.Literal("idle", "loading", "done", "failed"), result: Schema.String });
type State = typeof State.Type;
const initial: State = { page: "a", query: "", status: "idle", result: "" };

type Call = { readonly query: string; readonly resolve: (value: string) => void; readonly reject: (reason: unknown) => void; aborted: boolean };

const service = () => {
  const calls: Array<Call> = [];
  const work = (query: string, signal: AbortSignal) => new Promise<string>((resolve, reject) => {
    const call: Call = { query, resolve, reject, aborted: false };

    signal.addEventListener("abort", () => { call.aborted = true; });
    calls.push(call);
  });

  return { calls, work };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

/** The failure the settled state remembers: kept by reference, so the test can say it was not stringified. */
const failures: Array<unknown> = [];

const app = (work: (query: string, signal: AbortSignal) => Promise<string>, options: { readonly start?: boolean; readonly settleThrows?: boolean } = {}) => Valance.define({
  name: "waiting",
  state: { schema: State, initial: options.start === true ? { ...initial, query: "boot", status: "loading" } : initial },
  views: { only: { program: eventFreeProgram, scope: () => ({}) } },
  view: () => "only" as const,
  commands: (state: Valance.StateHandle<State>) => {
    const command = Valance.command(state);

    return {
      search: command.waiting(Schema.Struct({ query: Schema.String }), {
        begin: ({ query }, current) => ({ ...current, query, status: "loading", result: "" }),
        work: ({ query }, signal) => work(query, signal),
        wanted: ({ query }, current) => current.query === query && current.status === "loading",
        settle: (outcome, _input, current) => {
          if (options.settleThrows === true) { throw new Error("settle threw"); }

          if (!outcome.ok) { failures.push(outcome.error); }

          return outcome.ok ? { ...current, status: "done", result: outcome.value } : { ...current, status: "failed", result: "failed" };
        },
      }),
      // start-time work: the state already says loading, so there is no `begin`
      load: command.waiting(Schema.Struct({}), {
        work: () => work("boot", new AbortController().signal),
        wanted: (_input, current) => current.query === "boot" && current.status === "loading",
        settle: (outcome, _input, current) => outcome.ok ? { ...current, status: "done", result: outcome.value } : { ...current, status: "failed" },
      }),
      go: command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id, query: "", status: "idle", result: "" })),
    };
  },
  ...(options.start === true ? { start: "load" } : {}),
});

const headless = async (options: Parameters<typeof app>[1] = {}) => {
  const s = service();
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app(s.work, options)).pipe(Scope.extend(scope)));
  const state = () => Effect.runPromise(handle.state) as Promise<State>;
  /**
   * Starts a run and returns its CALLER's fiber, so what the caller observes can be read. The caller is outside the application's Scope (a host page, a test), as a real caller is:
   * the application's close interrupts the COMMAND, and the caller sees that, rather than being interrupted itself.
   */
  const run = async (query: string) => Effect.runFork(Effect.exit(handle.invoke("app/search", [{ value: query }])));
  const exitOf = async (fiber: Awaited<ReturnType<typeof run>>) => Effect.runPromise(Fiber.join(fiber));

  return { ...s, handle, scope, state, run, exitOf, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

describe("loading, success, failure: ordinary state", () => {
  it("begin, then settle with the value", async () => {
    const t = await headless();

    await t.run("a"); await settle();
    expect(await t.state()).toMatchObject({ status: "loading", query: "a" });
    t.calls[0]!.resolve("found"); await settle();
    expect(await t.state()).toMatchObject({ status: "done", result: "found" });
    await t.close();
  });

  it("a failure reaches settle exactly as the Promise rejected: an object, a string, undefined and an Error are all kept by reference, never stringified", async () => {
    const t = await headless();
    const typed = { _tag: "Offline", retryAfter: 3 };
    const boom = new Error("boom");

    failures.length = 0;
    for (const reason of [typed, "plain", undefined, boom]) {
      await t.run(`q${failures.length}`); await settle();
      t.calls.at(-1)!.reject(reason); await settle();
    }

    expect(failures).toHaveLength(4);
    expect(failures[0]).toBe(typed);
    expect(failures[1]).toBe("plain");
    expect(failures[2]).toBeUndefined();
    expect(failures[3]).toBe(boom);
    expect(await t.state()).toMatchObject({ status: "failed" });                                  // the application chose what failure means in state
    await t.close();
  });

  it("a synchronous throw in `work` is a failure outcome like a rejection", async () => {
    const t = await headless();
    const s = Valance.define({
      name: "sync-throw", state: { schema: State, initial }, views: { only: { program: eventFreeProgram, scope: () => ({}) } }, view: () => "only" as const,
      commands: (state: Valance.StateHandle<State>) => ({ search: Valance.command(state).waiting(Schema.Struct({ query: Schema.String }), {
        work: () => { throw new TypeError("sync"); },
        wanted: () => true,
        settle: (outcome, _input, current) => ({ ...current, status: outcome.ok ? "done" : "failed", result: outcome.ok ? "" : String((outcome.error as Error).message) }),
      }) }),
    });
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(s).pipe(Scope.extend(scope)));

    await Effect.runPromise(handle.invoke("app/search", [{ value: "x" }]));
    expect(await Effect.runPromise(handle.state)).toMatchObject({ status: "failed", result: "sync" });
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await t.close();
  });
});

describe("latest-wins: a newer run of the same command supersedes an older one", () => {
  it("a, a: the first answer is ignored, the second accepted, in either order", async () => {
    for (const first of [true, false]) {
      const t = await headless();

      await t.run("a"); await t.run("a"); await settle();
      const [older, newer] = [t.calls[0]!, t.calls[1]!];

      (first ? older : newer).resolve(first ? "older" : "newer"); await settle();
      (first ? newer : older).resolve(first ? "newer" : "older"); await settle();
      expect(await t.state()).toMatchObject({ status: "done", result: "newer" });                // the newest run's answer, whichever completes first
      await t.close();
    }
  });

  it("a, as, a: only the third run's answer is shown", async () => {
    const t = await headless();

    for (const q of ["a", "as", "a"]) { await t.run(q); }
    await settle();
    t.calls[0]!.resolve("first"); t.calls[1]!.resolve("second"); await settle();
    expect((await t.state()).status).toBe("loading");
    t.calls[2]!.resolve("third"); await settle();
    expect(await t.state()).toMatchObject({ status: "done", result: "third" });
    await t.close();
  });
});

describe("a superseded run: A starts, B starts, B completes, A completes", () => {
  it("A's work is NOT cancelled, A's caller sees success, A's late result (success or failure) changes nothing, B's stands", async () => {
    const t = await headless();
    const a = await t.run("A"); await settle();
    const b = await t.run("B"); await settle();

    t.calls[1]!.resolve("B-result"); await settle();
    expect(await t.state()).toMatchObject({ query: "B", status: "done", result: "B-result" });

    expect(t.calls[0]!.aborted).toBe(false);                                   // superseded, not cancelled: its work was left running
    t.calls[0]!.reject("A failed late"); await settle();                      // A completes now, with a FAILURE
    expect(await t.state()).toMatchObject({ query: "B", status: "done", result: "B-result" });

    const exitA = await t.exitOf(a);
    const exitB = await t.exitOf(b);

    expect(Exit.isSuccess(exitA)).toBe(true);                                  // A's caller observes a completed run: it is not an interruption and not a failure
    expect(Exit.isSuccess(exitB)).toBe(true);
    await t.close();
  });
});

describe("`wanted`: relevance to the state, separate from which run is newest", () => {
  it("another command changes the state: the result is dropped, success or failure", async () => {
    for (const how of ["resolve", "reject"] as const) {
      const t = await headless();

      await t.run("q"); await settle();
      await Effect.runPromise(t.handle.invoke("app/go", [{ value: "b" }]));
      (how === "resolve" ? t.calls[0]!.resolve("late") : t.calls[0]!.reject("late failure")); await settle();
      expect(await t.state()).toMatchObject({ page: "b", status: "idle", result: "" });
      await t.close();
    }
  });

  it("is required: a waiting command without it does not typecheck", () => {
    const missing = (state: Valance.StateHandle<State>) => Valance.command(state).waiting(
      Schema.Struct({ query: Schema.String }),
      // @ts-expect-error `wanted` is required: a result that no longer fits the state must not land by forgetting to ask
      { work: () => Promise.resolve("x"), settle: (_outcome, _input, current) => current }
    );

    expect(typeof missing).toBe("function");
  });
});

describe("interruption is not success, and the application's close", () => {
  it("closing the application aborts the work, commits nothing afterwards, and the invoking caller sees an interruption (distinguishable from success)", async () => {
    const t = await headless();
    const caller = await t.run("a"); await settle();

    await t.close();
    expect(t.calls[0]!.aborted).toBe(true);
    t.calls[0]!.resolve("late"); await settle();
    expect(await t.state()).toMatchObject({ status: "loading" });              // the state stays readable, exactly as the last commit left it
    const exit = await t.exitOf(caller);

    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true);
    expect(Exit.isSuccess(exit)).toBe(false);
  });

  it("the caller's own interruption stops the run (the work's signal aborts, settle never runs): the state stays as `begin` left it", async () => {
    const t = await headless();
    const caller = await t.run("a"); await settle();

    await Effect.runPromise(Fiber.interrupt(caller));
    expect(t.calls[0]!.aborted).toBe(true);
    t.calls[0]!.resolve("late"); await settle();
    expect(await t.state()).toMatchObject({ status: "loading", result: "" });  // inherent to any command that begins and is then interrupted: nothing commits "interrupted"
    await t.close();
  });
});

describe("start-time work and server rendering", () => {
  it("as `start`: admitted at start and owned by the application, its answer commits; closing aborts it", async () => {
    const t = await headless({ start: true });

    await settle();
    expect(t.calls).toHaveLength(1);
    t.calls[0]!.resolve("booted"); await settle();
    expect(await t.state()).toMatchObject({ status: "done", result: "booted" });
    await t.close();
  });

  it("a start-time run that is still pending when the application closes is interrupted and commits nothing", async () => {
    const t = await headless({ start: true });

    await settle();
    await t.close();
    t.calls[0]!.resolve("late"); await settle();
    expect(await t.state()).toMatchObject({ status: "loading", query: "boot" });
  });

  it("server rendering: the start-time run BEGINS during renderToHtml and is interrupted when the render ends; the HTML and the returned state are what the render read", async () => {
    const s = service();
    const served = await Effect.runPromise(renderToHtml(app(s.work, { start: true }), { primitives: { main: { element: "div" }, text: { element: "span" } } }));

    expect(s.calls).toHaveLength(1);
    expect(served.state).toMatchObject({ status: "loading", query: "boot" });
    expect(served.html).toContain("main");
    s.calls[0]!.resolve("late"); await settle();
    expect(served.state).toMatchObject({ status: "loading" });
  });
});

describe("when the author's own functions misbehave", () => {
  it("a settle that throws is a defect of the command, and the state stays as begin left it (loading)", async () => {
    const t = await headless({ settleThrows: true });
    const caller = await t.run("a"); await settle();

    t.calls[0]!.resolve("x"); await settle();
    const exit = await t.exitOf(caller);

    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
    expect(await t.state()).toMatchObject({ status: "loading" });
    await t.close();
  });
});
