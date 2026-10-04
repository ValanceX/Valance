// Tracer: can a resource WITH A FINALIZER live for the application's lifetime when it is acquired by a command (startup or ordinary)?
// Nothing under src/ or packages/ is involved: the bridge is built from what exists. The PLATFORM (a scoped layer, built into the application's runtime scope,
// released last: NEXUS C15/I31) owns a Scope and offers commands `own(effect)`: run a scoped acquisition INTO that Scope. The raw Scope is never handed out.
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Deferred, Effect, Exit, Layer, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";

/** What a command may do with the application's lifetime: acquire into it. It cannot close it, read it, or outlive it. */
interface Owner { readonly own: <A, E, R>(acquire: Effect.Effect<A, E, R | Scope.Scope>) => Effect.Effect<A, E, Exclude<R, Scope.Scope>> }
const Owner = Nexus.Capability.define<Owner>("example/application-owner");

const platform = (log: Array<string>): Nexus.Application.Platform => Layer.scoped(Nexus.Capability.Environment, Effect.gen(function* () {
  const scope = yield* Scope.make();

  yield* Effect.addFinalizer(() => Effect.zipRight(Effect.sync(() => { log.push("owner scope closing"); }), Scope.close(scope, Exit.void)));
  const owner: Owner = { own: (acquire) => Scope.extend(acquire, scope) as never };

  return { resolutions: new Map([[Owner.id, { _tag: "Available" as const, implementation: owner }]]) };
}));

const State = Schema.Struct({ opened: Schema.Array(Schema.String) });
type State = typeof State.Type;

const world = (options: { readonly start?: string; readonly gated?: ReadonlyArray<string>; readonly interruptible?: boolean } = {}) => {
  const log: Array<string> = [];
  const gates = new Map<string, Deferred.Deferred<void>>((options.gated ?? []).map((name) => [name, Effect.runSync(Deferred.make<void>())]));
  const live = new Map<string, { readonly alive: () => boolean }>();
  const resource = (name: string) => Effect.acquireRelease(
    Effect.suspend(() => {
      const gate = gates.get(name);

      log.push(`acquiring ${name}`);

      return (gate === undefined ? Effect.void : (options.interruptible === true ? Effect.interruptible : <A, E>(e: Effect.Effect<A, E>) => e)(Deferred.await(gate)).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push(`acquire ${name} interrupted`); })))).pipe(Effect.as(name));
    }).pipe(Effect.tap(() => Effect.sync(() => { log.push(`acquire ${name}`); }))),
    () => Effect.sync(() => { log.push(`release ${name}`); live.delete(name); })
  ).pipe(Effect.tap(() => Effect.sync(() => { live.set(name, { alive: () => live.has(name) }); })));

  const definition = Valance.define({
    name: "scoped-capability",
    state: { schema: State, initial: { opened: [] } satisfies State },
    views: { only: { program: titleProgram, scope: (s: State) => ({ title: s.opened.join() }) } },
    view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const open = (name: string) => Nexus.Command.define(`open.${name}`, Schema.Struct({}), () => Effect.gen(function* () {
        const owner = yield* Nexus.Capability.require(Owner);

        yield* owner.own(resource(name));                                                // acquired INTO the application's lifetime; the command's own scope is not involved
        yield* state.update((c): Effect.Effect<State> => Effect.succeed({ opened: [...c.opened, name] }));
      }));

      return Object.fromEntries(["main", "late", "a", "b", "slow"].map((n) => [`app/open${n[0]!.toUpperCase()}${n.slice(1)}`, Valance.entry(open(n))]));
    },
    ...(options.start === undefined ? {} : { start: options.start }),
  });

  return { log, gates, live, definition };
};

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) { throw new Error("timed out"); }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const boot = async (options: { readonly start?: string; readonly gated?: ReadonlyArray<string>; readonly interruptible?: boolean } = {}) => {
  const w = world(options);
  const scope = await Effect.runPromise(Scope.make());

  await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { w.log.push("platform released"); })));                 // registered first: runs LAST
  const handle = await Effect.runPromise(Valance.start(w.definition, { platform: platform(w.log) }).pipe(Scope.extend(scope)));

  return { ...w, handle, close: () => Effect.runPromise(Scope.close(scope, Exit.void)), state: () => Effect.runPromise(handle.state) };
};

describe("an application-lifetime resource, acquired by a command through a platform-owned scope", () => {
  it("1 (critical): STARTUP work acquires it; the command completes; the resource stays alive; application close releases it, after the owner scope closes", async () => {
    const b = await boot({ start: "app/openMain" });

    await wait(() => b.log.includes("acquire main"));
    await expect.poll(async () => (await b.state()).opened.join()).toBe("main");      // the command has completed (its commit is after the acquisition)
    expect(b.log).toEqual(["acquiring main", "acquire main"]);                                           // NOT released when the command ended
    expect(b.live.get("main")?.alive()).toBe(true);

    await b.close();
    expect(b.log).toEqual(["acquiring main", "acquire main", "owner scope closing", "release main", "platform released"]);   // released once, as part of the application's end, before the host's own finalizers
    expect(b.live.has("main")).toBe(false);
  });

  it("2: an ORDINARY command after start does the same: ownership 'transfers' because the acquisition never belonged to the command", async () => {
    const b = await boot();

    await Effect.runPromise(b.handle.invoke("app/openLate", []));
    expect(b.log).toEqual(["acquiring late", "acquire late"]);
    expect(b.live.get("late")?.alive()).toBe(true);
    await b.close();
    expect(b.log.filter((e) => e.includes("late"))).toEqual(["acquiring late", "acquire late", "release late"]);
  });

  it("3a: cancellation DURING acquisition: an acquire that restores interruptibility is interrupted by VALANCE's drain, before the owner scope closes; nothing is ever held, a late gate does nothing", async () => {
    const b = await boot({ start: "app/openSlow", gated: ["slow"], interruptible: true });

    await wait(() => b.log.includes("acquiring slow"));
    await b.close();
    await Effect.runPromise(Deferred.succeed(b.gates.get("slow")!, undefined));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(b.log).toEqual(["acquiring slow", "acquire slow interrupted", "owner scope closing", "platform released"]);   // no "acquire slow", no "release slow"
    expect(b.live.size).toBe(0);
    expect((await b.state()).opened).toEqual([]);
  });

  it("3b: the DEFAULT acquire is uninterruptible (Effect's acquireRelease): application close waits for it (the documented C23 liveness limitation, reached by this route), then still releases it: no leak", async () => {
    const b = await boot({ start: "app/openSlow", gated: ["slow"] });

    await wait(() => b.log.includes("acquiring slow"));
    let closed = false;
    const closing = b.close().then(() => { closed = true; });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(false);                                                         // held open by the uninterruptible acquisition
    expect(b.log).toEqual(["acquiring slow"]);
    await Effect.runPromise(Deferred.succeed(b.gates.get("slow")!, undefined));
    await closing;

    expect(b.log).toEqual(["acquiring slow", "acquire slow", "owner scope closing", "release slow", "platform released"]);   // acquired, owned by the application, released with it
    expect(b.live.size).toBe(0);
  });

  it("4: two owned resources have independent entries and are each finalized exactly once, in reverse acquisition order", async () => {
    const b = await boot();

    await Effect.runPromise(b.handle.invoke("app/openA", []));
    await Effect.runPromise(b.handle.invoke("app/openB", []));
    expect(b.log).toEqual(["acquiring a", "acquire a", "acquiring b", "acquire b"]);
    await b.close();
    expect(b.log).toEqual(["acquiring a", "acquire a", "acquiring b", "acquire b", "owner scope closing", "release b", "release a", "platform released"]);
  });
});
