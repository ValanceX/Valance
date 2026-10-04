// Shared by inert-mount.browser.test.ts and recovery.browser.test.ts: one view whose title shows `n`, and the helpers that observe a mount.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Cause, Effect, Exit, Schema } from "effect";
import { inject } from "vitest";


const { catalog } = inject("page");

export const State = Schema.Struct({ n: Schema.Number, bad: Schema.Boolean });
export type State = Schema.Schema.Type<typeof State>;
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);

/** One view whose title shows `n`; `bad` makes the title a number, which the program's manifest rejects (a MESH render failure). */
export const application = () => Valance.define({
  name: "inert",
  state: { schema: State, initial: { n: 0, bad: false } },
  views: { only: { program: catalog.notfound, scope: (state: State) => ({ title: state.bad ? (42 as never) : `n${state.n}` }) } },
  view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<State>) => {
    const set = (name: string, change: (current: State) => State) => Nexus.Mesh.bind(Nexus.Command.define(`t.${name}`, Schema.Struct({}), () => Effect.asVoid(state.update((current): Effect.Effect<State> => Effect.succeed(change(current))))), () => ({}));

    return {
      "app/bump": set("bump", (current) => ({ ...current, n: current.n + 1 })),
      "app/break": set("break", (current) => ({ ...current, bad: true })),
      "app/fix": set("fix", (current) => ({ ...current, bad: false })),
      "notfound/back": set("back", (current) => ({ ...current, n: current.n + 1 })),   // the one button each mount renders
    } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
  },
});

export const label = (root: Element): string | null | undefined => root.querySelector("section")?.getAttribute("aria-label");
/** Is the mount still following the application? `followed` completes only when it stopped; its Exit says how. */
export const following = (mounted: Valance.Mounted<unknown>) => Effect.runPromise(Effect.race(
  Effect.map(mounted.followed, (exit) => Exit.isSuccess(exit) ? "ended" : Cause.isDieType(exit.cause) ? "failed: defect" : "failed: diagnostics"),
  Effect.succeed("following")
));

export const roots = () => { const made = [document.createElement("main"), document.createElement("main"), document.createElement("main")] as const; document.body.append(...made); return made; };

