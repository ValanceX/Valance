// Stage 39: who ends an ADMITTED click command? (Decision: the application.) Real Chromium, real PORT web target, real clicks, one independent mount (its own Scope), one
// command held pending on a gate the test owns. Two experiments, each ending exactly one of the two lifetimes while the other stays open.
import type { WebPort } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Cause, Deferred, Effect, Exit, Schema, Scope } from "effect";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { primitives } from "../src/catalog/web.js";

const { catalog } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const ids = ["gate", "set"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);

/** An application with one command held pending on a gate (`gate`) and one that commits at once (`set`); a platform resource marks its release in the trace. */
const setup = async () => {
  const events: Array<string> = [];
  const gate = Effect.runSync(Deferred.make<string>());
  const entered = Effect.runSync(Deferred.make<void>());
  const initial: State = { items: ids.map((id) => ({ id, name: id })), value: "init" };
  const commit = (state: Nexus.State.StateHandle<State>, value: string) => Effect.asVoid(state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value })));
  const app = Valance.define({
    name: "event-lifetime",
    state: { schema: State, initial },
    views: { home: { program: catalog.home, scope: (state: State) => ({ title: "Lifetime", count: state.items.length, summary: state.value, firstId: "", items: state.items.map(({ id, name }) => ({ id, name })) }) } },
    view: () => "home" as const,
    commands: (state: Nexus.State.StateHandle<State>) => ({
      "home/open": Nexus.Mesh.bind(Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), ({ id }) => (id === "gate"
        ? Effect.gen(function* () {
          events.push("command entered");
          yield* Deferred.succeed(entered, undefined);
          const value = yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { events.push("command interrupted"); })));

          events.push("command resumed");
          yield* commit(state, value);
        })
        : commit(state, "set")).pipe(Effect.onExit((exit) => Effect.sync(() => { events.push(`command exit: ${show(exit)}`); })))),
      (args) => ({ id: (args[0] !== undefined && "value" in args[0] ? args[0].value : "") as string })),
      "home/reverse": Nexus.Mesh.bind(Nexus.Command.define("t.reverse", Schema.Struct({}), () => Effect.void), () => ({})),
    }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
  });
  const appScope = await run(Scope.make());

  await run(Scope.addFinalizer(appScope, Effect.sync(() => { events.push("platform resource released"); })));      // registered before start: runs after NEXUS terminates
  const handle = (await run(Valance.start(app as never, { state: initial }).pipe(Scope.extend(appScope)))) as Valance.ApplicationHandle<State, never>;
  const mountIn = async (name: string) => {
    const root = document.createElement("main");

    document.body.append(root);
    const scope = await run(Scope.make());
    const target: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container: root, primitives })(report);

      return { draw: (tree) => { port.draw(tree); }, update: (tree) => { port.update(tree); }, hydrate: (tree) => port.hydrate(tree), unmount: () => { port.unmount(); events.push(`${name} unmounted`); } };
    };
    const mounted = (await run(Valance.mount(handle as never, target).pipe(Scope.extend(scope)))) as Valance.Mounted<never>;
    const row = (id: string) => root.querySelectorAll("div")[ids.indexOf(id as never)]!.querySelector("button")!;

    return { root, scope, mounted, click: (id: string) => userEvent.click(row(id)), label: () => (root.querySelector("span")?.textContent ?? "").replace(/^\d+ items: /, ""), close: () => run(Scope.close(scope, Exit.void)) };
  };

  return { events, handle, appScope, mountIn, entered: () => run(Deferred.await(entered)), release: (value: string) => run(Deferred.succeed(gate, value)), closeApp: () => run(Scope.close(appScope, Exit.void)), state: () => run(handle.state) };
};

describe("an admitted click command, pending, in Chromium with an independent mount", () => {
  it("Experiment A: the MOUNT's Scope closes first, the application stays alive", async () => {
    const s = await setup();
    const a = await s.mountIn("A");

    await a.click("gate");
    await s.entered();
    await a.close();                                                                  // the mount ends; nothing touches the application's Scope
    await s.release("late");
    await expect.poll(() => s.events.includes("command exit: succeeded")).toBe(true);

    // OBSERVED (Stage 39, application-owned): the mount's end does not touch the command. It resumes when its gate opens, commits, and the exit lands in
    // the closed mount's ledger. (Before Stage 39 this was `command interrupted` by the mount's finalizer, no commit, no exit; see docs/FINDINGS.md.)
    expect(s.events).toEqual(["command entered", "A unmounted", "command resumed", "command exit: succeeded"]);
    expect((await s.state()).value).toBe("late");
    expect(a.mounted.dispatched.map(show)).toEqual(["succeeded"]);
    const b = await s.mountIn("B");                                                   // the application is fully usable: a new mount observes and modifies state

    expect(b.label()).toBe("late");                                                   // the new mount observes what the surviving command committed
    await b.click("set");
    await expect.poll(() => b.label()).toBe("set");
    await s.closeApp();
    await b.close();
    document.querySelectorAll("main").forEach((node) => node.remove());
  });

  it("Experiment B: the APPLICATION's Scope closes first, the mount stays open", async () => {
    const s = await setup();
    const a = await s.mountIn("A");

    await a.click("gate");
    await s.entered();
    await s.closeApp();                                                               // the application ends; the mount's Scope stays open
    await s.release("late");
    await expect.poll(() => a.mounted.dispatched.length).toBe(1);

    // OBSERVED: the command is interrupted by the application's registry, BEFORE the platform resource is released (nothing released under it); the
    // mount is still drawn and its follower ended Success; the exit is recorded in the live mount's ledger; state stays readable.
    expect(s.events).toEqual(["command entered", "command interrupted", "command exit: interrupted", "platform resource released"]);
    expect(a.label()).toBe("init");
    expect(show(await run(a.mounted.followed) as never)).toBe("succeeded");
    expect(a.mounted.dispatched.map(show)).toEqual(["interrupted"]);
    expect((await s.state()).value).toBe("init");
    await a.close();                                                                  // the mount's own Scope, afterwards: clean, exactly once
    expect(s.events.filter((event) => event === "A unmounted")).toHaveLength(1);
    expect(a.root.innerHTML).toBe("");
    document.querySelectorAll("main").forEach((node) => node.remove());
  });
});
