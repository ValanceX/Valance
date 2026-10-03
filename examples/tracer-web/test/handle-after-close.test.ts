// The public handle after the application's Scope closes (C20 to C23, C33), through `Valance.start`'s result and the caller's Scope only.
//   invoke  a lazy Effect; run after the close it DIES (a defect, not a typed failure) with NEXUS's refusal; during the drain with Valance's admission refusal;
//           an unknown key is still the typed UnmappedCommand (resolved before admission)
//   state   still readable: the last committed state
//   races   a command admitted before the close is interrupted by the drain (no commit), unless it is uninterruptible (C23): then the close waits and the commit happens
//           BEFORE `Scope.close` resolves; no commit ever follows the close
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { until } from "./helpers.js";
import { run, sleep, world } from "./lifecycle-world.js";

const describeExit = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "success" : Cause.isFailType(exit.cause) ? `typed ${(exit.cause.error as { _tag: string })._tag}` : Cause.isDieType(exit.cause) ? `defect: ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const TERMINATED = "defect: NEXUS: the runtime has begun terminating";
const DRAINING = "defect: VALANCE: admission is closed (draining)";

describe("the handle after the application's Scope closed", () => {
  it("invoke is a lazy Effect that dies with the refusal (every time, no matter the command); an unknown key is still the typed UnmappedCommand; state stays readable and nothing runs", async () => {
    const w = await world();
    const app = await w.startApp();

    await run(app.handle.invoke("app/bump", []));
    await app.close();

    expect(() => app.handle.invoke("app/bump", [])).not.toThrow();                    // the call itself builds an Effect: the refusal happens when it runs
    const outcomes = [] as Array<string>;

    for (const [key, args] of [["app/bump", []], ["app/bump", []], ["app/navigate", [{ value: { path: "/z" } }]], ["app/hold", []]] as const) {
      outcomes.push(describeExit(await run(Effect.exit(app.handle.invoke(key, args)))));
    }
    expect(outcomes).toEqual([TERMINATED, TERMINATED, TERMINATED, TERMINATED]);        // repeated calls, different commands: one terminal behavior
    expect(describeExit(await run(Effect.exit(app.handle.invoke("app/nope", []))))).toBe("typed UnmappedCommand");
    await sleep(40);
    expect(await run(app.handle.state)).toEqual({ path: "/", n: 1 });                 // the last committed state is readable, unchanged
    expect(w.log).toEqual(["commit bump"]);                                           // no command body ran, nothing was committed or restarted
  });

  it("a command admitted before the close: interruptible → interrupted by the drain, no commit; uninterruptible → the close waits, a call during the drain is refused by admission, the commit happens before the close resolves, its caller sees Interrupted", async () => {
    const interruptible = await world();
    const a = await interruptible.startApp();
    const heldCall = Effect.runPromise(Effect.exit(a.handle.invoke("app/hold", [])));

    await until(() => interruptible.log.includes("hold started"));
    await a.close();                                                                    // resolves: the drain interrupts the held command
    expect(describeExit(await heldCall)).toBe("interrupted");
    interruptible.releaseHold();
    await sleep(40);
    expect(interruptible.log).toEqual(["hold started", "hold interrupted"]);           // it never committed
    expect(await run(a.handle.state)).toEqual({ path: "/", n: 0 });

    const stubborn = await world();
    const b = await stubborn.startApp();
    const stubbornCall = Effect.runPromise(Effect.exit(b.handle.invoke("app/hold-uninterruptible", [])));

    await until(() => stubborn.log.includes("hold-u started"));
    let closed = false;
    const closing = b.close().then(() => { closed = true; });

    await sleep(80);
    expect(closed).toBe(false);                                                         // the drain waits for an uninterruptible command (C23)
    expect(describeExit(await run(Effect.exit(b.handle.invoke("app/bump", []))))).toBe(DRAINING);   // a NEW call during the drain is refused by admission
    expect((await run(b.handle.state)).n).toBe(0);                                     // and nothing has committed yet
    stubborn.releaseHold();
    await closing;
    expect(stubborn.log).toEqual(["hold-u started", "commit hold-u"]);                 // the commit happened, and before `Scope.close` resolved
    expect(await run(b.handle.state)).toEqual({ path: "/", n: 2000 });
    expect(describeExit(await stubbornCall)).toBe("interrupted");                      // its caller was interrupted by the drain even though the commit completed: the state is the record
    expect(describeExit(await run(Effect.exit(b.handle.invoke("app/bump", []))))).toBe(TERMINATED);   // after the close, the other refusal
  });

  it("a command admitted right before the close, at several offsets: it commits before the close resolves or is interrupted without committing; nothing ever commits after the close", async () => {
    for (const delay of [-1, 0, 1, 3]) {
      const w = await world();
      const app = await w.startApp();
      const call = run(Effect.exit(app.handle.invoke("app/bump", [])));

      if (delay >= 0) { await sleep(delay); }
      await app.close();
      const commitsAtClose = w.log.length;
      const exit = describeExit(await call);

      await sleep(30);
      expect(w.log.length).toBe(commitsAtClose);                                       // no commit after the close resolved
      expect(["success", "interrupted"]).toContain(exit);
      expect(exit === "success").toBe((await run(app.handle.state)).n === 1);          // success iff it committed
    }
  });

  it("with a mount and a history still alive, every post-close path ends in the same terminal refusal: invoke, a mount event, a popstate; none commits, presents or writes", async () => {
    const w = await world();
    const logs: Array<string> = [];
    const app = await w.startApp();
    const mount = await w.mountIn(app.handle);
    const history = await w.attachHistory(app.handle);

    await run(app.handle.invoke("app/navigate", [{ value: { path: "/a" } }]));
    await sleep(40);
    const writes = [...w.writes];
    const opsBefore = [...mount.ops];
    const original = console.log;

    await app.close();
    console.log = (...args: Array<unknown>) => { logs.push(args.map(String).join(" ")); };
    try {
      const invoked = describeExit(await run(Effect.exit(app.handle.invoke("app/bump", []))));

      mount.click();                                                                    // a mount event
      w.win.history.back();                                                             // a popstate
      await sleep(80);
      const event = mount.mounted.dispatched[0]!;

      expect(invoked).toBe(TERMINATED);
      expect(describeExit(event)).toBe(TERMINATED);                                     // the mount's ledger records the same refusal
      expect(logs.filter((line) => line.includes("popstate navigation failed") && line.includes("begun terminating"))).toHaveLength(1);   // history logs the same one
    } finally {
      console.log = original;
    }
    expect(await run(app.handle.state)).toEqual({ path: "/a", n: 0 });
    expect(w.log).toEqual(["commit navigate /a"]);                                      // no commit, no command body
    expect(w.writes).toEqual(writes);                                                    // no history write
    expect(mount.ops).toEqual(opsBefore);                                                // no presentation
    await history.close();
    await mount.close();
  });
});
