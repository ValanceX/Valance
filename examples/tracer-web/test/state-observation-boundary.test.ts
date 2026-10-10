// Stage 54 — observing state. Four separate things, none of them a second owner:
//   a read (`handle.state`)   the authoritative state right now: visible the moment a commit completes, creating no subscription and no obligation for anyone to present it
//   the stream (`State.values`, internal to VALANCE consumers)   asynchronous: the current state first, then one element per commit in commit order, nothing fabricated, nothing for a failed
//                             mutation; a slow observer lags on its own and delays neither commits nor other observers; it ends with the application's Scope and never resumes
//   presentation              a consumer of the stream that may skip superseded elements (C32);  history   another consumer, with its own subscription
//   selectors                 NEXUS's `Selector` is not part of VALANCE's public surface (`ApplicationHandle` is `state` and `invoke`): not applicable here
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import type { HydrationResult } from "@valancex/port-web";
import { runningOf } from "@valancex/valance/internal";
import { Effect, Exit, Fiber, Schema, Scope, Stream } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const State = Schema.Struct({ n: Schema.Number });
type State = Schema.Schema.Type<typeof State>;
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const world = async () => {
  const probes: Array<{ readonly state: number; readonly streamLength: number }> = [];
  const observers: Array<{ readonly seen: Array<number> }> = [];
  const app = Valance.define({
    name: "observation", state: { schema: State, initial: { n: 0 } },
    views: { only: { program: titleProgram, scope: (s: State) => ({ title: `n${s.n}` }) } }, view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const bind = (name: string, schema: Schema.Schema<never, never>, body: (input: never) => Effect.Effect<unknown, unknown>, input: (args: ReadonlyArray<Nexus.Mesh.IntentArgument>) => unknown) =>
        Nexus.Mesh.bind(Nexus.Command.define(name, schema as never, body as never), input as never);
      const first = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => args[0] !== undefined && "value" in args[0] ? args[0].value : undefined;

      return {
        "app/set": bind("set", Schema.Struct({ value: Schema.Unknown }) as never, (({ value }: { value: unknown }) => Effect.asVoid(state.set({ n: value } as never))) as never, (args) => ({ value: first(args) })),
        "app/inc": bind("inc", Schema.Struct({}) as never, (() => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ n: c.n + 1 })))) as never, () => ({})),
        "app/slowInc": bind("slowInc", Schema.Struct({}) as never, (() => Effect.zipRight(Effect.promise(() => sleep(15)), Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ n: c.n + 1 }))))) as never, () => ({})),
        "app/updateFails": bind("updateFails", Schema.Struct({}) as never, (() => state.update((): Effect.Effect<State, string> => Effect.fail("update failed"))) as never, () => ({})),
        // commits, then looks at the state and at the observers in the SAME step: the commit is readable, its stream delivery has not happened yet
        "app/incAndProbe": bind("incAndProbe", Schema.Struct({}) as never, (() => Effect.gen(function* () {
          yield* state.update((c): Effect.Effect<State> => Effect.succeed({ n: c.n + 1 }));
          const now = yield* state.get;

          probes.push({ state: now.n, streamLength: observers[0]!.seen.length });
        })) as never, () => ({})),
        "app/navigate": bind("navigate", Schema.Struct({ n: Schema.Number }) as never, (({ n }: { n: number }) => Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ n })))) as never, (args) => first(args)),
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const fibers: Array<Fiber.RuntimeFiber<void, never>> = [];
  /** A stream observer, attached and PROVEN attached (its first element, the current state, has arrived). `lag` makes it slow. */
  const observe = async (lag = 0) => {
    const seen: Array<number> = [];

    observers.push({ seen });
    fibers.push(Effect.runFork(Stream.runForEach(runningOf(handle).states, (s) => Effect.zipRight(lag > 0 ? Effect.promise(() => sleep(lag)) : Effect.void, Effect.sync(() => { seen.push((s as State).n); })))));
    await until(() => seen.length >= 1);

    return seen;
  };
  const mount = async () => {
    const page = load("");
    const ops: Array<string> = [];
    const scope = await run(Scope.make());

    await run(Valance.mount(handle, ((report) => { const port = Web.target({ container: page.container, primitives })(report); return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); } }; }) as Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>>).pipe(Scope.extend(scope)));

    return { ops, label: () => page.container.querySelector("section")?.getAttribute("aria-label"), close: () => run(Scope.close(scope, Exit.void)) };
  };
  const invoke = (key: string, value?: unknown) => Effect.runPromise(Effect.exit(handle.invoke(key, value === undefined ? [] : [{ value } as never])));

  return { handle, appScope, probes, observe, mount, invoke, state: async () => (await run(handle.state) as State), close: async () => { await run(Scope.close(appScope, Exit.void)); await Promise.all(fibers.map((f) => Effect.runPromise(Fiber.interrupt(f)))); } };
};

describe("reading versus streaming", () => {
  it("A/B. the stream begins with the current state; a commit is readable as soon as it completes, in the same step before its stream element is delivered; the element then arrives exactly once", async () => {
    const w = await world();

    await w.invoke("app/inc");                                           // n=1 before anyone observes
    const seen = await w.observe();

    expect(seen).toEqual([1]);                                           // B: the first element is the current state, not the history
    await w.invoke("app/incAndProbe");
    expect(w.probes).toEqual([{ state: 2, streamLength: 1 }]);           // A: the commit was readable; the observer had not received it yet
    await until(() => seen.length === 2);
    await sleep(30);
    expect(seen).toEqual([1, 2]);                                        // delivered, once
    expect((await w.state()).n).toBe(2);
    await w.close();
  });

  it("C. failed mutations (invalid set, failing update) add no stream element and leave the state unchanged", async () => {
    const w = await world();
    const seen = await w.observe();

    await w.invoke("app/inc");
    await until(() => seen.length === 2);
    await w.invoke("app/set", "bad");
    await w.invoke("app/updateFails");
    await sleep(40);
    expect(seen).toEqual([0, 1]);
    expect((await w.state()).n).toBe(1);
    await w.close();
  });

  it("D. several commits arrive as one element each, in commit order, none invented, duplicated or reordered", async () => {
    const w = await world();
    const seen = await w.observe();

    for (let i = 0; i < 5; i += 1) { await w.invoke("app/inc"); }
    await until(() => seen.length === 6);
    await sleep(30);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    await w.close();
  });

  it("E. a slow observer lags on its own: commits are not delayed, another observer is not held back, and the slow one still receives every element in order", async () => {
    const w = await world();
    const fast = await w.observe();
    const slow = await w.observe(40);
    const started = Date.now();

    for (let i = 0; i < 4; i += 1) { await w.invoke("app/inc"); }
    const committedIn = Date.now() - started;

    expect((await w.state()).n).toBe(4);                                 // all committed
    await until(() => fast.length === 5);
    expect(slow.length).toBeLessThan(5);                                 // the slow one is still catching up: the fast one did not wait for it
    expect(committedIn).toBeLessThan(40 * 4);                            // (and the commits did not wait either)
    await until(() => slow.length === 5);
    expect(slow).toEqual([0, 1, 2, 3, 4]);
    expect(fast).toEqual([0, 1, 2, 3, 4]);
    await w.close();
  });

  it("F. reads during concurrent commands see whatever has committed at that moment: non-decreasing, each one a state that was committed", async () => {
    const w = await world();
    const seen = await w.observe();
    const reads: Array<number> = [];
    let reading = true;
    const reader = (async () => { while (reading) { reads.push((await w.state()).n); await sleep(3); } })();

    await Promise.all(Array.from({ length: 5 }, () => w.invoke("app/slowInc")));
    reading = false;
    await reader;
    await until(() => seen.length === 6);
    expect(reads.every((n, i) => i === 0 || n >= reads[i - 1]!)).toBe(true);
    expect(reads.every((n) => seen.includes(n))).toBe(true);             // no snapshot or in-between value
    expect(reads.at(-1)).toBeLessThanOrEqual(5);
    expect((await w.state()).n).toBe(5);
    await w.close();
  });
});

describe("observation versus its consumers", () => {
  it("G. the stream can hold states a mount never presents (latest-state skipping); presentation is a separate consumer", async () => {
    const w = await world();
    const seen = await w.observe();
    const m = await w.mount();

    await Promise.all(Array.from({ length: 6 }, () => w.invoke("app/inc")));
    await until(() => m.label() === "n6");
    await sleep(30);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);                         // every commit is observable
    expect(m.ops.length).toBeLessThanOrEqual(7);                         // the mount presented its own subset (possibly all, never more)
    expect(m.ops[0]).toBe("draw");
    await m.close();
    await w.close();
  });

  it("H. history observes through its own subscription and does not alter the stream: only the commits made appear in it", async () => {
    const w = await world();
    const seen = await w.observe();
    const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/0" });
    const pushed: Array<string> = [];
    const push = dom.window.history.pushState.bind(dom.window.history);

    dom.window.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
    const scope = await run(Scope.make());

    await run(Web.history(w.handle, { window: dom.window as unknown as Window, urlOf: (s: { readonly n: number }) => `/${s.n}`, stateOf: (url: URL) => ({ n: Number(url.pathname.slice(1)) }), navigate: "app/navigate" } as never).pipe(Scope.extend(scope)));
    await sleep(40);
    expect(seen).toEqual([0]);                                           // attaching added nothing
    await w.invoke("app/inc");
    await w.invoke("app/inc");
    await until(() => pushed.length === 2);
    expect(pushed).toEqual(["/1", "/2"]);
    await sleep(30);
    expect(seen).toEqual([0, 1, 2]);                                     // history wrote URLs, never state
    await run(Scope.close(scope, Exit.void));
    await w.close();
  });
});

describe("observation across lifetimes", () => {
  it("I. after the close the state stays readable, a late observer gets an empty, finished stream, and no mutation produces an element", async () => {
    const w = await world();
    const seen = await w.observe();

    await w.invoke("app/inc");
    await until(() => seen.length === 2);
    await w.close();
    expect((await w.state()).n).toBe(1);
    const late = await Effect.runPromise(Stream.runCollect(runningOf(w.handle).states).pipe(Effect.timeoutTo({ duration: "500 millis", onSuccess: (chunk) => [...chunk], onTimeout: () => "hung" as const })));

    expect(late).toEqual([]);                                            // finished, not hung, and no replay of a new lifecycle
    expect(Exit.isFailure(await w.invoke("app/inc"))).toBe(true);
    await sleep(40);
    expect(seen).toEqual([0, 1]);
    expect((await w.state()).n).toBe(1);
  });

  it("J. two applications have independent reads and streams; closing one leaves the other observed", async () => {
    const a = await world();
    const b = await world();
    const [sa, sb] = [await a.observe(), await b.observe()];

    await a.invoke("app/inc");
    await until(() => sa.length === 2);
    await sleep(30);
    expect([sa, sb]).toEqual([[0, 1], [0]]);
    await b.invoke("app/inc");
    await b.invoke("app/inc");
    await until(() => sb.length === 3);
    expect([sa, sb]).toEqual([[0, 1], [0, 1, 2]]);
    await a.close();
    await b.invoke("app/inc");
    await until(() => sb.length === 4);
    expect(sb).toEqual([0, 1, 2, 3]);
    expect([(await a.state()).n, (await b.state()).n]).toEqual([1, 3]);
    await b.close();
  });
});
