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
import { renderToHtml } from "@valancex/valance/web/server";
import { Cause, Effect, Exit, Schema, Scope } from "effect";

import { primitives } from "../src/catalog/web.js";
import { load } from "./helpers.js";

const prop = (kind: string, required = true) => ({ type: { kind }, required });
const view = (commands = true) => ({
  props: {}, events: {}, commands: commands ? { tap: { parameters: [{ name: "id", type: { kind: "string" } }] } } : {},
  scope: { title: { kind: "string" }, show: { kind: "boolean" }, items: { kind: "list", element: { kind: "record", fields: { id: prop("string"), tag: prop("string") } } } },
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
  <mesh-each items={items} as="item" key={item.id}><row><text>{item.id}</text><button on.click={tap(item.tag)}>x</button></row></mesh-each>
</page>`;
const program = async (root: "va" | "vb") => {
  const result = await compile({ source, path: `${root}.mprx`, model: { manifest, path: "components.json", component: root } });

  if (result.template === undefined) { throw new Error(JSON.stringify(result.diagnostics)); }

  return { root, templates: [JSON.stringify(result.template)], model: manifest };
};
const programs = { va: await program("va"), vb: await program("vb") };

const State = Schema.Struct({ view: Schema.Literal("a", "b"), show: Schema.Boolean, ids: Schema.Array(Schema.String), n: Schema.Number, note: Schema.optional(Schema.String), tag: Schema.optional(Schema.String), plain: Schema.optional(Schema.Boolean) });
type State = Schema.Schema.Type<typeof State>;
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
// `note` is outside every render; `tag` changes only the event argument (not the visible text); `plain` makes both views render the same title.
const scopeOf = (title: string) => (s: State) => ({ title: s.plain === true ? "T" : `${title}${s.n}`, show: s.show, items: s.ids.map((id) => ({ id, tag: `${s.tag ?? ""}${id}` })) });

export const boot = async (initial: State = { view: "a", show: false, ids: ["A", "B"], n: 0 }, boot_options: { readonly omit?: ReadonlyArray<string> } = {}) => {
  const taps: Array<string> = [];
  const seen: Array<{ readonly id: string; readonly n: number; readonly tag: string; readonly view: string }> = [];
  const started: Array<string> = [];
  const gate: { current?: Promise<void>; readonly byId: Map<string, Promise<void>>; commit?: boolean; uninterruptible?: boolean } = { byId: new Map() };
  const app = Valance.define({
    name: "same-view", state: { schema: State, initial },
    views: { a: { program: programs.va, scope: scopeOf("A") }, b: { program: programs.vb, scope: scopeOf("B") } },
    view: (s: State) => s.view,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const set = (name: string, change: (c: State) => State) => Nexus.Mesh.bind(Nexus.Command.define(`s.${name}`, Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed(change(c))))), () => ({}));
      // `gate.current` (a promise) holds a tap BEFORE it reads state; `seen` is the state a tap observed when it actually ran.
      const tap = Nexus.Mesh.bind(Nexus.Command.define("s.tap", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.suspend(() => { const body = Effect.gen(function* () {
        started.push(id);
        const held = gate.byId.get(id) ?? gate.current;

        if (held !== undefined) { yield* Effect.promise(() => held); }
        const now = yield* state.get;

        if (gate.commit === true) { yield* state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, note: `${c.note ?? ""}${id}` })); }   // the commit, recorded in commit order

        seen.push({ id, n: now.n, tag: now.tag ?? "", view: now.view });
        taps.push(id);
      }); return gate.uninterruptible === true ? Effect.uninterruptible(body) : body; })), (args) => ({ id: "value" in args[0]! ? args[0].value : "" }));

      const table = {
        "app/ids": Nexus.Mesh.bind(Nexus.Command.define("s.ids", Schema.Struct({ ids: Schema.Array(Schema.String) }), ({ ids }) => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, ids })))), (args) => ({ ids: "value" in args[0]! ? args[0].value : [] })),
        "app/show": set("show", (c) => ({ ...c, show: true })),
        "app/hide": set("hide", (c) => ({ ...c, show: false })),
        "app/toggleView": set("toggleView", (c) => ({ ...c, view: c.view === "a" ? "b" : "a" })),
        "app/bump": set("bump", (c) => ({ ...c, n: c.n + 1 })),
        "app/note": Nexus.Mesh.bind(Nexus.Command.define("s.note", Schema.Struct({ note: Schema.String }), ({ note }) => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, note })))), (args) => ({ note: "value" in args[0]! ? args[0].value : "" })),
        "app/tag": Nexus.Mesh.bind(Nexus.Command.define("s.tag", Schema.Struct({ tag: Schema.String }), ({ tag }) => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, tag })))), (args) => ({ tag: "value" in args[0]! ? args[0].value : "" })),
        "app/plain": set("plain", (c) => ({ ...c, plain: true })),
        "app/copy": set("copy", (c) => ({ ...c })),                          // a new, equal state object
        "app/same": set("same", (c) => c),                                    // the very same state object
        "va/tap": tap, "vb/tap": tap,
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;

      return Object.fromEntries(Object.entries(table).filter(([key]) => !(boot_options.omit ?? []).includes(key)));
    },
  });
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const mountOn = async (options: { readonly onUpdate?: () => void; readonly updateThrows?: () => "before" | "after" | undefined; readonly page?: ReturnType<typeof load> } = {}) => {
    const page = options.page ?? load("");
    const ops: Array<string> = [];
    const trees: Array<string> = [];
    const reports: Array<{ readonly handler: string; readonly payload: unknown; readonly send: () => void }> = [];
    let reporter: ((handler: string, payload: never) => void) | undefined;
    const factory: Valance.TargetFactory<WebPort> = (report) => {
      reporter = report;
      const port = Web.target({ container: page.container, primitives })((handler, payload) => { reports.push({ handler, payload, send: () => { report(handler, payload); } }); report(handler, payload); });

      return { draw: (t) => { port.draw(t); ops.push("draw"); trees.push(JSON.stringify(t)); }, update: (t) => { const when = options.updateThrows?.(); if (when === "before") { throw new Error("update failed"); } port.update(t); if (when === "after") { throw new Error("update failed after mutation"); } ops.push("update"); trees.push(JSON.stringify(t)); options.onUpdate?.(); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
    };
    const scope = await run(Scope.make());
    const mounted = await run(Valance.mount(handle, factory).pipe(Scope.extend(scope)));

    return {
      page, ops, trees, mounted, scope, reports, report: (handler: string, payload: unknown) => { reporter!(handler, payload as never); },
      title: () => page.container.querySelector("section")?.getAttribute("aria-label"),
      shown: () => page.container.textContent!.includes("shown"),
      rows: () => Array.from(page.container.querySelectorAll("div")).map((d) => d.querySelector("span")!.textContent),
      rowEls: () => Array.from(page.container.querySelectorAll("div")),
      standing: () => run(Effect.race(Effect.map(mounted.followed, (e): string => Exit.isSuccess(e) ? "ended" : Cause.isFailType(e.cause) ? `failed ${(e.cause.error as { _tag: string })._tag}` : "other"), Effect.succeed("following"))),
      close: () => run(Scope.close(scope, Exit.void)),
    };
  };

  return { app, handle, appScope, mountOn, taps, seen, started, gate, invoke: (key: string, ...args: ReadonlyArray<unknown>) => run(handle.invoke(key, args.map((value) => ({ value })) as never)), rawInvoke: (key: string) => handle.invoke(key, []), state: () => run(handle.state) };
};


// Shared by hydrate-commit.test.ts and baseline-equivalence.test.ts: hydrate into a container, over a recording target that can throw in hydrate or update.
export type Booted = Awaited<ReturnType<typeof boot>>;
export type HState = Parameters<typeof boot>[0] & object;
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const A0: State = { view: "a", show: false, ids: ["A", "B"], n: 0 };

export const served = (b: Booted, state: State) => run(renderToHtml(b.app, { primitives, state })).then((r) => r.html);

/** Hydrate `b` into a container holding `html`. `throws` makes the target's hydrate throw before or after PORT hydrated; `reports` are the interactions PORT handed to VALANCE. */
export const hydrateOn = async (b: Booted, html: string, options: { readonly throws?: "before" | "after"; readonly page?: ReturnType<typeof load>; readonly updateThrows?: () => boolean } = {}) => {
  const page = options.page ?? load(html);
  const errors: Array<string> = [];
  const ops: Array<string> = [];
  const reports: Array<{ readonly handler: string; readonly send: () => void }> = [];
  const scope = await run(Scope.make());

  page.window.addEventListener("error", (event) => { errors.push(event.message); });
  if (options.page !== undefined) { page.container.innerHTML = html; }
  const factory: Valance.TargetFactory<ReturnType<ReturnType<typeof Web.target>>> = (report) => {
    const port = Web.target({ container: page.container, primitives })((handler, payload) => { reports.push({ handler, send: () => { report(handler, payload); } }); report(handler, payload); });

    return {
      draw: (t) => { port.draw(t); ops.push("draw"); },
      update: (t) => { if (options.updateThrows?.() === true) { port.update(t); throw new Error("update failed after mutation"); } port.update(t); ops.push("update"); },
      hydrate: (t) => {
        if (options.throws === "before") { throw new Error("hydrate failed"); }
        const result = port.hydrate(t);

        if (options.throws === "after") { throw new Error("hydrate failed after mutation"); }
        ops.push("hydrate");

        return result;
      },
      unmount: () => { port.unmount(); ops.push("unmount"); },
    };
  };
  const exit = await Effect.runPromise(Valance.hydrate(b.handle, factory).pipe(Scope.extend(scope), Effect.exit, Effect.timeoutTo({ duration: "800 millis", onSuccess: (e) => e as Exit.Exit<Valance.Mounted<never> & { readonly hydration: { readonly adopted: boolean } }, unknown> | "hung", onTimeout: () => "hung" as const })));
  const ok = exit !== "hung" && Exit.isSuccess(exit) ? exit.value : undefined;

  return {
    exit, ok, page, ops, errors, reports, scope,
    rows: () => Array.from(page.container.querySelectorAll("div")).map((d) => d.querySelector("span")!.textContent),
    click: (index: number) => { page.click(page.container.querySelectorAll("div")[index]!.querySelector("button")!); },
    close: () => run(Scope.close(scope, Exit.void)),
  };
};
export const defectOf = (exit: unknown): string => Exit.isFailure(exit as Exit.Exit<unknown, unknown>) && Cause.isDieType((exit as { cause: Cause.Cause<unknown> }).cause) ? ((exit as { cause: { defect: Error } }).cause.defect).message : "not a defect";

