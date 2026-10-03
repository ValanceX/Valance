// Shared by first-render-failure.test.ts and first-update.test.ts: a one-view application whose state is valid for NEXUS, and whose scope function can be made to produce a
// value the program's manifest rejects (`bad`), plus helpers that classify an Exit.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Cause, Effect, Exit, Schema } from "effect";

import { compilePrograms } from "../src/catalog/compile.js";

export const programs = await compilePrograms();
export const State = Schema.Struct({ n: Schema.Number, bad: Schema.Boolean });
export type State = Schema.Schema.Type<typeof State>;
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const definition = (initial: State, hooks: { onScope?: () => void } = {}) => Valance.define({
  name: "first-render", state: { schema: State, initial },
  views: { only: { program: programs.notfound, scope: (s: State) => { hooks.onScope?.(); return { title: s.bad ? (42 as never) : `n${s.n}` }; } } }, view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<State>) => ({
    "app/fix": Nexus.Mesh.bind(Nexus.Command.define("t.fix", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, bad: false })))), () => ({})),
    "app/break": Nexus.Mesh.bind(Nexus.Command.define("t.break", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, bad: true })))), () => ({})),
    "app/bump": Nexus.Mesh.bind(Nexus.Command.define("t.bump", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 1 })))), () => ({})),
  }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
});

export const causeOf = (exit: Exit.Exit<unknown, unknown> | "hung"): "hung" | "success" | "interrupted" | "MeshDiagnostics" | "defect" | "other" => exit === "hung" ? "hung" : Exit.isSuccess(exit) ? "success" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isFailType(exit.cause) && (exit.cause.error as { _tag?: string })._tag === "MeshDiagnostics" ? "MeshDiagnostics" : Cause.isDieType(exit.cause) ? "defect" : "other";

