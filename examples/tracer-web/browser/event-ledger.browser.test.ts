// Stage 40: the event-exit ledger (`Mounted.dispatched` / `settled`) in the one case Stage 39 made possible: the mount closes while its admitted click
// command is still pending in the application; the command exits later. Real Chromium, real PORT target, independent mount, existing public surface only.
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

const ids = ["gate"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isFailType(exit.cause) ? `failed ${JSON.stringify(exit.cause.error)}` : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : "other";
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);

const setup = async (outcome: "commit" | "fail") => {
  const gate = Effect.runSync(Deferred.make<string>());
  const entered = Effect.runSync(Deferred.make<void>());
  const initial: State = { items: ids.map((id) => ({ id, name: id })), value: "init" };
  const app = Valance.define({
    name: "event-ledger",
    state: { schema: State, initial },
    views: { home: { program: catalog.home, scope: (state: State) => ({ title: "Ledger", count: state.items.length, summary: state.value, firstId: "", items: state.items.map(({ id, name }) => ({ id, name })) }) } },
    view: () => "home" as const,
    commands: (state: Nexus.State.StateHandle<State>) => ({
      "home/open": Nexus.Mesh.bind(Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), () => Effect.gen(function* () {
        yield* Deferred.succeed(entered, undefined);
        const value = yield* Deferred.await(gate);

        if (outcome === "fail") { return yield* Effect.fail("late-boom") as Effect.Effect<never, string>; }

        yield* state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value }));
      })), (args) => ({ id: (args[0] !== undefined && "value" in args[0] ? args[0].value : "") as string })),
      "home/reverse": Nexus.Mesh.bind(Nexus.Command.define("t.reverse", Schema.Struct({}), () => Effect.void), () => ({})),
    }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
  });
  const appScope = await run(Scope.make());
  const mountScope = await run(Scope.make());
  const handle = (await run(Valance.start(app as never, { state: initial }).pipe(Scope.extend(appScope)))) as Valance.ApplicationHandle<State, never>;
  const root = document.createElement("main");

  document.body.append(root);
  const target: Valance.TargetFactory<WebPort> = (report) => Web.target({ container: root, primitives })(report);
  const mounted = (await run(Valance.mount(handle as never, target).pipe(Scope.extend(mountScope)))) as Valance.Mounted<never>;

  return {
    root, mounted, handle,
    click: () => userEvent.click(root.querySelector("div button")!),
    entered: () => run(Deferred.await(entered)),
    release: () => run(Deferred.succeed(gate, "late")),
    closeMount: () => run(Scope.close(mountScope, Exit.void)),
    closeApp: () => run(Scope.close(appScope, Exit.void)),
    state: () => run(handle.state),
  };
};

describe("the event-exit ledger when the mount closes before its command exits", () => {
  it("the exit arrives in the CLOSED mount's ledger; `settled` on the closed mount does not wait for it; the ledger is the only place a failure is recorded", async () => {
    const s = await setup("fail");

    try {
      await s.click();
      await s.entered();
      await s.closeMount();                                                       // target and follower gone; the mount is closed
      expect(s.root.innerHTML).toBe("");
      expect(s.mounted.dispatched).toEqual([]);                                   // nothing has exited yet

      await run(s.mounted.settled);                                               // returns at once: the closed mount holds no dispatches to await
      expect(s.mounted.dispatched).toEqual([]);                                   // ... it did NOT wait for the still-running command

      await s.release();                                                          // the command, now owned by the application alone, fails
      await expect.poll(() => s.mounted.dispatched.length).toBe(1);               // the closed mount's ledger receives the late exit
      expect(s.mounted.dispatched.map(show)).toEqual(['failed "late-boom"']);
      expect((await s.state()).value).toBe("init");                               // the failure is visible NOWHERE else: not state, not any render
      expect(show(await run(s.mounted.followed) as never)).toBe("interrupted");   // the follower ended with the mount's Scope

      await s.closeApp();                                                         // the application closes with nothing pending
      expect(s.mounted.dispatched.map(show)).toEqual(['failed "late-boom"']);    // the ledger is unchanged by it: it lives as long as someone holds `Mounted`
    } finally {
      root(s);
    }
  });

  it("an exit that only the application's drain produces is recorded too, and was already there when the application's Scope.close returned (observed over 17 runs; not a documented guarantee)", async () => {
    const s = await setup("commit");

    try {
      await s.click();
      await s.entered();
      await s.closeMount();                                                       // closed mount, command still pending
      await s.closeApp();                                                         // the registry interrupts it and awaits its exit

      expect(s.mounted.dispatched.map(show)).toEqual(["interrupted"]);           // read with no waiting
      await run(s.mounted.settled);                                               // still returns at once
    } finally {
      root(s);
    }
  });
});

const root = (s: { readonly root: Element }) => { s.root.remove(); };
