// Shared by first-render-failure.test.ts and first-update.test.ts: a one-view application whose state is valid for NEXUS, and whose scope function can be made to produce a
// value the program's manifest rejects (`bad`), plus helpers that classify an Exit.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";

import { titleProgram } from "./title-program.js";
import { primitives } from "../src/catalog/web.js";

export const State = Schema.Struct({ n: Schema.Number, bad: Schema.Boolean });
export type State = Schema.Schema.Type<typeof State>;
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const definition = (initial: State, hooks: { onScope?: () => void } = {}) => Valance.define({
  name: "first-render", state: { schema: State, initial },
  views: { only: { program: titleProgram, scope: (s: State) => { hooks.onScope?.(); return { title: s.bad ? (42 as never) : `n${s.n}` }; } } }, view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<State>) => ({
    "app/fix": Nexus.Mesh.bind(Nexus.Command.define("t.fix", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, bad: false })))), () => ({})),
    "app/break": Nexus.Mesh.bind(Nexus.Command.define("t.break", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, bad: true })))), () => ({})),
    "app/bump": Nexus.Mesh.bind(Nexus.Command.define("t.bump", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 1 })))), () => ({})),
  }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
});

export const causeOf = (exit: Exit.Exit<unknown, unknown> | "hung"): "hung" | "success" | "interrupted" | "MeshDiagnostics" | "defect" | "other" => exit === "hung" ? "hung" : Exit.isSuccess(exit) ? "success" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isFailType(exit.cause) && (exit.cause.error as { _tag?: string })._tag === "MeshDiagnostics" ? "MeshDiagnostics" : Cause.isDieType(exit.cause) ? "defect" : "other";


/** One application, a jsdom document, and `open(kind)`: a mount (or hydrate) in a Scope of its own, over a recording target whose update/unmount can be made to throw or to act. */
export type Kind = "mount" | "hydrate";

/** One application, a jsdom document, and `open(kind)`: a mount (or hydrate) in a Scope of its own, over a recording target whose update can be made to throw or to act. */
export const rig = async () => {
  const doc = new JSDOM(`<!doctype html><body></body>`, { url: "http://localhost/" }).window.document;
  const hooks: { onScope?: () => void } = {};
  const app = definition({ n: 0, bad: false }, hooks);
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const served = await run(renderToHtml(definition({ n: 0, bad: false }), { primitives, state: { n: 0, bad: false } }));

  const open = async (kind: Kind, options: { readonly updateThrows?: () => boolean; readonly inUpdate?: () => void; readonly unmountThrows?: () => boolean } = {}) => {
    const container = doc.createElement("main");
    const ops: Array<string> = [];
    const scope = await run(Scope.make());

    container.innerHTML = kind === "hydrate" ? served.html : "";
    doc.body.append(container);
    const factory: Valance.TargetFactory<ReturnType<ReturnType<typeof Web.target>>> = (report) => {
      const port = Web.target({ container, primitives })(report);

      return {
        draw: (t) => { port.draw(t); ops.push("draw"); },
        update: (t) => { options.inUpdate?.(); if (options.updateThrows?.() === true) { throw new Error("update failed"); } port.update(t); ops.push("update"); },
        hydrate: (t) => { ops.push("hydrate"); return port.hydrate(t); },
        unmount: () => { ops.push("unmount"); if (options.unmountThrows?.() === true) { throw new Error("unmount failed"); } port.unmount(); },
      };
    };
    const mounted = await run((kind === "mount" ? Valance.mount(handle, factory) : Valance.hydrate(handle, factory)).pipe(Scope.extend(scope)));

    return { container, ops, scope, mounted, label: () => container.querySelector("section")?.getAttribute("aria-label"), close: () => run(Scope.close(scope, Exit.void)) };
  };
  /** How the mount's follower stands: still following, or the shape of its exit. */
  const standing = (mounted: Valance.Mounted<unknown>) => Effect.runPromise(Effect.race(
    Effect.map(mounted.followed, (exit): string => Exit.isSuccess(exit) ? "ended" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isFailType(exit.cause) ? `typed ${(exit.cause.error as { _tag: string })._tag}` : Cause.isDieType(exit.cause) ? `defect ${(exit.cause.defect as Error).message}` : "other"),
    Effect.succeed("following")
  ));
  const recovers = async () => {
    const fresh = await open("mount");

    return { text: fresh.label(), close: fresh.close, followed: await standing(fresh.mounted) };
  };

  return { handle, open, standing, recovers, hooks, appScope, state: () => run(handle.state) };
};

