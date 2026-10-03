import type { WebPort } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Effect, Exit, Schema, Scope } from "effect";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { primitives } from "../src/catalog/web.js";

const { catalog } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const State = Schema.Struct({ view: Schema.Literal("a", "b"), n: Schema.Number });
type State = Schema.Schema.Type<typeof State>;
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const initial: State = { view: "a", n: 0 };

const app = (timeline: Array<string>) => {
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

const label = (root: Element): string | null | undefined => root.querySelector("section")?.getAttribute("aria-label");

/** The Web target, recording each PORT operation Valance asks for together with what the DOM shows right after it. */
const recording = (root: Element, log: Array<string>, timeline: Array<string>, mount: number): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container: root, primitives })(report);

  return {
    draw: (tree) => { port.draw(tree); log.push(`draw ${label(root)}`); timeline.push(`m${mount} draw ${label(root)}`); },
    update: (tree) => { port.update(tree); log.push(`update ${label(root)}`); timeline.push(`m${mount} update ${label(root)}`); },
    hydrate: (tree) => port.hydrate(tree),
    unmount: () => { port.unmount(); },
  };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

/** One application, `mounts` mounts in the application's own Scope, and a timeline of commits and PORT operations in the order they happened. */
const start = async (mounts: number) => {
  const roots = Array.from({ length: mounts }, () => document.createElement("main"));

  document.body.append(...roots);
  const timeline: Array<string> = [];
  const { definition, intents } = app(timeline);
  const scope = await run(Scope.make());
  const handle = await run(Valance.start(definition).pipe(Scope.extend(scope)));
  const logs = roots.map(() => [] as Array<string>);
  const mounted = await Promise.all(roots.map((root, index) => run(Valance.mount(handle, recording(root, logs[index]!, timeline, index)).pipe(Scope.extend(scope)))));

  return {
    roots, handle, logs, mounted, intents, timeline,
    invoke: (key: string) => handle.invoke(key, []),
    close: async () => { await run(Scope.close(scope, Exit.void)); roots.forEach((root) => { root.remove(); }); },
  };
};

const commitsBeforePresentation = (timeline: ReadonlyArray<string>, commits: number): boolean => {
  const first = timeline.findIndex((entry, index) => index > 0 && /^m\d+ (draw|update) /.test(entry));      // the first presentation after the initial draw

  return timeline.slice(0, first).filter((entry) => entry.startsWith("commit")).length === commits;
};

describe("bursty commits: what the presentation guarantees", () => {
  it("same view: every commit is presented, in order, from ITS OWN state (not the latest); the commits really precede the presentations; the final DOM is the final state", async () => {
    // Three ways to produce the burst: sequential invokes in one Effect, three invokes started in one turn, three commands from one host event.
    const ways: Array<[string, (t: Awaited<ReturnType<typeof start>>) => Promise<void>]> = [
      ["sequential invokes", (t) => run(Effect.gen(function* () { yield* t.invoke("app/bump"); yield* t.invoke("app/bump"); yield* t.invoke("app/bump"); }))],
      ["one turn", async (t) => { await Promise.all([run(t.invoke("app/bump")), run(t.invoke("app/bump")), run(t.invoke("app/bump"))]); }],
      ["one host event", async (t) => {
        const host = document.createElement("button");

        document.body.append(host);
        host.onclick = () => { for (let count = 0; count < 3; count += 1) { void run(t.invoke("app/bump")); } };
        await userEvent.click(host);
        host.remove();
      }],
    ];

    for (const [name, burst] of ways) {
      const t = await start(1);

      await burst(t);
      await settle();
      expect([name, t.logs[0]]).toEqual([name, ["draw A0", "update A1", "update A2", "update A3"]]);   // one step per commit, never skipped, never coalesced
      expect(label(t.roots[0]!)).toBe("A3");
      expect(await run(t.handle.state)).toEqual({ view: "a", n: 3 });
      if (name === "sequential invokes") {
        expect(commitsBeforePresentation(t.timeline, 3)).toBe(true);                    // all three commits happened before the first of their presentations
      }
      await t.close();
    }
  });

  it("across a view boundary (A1, B1, A1, A2) and with two mounts: every intermediate view is drawn in commit order, each mount keeps its own continuity, both end on the final state", async () => {
    const t = await start(2);

    await run(Effect.gen(function* () { yield* t.invoke("app/bump"); yield* t.invoke("app/toggle"); yield* t.invoke("app/toggle"); yield* t.invoke("app/bump"); }));
    await settle();

    const expected = ["draw A0", "update A1", "draw B1", "draw A1", "update A2"];          // same view → update, other view → draw, B is not skipped

    expect(t.logs).toEqual([expected, expected]);                                          // identical per mount: the shared stream, independent presentations
    expect(t.roots.map(label)).toEqual(["A2", "A2"]);
    expect(await run(t.handle.state)).toEqual({ view: "a", n: 2 });
    expect(t.timeline.filter((entry) => entry.startsWith("commit"))).toEqual(["commit bump", "commit toggle", "commit toggle", "commit bump"]);
    await t.close();
  });

  it("an event reported on the drawn render during a burst is dispatched against THAT render's table, even though a newer state (another view) has committed", async () => {
    const t = await start(1);
    const button = t.roots[0]!.querySelector("button")!;

    expect(label(t.roots[0]!)).toBe("A0");
    const toggled = run(t.invoke("app/toggle"));                                           // commit toward B ...
    button.click();                                                                        // ... while A's button is the drawn render's
    await toggled;
    await settle();

    expect(t.intents).toContain("back-on-a");                                              // A's table, by the render the click was reported on
    expect(t.intents).not.toContain("back-on-b");
    expect(t.mounted[0]!.dispatched.map((exit) => exit._tag)).toEqual(["Success"]);
    expect(await run(t.handle.state)).toEqual({ view: "b", n: 10 });                       // its effect is on the one authoritative state
    expect(label(t.roots[0]!)).toBe("B10");                                                // and the final DOM is the final state
    await t.close();
  });
});
