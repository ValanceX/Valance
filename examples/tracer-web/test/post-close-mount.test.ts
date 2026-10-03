// Stage 47 — `mount` / `hydrate` against a handle whose application is closed or closing. The application's lifetime is the one `start` was given; nothing a mount does can renew it.
//   after the close    the state is still READABLE (`handle.state`), but the state stream is over: a mount's first element never comes, so it ends with the defect
//                      "the application ended before its first render": no render, no target operation (the container is untouched), no finalizer, no commit, no restart
//   during the drain   the runtime is still alive: a mount draws the current state and follows, and its follower ends when the application finishes closing (C24)
//   `invoke`           dies with its own terminal defect (C33); mount/hydrate die with theirs. Different messages, the same class: a defect, never a typed error
// Recovery of an INERT mount (a fresh mount) needs a live application; once the application is closed there is nothing to recover to.
import { Cause, Effect, Exit, Scope, Stream } from "effect";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { runningOf } from "@valancex/valance/internal";
import { describe, expect, it } from "vitest";

import { primitives } from "../src/catalog/web.js";
import { A0, boot, hydrateOn, run, served, sleep, scopeHook } from "./structure-fixture.js";
import { load } from "./helpers.js";

type Booted = Awaited<ReturnType<typeof boot>>;
const closeApp = (b: Booted) => Effect.runPromise(Scope.close(b.appScope, Exit.void));
const message = (exit: unknown): string => Exit.isFailure(exit as Exit.Exit<unknown, unknown>) && Cause.isDieType((exit as { cause: Cause.Cause<unknown> }).cause) ? ((exit as { cause: { defect: Error } }).cause.defect).message : "not a defect";
/** A plain `mount` over a recording target, settled with its Exit (the fixture's `mountOn` throws on failure). */
const attempt = async (b: Booted) => {
  const page = load("");
  const ops: Array<string> = [];
  const scope = await run(Scope.make());
  const factory: Valance.TargetFactory<ReturnType<ReturnType<typeof Web.target>>> = (report) => {
    const port = Web.target({ container: page.container, primitives })(report);

    return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
  };
  const exit = await Effect.runPromise(Valance.mount(b.handle, factory).pipe(Scope.extend(scope), Effect.exit, Effect.timeoutTo({ duration: "800 millis", onSuccess: (e) => e as Exit.Exit<Valance.Mounted<never>, unknown> | "hung", onTimeout: () => "hung" as const })));

  return { exit, ops, page, scope };
};

describe("mounting after the application closed", () => {
  it("A. mount ends with the defect 'the application ended before its first render': no render, no target operation, no finalizer, no commit; the state stays readable", async () => {
    const b = await boot();
    const renders: Array<number> = [];

    await b.invoke("app/bump");
    await closeApp(b);
    scopeHook.current = (s) => { renders.push(s.n); };
    const before = await b.state();
    const r = await attempt(b);

    scopeHook.current = undefined;
    expect(r.exit).not.toBe("hung");
    expect(message(r.exit)).toBe("the application ended before its first render");
    expect(renders).toEqual([]);                                         // MESH was never asked to render
    expect(r.ops).toEqual([]);                                           // the target was never drawn on
    expect(r.page.container.innerHTML).toBe("");
    await run(Scope.close(r.scope, Exit.void));
    expect(r.ops).toEqual([]);                                           // no finalizer: nothing is unmounted either
    expect(await b.state()).toEqual(before);                             // readable, unchanged: the mount committed nothing and restarted nothing
    expect(before.n).toBe(1);
  });

  it("A'. the state stream does not resume: it is over, and a later mount attempt does not change that", async () => {
    const b = await boot();

    await closeApp(b);
    await attempt(b);
    await attempt(b);
    const seen = await Effect.runPromise(Stream.runCollect(runningOf(b.handle).states).pipe(Effect.timeoutTo({ duration: "500 millis", onSuccess: (chunk) => [...chunk], onTimeout: () => "hung" as const })));

    expect(seen).toEqual([]);                                            // no element, and it ends (not "hung")
    expect((await b.state()).n).toBe(0);
  });

  it("C. hydrate ends the same way: no target operation, the server markup untouched, no mismatch reported", async () => {
    const b = await boot();
    const html = await served(b, A0);

    await closeApp(b);
    const h = await hydrateOn(b, html);

    expect(h.exit).not.toBe("hung");
    expect(message(h.exit)).toBe("the application ended before its first render");
    expect(h.ops).toEqual([]);
    expect(h.page.container.innerHTML).toBe(html);
    await h.close();
    expect(h.ops).toEqual([]);
  });

  it("F. invoke, mount and hydrate after the close are all refused with defects of their own (different messages, never typed errors); an unknown key is still the typed UnmappedCommand", async () => {
    const b = await boot();

    await closeApp(b);
    const invoked = await Effect.runPromise(Effect.exit(b.rawInvoke("app/bump")));
    const mounted = await attempt(b);
    const hydrated = await hydrateOn(b, "");
    const unknown = await Effect.runPromise(Effect.exit(b.rawInvoke("app/nothing")));

    expect(message(invoked)).toBe("NEXUS: the runtime has begun terminating");
    expect(message(mounted.exit)).toBe("the application ended before its first render");
    expect(message(hydrated.exit)).toBe("the application ended before its first render");
    expect(Exit.isFailure(unknown) && Cause.isFailType(unknown.cause)).toBe(true);
    expect((await b.state()).n).toBe(0);                                 // and the state is readable throughout
  });
});

describe("mounting while the application drains", () => {
  it("B. the runtime is still alive: a mount (or hydrate) draws the current state and follows; it ends when the close completes, like any mount (C24)", async () => {
    const b = await boot();
    const holder = await b.mountOn();
    let release!: () => void;

    await b.invoke("app/bump");
    b.gate.byId.set("A", new Promise<void>((resolve) => { release = resolve; }));
    b.gate.uninterruptible = true;
    holder.page.click(holder.rowEls()[0]!.querySelector("button")!);     // an admitted uninterruptible command holds the drain open
    await sleep(40);
    let closed = false;
    const closing = closeApp(b).then(() => { closed = true; });

    await sleep(40);
    expect(closed).toBe(false);
    const m = await b.mountOn();                                         // during the drain
    const h = await hydrateOn(b, await served(b, A0));

    expect(m.ops).toEqual(["draw"]);
    expect(h.ok?.hydration).toBeDefined();
    expect(h.ops).toEqual(["hydrate"]);
    expect(await m.standing()).toBe("following");
    release();
    await closing;
    await sleep(60);
    expect(await m.standing()).toBe("ended");                             // the follower ends with the application's stream
    expect(m.ops).toEqual(["draw"]);
    await Promise.all([m.close(), h.close(), holder.close()]);
  });
});

describe("recovering a mount versus recovering an application", () => {
  it("D. a fresh mount recovers an inert mount while the application lives; once the application is closed no mount can be created, and what is already there stays as it was", async () => {
    const b = await boot();
    let throws = false;
    const inert = await b.mountOn({ updateThrows: () => throws ? "after" : undefined });

    throws = true;
    await b.invoke("app/bump");
    await sleep(40);
    const fresh = await b.mountOn();                                     // mount recovery: needs only a live application

    expect(fresh.ops).toEqual(["draw"]);
    await b.invoke("app/bump");
    await sleep(40);
    expect(fresh.ops).toEqual(["draw", "update"]);
    await closeApp(b);
    await sleep(40);
    const after = await attempt(b);                                      // application recovery: not a mount's to give

    expect(message(after.exit)).toBe("the application ended before its first render");
    expect(await fresh.standing()).toBe("ended");
    expect(inert.ops).toEqual(["draw"]);                                 // the inert mount is as it was
    expect((await b.state()).n).toBe(2);
    await Promise.all([inert.close(), fresh.close()]);
  });
});
