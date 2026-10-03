// Stage 46 — what the application's Scope.close linearizes, and what it does not.
//   it linearizes APPLICATION STATE: admission closes, commands drain, nothing commits after it resolves (C33)
//   it does not own or await the mounts' followers (their Scopes are the callers', C24): a follower consumes what the stream had already delivered, presenting the latest committed
//   state (render and target operation, both still allowed), then ends when the stream ends. So a presentation of a state committed BEFORE the close may begin and finish after
//   `Scope.close` resolved; none can ever be of a state committed after it; and once a presentation has begun it finishes (target operations are synchronous: the retained render
//   follows the operation's return in the same step, with no point at which a close could land between them).
// A MOUNT's Scope closing is the different, awaited boundary: its follower is interrupted and awaited, then unmounted: nothing is presented after that close resolves.
// Where the follower is is observed with `scopeHook` (inside the view's scope function: after the state was read, before MESH renders it) and the target's own `update` hook.
import { Cause, Effect, Exit, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { A0, boot, hydrateOn, scopeHook, served, sleep } from "./structure-fixture.js";
import { until } from "./helpers.js";

type Booted = Awaited<ReturnType<typeof boot>>;
const closeApp = (b: Booted) => Effect.runPromise(Scope.close(b.appScope, Exit.void));
const titles = (trees: ReadonlyArray<string>) => trees.map((t) => /"title":"(\w+)"/.exec(t)![1]!);
const reset = () => { scopeHook.current = undefined; };

describe("application close: state boundary, not presentation boundary", () => {
  it("A. a state committed before the close can be presented after Scope.close resolved (the target operation, and the retained render with it, happen after it); the follower then ends; nothing is committed", async () => {
    for (let round = 0; round < 3; round += 1) {
      const b = await boot();
      const m = await b.mountOn();
      const closeResolved = { value: false };
      const renderedAfterClose: Array<boolean> = [];

      scopeHook.current = () => { renderedAfterClose.push(closeResolved.value); };   // is the application's close already resolved when the follower renders?
      await Promise.all([1, 2, 3].map(() => b.invoke("app/bump")));
      await closeApp(b);
      closeResolved.value = true;
      const atClose = [...m.ops];
      const committed = (await b.state()).n;

      await sleep(60);
      reset();
      expect(committed).toBe(3);
      expect(titles(m.trees).at(-1)).toBe("A3");                           // the latest committed state was presented...
      expect(m.ops.length).toBeGreaterThan(atClose.length);                // ...after the close resolved (observed with this scheduling: possible, not required)
      expect(renderedAfterClose.length).toBeGreaterThan(0);                // (MESH began rendering it before the close resolved in this scheduling; the target operation came after: not claimed either way)
      expect((await b.state()).n).toBe(3);                                 // and nothing committed
      expect(await m.standing()).toBe("ended");
      await m.close();
    }
  });

  it("A'. a presentation never shows a state beyond the last commit, and at most the latest one is presented after the close", async () => {
    const b = await boot();
    const m = await b.mountOn();

    await Promise.all([1, 2, 3, 4].map(() => b.invoke("app/bump")));
    await closeApp(b);
    const atClose = m.ops.length;

    await sleep(60);
    const shown = titles(m.trees).map((t) => Number(t.slice(1)));

    expect(shown.every((n) => n <= 4)).toBe(true);
    expect(shown).toEqual([...shown].sort((x, y) => x - y));
    expect(m.ops.length - atClose).toBeLessThanOrEqual(1);                 // outstanding wake-ups read the same latest state: one presentation, not one per wake-up
    await m.close();
  });

  it("B/C. a presentation in progress when the close begins (state read, MESH not yet run) completes; its retained render follows the target operation in the same step", async () => {
    const b = await boot();
    const m = await b.mountOn();
    let closing: Promise<unknown> | undefined;

    scopeHook.current = (s) => { if (s.n === 1) { closing ??= closeApp(b); } };
    await b.invoke("app/bump");
    await until(() => closing !== undefined);
    await closing;
    await sleep(60);
    reset();
    expect(m.ops).toEqual(["draw", "update"]);                            // A1 was presented although the close began after its state was read
    expect(titles(m.trees)).toEqual(["A0", "A1"]);
    expect(await m.standing()).toBe("ended");
    await m.close();
  });

  it("E. commits while a presentation is in progress, then the close: the in-progress presentation finishes and the latest committed state is the last one shown; nothing later", async () => {
    const b = await boot();
    const m = await b.mountOn();
    let started = false;

    scopeHook.current = (s) => {
      if (s.n === 1 && !started) {
        started = true;
        void Effect.runPromise(Effect.all([b.rawInvoke("app/bump"), b.rawInvoke("app/bump")], { concurrency: "unbounded" })).then(() => closeApp(b));
      }
    };
    await b.invoke("app/bump");
    await until(() => (m.ops.length >= 2 && titles(m.trees).at(-1) === "A3"));
    await sleep(60);
    reset();
    const shown = titles(m.trees);

    expect(shown.slice(0, 2)).toEqual(["A0", "A1"]);
    expect(shown.at(-1)).toBe("A3");
    expect((await b.state()).n).toBe(3);
    expect(await m.standing()).toBe("ended");
    await m.close();
  });

  it("F. a view-changing draw in progress when the close begins completes as a draw", async () => {
    const b = await boot();
    const m = await b.mountOn();
    let closing: Promise<unknown> | undefined;

    scopeHook.current = (s) => { if (s.view === "b") { closing ??= closeApp(b); } };
    await b.invoke("app/toggleView");
    await until(() => closing !== undefined);
    await closing;
    await sleep(60);
    reset();
    expect(m.ops).toEqual(["draw", "draw"]);
    expect(titles(m.trees)).toEqual(["A0", "B0"]);
    await m.close();
  });

  it("G. the first presentation in progress when the close begins completes, for mount and for hydrate", async () => {
    for (const kind of ["mount", "hydrate"] as const) {
      const b = await boot();
      const html = await served(b, A0);
      let closing: Promise<unknown> | undefined;

      scopeHook.current = () => { closing ??= closeApp(b); };
      const result = kind === "mount" ? await b.mountOn() : await hydrateOn(b, html);

      await closing;
      await sleep(60);
      reset();
      expect(result.ops).toEqual([kind === "mount" ? "draw" : "hydrate"]);
      if (kind === "hydrate") {
        expect("exit" in result && result.exit !== "hung" && Exit.isSuccess(result.exit)).toBe(true);
      }
      await result.close();
    }
  });
});

describe("a mount's Scope close is the awaited boundary", () => {
  it("H. mount close: an in-progress presentation completes and is retained, nothing is presented after the close resolves (the follower is interrupted and awaited, then unmounted)", async () => {
    const b = await boot();
    let closing: Promise<unknown> | undefined;
    const m = await b.mountOn({ onUpdate: () => { closing ??= m.close(); } });    // the mount's own Scope closes inside the presentation of A1

    await b.invoke("app/bump");
    await until(() => closing !== undefined);
    await closing;
    const atClose = [...m.ops];

    await b.invoke("app/bump");                                            // later commits: the application is alive, the mount is not
    await b.invoke("app/bump");
    await sleep(60);
    expect(atClose).toEqual(["draw", "update", "unmount"]);                // A1 finished; then the target was unmounted
    expect(m.ops).toEqual(atClose);                                        // nothing after the close resolved
    expect((await b.state()).n).toBe(3);
    const exit = await Effect.runPromise(m.mounted.followed);

    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true);
  });

  it("H'. mount close during the render of a state (read, MESH not yet run): the presentation is dropped or finished before the close resolves, never after", async () => {
    const b = await boot();
    let closing: Promise<unknown> | undefined;
    const m = await b.mountOn();

    scopeHook.current = (s) => { if (s.n === 1) { closing ??= m.close(); } };
    await b.invoke("app/bump");
    await until(() => closing !== undefined);
    await closing;
    reset();
    const atClose = [...m.ops];

    await sleep(60);
    expect(m.ops).toEqual(atClose);
    expect(atClose.at(-1)).toBe("unmount");
  });
});
