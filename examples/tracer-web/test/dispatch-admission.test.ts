// Stage 42 — where an interaction becomes the application's. Four moments, kept apart:
//   report      the mount reads its retained render and starts the dispatch (synchronously, in the target's callback)
//   admission   the dispatch's own fiber registers itself with the application as its FIRST step, in the same synchronous run as the report; only then does MESH resolve the handler
//               (inside the admitted fiber) and the bound command start. A refusal (the application closed or draining) is therefore decided before MESH looks at the handler
//   execution   the command starts and reads state;      completion   its exit lands in the mount's `dispatched` (settle order)
// Lifecycle after admission is the application's (C20, C26, C33); a mount closing is not an admission boundary.
import { Cause, Effect, Exit, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { boot, sleep } from "./structure-fixture.js";
import { until } from "./helpers.js";

const settle = () => sleep(40);
const three = { view: "a", show: false, ids: ["A1", "A2", "A3"], n: 0, tag: "a" } as const;
const one = { view: "a", show: false, ids: ["A1"], n: 0, tag: "a" } as const;
const press = (m: { readonly page: { click: (e: Element) => unknown }; readonly rowEls: () => ReadonlyArray<Element> }, row = 0) => { m.page.click(m.rowEls()[row]!.querySelector("button")!); };
const hold = (promises: Map<string, Promise<void>>, id: string) => { let release!: () => void; promises.set(id, new Promise<void>((resolve) => { release = resolve; })); return release; };
const shape = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "success" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isDieType(exit.cause) ? `died ${(exit.cause.defect as Error).message}` : Cause.isFailType(exit.cause) ? `failed ${(exit.cause.error as { _tag?: string })._tag}` : "other";
const closeOf = (b: { readonly appScope: Scope.CloseableScope }) => () => Effect.runPromise(Scope.close(b.appScope, Exit.void));

describe("report, admission, execution, completion", () => {
  it("A. admission is part of the report, not of the command's start: an interaction reported in the same step the application starts closing is admitted, then interrupted before it ever executed; one reported after is refused", async () => {
    const b = await boot(one);
    const m = await b.mountOn();

    press(m);
    const closing = closeOf(b)();                                         // same synchronous step as the report
    await closing;
    await until(() => m.mounted.dispatched.length === 1);
    expect(shape(m.mounted.dispatched[0]!)).toBe("interrupted");        // admitted (not refused), and the drain interrupted it
    expect(b.started).toEqual([]);                                       // MESH had not even handed it to the command
    press(m);                                                            // after the close
    await until(() => m.mounted.dispatched.length === 2);
    expect(shape(m.mounted.dispatched[1]!)).toMatch(/^died .*terminating/);
    expect(b.taps).toEqual([]);
    await m.close();
  });

  it("A'. mount closure is not an admission boundary: an interaction reported in the step the mount's Scope closes is still admitted and completes", async () => {
    const b = await boot(one);
    const m = await b.mountOn();

    press(m);
    const closing = m.close();

    await closing;
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["aA1"]);
    await until(() => m.mounted.dispatched.length === 1);
    expect(shape(m.mounted.dispatched[0]!)).toBe("success");
  });

  it("B. an admitted, held command and the mount closing: `settled` waits while the mount is open and returns at once once it is closed; the command completes and its exit still arrives", async () => {
    const b = await boot(one);
    const m = await b.mountOn();
    const release = hold(b.gate.byId, "aA1");

    press(m);
    await settle();
    expect(b.started).toEqual(["aA1"]);
    const settled = Effect.runPromise(m.mounted.settled).then(() => "settled");

    expect(await Promise.race([settled, sleep(60).then(() => "pending")])).toBe("pending");
    await m.close();
    expect(await Promise.race([Effect.runPromise(m.mounted.settled).then(() => "settled"), sleep(200).then(() => "pending")])).toBe("settled");   // a closed mount holds nothing
    release();
    await until(() => b.taps.length === 1);
    await until(() => m.mounted.dispatched.length === 1);
    expect(shape(m.mounted.dispatched[0]!)).toBe("success");
    await settled;
  });

  it("C. several interactions from one retained render keep their own arguments; completion and commit follow the release order, not the report order (admission order is not observable beyond that)", async () => {
    const b = await boot(three);
    const m = await b.mountOn();

    b.gate.commit = true;
    const releases = ["aA1", "aA2", "aA3"].map((id) => hold(b.gate.byId, id));

    press(m, 0);
    press(m, 1);
    press(m, 2);
    await settle();
    expect([...b.started].sort()).toEqual(["aA1", "aA2", "aA3"]);        // all three admitted and executing; the order they started in is not asserted
    expect(b.taps).toEqual([]);
    releases[2]!();
    await until(() => b.taps.length === 1);
    releases[0]!();
    await until(() => b.taps.length === 2);
    releases[1]!();
    await until(() => b.taps.length === 3);
    expect(b.taps).toEqual(["aA3", "aA1", "aA2"]);                      // completion order = release order
    expect((await b.state()).note).toBe("aA3aA1aA2");                   // commit order likewise: each command's own progress
    expect(m.mounted.dispatched.map(shape)).toEqual(["success", "success", "success"]);
    await m.close();
  });

  it("D. interactions from two mounts keep their own mounts' arguments, and run in the order the application lets them, not mount order or report order", async () => {
    const b = await boot(one);
    let fails = false;
    const stuck = await b.mountOn({ updateThrows: () => fails ? "after" : undefined });
    const moves = await b.mountOn();

    fails = true;
    await b.invoke("app/tag", "b");
    await settle();
    const r1 = hold(b.gate.byId, "aA1");                                 // stuck's retained render: tag a
    const r2 = hold(b.gate.byId, "bA1");                                 // moves': tag b
    b.gate.commit = true;
    press(stuck);
    press(moves);
    await settle();
    r2();
    await until(() => b.taps.length === 1);
    r1();
    await until(() => b.taps.length === 2);
    expect(b.taps).toEqual(["bA1", "aA1"]);
    expect((await b.state()).note).toBe("bA1aA1");
    await stuck.close();
    await moves.close();
  });
});

describe("closing the application", () => {
  it("E. during the drain an interaction is refused at admission; the admitted uninterruptible command commits before Scope.close resolves; nothing commits after it", async () => {
    const b = await boot(one);
    const m = await b.mountOn();
    const release = hold(b.gate.byId, "aA1");

    b.gate.uninterruptible = true;
    b.gate.commit = true;
    press(m);
    await settle();
    let closed = false;
    const closing = closeOf(b)().then(() => { closed = true; });

    await settle();
    expect(closed).toBe(false);                                          // the drain waits for the uninterruptible command
    press(m);                                                            // a second interaction during the drain
    await until(() => m.mounted.dispatched.length === 1);
    expect(shape(m.mounted.dispatched[0]!)).toBe("died VALANCE: admission is closed (draining)");
    expect(b.started).toEqual(["aA1"]);                                  // it never reached the command
    release();
    await closing;
    expect(b.taps).toEqual(["aA1"]);
    expect((await b.state()).note).toBe("aA1");                          // committed before the close resolved
    expect(shape(m.mounted.dispatched[1]!)).toBe("interrupted");         // its caller still sees Interrupted (C33), so the ledger is not the record of the commit
    press(m);                                                            // after the close
    await until(() => m.mounted.dispatched.length === 3);
    expect(shape(m.mounted.dispatched[2]!)).toMatch(/^died .*terminating/);
    await sleep(60);
    expect((await b.state()).note).toBe("aA1");                          // nothing after
    expect(b.taps).toEqual(["aA1"]);
    await m.close();
  });

  it("F. an unmapped command: typed UnmappedCommand while the application is open, but once admission is closed the refusal wins (admission precedes MESH's resolution), unlike `invoke` with an unknown key, which stays typed", async () => {
    const b = await boot(one, { omit: ["va/tap"] });
    const m = await b.mountOn();

    press(m);
    await until(() => m.mounted.dispatched.length === 1);
    expect(shape(m.mounted.dispatched[0]!)).toBe("failed UnmappedCommand");
    await closeOf(b)();
    press(m);
    await until(() => m.mounted.dispatched.length === 2);
    expect(shape(m.mounted.dispatched[1]!)).toMatch(/^died .*terminating/);
    const invoked = await Effect.runPromise(Effect.exit(b.rawInvoke("app/nothing")));

    expect(shape(invoked)).toBe("failed UnmappedCommand");               // the key is looked up before admission
    await m.close();
  });

  for (const uninterruptible of [false, true]) {
    it(`G. report → presentation → application close (${uninterruptible ? "uninterruptible" : "interruptible"} command): the presentation never alters the reported interaction; lifecycle alone decides whether it runs`, async () => {
      const b = await boot(one);
      const m = await b.mountOn();
      const release = hold(b.gate.byId, "aA1");

      b.gate.uninterruptible = uninterruptible;
      b.gate.commit = true;
      press(m);
      await settle();
      await b.invoke("app/tag", "b");                                    // presented: the retained render is now B(b)
      await settle();
      expect(m.ops).toEqual(["draw", "update"]);
      const closing = closeOf(b)();

      await settle();
      release();
      await closing;
      await until(() => m.mounted.dispatched.length === 1);

      if (uninterruptible) {
        expect(shape(m.mounted.dispatched[0]!)).toBe("interrupted");     // C33: the caller sees Interrupted; the state is the record of whether it committed
        expect(b.taps).toEqual(["aA1"]);                                 // the reported render's argument, not B's "bA1"
        expect(b.seen[0]!.tag).toBe("b");                                // the state it ran against
        expect((await b.state()).note).toBe("aA1");
      } else {
        expect(shape(m.mounted.dispatched[0]!)).toBe("interrupted");
        expect(b.taps).toEqual([]);
        expect((await b.state()).note).toBeUndefined();
      }
      await m.close();
    });
  }
});
