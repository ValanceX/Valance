// Shared by inert-dispatch.test.ts and shared-vs-local-failure.test.ts: a two-view application (A: notfound program, whose render fails while `bad`; B: details program),
// commands that tell the views apart (A's button repairs and adds 10, B's adds 100), and `mountOn` over a recording target whose update can throw or act.
import type { WebPort } from "@valancex/port-web";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Schema, Scope } from "effect";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { load } from "./helpers.js";

export const programs = await compilePrograms();
export const State = Schema.Struct({ view: Schema.Literal("a", "b"), n: Schema.Number, bad: Schema.Boolean });
export type State = Schema.Schema.Type<typeof State>;
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isDieType(exit.cause) ? `died ${(exit.cause.defect as Error).message}` : Cause.isFailType(exit.cause) ? "failed" : "interrupted";

/** View A (notfound program): an event that REPAIRS (+10, bad cleared); view B (details program): an event that adds 100. A's render fails while `bad`. */
export const boot = async () => {
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
        "app/fix": set("fix", (c) => ({ ...c, bad: false })),
        "app/bump": set("bump", (c) => ({ ...c, n: c.n + 1 })),
        "app/toggle": set("toggle", (c) => ({ ...c, view: c.view === "a" ? "b" : "a" })),
        "notfound/back": set("back-on-a", (c) => ({ ...c, n: c.n + 10, bad: false })),   // A's retained button: repairs
        "details/back": set("back-on-b", (c) => ({ ...c, n: c.n + 100 })),                 // B's button
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const mountOn = async (options: { readonly page?: ReturnType<typeof load>; readonly updateThrows?: () => boolean; readonly onUpdate?: () => void } = {}) => {
    const page = options.page ?? load("");
    const ops: Array<string> = [];
    const target: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container: page.container, primitives })(report);

      return { draw: (t) => { port.draw(t); ops.push(`draw ${label()}`); }, update: (t) => { if (options.updateThrows?.() === true) { throw new Error("update failed"); } port.update(t); ops.push(`update ${label()}`); options.onUpdate?.(); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
    };
    const label = (): string => page.container.querySelector("section")?.getAttribute("aria-label") ?? "";
    const scope = await run(Scope.make());
    const mounted = await run(Valance.mount(handle, target).pipe(Scope.extend(scope)));

    return { page, ops, label, mounted, scope, click: () => { page.click(page.container.querySelector("button")!); }, ledger: () => mounted.dispatched.map(show), close: () => run(Scope.close(scope, Exit.void)),
      standing: () => run(Effect.race(Effect.map(mounted.followed, (e): string => Exit.isSuccess(e) ? "ended" : Cause.isInterruptedOnly(e.cause) ? "interrupted" : Cause.isFailType(e.cause) ? `failed ${(e.cause.error as { _tag: string })._tag}` : Cause.isDieType(e.cause) ? `defect ${(e.cause.defect as Error).message}` : "other"), Effect.succeed("following"))) };
  };

  return { log, handle, appScope, mountOn, state: () => run(handle.state), invoke: (key: string) => run(handle.invoke(key, [])), rawInvoke: (key: string) => handle.invoke(key, []) };
};

