// Shared by burst.browser.test.ts and backlog.browser.test.ts: an application with views A (notfound program) and B (details program) over one state
// `{ view, n }`, and a recording target over the real Web target. `after` runs once per PORT operation, so a test can make presentation take real time.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Schema } from "effect";
import { inject } from "vitest";

import { primitives } from "../src/catalog/web.js";

const { catalog } = inject("page");

export const State = Schema.Struct({ view: Schema.Literal("a", "b"), n: Schema.Number });
export type State = Schema.Schema.Type<typeof State>;
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
export const initial: State = { view: "a", n: 0 };

export const app = (timeline: Array<string>) => {
  const intents: Array<string> = [];
  const definition = Valance.define({
    name: "burst",
    state: { schema: State, initial },
    views: {
      a: { program: catalog.notfound, scope: ({ n }: State) => ({ title: `A${n}` }) },
      b: { program: catalog.details, scope: ({ n }: State) => ({ title: `B${n}`, id: "x", name: "x", count: n, summary: "" }) },
    },
    view: (state: State) => state.view,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const set = (name: string, change: (current: State) => State) => Nexus.Mesh.bind(Nexus.Command.define(`t.${name}`, Schema.Struct({}), () => Effect.asVoid(Effect.tap(state.update((current): Effect.Effect<State> => Effect.succeed(change(current))), () => Effect.sync(() => { intents.push(name); timeline.push(`commit ${name}`); })))), () => ({}));

      return {
        "app/bump": set("bump", (current) => ({ ...current, n: current.n + 1 })),
        "app/toggle": set("toggle", (current) => ({ ...current, view: current.view === "a" ? "b" : "a" })),
        "notfound/back": set("back-on-a", (current) => ({ ...current, n: current.n + 10 })),   // A's one button
        "details/back": set("back-on-b", (current) => ({ ...current, n: current.n + 100 })),   // B's one button
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });

  return { definition, intents };
};

export const label = (root: Element): string | null | undefined => root.querySelector("section")?.getAttribute("aria-label");

/** The Web target, recording each PORT operation Valance asks for together with what the DOM shows right after it. */
export const recording = (root: Element, log: Array<string>, timeline: Array<string>, mount: number, after: () => void = () => undefined): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container: root, primitives })(report);

  return {
    draw: (tree) => { port.draw(tree); log.push(`draw ${label(root)}`); timeline.push(`m${mount} draw ${label(root)}`); after(); },
    update: (tree) => { port.update(tree); log.push(`update ${label(root)}`); timeline.push(`m${mount} update ${label(root)}`); after(); },
    hydrate: (tree) => port.hydrate(tree),
    unmount: () => { port.unmount(); },
  };
};

