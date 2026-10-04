// Stage 51 — the handle is the identity of one application. Everything attached to it (`state`, `invoke`, mounts, histories) refers to that application's lifetime, state, command registry
// and state stream; nothing reaches another application, nothing is global (a consumer is told its application only by the handle it is given), and attaching a consumer never starts
// or renews anything.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Logger, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";
import { boot, run, sleep } from "./structure-fixture.js";

type Booted = Awaited<ReturnType<typeof boot>>;
const settle = () => sleep(50);
const closeApp = (b: Booted) => Effect.runPromise(Scope.close(b.appScope, Exit.void));
/** A history over its own window at /n0, the URLs it pushed and what it logged. */
const history = async (b: Booted) => {
  const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/n0" });
  const pushed: Array<string> = [];
  const logs: Array<string> = [];
  const push = dom.window.history.pushState.bind(dom.window.history);

  dom.window.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
  const logger = Logger.replace(Logger.defaultLogger, Logger.make(({ message }) => { logs.push(String(message)); }));
  const scope = await run(Scope.make());

  await run(Web.history(b.handle, { window: dom.window as unknown as Window, urlOf: (s: { readonly n: number }) => `/n${s.n}`, stateOf: () => ({}), navigate: "app/bump" } as never).pipe(Effect.provide(logger), Scope.extend(scope)));
  await sleep(30);

  return { win: dom.window, pushed, logs, close: () => run(Scope.close(scope, Exit.void)) };
};
const popstate = async (h: Awaited<ReturnType<typeof history>>) => { h.win.history.pushState(null, "", "/foreign"); h.pushed.length = 0; h.win.history.back(); await sleep(60); };

describe("one handle, one application", () => {
  it("A. several mounts and histories from one handle share its state and keep independent consumer state; closing one leaves the rest", async () => {
    const b = await boot();
    let throws = false;
    const stuck = await b.mountOn({ updateThrows: () => throws ? "after" : undefined });
    const live = await b.mountOn();
    const h1 = await history(b);
    const h2 = await history(b);

    throws = true;
    await b.invoke("app/bump");
    await settle();
    expect([live.title(), live.ops]).toEqual(["A1", ["draw", "update"]]);   // every consumer reacted to the one application...
    expect(stuck.ops).toEqual(["draw"]);                                 // ...and each mount holds its own presentation state
    expect([h1.pushed, h2.pushed]).toEqual([["/n1"], ["/n1"]]);
    await h1.close();
    await live.close();
    await b.invoke("app/bump");
    await settle();
    expect(h1.pushed).toEqual(["/n1"]);
    expect(h2.pushed).toEqual(["/n1", "/n2"]);                           // the other history carries on
    const fresh = await b.mountOn();

    expect(fresh.title()).toBe("A2");                                    // and a fresh mount reads the same application
    await Promise.all([stuck.close(), fresh.close(), h2.close()]);
  });

  it("B/F. two applications are isolated: commits, consumers and closing one touch only that application; the closed one stays readable and refuses commands, its consumers follow the post-close contracts", async () => {
    const a = await boot();
    const b = await boot();
    const [ma, mb] = [await a.mountOn(), await b.mountOn()];
    const [ha, hb] = [await history(a), await history(b)];

    await a.invoke("app/bump");
    await settle();
    expect([ma.title(), mb.title()]).toEqual(["A1", "A0"]);              // only A's consumers reacted
    expect([ha.pushed, hb.pushed]).toEqual([["/n1"], []]);
    await b.invoke("app/bump");
    await b.invoke("app/bump");
    await settle();
    expect([ma.title(), mb.title()]).toEqual(["A1", "A2"]);
    expect([ha.pushed, hb.pushed]).toEqual([["/n1"], ["/n1", "/n2"]]);

    await closeApp(a);
    await settle();
    expect((await a.state()).n).toBe(1);                                 // readable
    expect(Exit.isFailure(await Effect.runPromise(Effect.exit(a.rawInvoke("app/bump"))))).toBe(true);   // admission refused
    expect(await ma.standing()).toBe("ended");                           // post-close: inert mount...
    await popstate(ha);
    expect(ha.logs).toEqual(["popstate navigation failed"]);             // ...history refusing popstate
    await b.invoke("app/bump");                                          // B is untouched
    await settle();
    expect(mb.title()).toBe("A3");
    expect(hb.pushed).toEqual(["/n1", "/n2", "/n3"]);
    expect(await mb.standing()).toBe("following");
    expect(hb.logs).toEqual([]);
    await Promise.all([ma.close(), mb.close(), ha.close(), hb.close()]);
  });

  it("C. `handle.state` always reads that application's authoritative state", async () => {
    const a = await boot();
    const b = await boot();
    const reads: Array<[number, number]> = [];

    for (const [target, count] of [[a, 1], [b, 2], [a, 1]] as const) {
      for (let i = 0; i < count; i += 1) { await target.invoke("app/bump"); }
      reads.push([(await a.state()).n, (await b.state()).n]);
    }
    expect(reads).toEqual([[1, 0], [1, 2], [2, 2]]);
    await Promise.all([closeApp(a), closeApp(b)]);
  });

  it("D. each application has its own command registry: a key one defines is unmapped (typed, local) in the other", async () => {
    const State = Schema.Struct({ n: Schema.Number });
    type State = Schema.Schema.Type<typeof State>;
    const other = Valance.define({
      name: "other", state: { schema: State, initial: { n: 0 } },
      views: { only: { program: titleProgram, scope: (s: State) => ({ title: `o${s.n}` }) } }, view: () => "only" as const,
      commands: (state: Nexus.State.StateHandle<State>) => ({
        "app/only-here": Nexus.Mesh.bind(Nexus.Command.define("o.here", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ n: c.n + 100 })))), () => ({})),
      }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
    });
    const scope = await run(Scope.make());
    const handle = await run(Valance.start(other).pipe(Scope.extend(scope)));
    const b = await boot();
    const typed = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) && Cause.isFailType(exit.cause) ? (exit.cause.error as { _tag: string })._tag : "not typed";

    await run(handle.invoke("app/only-here", []));
    expect(await run(handle.state)).toEqual({ n: 100 });
    expect(typed(await Effect.runPromise(Effect.exit(handle.invoke("app/bump", []))))).toBe("UnmappedCommand");   // b's key, unknown here
    expect(typed(await Effect.runPromise(Effect.exit(b.rawInvoke("app/only-here"))))).toBe("UnmappedCommand");     // and the other way round
    await b.invoke("app/bump");
    expect((await b.state()).n).toBe(1);
    expect(await run(handle.state)).toEqual({ n: 100 });                 // neither touched the other
    await Promise.all([run(Scope.close(scope, Exit.void)), closeApp(b)]);
  });

  it("E/G. a consumer attached later reads the current state of its handle's application and replays nothing; earlier consumers carry on from their own state; zero consumers is a full application", async () => {
    const b = await boot();

    for (let i = 0; i < 3; i += 1) { await b.invoke("app/bump"); }       // no consumers: committing is just the application
    const early = await b.mountOn();
    const h1 = await history(b);

    expect(early.ops).toEqual(["draw"]);
    expect(early.title()).toBe("A3");                                    // current state, no replay of earlier commits
    expect(h1.pushed).toEqual([]);                                       // baseline: nothing written for attaching
    await b.invoke("app/bump");
    await settle();
    const late = await b.mountOn();
    const h2 = await history(b);

    expect(late.ops).toEqual(["draw"]);
    expect(late.title()).toBe("A4");
    expect(early.ops).toEqual(["draw", "update"]);                       // the earlier mount went on from its own retained render
    expect(h1.pushed).toEqual(["/n4"]);
    expect(h2.pushed).toEqual([]);
    await b.invoke("app/bump");
    await settle();
    expect([early.title(), late.title()]).toEqual(["A5", "A5"]);
    expect([h1.pushed, h2.pushed]).toEqual([["/n4", "/n5"], ["/n5"]]);
    await Promise.all([early.close(), late.close(), h1.close(), h2.close()]);
  });
});
