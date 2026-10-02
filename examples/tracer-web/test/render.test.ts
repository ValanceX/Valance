// Render and update boundary (constraints C2, C7): what reaches the target is MESH's render-v1,
// produced by MESH from NEXUS state; the only way to change it is state → render → PORT.
import { render } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { application } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { until } from "./helpers.js";

describe("render boundary", () => {
  it("the target receives MESH's own render-v1 of NEXUS's state, and updates come only from state", async () => {
    const programs = await compilePrograms();
    const program = programs.counter;
    const app = application(programs);
    const calls: Array<{ readonly op: "draw" | "update" | "unmount"; readonly tree?: unknown }> = [];
    let report!: Valance.Report;
    // A recording target: PORT's contract and nothing else.
    const target: Valance.TargetFactory<Valance.Target> = (r) => {
      report = r;

      return { draw: (tree) => { calls.push({ op: "draw", tree }); }, update: (tree) => { calls.push({ op: "update", tree }); }, unmount: () => { calls.push({ op: "unmount" }); } };
    };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app);
      const mounted = yield* Valance.mount(running, target);
      const first = yield* running.state;

      // The tree is exactly what MESH renders for the snapshot, not something Valance built.
      const direct = yield* Effect.promise(() => render({ program, model: program.model, snapshot: { title: first.title, count: first.count, stamp: first.stamp } }));
      expect(calls[0]).toEqual({ op: "draw", tree: direct.render?.tree });
      expect(calls[0]?.tree).toMatchObject({ format: "mesh-render", version: 1 });

      // The target reports a handler of the drawn tree; the application never touches the target.
      const tree = calls[0]!.tree as { root: { children: ReadonlyArray<{ events: { click: string } }> } };
      report(tree.root.children[1]!.events.click);
      yield* mounted.settled;
      yield* Effect.promise(() => until(() => calls.some((call) => call.op === "update")));

      const after = yield* running.state;
      const expected = yield* Effect.promise(() => render({ program, model: program.model, snapshot: { title: after.title, count: after.count, stamp: after.stamp } }));
      expect(calls.filter((call) => call.op === "update").at(-1)).toEqual({ op: "update", tree: expected.render?.tree });
      expect(after.count).toBe(1);
      expect(calls.filter((call) => call.op === "draw")).toHaveLength(1);
    })));

    expect(calls.at(-1)).toEqual({ op: "unmount" });
  });
});
