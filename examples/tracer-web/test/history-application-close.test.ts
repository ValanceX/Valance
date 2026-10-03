// Stage 48 — `Web.history` attached before, during and after the application's close, and its own Scope's close.
//   alive      the first state's `urlOf` is the baseline (nothing written, a foreign URL is left alone); later transitions push; a popstate runs the navigate command
//   draining   the runtime is still alive: attaching works and the follower follows committed states (only a command already admitted can commit during the drain)
//   closed     attaching RETURNS (history never fails to attach) and installs its listener, but the state stream is over: no baseline, no write, no commit, no restart. A popstate is
//              attempted through the application's navigate entry, refused by the closed application and logged ("popstate navigation failed"), and the listener lives until history's own Scope closes
//   history's Scope closing removes the listener: nothing is synchronized or logged after it, and the application is untouched by it
import { Effect, Exit, Logger, Scope } from "effect";
import * as Web from "@valancex/valance/web";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { boot, run, sleep } from "./structure-fixture.js";

type Booted = Awaited<ReturnType<typeof boot>>;
const closeApp = (b: Booted) => Effect.runPromise(Scope.close(b.appScope, Exit.void));
/** A window at /n0 with a real history, the URLs history pushed, and the log lines of history's failures. */
const world = () => {
  const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/n0" });
  const pushed: Array<string> = [];
  const logs: Array<string> = [];
  const push = dom.window.history.pushState.bind(dom.window.history);

  dom.window.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
  const logger = Logger.replace(Logger.defaultLogger, Logger.make(({ message }) => { logs.push(String(message)); }));

  return { win: dom.window, pushed, logs, logger, path: () => dom.window.location.pathname };
};
type World = ReturnType<typeof world>;
/** history over `/n${n}${note}`: a popstate runs `app/bump`, so a live application visibly commits it. */
const attach = (b: Booted, w: World, scope: Scope.Scope) => run(Web.history(b.handle, { window: w.win as unknown as Window, urlOf: (s: { readonly n: number; readonly note?: string }) => `/n${s.n}${s.note ?? ""}`, stateOf: () => ({}), navigate: "app/bump" } as never).pipe(Effect.provide(w.logger), Scope.extend(scope)));
/** A browser navigation that fires popstate: an entry the application did not write, then back. */
const popstate = async (w: World) => { w.win.history.pushState(null, "", "/foreign"); w.pushed.length = 0; w.win.history.back(); await sleep(60); };

describe("history while the application lives", () => {
  it("A/G. attaching uses the current state as the baseline (nothing written, a foreign URL left alone); later transitions push; a popstate commits through navigate; closing history's Scope ends all of it", async () => {
    const b = await boot();
    const w = world();
    const scope = await run(Scope.make());

    await b.invoke("app/bump");                                          // state n=1 while the window is at /n0
    await attach(b, w, scope);
    await sleep(30);
    expect(w.pushed).toEqual([]);                                        // baseline /n1: not written, no reconciliation of /n0
    expect(w.path()).toBe("/n0");
    await b.invoke("app/bump");
    await sleep(30);
    expect(w.pushed).toEqual(["/n2"]);
    await popstate(w);                                                   // back from /foreign
    expect((await b.state()).n).toBe(3);                                 // the navigate command ran in the live application
    expect(w.pushed).toEqual([]);                                        // a popstate never writes
    await run(Scope.close(scope, Exit.void));                            // E: history's Scope
    w.logs.length = 0;
    await popstate(w);
    await b.invoke("app/bump");
    await sleep(30);
    expect((await b.state()).n).toBe(4);                                 // only the explicit bump: the popstate was not handled
    expect(w.pushed).toEqual([]);                                        // and the commit was not synchronized either
    expect(w.logs).toEqual([]);
  });
});

describe("history while the application drains", () => {
  it("B. attaching during the drain works and follows what an admitted command commits; when the close completes the follower ends but the listener stays", async () => {
    const b = await boot();
    const holder = await b.mountOn();
    const w = world();
    const scope = await run(Scope.make());
    let release!: () => void;

    b.gate.byId.set("A", new Promise<void>((resolve) => { release = resolve; }));
    b.gate.uninterruptible = true;
    b.gate.commit = true;                                                // the held command commits `note` ("A"), which urlOf reads
    holder.page.click(holder.rowEls()[0]!.querySelector("button")!);
    await sleep(40);
    let closed = false;
    const closing = closeApp(b).then(() => { closed = true; });

    await sleep(40);
    expect(closed).toBe(false);                                          // draining
    await attach(b, w, scope);
    await sleep(30);
    release();
    await closing;
    await sleep(60);
    expect(w.pushed).toEqual(["/n0A"]);                                  // followed during the drain: baseline /n0, then the committed note
    await popstate(w);
    expect(w.logs).toEqual(["popstate navigation failed"]);              // after the close: attempted and refused (below)
    expect((await b.state()).note).toBe("A");
    await run(Scope.close(scope, Exit.void));
    await holder.close();
  });
});

describe("history after the application closed", () => {
  it("C/D/F. attaching returns and installs its listener, writes nothing and commits nothing; a popstate is attempted, refused and logged each time, contained; history's Scope close removes it", async () => {
    const b = await boot();
    const w = world();
    const scope = await run(Scope.make());

    await b.invoke("app/bump");
    await closeApp(b);
    await attach(b, w, scope);                                           // does not throw, does not renew the application
    await sleep(30);
    expect(w.pushed).toEqual([]);                                        // no baseline, no write
    expect(w.path()).toBe("/n0");
    await popstate(w);
    expect(w.logs).toEqual(["popstate navigation failed"]);
    expect(w.pushed).toEqual([]);                                        // a popstate never writes
    w.win.history.forward();
    await sleep(40);
    expect(w.logs).toEqual(["popstate navigation failed", "popstate navigation failed"]);   // the listener survives: it is history's
    expect(await b.state()).toMatchObject({ n: 1 });                     // readable, unchanged: nothing committed, nothing restarted
    await run(Scope.close(scope, Exit.void));
    w.win.history.back();
    await sleep(40);
    expect(w.logs.length).toBe(2);                                       // history's Scope closed the listener
    expect((await b.state()).n).toBe(1);
  });

  it("C'. several histories after the close each have their own listener and refusal: no shared application lifetime appears", async () => {
    const b = await boot();
    const w = world();
    const first = await run(Scope.make());
    const second = await run(Scope.make());

    await closeApp(b);
    await attach(b, w, first);
    await attach(b, w, second);
    await popstate(w);
    expect(w.logs).toEqual(["popstate navigation failed", "popstate navigation failed"]);
    await run(Scope.close(first, Exit.void));
    w.win.history.forward();
    await sleep(40);
    expect(w.logs.length).toBe(3);                                       // only the second one is left
    await run(Scope.close(second, Exit.void));
    expect((await b.state()).n).toBe(0);
    expect(w.pushed).toEqual([]);
  });

  it("F'. application closed while history lives in its own Scope: the same terminal behavior, then cleanup with history's Scope", async () => {
    const b = await boot();
    const w = world();
    const scope = await run(Scope.make());

    await attach(b, w, scope);
    await sleep(30);                                                     // the follower takes its baseline (the first state) asynchronously
    await b.invoke("app/bump");
    await sleep(30);
    expect(w.pushed).toEqual(["/n1"]);
    await closeApp(b);
    await popstate(w);
    expect(w.logs).toEqual(["popstate navigation failed"]);
    expect(w.pushed).toEqual([]);
    await run(Scope.close(scope, Exit.void));
    w.logs.length = 0;
    await popstate(w);
    expect(w.logs).toEqual([]);
    expect((await b.state()).n).toBe(1);
  });
});
