// The mount's dispatch bookkeeping through every outcome of an event command: `Mounted.dispatched` (the exit ledger), the mount's held dispatches (`pending`, observable only
// through `Mounted.settled`), and the application's commits are three different things.
//   ledger     one entry per dispatch, in settle order, appended when the dispatch settles: success, the command's typed failure, its defect (not converted), interruption
//   settled    a barrier over the dispatches the OPEN mount holds; it resolves when they have all exited, whatever their outcome; held dispatches are released by `settled` or by the close
//   commits    only what the command actually committed; a failed, died or interrupted command commits nothing
//   close      the mount's close releases ITS bookkeeping (settled on a closed mount returns at once); the admitted command continues as the application's (C25) and its exit
//              still reaches the ledger; nothing is presented through the closed mount. A `settled` already waiting keeps waiting for the dispatches it had captured.
//   inert      an inert mount keeps its last good render FOR EVENTS (C31): an event on it dispatches, commits, and is recorded and covered like any other
import type { WebPort } from "@valancex/port-web";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Deferred, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";
import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const programs = await compilePrograms();
const ids = ["ok", "typed", "die", "interrupt", "gate1", "gate2", "break"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const show = (exit: Exit.Exit<unknown, unknown> | "HUNG"): string => exit === "HUNG" ? "HUNG" : Exit.isSuccess(exit) ? "succeeded" : Cause.isFailType(exit.cause) ? `failed ${JSON.stringify(exit.cause.error)}` : Cause.isDieType(exit.cause) ? `died ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const bounded = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect.pipe(Effect.exit, Effect.timeoutTo({ duration: "250 millis", onSuccess: (e) => e as Exit.Exit<unknown, unknown> | "HUNG", onTimeout: () => "HUNG" as const })));

const boot = async () => {
  const log: Array<string> = [];
  const gates = { gate1: Effect.runSync(Deferred.make<string>()), gate2: Effect.runSync(Deferred.make<string>()) };
  const initial: State = { items: ids.map((id) => ({ id, name: id })), value: "init" };
  const app = Valance.define({
    name: "dispatch", state: { schema: State, initial },
    views: { home: { program: programs.home, scope: (s: State) => ({ title: s.value === "bad" ? (42 as never) : "T", count: s.items.length, summary: s.value, firstId: "", items: s.items.map(({ id, name }) => ({ id, name })) }) } }, view: () => "home" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const commit = (value: string) => Effect.zipRight(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, value })), Effect.sync(() => { log.push(`commit ${value}`); }));
      const gated = (name: "gate1" | "gate2") => Effect.zipRight(Effect.sync(() => { log.push(`${name} started`); }), Effect.flatMap(Deferred.await(gates[name]).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push(`${name} interrupted`); }))), (v) => commit(`${name}:${v}`)));
      const behavior = (id: string): Effect.Effect<void, string> => id === "ok" ? commit("ok") : id === "typed" ? Effect.fail("typed-boom") : id === "die" ? Effect.die(new Error("defect-boom")) : id === "interrupt" ? Effect.interrupt : id === "break" ? commit("bad") : id === "gate1" || id === "gate2" ? gated(id) : Effect.die(new Error("unknown"));
      return { "home/open": Nexus.Mesh.bind(Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), ({ id }) => behavior(id)), (args) => ({ id: (args[0] as { value: unknown }).value })) } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });
  const appScope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app, { state: initial }).pipe(Scope.extend(appScope)));
  const mountOn = async () => {
    const page = load("");
    const ops: Array<string> = [];
    const target: Valance.TargetFactory<WebPort> = (report) => { const port = Web.target({ container: page.container, primitives })(report); return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } }; };
    const scope = await Effect.runPromise(Scope.make());
    const mounted = await Effect.runPromise(Valance.mount(handle, target).pipe(Scope.extend(scope)));
    return { page, ops, scope, mounted, click: (id: string) => page.click(page.container.querySelectorAll("div")[ids.indexOf(id as never)]!.querySelector("button")!), ledger: () => mounted.dispatched.map(show), close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
  };
  return { log, gates, handle, appScope, mountOn, state: () => Effect.runPromise(handle.state), release: (name: "gate1" | "gate2", v = "v") => Effect.runSync(Deferred.succeed(gates[name], v)) };
};


describe("event dispatch bookkeeping", () => {
  it("a successful command: pending while in flight (ledger empty, settled waiting), then committed, recorded as succeeded, settled complete", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.click("gate1");
    await until(() => b.log.includes("gate1 started"));
    expect(m.ledger()).toEqual([]);
    expect(show(await bounded(m.mounted.settled))).toBe("HUNG");                           // the barrier waits for the held dispatch
    b.release("gate1");
    await until(() => b.log.includes("commit gate1:v"));
    expect(show(await bounded(m.mounted.settled))).toBe("succeeded");
    expect(m.ledger()).toEqual(["succeeded"]);
    expect((await b.state()).value).toBe("gate1:v");
    await m.close();
  });

  it("typed failure, defect and interruption each settle the dispatch, are recorded as themselves (a defect is not converted), release settled, and commit nothing", async () => {
    for (const [id, recorded] of [["typed", 'failed "typed-boom"'], ["die", "died defect-boom"], ["interrupt", "interrupted"]] as const) {
      const b = await boot();
      const m = await b.mountOn();

      m.click(id);
      await sleep(40);
      expect(m.ledger()).toEqual([recorded]);
      expect(show(await bounded(m.mounted.settled))).toBe("succeeded");
      expect((await b.state()).value).toBe("init");                                        // no phantom commit
      expect(b.log).toEqual([]);
      await m.close();
    }
  });

  it("an admitted command interrupted by the application's drain is recorded as interrupted, commits nothing, and does not leave settled waiting", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.click("gate1");
    await until(() => b.log.includes("gate1 started"));
    await Effect.runPromise(Scope.close(b.appScope, Exit.void));
    await sleep(40);
    expect(b.log).toEqual(["gate1 started", "gate1 interrupted"]);
    expect(m.ledger()).toEqual(["interrupted"]);
    expect(show(await bounded(m.mounted.settled))).toBe("succeeded");
    expect((await b.state()).value).toBe("init");
    await m.close();
  });

  it("the mount closes with a dispatch in flight: its bookkeeping ends at the close (settled returns at once), the command continues as the application's, commits, reaches the ledger, and presents nothing through the closed mount", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.click("gate1");
    await until(() => b.log.includes("gate1 started"));
    await m.close();
    expect(m.ledger()).toEqual([]);                                                        // not settled yet: it belongs to the application now
    expect(show(await bounded(m.mounted.settled))).toBe("succeeded");                      // the closed mount holds no dispatches (C26)
    b.release("gate1");
    await until(() => b.log.includes("commit gate1:v"));
    await sleep(30);
    expect(m.ledger()).toEqual(["succeeded"]);                                             // the exit still arrives
    expect(m.ops).toEqual(["draw", "unmount"]);                                            // no presentation after the unmount
    expect((await b.state()).value).toBe("gate1:v");
    await Effect.runPromise(Scope.close(b.appScope, Exit.void));
  });

  it("two dispatches in flight settle independently, in the order they finish (not admission order); settled waits for the last and the ledger has both", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.click("gate1");
    m.click("gate2");
    await until(() => b.log.includes("gate1 started") && b.log.includes("gate2 started"));
    b.release("gate2", "second");
    await until(() => b.log.includes("commit gate2:second"));
    await sleep(20);
    expect(m.ledger()).toEqual(["succeeded"]);                                             // the second-admitted finished first and is recorded alone
    expect(show(await bounded(m.mounted.settled))).toBe("HUNG");                           // settled still waits for the other
    b.release("gate1", "first");
    expect(show(await bounded(m.mounted.settled))).toBe("succeeded");
    expect(m.ledger()).toEqual(["succeeded", "succeeded"]);
    expect(b.log.filter((entry) => entry.startsWith("commit"))).toEqual(["commit gate2:second", "commit gate1:first"]);
    await m.close();
  });

  it("an inert mount keeps its last good render for events (C31): a later event dispatches against it, commits, is recorded and covered by settled; nothing is presented", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.click("break");                                                                      // commits a state whose render is invalid: the follower ends
    await sleep(60);
    expect(show(await Effect.runPromise(Effect.race(Effect.map(m.mounted.followed, (e) => e as Exit.Exit<unknown, unknown>), Effect.succeed("HUNG" as const))))).toMatch(/^failed .*MeshDiagnostics/);
    m.click("ok");                                                                         // an event on the inert target
    await sleep(60);
    expect(m.ledger()).toEqual(["succeeded", "succeeded"]);                                // nothing leaked, nothing refused
    expect(show(await bounded(m.mounted.settled))).toBe("succeeded");
    expect((await b.state()).value).toBe("ok");                                            // the command is the application's and committed
    expect(m.ops).toEqual(["draw"]);                                                       // no presentation through the inert mount
    await m.close();
  });

  it("a settled already waiting when the mount closes keeps waiting for the dispatches it had captured, and ends when they exit", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.click("gate1");
    await until(() => b.log.includes("gate1 started"));
    const waiting = Effect.runPromise(Effect.exit(m.mounted.settled)).then((exit) => show(exit));

    await sleep(30);
    await m.close();
    expect(await Promise.race([waiting, sleep(200).then(() => "still waiting")])).toBe("still waiting");
    b.release("gate1");
    expect(await Promise.race([waiting, sleep(500).then(() => "hung")])).toBe("succeeded");
    await Effect.runPromise(Scope.close(b.appScope, Exit.void));
  });
});
