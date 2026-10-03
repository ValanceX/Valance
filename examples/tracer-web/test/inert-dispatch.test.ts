// The render an inert mount retains (C31) is intentionally stale. What an event on it means:
//   the event resolves against the RETAINED render (its handler identity, its intent, its arguments), never against the view the application has since selected;
//   the resulting command runs against CURRENT application state (the application stays authoritative: a retained event only invokes an application command);
//   the mount presents nothing, whatever the event commits: it never resumes by itself; other mounts' presentations never replace its retained render;
//   a fresh mount starts from current state with a normal first draw; after the application closes, the retained event meets the existing terminal refusal.
import type { WebPort } from "@valancex/port-web";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load } from "./helpers.js";

const programs = await compilePrograms();
const State = Schema.Struct({ view: Schema.Literal("a", "b"), n: Schema.Number, bad: Schema.Boolean });
type State = Schema.Schema.Type<typeof State>;
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isDieType(exit.cause) ? `died ${(exit.cause.defect as Error).message}` : Cause.isFailType(exit.cause) ? "failed" : "interrupted";

/** View A (notfound program): an event that REPAIRS (+10, bad cleared); view B (details program): an event that adds 100. A's render fails while `bad`. */
const boot = async () => {
  const log: Array<string> = [];
  const app = Valance.define({
    name: "inert-dispatch", state: { schema: State, initial: { view: "a", n: 0, bad: false } },
    views: {
      a: { program: programs.notfound, scope: (s: State) => ({ title: s.bad ? (42 as never) : `A${s.n}` }) },
      b: { program: programs.details, scope: (s: State) => ({ title: `B${s.n}`, id: "x", name: "x", count: s.n, summary: "" }) },
    },
    view: (s: State) => s.view,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const set = (name: string, change: (c: State) => State) => Nexus.Mesh.bind(Nexus.Command.define(`t.${name}`, Schema.Struct({}), () => Effect.asVoid(Effect.zipRight(state.update((c): Effect.Effect<State> => Effect.succeed(change(c))), Effect.sync(() => { log.push(`commit ${name}`); })))), () => ({}));

      return {
        "app/break": set("break", (c) => ({ ...c, bad: true })),
        "app/bump": set("bump", (c) => ({ ...c, n: c.n + 1 })),
        "app/toggle": set("toggle", (c) => ({ ...c, view: c.view === "a" ? "b" : "a" })),
        "notfound/back": set("back-on-a", (c) => ({ ...c, n: c.n + 10, bad: false })),   // A's retained button: repairs
        "details/back": set("back-on-b", (c) => ({ ...c, n: c.n + 100 })),                 // B's button
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const mountOn = async (options: { readonly page?: ReturnType<typeof load>; readonly updateThrows?: () => boolean } = {}) => {
    const page = options.page ?? load("");
    const ops: Array<string> = [];
    const target: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container: page.container, primitives })(report);

      return { draw: (t) => { port.draw(t); ops.push(`draw ${label()}`); }, update: (t) => { if (options.updateThrows?.() === true) { throw new Error("update failed"); } port.update(t); ops.push(`update ${label()}`); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
    };
    const label = (): string => page.container.querySelector("section")?.getAttribute("aria-label") ?? "";
    const scope = await run(Scope.make());
    const mounted = await run(Valance.mount(handle, target).pipe(Scope.extend(scope)));

    return { page, ops, label, mounted, scope, click: () => { page.click(page.container.querySelector("button")!); }, ledger: () => mounted.dispatched.map(show), close: () => run(Scope.close(scope, Exit.void)),
      standing: () => run(Effect.race(Effect.map(mounted.followed, (e): string => Exit.isSuccess(e) ? "ended" : "failed"), Effect.succeed("following"))) };
  };

  return { log, handle, appScope, mountOn, state: () => run(handle.state), invoke: (key: string) => run(handle.invoke(key, [])) };
};

/** A mount on view A that goes inert: the commit that follows makes A's render invalid. */
const inertA = async () => {
  const b = await boot();
  const a = await b.mountOn();

  await b.invoke("app/break");
  await sleep(60);
  expect(await a.standing()).toBe("failed");
  expect(a.label()).toBe("A0");                                                              // the last good render, retained

  return { b, a };
};

describe("an inert mount's retained render and the application's later state", () => {
  it("1-4 the event resolves against the RETAINED render (A's intent), not the view since selected (B); it runs against current state; it repairs the state; the mount stays inert; a fresh mount renders the repaired current state", async () => {
    const { b, a } = await inertA();

    await b.invoke("app/toggle");                                                            // the application now selects view B
    await b.invoke("app/bump");
    await b.invoke("app/bump");
    expect(await b.state()).toEqual({ view: "b", n: 2, bad: true });
    a.click();                                                                               // A's retained button
    await sleep(60);

    expect(b.log).toEqual(["commit break", "commit toggle", "commit bump", "commit bump", "commit back-on-a"]);   // A's command, never B's `back-on-b`
    expect(await b.state()).toEqual({ view: "b", n: 12, bad: false });                       // on CURRENT state: the toggle and both bumps survive; the repair applied; exactly +10
    expect(a.ledger()).toEqual(["succeeded"]);
    expect(a.ops).toEqual(["draw A0"]);                                                      // no presentation, even though the state is renderable again
    expect(await a.standing()).toBe("failed");                                               // it did not resume

    const fresh = await b.mountOn();

    expect(fresh.ops).toEqual(["draw B12"]);                                                 // a normal first draw of the CURRENT state (view B), not the retained A render
    expect(await fresh.standing()).toBe("following");
    await fresh.close();
    await a.close();
  });

  it("3 several retained events while the state keeps changing: each is an independent dispatch of the retained intent; ledger entries are correct; nothing is presented", async () => {
    const { b, a } = await inertA();

    a.click();
    await sleep(30);
    await b.invoke("app/toggle");
    a.click();
    await b.invoke("app/bump");
    a.click();
    await sleep(60);
    expect(b.log.filter((entry) => entry.startsWith("commit back"))).toEqual(["commit back-on-a", "commit back-on-a", "commit back-on-a"]);   // always the retained render's intent
    expect(await b.state()).toEqual({ view: "b", n: 31, bad: false });
    expect(a.ledger()).toEqual(["succeeded", "succeeded", "succeeded"]);
    expect(a.ops).toEqual(["draw A0"]);
    await a.close();
  });

  it("5 another mount keeps following and presents what the retained event committed; the inert mount dispatches A's retained intent and cannot touch the live mount's render bookkeeping", async () => {
    const b = await boot();
    let throws = false;
    const inert = await b.mountOn({ updateThrows: () => throws });                          // mount-local inertness: a target that fails its first update
    const live = await b.mountOn();

    throws = true;
    await b.invoke("app/bump");
    await sleep(60);
    expect(await inert.standing()).toBe("failed");
    expect(await live.standing()).toBe("following");
    await b.invoke("app/toggle");                                                            // the live mount draws view B; the inert one still holds A's render
    await sleep(60);
    expect([inert.label(), live.label()]).toEqual(["A0", "B1"]);

    inert.click();                                                                           // A's retained button
    await sleep(60);
    expect(b.log.at(-1)).toBe("commit back-on-a");                                           // A's intent, although the application is on view B
    expect(await b.state()).toEqual({ view: "b", n: 11, bad: false });
    expect(live.label()).toBe("B11");                                                        // the live mount presents the committed state normally
    live.click();                                                                            // and its OWN drawn render still dispatches B's intent
    await sleep(60);
    expect(b.log.at(-1)).toBe("commit back-on-b");
    expect(await b.state()).toEqual({ view: "b", n: 111, bad: false });
    expect(live.label()).toBe("B111");
    expect(inert.ops).toEqual(["draw A0"]);                                                  // the inert mount presented nothing throughout
    expect(inert.ledger()).toEqual(["succeeded"]);
    expect(live.ledger()).toEqual(["succeeded"]);
    expect(await live.standing()).toBe("following");
    await live.close();
    await inert.close();
  });

  it("6 after the application closes, the retained event meets the existing terminal refusal: it is recorded as a defect, nothing commits, the state is unchanged", async () => {
    const { b, a } = await inertA();
    const before = await b.state();
    const logged = [...b.log];

    await run(Scope.close(b.appScope, Exit.void));
    a.click();
    await sleep(60);
    expect(a.ledger()).toEqual(["died NEXUS: the runtime has begun terminating"]);
    expect(b.log).toEqual(logged);                                                           // no commit
    expect(await b.state()).toEqual(before);
    expect(a.ops).toEqual(["draw A0"]);
    await a.close();
  });

  it("7 after retained events and another path advanced the state, closing the inert mount and mounting afresh in the SAME container starts from the current state with a normal draw", async () => {
    const { b, a } = await inertA();

    a.click();                                                                               // repair through the retained event
    await sleep(40);
    await b.invoke("app/toggle");
    await b.invoke("app/bump");
    expect(await b.state()).toEqual({ view: "b", n: 11, bad: false });
    expect(a.label()).toBe("A0");                                                            // its DOM is still the old render
    await a.close();
    expect(a.page.container.innerHTML).toBe("");

    const fresh = await b.mountOn({ page: a.page });                                         // the same container

    expect(fresh.ops).toEqual(["draw B11"]);                                                 // current state, not the retained render or DOM
    await b.invoke("app/bump");
    await sleep(40);
    expect(fresh.ops).toEqual(["draw B11", "update B12"]);                                   // and it follows normally
    expect(await fresh.standing()).toBe("following");
    await fresh.close();
  });
});
