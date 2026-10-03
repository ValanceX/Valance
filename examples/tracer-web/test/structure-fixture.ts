// Shared by same-view-structure.test.ts and update-commit.test.ts. Stage 35 — the boundary between VALANCE's coarse view identity and MESH's internal structural identity.
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

import { primitives } from "../src/catalog/web.js";
import { load } from "./helpers.js";

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
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const scopeOf = (title: string) => (s: State) => ({ title: `${title}${s.n}`, show: s.show, items: s.ids.map((id) => ({ id })) });

export const boot = async (initial: State = { view: "a", show: false, ids: ["A", "B"], n: 0 }) => {
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
  const mountOn = async (options: { readonly onUpdate?: () => void; readonly updateThrows?: () => "before" | "after" | undefined; readonly page?: ReturnType<typeof load> } = {}) => {
    const page = options.page ?? load("");
    const ops: Array<string> = [];
    const reports: Array<{ readonly handler: string; readonly payload: unknown; readonly send: () => void }> = [];
    const factory: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container: page.container, primitives })((handler, payload) => { reports.push({ handler, payload, send: () => { report(handler, payload); } }); report(handler, payload); });

      return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { const when = options.updateThrows?.(); if (when === "before") { throw new Error("update failed"); } port.update(t); if (when === "after") { throw new Error("update failed after mutation"); } ops.push("update"); options.onUpdate?.(); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
    };
    const scope = await run(Scope.make());
    const mounted = await run(Valance.mount(handle, factory).pipe(Scope.extend(scope)));

    return {
      page, ops, mounted, scope, reports,
      title: () => page.container.querySelector("section")?.getAttribute("aria-label"),
      shown: () => page.container.textContent!.includes("shown"),
      rows: () => Array.from(page.container.querySelectorAll("div")).map((d) => d.querySelector("span")!.textContent),
      rowEls: () => Array.from(page.container.querySelectorAll("div")),
      standing: () => run(Effect.race(Effect.map(mounted.followed, (e): string => Exit.isSuccess(e) ? "ended" : Cause.isFailType(e.cause) ? `failed ${(e.cause.error as { _tag: string })._tag}` : "other"), Effect.succeed("following"))),
      close: () => run(Scope.close(scope, Exit.void)),
    };
  };

  return { app, handle, appScope, mountOn, taps, invoke: (key: string, ...args: ReadonlyArray<unknown>) => run(handle.invoke(key, args.map((value) => ({ value })) as never)), state: () => run(handle.state) };
};

