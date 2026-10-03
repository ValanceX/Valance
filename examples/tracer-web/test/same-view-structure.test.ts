// Stage 35 — the boundary between VALANCE's coarse view identity and MESH's internal structural identity.
//   same view, structure changes (mesh-if appears/disappears, keyed mesh-each adds/removes/reorders) → `update`, never `draw`
//   different view, identical structure → `draw` (similarity is never continuity)
//   skipped intermediates → the presented structure is an update from what was actually presented
//   same-view structural failure → inert (C31); fresh mount draws normally; mounts are independent
//   events after a structural update resolve against the newly presented render
// VALANCE decides draw/update from the view name alone; MESH owns structure and identity; PORT owns the realization.
import type { WebPort } from "@valancex/port-web";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { compile } from "@valancex/mesh-compiler";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const prop = (kind: string, required = true) => ({ type: { kind }, required });
const view = (commands = true) => ({
  props: {}, events: {}, commands: commands ? { tap: { parameters: [{ name: "id", type: { kind: "string" } }] } } : {},
  scope: { title: { kind: "string" }, show: { kind: "boolean" }, items: { kind: "list", element: { kind: "record", fields: { id: prop("string") } } } },
});
const manifest = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: { title: prop("string") }, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    row: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    "mesh-if": { props: { when: prop("boolean") }, events: {}, commands: {}, scope: {} },
    "mesh-each": { props: { items: { type: { kind: "list", element: { kind: "any" } }, required: true }, as: prop("string"), key: { type: { kind: "any" }, required: true } }, events: {}, commands: {}, scope: {} },
    va: view(), vb: view(),
  },
});
// Both views have the SAME structure: a conditional, then a keyed repeat.
const source = `<page title={title}>
  <mesh-if when={show}><text>shown</text></mesh-if>
  <mesh-each items={items} as="item" key={item.id}><row><text>{item.id}</text><button on.click={tap(item.id)}>x</button></row></mesh-each>
</page>`;
const program = async (root: "va" | "vb") => {
  const result = await compile({ source, path: `${root}.mprx`, model: { manifest, path: "components.json", component: root } });

  if (result.template === undefined) { throw new Error(JSON.stringify(result.diagnostics)); }

  return { root, templates: [JSON.stringify(result.template)], model: manifest };
};
const programs = { va: await program("va"), vb: await program("vb") };

const State = Schema.Struct({ view: Schema.Literal("a", "b"), show: Schema.Boolean, ids: Schema.Array(Schema.String), n: Schema.Number });
type State = Schema.Schema.Type<typeof State>;
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const scopeOf = (title: string) => (s: State) => ({ title: `${title}${s.n}`, show: s.show, items: s.ids.map((id) => ({ id })) });

const boot = async (initial: State = { view: "a", show: false, ids: ["A", "B"], n: 0 }) => {
  const taps: Array<string> = [];
  const app = Valance.define({
    name: "same-view", state: { schema: State, initial },
    views: { a: { program: programs.va, scope: scopeOf("A") }, b: { program: programs.vb, scope: scopeOf("B") } },
    view: (s: State) => s.view,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const set = (name: string, change: (c: State) => State) => Nexus.Mesh.bind(Nexus.Command.define(`s.${name}`, Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed(change(c))))), () => ({}));
      const tap = Nexus.Mesh.bind(Nexus.Command.define("s.tap", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.sync(() => { taps.push(id); })), (args) => ({ id: "value" in args[0]! ? args[0].value : "" }));

      return {
        "app/ids": Nexus.Mesh.bind(Nexus.Command.define("s.ids", Schema.Struct({ ids: Schema.Array(Schema.String) }), ({ ids }) => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, ids })))), (args) => ({ ids: "value" in args[0]! ? args[0].value : [] })),
        "app/show": set("show", (c) => ({ ...c, show: true })),
        "app/hide": set("hide", (c) => ({ ...c, show: false })),
        "app/toggleView": set("toggleView", (c) => ({ ...c, view: c.view === "a" ? "b" : "a" })),
        "app/bump": set("bump", (c) => ({ ...c, n: c.n + 1 })),
        "va/tap": tap, "vb/tap": tap,
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const mountOn = async (options: { readonly onUpdate?: () => void } = {}) => {
    const page = load("");
    const ops: Array<string> = [];
    const factory: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container: page.container, primitives })(report);

      return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); options.onUpdate?.(); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
    };
    const scope = await run(Scope.make());
    const mounted = await run(Valance.mount(handle, factory).pipe(Scope.extend(scope)));

    return {
      page, ops, mounted, scope,
      title: () => page.container.querySelector("section")?.getAttribute("aria-label"),
      shown: () => page.container.textContent!.includes("shown"),
      rows: () => Array.from(page.container.querySelectorAll("div")).map((d) => d.querySelector("span")!.textContent),
      rowEls: () => Array.from(page.container.querySelectorAll("div")),
      standing: () => run(Effect.race(Effect.map(mounted.followed, (e): string => Exit.isSuccess(e) ? "ended" : Cause.isFailType(e.cause) ? `failed ${(e.cause.error as { _tag: string })._tag}` : "other"), Effect.succeed("following"))),
      close: () => run(Scope.close(scope, Exit.void)),
    };
  };

  return { handle, appScope, mountOn, taps, invoke: (key: string, ...args: ReadonlyArray<unknown>) => run(handle.invoke(key, args.map((value) => ({ value })) as never)), state: () => run(handle.state) };
};

describe("same-view structural change is an update", () => {
  it("conditional appears and disappears; keyed repeat adds, removes and reorders: each is one update, never a draw", async () => {
    const b = await boot();
    const m = await b.mountOn();

    expect(m.ops).toEqual(["draw"]);
    expect(m.shown()).toBe(false);
    expect(m.rows()).toEqual(["A", "B"]);

    const step = async (key: string, expectOps: number, arg?: ReadonlyArray<string>) => {
      await b.invoke(key, ...(arg === undefined ? [] : [arg]));
      await until(() => m.ops.length === expectOps);
    };

    await step("app/show", 2);                       // 1 appears
    expect(m.shown()).toBe(true);
    await step("app/hide", 3);                       // 2 disappears
    expect(m.shown()).toBe(false);
    await step("app/ids", 4, ["A", "B", "C"]);       // 3 add
    expect(m.rows()).toEqual(["A", "B", "C"]);
    await step("app/ids", 5, ["A", "C"]);            // 3 remove
    expect(m.rows()).toEqual(["A", "C"]);
    await step("app/ids", 6, ["C", "A"]);            // 4 reorder, same keys: ONE update (no DOM identity claim)
    expect(m.rows()).toEqual(["C", "A"]);
    expect(m.ops).toEqual(["draw", "update", "update", "update", "update", "update"]);
    expect(await m.standing()).toBe("following");
    await m.close();
  });

  it("different views with structurally identical output: draw, never inferred continuity", async () => {
    const b = await boot({ view: "a", show: true, ids: ["A"], n: 0 });
    const m = await b.mountOn();
    const before = m.rowEls()[0];

    await b.invoke("app/toggleView");
    await until(() => m.ops.length === 2);
    expect(m.ops).toEqual(["draw", "draw"]);
    expect(m.title()).toBe("B0");
    expect(before!.isConnected).toBe(false);          // a fresh realization, not a reconcile of the similar tree
    await b.invoke("app/bump");                       // and within B again: update
    await until(() => m.ops.length === 3);
    expect(m.ops).toEqual(["draw", "draw", "update"]);
    await m.close();
  });

  it("skipped intermediates: the presented structure is an update from what was actually presented, ending at the latest", async () => {
    const burst = await boot();
    const n = await burst.mountOn();

    // S1, S2, S3 committed together: whichever the follower skips, every presentation after the first is an update.
    await Promise.all([burst.invoke("app/show"), burst.invoke("app/ids", ["A", "B", "C"]), burst.invoke("app/ids", ["C"])]);
    await until(() => n.rows().length === 1);
    expect(n.shown()).toBe(true);
    expect(n.rows()).toEqual(["C"]);
    expect(n.ops[0]).toBe("draw");
    expect(n.ops.slice(1).every((op) => op === "update")).toBe(true);
    expect(n.ops.length).toBeLessThanOrEqual(4);
    await n.close();
  });

  it("two mounts with different structural progress each continue from their own presented render", async () => {
    const b = await boot();
    const lag = await b.mountOn();
    let once = false;
    const eager = await b.mountOn({ onUpdate: () => { if (!once) { once = true; void b.invoke("app/show"); void b.invoke("app/ids", ["Z"]); } } });

    await b.invoke("app/ids", ["A", "B", "C"]);       // eager's first update triggers two more commits from inside its own target
    await until(() => eager.rows().length === 1 && lag.rows().length === 1);
    for (const m of [lag, eager]) {
      expect(m.rows()).toEqual(["Z"]);
      expect(m.shown()).toBe(true);
      expect(m.ops[0]).toBe("draw");
      expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);
    }
    await lag.close();
    await eager.close();
  });
});

describe("failure and events", () => {
  it("a same-view structural update that fails at MESH: the mount goes inert on its last good render; repair does not resume it; a fresh mount draws normally", async () => {
    const b = await boot();
    const m = await b.mountOn();

    await b.invoke("app/ids", ["A", "A"]);            // duplicate declared key: runtime-duplicate-key, no render
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await m.standing()).toBe("failed MeshDiagnostics");
    expect(m.ops).toEqual(["draw"]);
    expect(m.rows()).toEqual(["A", "B"]);
    await b.invoke("app/ids", ["A", "B", "C"]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(m.rows()).toEqual(["A", "B"]);             // never resumes
    expect(await m.standing()).toBe("failed MeshDiagnostics");

    const fresh = await b.mountOn();

    expect(fresh.ops).toEqual(["draw"]);
    expect(fresh.rows()).toEqual(["A", "B", "C"]);
    await fresh.close();
    await m.close();
  });

  it("events after a structural update resolve against the newly presented render; removed nodes give no dispatch path", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const removed = m.rowEls()[1]!.querySelector("button")!;

    await b.invoke("app/ids", ["A", "C"]);
    await until(() => m.rows().length === 2 && m.rows()[1] === "C");
    m.page.click(m.rowEls()[1]!.querySelector("button")!);       // C: only exists in the new render
    await until(() => b.taps.length === 1);
    expect(b.taps).toEqual(["C"]);
    m.page.click(removed);                                       // B: removed from the render
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(b.taps).toEqual(["C"]);
    expect(m.mounted.dispatched.length).toBe(1);
    await m.close();
  });
});
