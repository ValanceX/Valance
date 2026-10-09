// Stage 53 — who can change application state, and with what guarantee. Observed (NEXUS's `State`), not designed:
//   owner       the application's one state cell; a command is the mutation path (mounts and histories only observe; the only thing history invokes is the configured navigate command)
//   set         decodes `next` against the schema first: invalid → typed StateValidationFailed, no commit; valid → the decoded value commits
//   update      the TRUSTED writer: `f` runs atomically (concurrent updates all land), a failing `f` commits nothing, and a value `f` returns is committed as is, without validation
//   commit      every commit is one element of `State.values`, authoritative whether or not anything presents it; after the application's close nothing commits and the last value stays readable
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import type { HydrationResult } from "@valancex/port-web";
import { runningOf } from "@valancex/valance/internal";
import { Cause, Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const State = Schema.Struct({ n: Schema.Number });
type State = Schema.Schema.Type<typeof State>;
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** The stream is delivered asynchronously: wait for it to carry `count` elements (bounded), then it is safe to compare. */
const delivered = async (w: { readonly stream: ReadonlyArray<unknown> }, count: number) => { await until(() => w.stream.length >= count); await sleep(20); };
const kind = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "success" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isDieType(exit.cause) ? `die ${String((exit.cause.defect as Error).message).slice(0, 60)}` : Cause.isFailType(exit.cause) ? `fail ${typeof exit.cause.error === "string" ? exit.cause.error : (exit.cause.error as { _tag: string })._tag}` : "other";

const world = async () => {
  const app = Valance.define({
    name: "mutation", state: { schema: State, initial: { n: 0 } },
    views: { only: { program: titleProgram, scope: (s: State) => ({ title: `n${s.n}` }) } }, view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const bind = (name: string, schema: Schema.Schema<never, never>, body: (input: never) => Effect.Effect<unknown, unknown>, input: (args: ReadonlyArray<Nexus.Mesh.IntentArgument>) => unknown) =>
        Nexus.Mesh.bind(Nexus.Command.define(name, schema as never, body as never), input as never);
      const first = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => args[0] !== undefined && "value" in args[0] ? args[0].value : undefined;

      return {
        // set: the value is `unknown` to the command, so an invalid one reaches `State.set`'s own validation
        "app/set": bind("set", Schema.Struct({ value: Schema.Unknown }) as never, (({ value }: { value: unknown }) => Effect.asVoid(state.set({ n: value } as never))) as never, (args) => ({ value: first(args) })),
        "app/update": bind("update", Schema.Struct({ value: Schema.Number }) as never, (({ value }: { value: number }) => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: value })))) as never, (args) => ({ value: first(args) })),
        "app/updateFails": bind("updateFails", Schema.Struct({}) as never, (() => state.update((): Effect.Effect<State, string> => Effect.fail("update failed"))) as never, () => ({})),
        "app/updateInvalid": bind("updateInvalid", Schema.Struct({}) as never, (() => Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ n: "not a number" } as never)))) as never, () => ({})),
        "app/inc": bind("inc", Schema.Struct({}) as never, (() => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ n: c.n + 1 })))) as never, () => ({})),
        "app/navigate": bind("navigate", Schema.Struct({ n: Schema.Number }) as never, (({ n }: { n: number }) => Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ n })))) as never, (args) => first(args)),
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const stream: Array<unknown> = [];
  const watcher = Effect.runFork(Stream.runForEach(runningOf(handle).states, (s) => Effect.sync(() => { stream.push(s); })));
  const mount = async () => {
    const page = load("");
    const scope = await run(Scope.make());

    await run(Valance.mount(handle, ((report) => Web.target({ container: page.container, primitives })(report)) as Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>>).pipe(Scope.extend(scope)));

    return { label: () => page.container.querySelector("section")?.getAttribute("aria-label"), close: () => run(Scope.close(scope, Exit.void)) };
  };
  const invoke = (key: string, value?: unknown) => Effect.runPromise(Effect.exit(handle.invoke(key, value === undefined ? [] : [{ value } as never])));

  return { handle, appScope, stream, mount, invoke, state: () => run(handle.state), close: async () => { await run(Scope.close(appScope, Exit.void)); await Effect.runPromise(Fiber.interrupt(watcher)); } };
};

describe("State.set and State.update", () => {
  it("A/B. set validates before committing: a valid value commits (one stream element, visible, presented); an invalid one is a typed StateValidationFailed with no commit", async () => {
    const w = await world();
    const m = await w.mount();

    expect(kind(await w.invoke("app/set", 4))).toBe("success");
    expect(await w.state()).toEqual({ n: 4 });
    await until(() => m.label() === "n4");
    expect(w.stream).toEqual([{ n: 0 }, { n: 4 }]);                      // the first element is the current state; then the commit
    expect(kind(await w.invoke("app/set", "four"))).toBe("fail StateValidationFailed");
    expect(await w.state()).toEqual({ n: 4 });                           // unchanged
    await sleep(40);
    expect(w.stream).toEqual([{ n: 0 }, { n: 4 }]);                      // no commit reached the stream
    expect(m.label()).toBe("n4");                                        // and the consumer is alive on the last good state
    expect(kind(await w.invoke("app/set", 6))).toBe("success");
    await until(() => m.label() === "n6");
    await m.close();
    await w.close();
  });

  it("C/D. update commits what it returns (visible, in the stream); an update that fails before returning commits nothing and leaves the application usable", async () => {
    const w = await world();

    expect(kind(await w.invoke("app/update", 3))).toBe("success");
    expect(await w.state()).toEqual({ n: 3 });
    expect(kind(await w.invoke("app/updateFails"))).toBe("fail update failed");
    expect(await w.state()).toEqual({ n: 3 });
    await delivered(w, 2);
    expect(w.stream).toEqual([{ n: 0 }, { n: 3 }]);
    expect(kind(await w.invoke("app/update", 5))).toBe("success");
    await delivered(w, 3);
    expect(w.stream).toEqual([{ n: 0 }, { n: 3 }, { n: 5 }]);
    await w.close();
  });

  it("E. update is the trusted writer: a value it returns is committed without validation (it becomes the authoritative state); set on the same value is refused", async () => {
    const w = await world();

    expect(kind(await w.invoke("app/updateInvalid"))).toBe("success");   // no validation guarantee beyond what `set` gives
    expect(await w.state()).toEqual({ n: "not a number" });
    await delivered(w, 2);
    expect(w.stream).toEqual([{ n: 0 }, { n: "not a number" }]);
    expect(kind(await w.invoke("app/set", "not a number"))).toBe("fail StateValidationFailed");   // the same value through `set` is refused
    await w.close();
  });

  it("F. independent atomic updates all land", async () => {
    const w = await world();

    await Promise.all(Array.from({ length: 12 }, () => w.invoke("app/inc")));
    expect(await w.state()).toEqual({ n: 12 });
    await delivered(w, 13);
    expect(w.stream.length).toBe(13);                                    // every commit is one stream element
    await w.close();
  });
});

describe("who mutates", () => {
  it("G. mounts and histories only observe: attaching and presenting commit nothing, and history's only mutation path is the configured navigate command", async () => {
    const w = await world();
    const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/5" });
    const scope = await run(Scope.make());
    const m = await w.mount();

    await run(Web.history(w.handle, { window: dom.window as unknown as Window, urlOf: (s: { readonly n: number }) => `/${s.n}`, stateOf: (url: URL) => ({ n: Number(url.pathname.slice(1)) }), navigate: "app/navigate" } as never).pipe(Scope.extend(scope)));
    await sleep(60);
    expect(w.stream).toEqual([{ n: 0 }]);                                // attaching changed nothing; the presentation fed nothing back
    expect(m.label()).toBe("n0");
    dom.window.history.pushState(null, "", "/7");
    dom.window.history.back();                                           // popstate to /5: history invokes `app/navigate` with it
    await until(() => w.stream.length === 2);
    expect(await w.state()).toEqual({ n: 5 });                           // the command wrote the state, history only carried the URL's meaning
    await run(Scope.close(scope, Exit.void));
    await m.close();
    await w.close();
  });

  it("H. mutating one application leaves the other untouched", async () => {
    const a = await world();
    const b = await world();

    await a.invoke("app/update", 3);
    expect([(await a.state()).n, (await b.state()).n]).toEqual([3, 0]);
    await b.invoke("app/update", 9);
    expect([(await a.state()).n, (await b.state()).n]).toEqual([3, 9]);
    await Promise.all([delivered(a, 2), delivered(b, 2)]);
    expect([a.stream.length, b.stream.length]).toEqual([2, 2]);
    await Promise.all([a.close(), b.close()]);
  });

  it("I. after the close nothing commits through any path and the last state stays readable; a lookup failure stays typed, a known key meets the terminal refusal", async () => {
    const w = await world();

    await w.invoke("app/update", 8);
    await w.close();
    expect(kind(await w.invoke("app/update", 1))).toMatch(/^die /);
    expect(kind(await w.invoke("app/set", 1))).toMatch(/^die /);
    expect(kind(await w.invoke("app/updateInvalid"))).toMatch(/^die /);
    expect(kind(await w.invoke("app/nothing"))).toBe("fail UnmappedCommand");
    expect(await w.state()).toEqual({ n: 8 });
    await delivered(w, 2);
    expect(w.stream).toEqual([{ n: 0 }, { n: 8 }]);
  });

  it("J. with no consumer every commit is authoritative; consumers attached later start from the current state and replay nothing", async () => {
    const w = await world();

    for (const value of [1, 2, 3]) { await w.invoke("app/update", value); }
    expect(await w.state()).toEqual({ n: 3 });
    await delivered(w, 4);
    expect(w.stream).toEqual([{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }]);
    const m = await w.mount();

    expect(m.label()).toBe("n3");
    expect(w.stream.length).toBe(4);                                     // attaching committed nothing
    await m.close();
    await w.close();
  });
});
