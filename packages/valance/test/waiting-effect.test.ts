// `command(state).waiting` with Effect work: the same command (begin, wanted, settle, supersession, interruption), and now able to use the application's capabilities. A Promise
// `work` is unchanged (waiting.test.ts).
import * as Nexus from "@valancex/nexus";
import { Cause, Effect, Exit, Fiber, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ query: Schema.String, status: Schema.Literal("idle", "loading", "done", "failed"), result: Schema.String, failure: Schema.String });
type State = typeof State.Type;

const Lookup = Nexus.Capability.define<{ readonly find: (query: string) => Promise<string> }>("test/lookup");

const app = (work: (query: string) => Effect.Effect<string, unknown, Nexus.Capability.EnvironmentShape>) => Valance.define({
  name: "waiting-effect",
  state: { schema: State, initial: { query: "", status: "idle", result: "", failure: "" } as State },
  views: { only: { program: eventFreeProgram, scope: () => ({}) } },
  view: () => "only" as const,
  commands: (state: Valance.StateHandle<State>) => ({
    search: Valance.command(state).waiting(Schema.Struct({ query: Schema.String }), {
      begin: ({ query }, current) => ({ ...current, query, status: "loading", result: "", failure: "" }),
      work: ({ query }) => work(query),
      wanted: ({ query }, current) => current.query === query && current.status === "loading",
      settle: (outcome, _input, current) => outcome.ok
        ? { ...current, status: "done", result: outcome.value }
        : { ...current, status: "failed", failure: typeof outcome.error === "object" && outcome.error !== null && "_tag" in outcome.error ? String((outcome.error as { _tag: unknown })._tag) : String(outcome.error) },
    }),
  }),
});

const platform = (find: (query: string) => Promise<string>): Nexus.Application.Platform => Nexus.Capability.EnvironmentLive(new Map([["test/lookup", { _tag: "Available", implementation: { find } }]]));

const run = async (work: Parameters<typeof app>[0], find?: (query: string) => Promise<string>) => {
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app(work), find === undefined ? {} : { platform: platform(find) }).pipe(Scope.extend(scope)));

  return {
    state: () => Effect.runPromise(handle.state) as Promise<State>,
    search: (query: string) => Effect.runFork(Effect.exit(handle.invoke("app/search", [{ value: query }]))),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
const viaCapability = (query: string) => Effect.gen(function* () {
  const lookup = yield* Nexus.Capability.require(Lookup);

  return yield* Effect.tryPromise({ try: () => lookup.find(query), catch: (error) => error });
});

describe("an Effect as the work of a waiting command", () => {
  it("can use a capability the platform provides: loading, then the answer", async () => {
    let answer: (value: string) => void = () => undefined;
    const t = await run(viaCapability, () => new Promise((resolve) => { answer = resolve; }));

    t.search("docs"); await settle();
    expect(await t.state()).toMatchObject({ status: "loading", query: "docs" });
    answer("three pages"); await settle();
    expect(await t.state()).toMatchObject({ status: "done", result: "three pages" });
    await t.close();
  });

  it("a capability the platform does not provide is a failure outcome the application chose to show, not a defect", async () => {
    const t = await run(viaCapability);

    t.search("docs"); await settle();
    expect(await t.state()).toMatchObject({ status: "failed", failure: "CapabilityUnavailableError" });
    await t.close();
  });

  it("a typed failure of the Effect reaches settle exactly as it failed", async () => {
    const t = await run(() => Effect.fail({ _tag: "Offline" }));

    t.search("x"); await settle();
    expect(await t.state()).toMatchObject({ status: "failed", failure: "Offline" });
    await t.close();
  });

  it("a throw from `work` itself is a failure outcome too", async () => {
    const t = await run(() => { throw new Error("boom"); });

    t.search("x"); await settle();
    expect(await t.state()).toMatchObject({ status: "failed", failure: "Error: boom" });
    await t.close();
  });

  it("a newer run supersedes an older one, and `wanted` drops an answer for a query the state has left", async () => {
    const answers = new Map<string, (value: string) => void>();
    const t = await run((query) => Effect.promise(() => new Promise<string>((resolve) => { answers.set(query, resolve); })));

    t.search("a"); await settle();
    t.search("b"); await settle();
    answers.get("b")!("answer b"); await settle();
    answers.get("a")!("answer a"); await settle();
    expect(await t.state()).toMatchObject({ query: "b", status: "done", result: "answer b" });          // the older answer arrived last and changed nothing
    await t.close();
  });

  it("closing the application interrupts the Effect, and nothing commits afterwards", async () => {
    let interrupted = false;
    const t = await run(() => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => { interrupted = true; }))));
    const caller = t.search("x");

    await settle();
    await t.close();

    const exit = await Effect.runPromise(Fiber.join(caller));

    expect(interrupted).toBe(true);
    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true);
    expect(await t.state()).toMatchObject({ status: "loading" });
  });
});
