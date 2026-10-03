// Stage 43 — what concurrently admitted commands can observe. VALANCE adds no queue, lock, transaction or staleness check: admitted commands run concurrently (each in its own fiber),
// each reads the state it finds when IT reads, and NEXUS's `State.update` is the one atomic read-modify-write (SubscriptionRef.updateAndGetEffect); a separate `get` then a write that
// ignores the current value is the command's own read-then-write and can lose an update. Commands are application-owned writers; VALANCE neither inspects nor merges their updates.
//   `app/work(id, kind)`: start → [gate read:id] → read → [gate commit:id] → commit (`rmw`: update(c => count+1); `stale`: update(() => count read + 1)) → [gate exit:id] → end
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Cause, Effect, Exit, Fiber, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { compilePrograms } from "../src/catalog/compile.js";
import { runningOf } from "@valancex/valance/internal";
import { Stream } from "effect";
import { boot, sleep } from "./structure-fixture.js";
import { until as untilTrue } from "./helpers.js";

const programs = await compilePrograms();
const State = Schema.Struct({ count: Schema.Number, log: Schema.Array(Schema.String) });
type State = Schema.Schema.Type<typeof State>;

const world = async () => {
  const events: Array<string> = [];
  const reads: Record<string, number> = {};
  const gates = new Map<string, { readonly promise: Promise<void>; readonly open: () => void }>();
  const gate = (name: string) => {
    if (!gates.has(name)) { let open!: () => void; gates.set(name, { promise: new Promise<void>((resolve) => { open = resolve; }), open }); }

    return gates.get(name)!;
  };
  const wait = (name: string) => Effect.promise(() => gate(name).promise);
  const app = Valance.define({
    name: "concurrency", state: { schema: State, initial: { count: 0, log: [] } },
    views: { only: { program: programs.notfound, scope: (s: State) => ({ title: `c${s.count}` }) } }, view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const work = Nexus.Mesh.bind(Nexus.Command.define("s.work", Schema.Struct({ id: Schema.String, kind: Schema.String }), ({ id, kind }) => {
        const body = Effect.gen(function* () {
          events.push(`start ${id}`);
          yield* wait(`read:${id}`);
          const seen = yield* state.get;

          reads[id] = seen.count;
          events.push(`read ${id}`);
          yield* wait(`commit:${id}`);
          yield* state.update((c): Effect.Effect<State> => Effect.succeed(kind === "stale" ? { count: seen.count + 1, log: [...seen.log, id] } : { count: c.count + 1, log: [...c.log, id] }));
          events.push(`commit ${id}`);
          yield* wait(`exit:${id}`);
          events.push(`end ${id}`);
        });

        return kind === "uninterruptible" ? Effect.uninterruptible(body) : body;
      }), (args) => ({ id: "value" in args[0]! ? args[0].value : "", kind: "value" in args[1]! ? args[1].value : "rmw" }));
      const inc = Nexus.Mesh.bind(Nexus.Command.define("s.inc", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, count: c.count + 1 })))), () => ({}));

      return { "app/work": work, "app/inc": inc } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });
  const appScope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(appScope)));
  const admit = (id: string, kind = "rmw") => Effect.runFork(Effect.exit(handle.invoke("app/work", [{ value: id }, { value: kind }] as never)));
  const state = () => Effect.runPromise(handle.state);
  const until = async (done: () => boolean) => { for (let i = 0; !done(); i += 1) { if (i > 300) { throw new Error(`timed out; events ${JSON.stringify(events)}`); } await sleep(5); } };
  const exitOf = async (fiber: Fiber.RuntimeFiber<Exit.Exit<unknown, unknown>>): Promise<string> => { const e = await Effect.runPromise(Fiber.join(fiber)); return Exit.isSuccess(e) ? "success" : Cause.isInterruptedOnly(e.cause) ? "interrupted" : "other"; };

  return { events, reads, gate, admit, state, until, exitOf, appScope, handle, close: () => Effect.runPromise(Scope.close(appScope, Exit.void)) };
};
const go = (w: Awaited<ReturnType<typeof world>>, id: string, ...steps: ReadonlyArray<"read" | "commit" | "exit">) => { for (const step of steps) { w.gate(`${step}:${id}`).open(); } };

describe("admitted commands run concurrently, over one atomic state primitive", () => {
  it("A. two admitted commands overlap: both start before either reads; read, commit and exit follow each command's own release, not admission order", async () => {
    const w = await world();
    const a = w.admit("A");
    const b = w.admit("B");

    await w.until(() => w.events.length === 2);
    expect([...w.events].sort()).toEqual(["start A", "start B"]);       // both executing: no queue between them
    go(w, "B", "read");
    await w.until(() => w.events.includes("read B"));
    go(w, "A", "read");
    await w.until(() => w.events.includes("read A"));
    go(w, "B", "commit");
    await w.until(() => w.events.includes("commit B"));
    go(w, "A", "commit");
    await w.until(() => w.events.includes("commit A"));
    go(w, "B", "exit");
    await w.until(() => w.events.includes("end B"));
    go(w, "A", "exit");
    expect([await w.exitOf(a), await w.exitOf(b)]).toEqual(["success", "success"]);
    expect(w.events.filter((e) => !e.startsWith("start"))).toEqual(["read B", "read A", "commit B", "commit A", "end B", "end A"]);
    expect((await w.state()).log).toEqual(["B", "A"]);                  // commit order = the order they reached the state primitive
    await w.close();
  });

  it("B. a commit is visible to a command that reads afterwards, whether or not the committing command has exited", async () => {
    const w = await world();
    const a = w.admit("A");
    const b = w.admit("B");

    await w.until(() => w.events.length === 2);
    go(w, "A", "read", "commit");                                        // A commits, and is then held before it returns
    await w.until(() => w.events.includes("commit A"));
    expect(w.events).not.toContain("end A");                             // committed, not completed
    expect(w.events.includes("end A")).toBe(false);
    go(w, "B", "read");
    await w.until(() => w.events.includes("read B"));
    expect(w.reads["B"]).toBe(1);                                        // B sees A's commit although A has not exited
    expect((await w.state()).log).toEqual(["A"]);
    go(w, "A", "exit");
    go(w, "B", "commit", "exit");
    expect([await w.exitOf(a), await w.exitOf(b)]).toEqual(["success", "success"]);
    expect((await w.state()).log).toEqual(["A", "B"]);
    await w.close();
  });

  it("C/D. two commands that both read before either commits see the same prior state: an atomic `update` keeps both writes, a read-then-write that ignores the current value loses one", async () => {
    for (const [kind, count] of [["rmw", 2], ["stale", 1]] as const) {
      const w = await world();
      const a = w.admit("A", kind);
      const b = w.admit("B", kind);

      await w.until(() => w.events.length === 2);
      go(w, "A", "read");
      go(w, "B", "read");
      await w.until(() => w.events.filter((e) => e.startsWith("read")).length === 2);
      expect(w.reads).toEqual({ A: 0, B: 0 });                           // both observed the same state: no optimistic concurrency control
      go(w, "A", "commit", "exit");
      await w.until(() => w.events.includes("commit A"));
      go(w, "B", "commit", "exit");
      expect([await w.exitOf(a), await w.exitOf(b)]).toEqual(["success", "success"]);
      expect((await w.state()).count).toBe(count);                       // `rmw`: update(c => c + 1) is atomic; `stale`: B overwrote A with the state it had read
      await w.close();
    }
  });

  it("D'. many concurrent atomic updates all land", async () => {
    const w = await world();

    await Promise.all(Array.from({ length: 25 }, () => Effect.runPromise(w.handle.invoke("app/inc", []))));
    expect((await w.state()).count).toBe(25);
    await w.close();
  });

  it("G. application close with concurrent admitted commands: the one before state access is interrupted without committing, the one past its commit keeps it, the uninterruptible one commits before Scope.close resolves, and nothing commits afterwards", async () => {
    const w = await world();
    const a = w.admit("A");                                              // held before reading
    const b = w.admit("B");                                              // will commit, then be held before returning
    const c = w.admit("C", "uninterruptible");                           // held before reading, uninterruptible

    await w.until(() => w.events.length === 3);
    go(w, "B", "read", "commit");
    await w.until(() => w.events.includes("commit B"));
    let closed = false;
    const closing = w.close().then(() => { closed = true; });

    await sleep(60);
    expect(closed).toBe(false);                                          // the drain waits on the uninterruptible command
    expect(await w.exitOf(a)).toBe("interrupted");
    expect(await w.exitOf(b)).toBe("interrupted");                       // interrupted after its commit
    go(w, "C", "read", "commit", "exit");
    await closing;
    expect(await w.exitOf(c)).toBe("interrupted");                       // C's caller sees Interrupted although it committed (C33)
    const after = await w.state();

    expect(after.log).toEqual(["B", "C"]);                               // exactly the commits that happened, all before the close resolved
    go(w, "A", "read", "commit", "exit");
    go(w, "B", "exit");
    await sleep(60);
    expect(await w.state()).toEqual(after);                              // nothing commits after the close
    expect(w.events).not.toContain("read A");
  });

  it("E. commands from two mounts enter one application state: each keeps its own render-derived argument, and every commit reaches the shared state stream", async () => {
    const b = await boot({ view: "a", show: false, ids: ["A1"], n: 0, tag: "a" });
    let fails = false;
    const stuck = await b.mountOn({ updateThrows: () => fails ? "after" : undefined });
    const moves = await b.mountOn();
    const streamed: Array<string> = [];
    const watcher = Effect.runFork(Stream.runForEach(runningOf(b.handle).states, (s) => Effect.sync(() => { streamed.push(s.note ?? ""); })));

    fails = true;
    await b.invoke("app/tag", "b");
    await sleep(40);
    b.gate.commit = true;
    stuck.page.click(stuck.rowEls()[0]!.querySelector("button")!);       // retained tag a
    moves.page.click(moves.rowEls()[0]!.querySelector("button")!);       // retained tag b
    await untilTrue(() => b.taps.length === 2);
    expect([...b.taps].sort()).toEqual(["aA1", "bA1"]);
    expect([...((await b.state()).note ?? "").match(/[ab]A1/g) ?? []].sort()).toEqual(["aA1", "bA1"]);   // both writers, one state
    await untilTrue(() => streamed.some((n) => n.includes("aA1") && n.includes("bA1")));
    await Effect.runPromise(Fiber.interrupt(watcher));
    await stuck.close();
    await moves.close();
  });
});
