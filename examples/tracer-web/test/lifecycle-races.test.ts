// Stage 22: lifecycle races on the public model. Three caller-owned Scopes (application, mount, history), real jsdom window and history, a gated application command
// reached from a real click. Each scenario records which Scope was closed, what was in flight, and what then happened.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Deferred, Effect, Exit, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";

const State = Schema.Struct({ path: Schema.String, n: Schema.Number });
type State = Schema.Schema.Type<typeof State>;
const programs = await compilePrograms();
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const urlOf = ({ path }: State): string => path === "/" ? "/x/" : `/x${path}`;
const stateOf = (url: URL): { readonly path: string } => ({ path: url.pathname.replace(/^\/x/, "") || "/" });

/** One world: a window with real history, the application (its command log, a gate), and helpers to mount and attach history in Scopes of their own. */
const world = async () => {
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: "http://localhost/x/" });
  const win = dom.window as unknown as Window;
  const log: Array<string> = [];
  const gate = Effect.runSync(Deferred.make<void>());
  const writes: Array<string> = [];
  const listeners = new Set<unknown>();
  const push = win.history.pushState.bind(win.history);
  const add = win.addEventListener.bind(win);
  const remove = win.removeEventListener.bind(win);

  win.history.pushState = (data, unused, target) => { writes.push(String(target)); push(data, unused, target); };
  win.addEventListener = ((type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => { if (type === "popstate") { listeners.add(listener); } add(type, listener, options); }) as typeof win.addEventListener;
  win.removeEventListener = ((type: string, listener: EventListener, options?: boolean | EventListenerOptions) => { if (type === "popstate") { listeners.delete(listener); } remove(type, listener, options); }) as typeof win.removeEventListener;

  const app = Valance.define({
    name: "races",
    state: { schema: State, initial: { path: "/", n: 0 } },
    views: { only: { program: programs.notfound, scope: (state: State) => ({ title: `n${state.n}${state.path}` }) } },
    view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const bind = (name: string, body: () => Effect.Effect<unknown>) => Nexus.Mesh.bind(Nexus.Command.define(`t.${name}`, Schema.Struct({}), () => Effect.asVoid(body())), () => ({}));

      return {
        "app/bump": bind("bump", () => Effect.tap(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 1 })), () => Effect.sync(() => { log.push("commit bump"); }))),
        "app/navigate": Nexus.Mesh.bind(Nexus.Command.define("t.navigate", Schema.Struct({ path: Schema.String }), ({ path }) => Effect.asVoid(Effect.tap(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, path })), () => Effect.sync(() => { log.push(`commit navigate ${path}`); })))), (args) => (args[0] as { value: unknown }).value),
        // The mount's one button: a command that waits at a gate the test owns, then commits (an event command: the application's once admitted, C25).
        "notfound/back": bind("gated", () => Effect.gen(function* () {
          log.push("gated started");
          yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push("gated interrupted"); })));
          yield* state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 100 }));
          log.push("commit gated");
        })),
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });

  let counter = 0;
  const mountIn = async (handle: Valance.ApplicationHandle<State, unknown>) => {
    const container = win.document.createElement("main");
    const ops: Array<string> = [];
    const index = counter;

    counter += 1;
    win.document.body.append(container);
    const scope = await run(Scope.make());
    const target: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container, primitives })(report);

      return { draw: (t) => { port.draw(t); ops.push(`draw ${text()}`); }, update: (t) => { port.update(t); ops.push(`update ${text()}`); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
    };
    const text = (): string => container.querySelector("section")?.getAttribute("aria-label") ?? "";
    const mounted = await run(Valance.mount(handle, target).pipe(Scope.extend(scope)));

    return { index, container, ops, scope, mounted, text, close: () => run(Scope.close(scope, Exit.void)), click: () => { container.querySelector("button")!.dispatchEvent(new (win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("click", { bubbles: true })); } };
  };
  const attachHistory = async (handle: Valance.ApplicationHandle<State, unknown>) => {
    const scope = await run(Scope.make());

    await run(Web.history(handle, { window: win, urlOf, stateOf, navigate: "app/navigate" }).pipe(Scope.extend(scope)));
    await sleep(40);

    return { scope, close: () => run(Scope.close(scope, Exit.void)) };
  };
  const startApp = async () => {
    const scope = await run(Scope.make());
    const handle = await run(Valance.start(app).pipe(Scope.extend(scope)));

    return { scope, handle, close: () => run(Scope.close(scope, Exit.void)) };
  };

  return { win, log, gate, writes, listeners, location: () => win.location.pathname, mountIn, attachHistory, startApp, release: () => Effect.runSync(Deferred.succeed(gate, undefined)) };
};

const clickOn = (win: Window, element: Element): void => { element.dispatchEvent(new (win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("click", { bubbles: true })); };

describe("lifecycle races: the three Scopes and what is in flight", () => {
  it("P1 the application closes while a mount presents, at several offsets around the commit: no commit after the close, the state is exactly what was committed, the mount ends and stays inert, nothing restarts", async () => {
    for (const delay of [-1, 0, 1, 2, 4]) {
      const w = await world();
      const app = await w.startApp();
      const m = await w.mountIn(app.handle);
      const commit = run(Effect.exit(app.handle.invoke("app/bump", [])));

      if (delay >= 0) { await sleep(delay); }
      await app.close();
      const commitsAtClose = w.log.length;
      const opsAtClose = m.ops.length;
      const exit = await commit;                                                     // the commit either happened before the close or was refused by it

      await sleep(60);
      const state = await run(app.handle.state);

      expect(w.log.length).toBe(commitsAtClose);                                     // nothing committed after the close resolved
      expect(state.n).toBe(w.log.filter((entry) => entry === "commit bump").length);// the state is exactly the commits that happened
      expect(Exit.isSuccess(exit)).toBe(state.n === 1);
      expect(m.ops.length).toBeGreaterThanOrEqual(opsAtClose);
      expect(m.text()).toMatch(/^n[01]\//);                                          // a state that was committed (maybe not the last: a mount may skip, or the stream may end first)
      expect(Number(m.text()[1])).toBeLessThanOrEqual(state.n);
      expect(await run(Effect.race(Effect.map(m.mounted.followed, (e) => e._tag), Effect.succeed("following")))).toBe("Success");   // the mount's follower ended with the application's stream

      // Inert: the application stays closed, an event on the mount is refused, no state changes.
      expect(Exit.isFailure(await run(Effect.exit(app.handle.invoke("app/bump", []))))).toBe(true);
      clickOn(w.win, m.container.querySelector("button")!);
      await sleep(40);
      expect(m.mounted.dispatched.map((e) => e._tag)).toEqual(["Failure"]);          // the click reached admission and was refused
      expect(w.log.filter((entry) => entry.startsWith("gated"))).toEqual([]);
      expect(await run(app.handle.state)).toEqual(state);
      await m.close();
    }
  });

  it("P2 a mount closes with a presentation pending: nothing is presented to it afterwards, the application and its commands stay usable, a later mount renders the current state", async () => {
    const w = await world();
    const app = await w.startApp();
    const m = await w.mountIn(app.handle);

    await run(app.handle.invoke("app/bump", []));                                    // a state that needs presentation ...
    await m.close();                                                                  // ... and the mount's Scope closes before the follower consumes it
    await sleep(60);
    expect(m.ops).toEqual(["draw n0/", "unmount"]);                                  // the pending presentation was dropped with the mount; nothing after unmount
    await run(app.handle.invoke("app/bump", []));
    expect(await run(app.handle.state)).toEqual({ path: "/", n: 2 });
    const later = await w.mountIn(app.handle);

    expect(later.text()).toBe("n2/");                                                // the authoritative state, not a stale presentation
    await later.close();
    await app.close();
  });

  it("P3 a mount closes while its event dispatch is in flight: the command is the application's and still commits; the closed mount presents nothing, its ledger still records the exit, a stale click on its old button reports nothing; the close may race the click itself", async () => {
    for (const closeImmediately of [false, true]) {
      const w = await world();
      const app = await w.startApp();
      const m = await w.mountIn(app.handle);
      const button = m.container.querySelector("button")!;

      clickOn(w.win, button);
      if (!closeImmediately) { await until(() => w.log.includes("gated started")); }
      await m.close();                                                                // the dispatch is in flight (admitted at the click, synchronously)
      await until(() => w.log.includes("gated started"));
      clickOn(w.win, button);                                                         // a stale callback: the unmounted target reports nothing
      await sleep(40);
      expect(w.log.filter((entry) => entry === "gated started")).toHaveLength(1);
      expect(w.log).not.toContain("gated interrupted");                              // closing the mount did not interrupt the command (C25)

      w.release();
      await until(() => w.log.includes("commit gated"));                             // it commits AFTER its mount closed, as the application's command
      await sleep(40);
      expect(await run(app.handle.state)).toEqual({ path: "/", n: 100 });
      expect(m.ops).toEqual(["draw n0/", "unmount"]);                                // no presentation to the closed mount
      expect(m.mounted.dispatched.map((e) => e._tag)).toEqual(["Success"]);          // the mount-owned ledger keeps receiving exits
      const later = await w.mountIn(app.handle);

      expect(later.text()).toBe("n100/");
      await later.close();
      await app.close();
    }
  });

  it("P4 history closes while the application lives: navigation still commits but no longer reaches the browser; a new history takes the CURRENT state as its baseline (writes nothing), then synchronizes later transitions; the gap is not backfilled", async () => {
    const w = await world();
    const app = await w.startApp();
    const first = await w.attachHistory(app.handle);

    await run(app.handle.invoke("app/navigate", [{ value: { path: "/a" } }]));
    await sleep(40);
    expect(w.writes).toEqual(["/x/a"]);
    await first.close();
    expect(w.listeners.size).toBe(0);                                                // the first follower's listener is gone

    await run(app.handle.invoke("app/navigate", [{ value: { path: "/b" } }]));       // committed while no history is attached
    await sleep(40);
    expect(w.writes).toEqual(["/x/a"]);                                              // nothing written for it
    expect(await run(app.handle.state)).toMatchObject({ path: "/b" });
    expect(w.location()).toBe("/x/a");                                               // the browser URL and the application URL now differ

    const second = await w.attachHistory(app.handle);

    expect(w.writes).toEqual(["/x/a"]);                                              // attaching writes nothing: the current state is the baseline (C15, C17)
    await run(app.handle.invoke("app/navigate", [{ value: { path: "/c" } }]));
    await sleep(40);
    expect(w.writes).toEqual(["/x/a", "/x/c"]);                                      // later transitions synchronize from that baseline
    w.win.history.back();
    await sleep(60);
    expect(await run(app.handle.state)).toMatchObject({ path: "/a" });               // popstate reaches the same navigate command; /b was never in the browser's history
    expect(w.writes).toEqual(["/x/a", "/x/c"]);
    await second.close();
    await app.close();
  });

  it("P5 the application closes while history lives: the listener stays (it is history's), a popstate is ATTEMPTED and refused by the closed application and logged, nothing is written, no command path survives; the listener goes with history's own Scope", async () => {
    const w = await world();
    const logs: Array<string> = [];
    const app = await w.startApp();
    const history = await w.attachHistory(app.handle);

    await run(app.handle.invoke("app/navigate", [{ value: { path: "/a" } }]));
    await sleep(40);
    const before = [...w.writes];

    await app.close();
    expect(w.listeners.size).toBe(1);
    const original = console.log;

    console.log = (...args: Array<unknown>) => { logs.push(args.map(String).join(" ")); };
    try {
      w.win.history.back();
      await sleep(80);
    } finally {
      console.log = original;
    }
    expect(logs.filter((line) => line.includes("popstate navigation failed") && line.includes("begun terminating"))).toHaveLength(1);   // attempted, refused, logged (C28)
    expect(w.writes).toEqual(before);
    expect(await run(app.handle.state)).toEqual({ path: "/a", n: 0 });              // authoritative state unchanged by the stale popstate
    expect(Exit.isFailure(await run(Effect.exit(app.handle.invoke("app/navigate", [{ value: { path: "/z" } }]))))).toBe(true);   // no usable command path
    expect(w.log).toEqual(["commit navigate /a"]);
    await history.close();
    expect(w.listeners.size).toBe(0);
  });
});

describe("a history attached late: application state is the baseline, the browser URL is not reconciled", () => {
  const appUrl = async (handle: Valance.ApplicationHandle<State, unknown>): Promise<string> => urlOf(await run(handle.state));

  it("H1 detached navigation, then attach: attaching writes nothing, so the browser URL and the application URL differ until the next transition, which resumes the normal path", async () => {
    const w = await world();
    const app = await w.startApp();
    const first = await w.attachHistory(app.handle);

    expect([w.location(), await appUrl(app.handle)]).toEqual(["/x/", "/x/"]);        // A: the two agree
    await first.close();
    await run(app.handle.invoke("app/navigate", [{ value: { path: "/b" } }]));       // B, while history is absent
    await sleep(40);
    await w.attachHistory(app.handle);

    expect([w.location(), await appUrl(app.handle)]).toEqual(["/x/", "/x/b"]);       // immediately after attaching: browser at A, application at B
    expect(w.writes).toEqual([]);                                                    // nothing was reconciled
    await run(app.handle.invoke("app/bump", []));                                    // an unrelated state change still writes nothing (C17)
    await sleep(40);
    expect(w.writes).toEqual([]);
    await run(app.handle.invoke("app/navigate", [{ value: { path: "/c" } }]));       // C: the follower works again, from the baseline B
    await sleep(40);
    expect(w.writes).toEqual(["/x/c"]);
    expect([w.location(), await appUrl(app.handle)]).toEqual(["/x/c", "/x/c"]);      // and they agree again
    await app.close();
  });

  it("H2 the browser URL was changed by someone else while no history was attached: attaching leaves it alone (the application's state is the baseline, the browser URL is never compared with it)", async () => {
    const w = await world();
    const app = await w.startApp();
    const first = await w.attachHistory(app.handle);

    await first.close();
    w.win.history.pushState(null, "", "/x/elsewhere");                               // not the application's write
    const foreign = [...w.writes];

    await w.attachHistory(app.handle);
    expect(w.writes).toEqual(foreign);                                               // attaching wrote nothing, and did not undo the foreign entry
    expect([w.location(), await appUrl(app.handle)]).toEqual(["/x/elsewhere", "/x/"]);
    expect(await run(app.handle.state)).toMatchObject({ path: "/" });                // and the application state was not changed by it
    await run(app.handle.invoke("app/bump", []));
    await sleep(40);
    expect(w.writes).toEqual(foreign);                                               // an unrelated change still writes nothing
    await app.close();
  });

  it("H3 Back/Forward across the detached interval: every entry goes through the application's navigate with stateOf(url); the interval's own navigation has NO entry and cannot be reached", async () => {
    const w = await world();
    const app = await w.startApp();
    const first = await w.attachHistory(app.handle);

    await run(app.handle.invoke("app/navigate", [{ value: { path: "/a" } }]));       // entry /x/a (written)
    await sleep(40);
    await first.close();
    await run(app.handle.invoke("app/navigate", [{ value: { path: "/b" } }]));       // detached: no entry
    await sleep(40);
    await w.attachHistory(app.handle);
    await run(app.handle.invoke("app/navigate", [{ value: { path: "/c" } }]));       // entry /x/c (written)
    await sleep(40);
    expect(w.writes).toEqual(["/x/a", "/x/c"]);                                      // the browser's stack: /x/, /x/a, /x/c

    const visit = async (move: "back" | "forward"): Promise<[string, string]> => {
      w.win.history[move]();
      await sleep(60);

      return [w.location(), (await run(app.handle.state)).path];
    };

    expect(await visit("back")).toEqual(["/x/a", "/a"]);                             // an entry from BEFORE the interval: meaningful
    expect(await visit("back")).toEqual(["/x/", "/"]);                               // the initial entry
    expect(await visit("forward")).toEqual(["/x/a", "/a"]);
    expect(await visit("forward")).toEqual(["/x/c", "/c"]);                          // an entry written AFTER the late attach: meaningful
    expect(w.log.filter((entry) => entry === "commit navigate /b")).toHaveLength(1); // /b was committed once, by the detached navigation, and never revisited
    expect(w.writes).toEqual(["/x/a", "/x/c"]);                                      // traversal wrote nothing
    await app.close();
  });
});

