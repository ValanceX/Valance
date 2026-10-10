// Only what changed is drawn: a later render of the same view reaches a target as MESH's patches (when the target can apply them), not as a whole tree to compare; another view draws afresh;
// and a target that has no `patch` is given `update`, as before. What the application shows after any of these is what a fresh render of its state shows.
import type * as Mesh from "@valancex/nexus";

import { compileProgram } from "@valancex/mesh-compiler";
import { Chunk, Effect, Exit, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { runningOf } from "../src/internal.js";

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    main: { props: {}, events: {}, commands: {}, scope: { title: { kind: "string" }, items: { kind: "list", element: { kind: "record", fields: { id: { type: { kind: "string" }, required: true }, label: { type: { kind: "string" }, required: true } } } } } },
    other: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    list: { props: {}, events: {}, commands: {}, scope: {} },
    "mesh-each": { props: { items: { type: { kind: "list", element: { kind: "any" } }, required: true }, as: { type: { kind: "string" }, required: true }, key: { type: { kind: "any" }, required: true } }, events: {}, commands: {}, scope: {} },
  },
});
const program = async (root: string, source: string): Promise<Mesh.Mesh.Program> => {
  const result = await compileProgram({ model: { manifest: model, path: "components.json" }, root, components: [{ component: root, source, path: `${root}.mprx` }] });

  if (result.program === undefined) {
    throw new Error(JSON.stringify(result.components));
  }

  return result.program;
};
const main = await program("main", `<list><text>{title}</text><mesh-each items={items} as="item" key={item.id}><text>{item.label}</text></mesh-each></list>`);
const other = await program("other", "<text>other</text>");

const State = Schema.Struct({ page: Schema.String, title: Schema.String, items: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })) });
type State = Schema.Schema.Type<typeof State>;

const application = Valance.define({
  name: "incremental",
  state: { schema: State, initial: { page: "main", title: "T", items: [{ id: "a", label: "A" }, { id: "b", label: "B" }] } },
  views: { main: { program: main, scope: (s) => ({ title: s.title, items: s.items }) }, other: { program: other, scope: () => ({}) } },
  view: (s) => (s.page === "main" ? "main" : "other") as "main" | "other",
  commands: (state) => {
    const command = Valance.command(state);
    const title = command(Schema.Struct({ title: Schema.String }), ({ title }, current) => ({ ...current, title }));
    const page = command(Schema.Struct({ page: Schema.String }), ({ page }, current) => ({ ...current, page }));
    const add = command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, items: [...current.items, { id, label: id.toUpperCase() }] }));

    return { "app/title": Valance.entry(title, (value) => ({ title: value })), "app/page": Valance.entry(page, (value) => ({ page: value })), "app/add": Valance.entry(add, (value) => ({ id: value })) };
  },
});

const treeOf = (render: { readonly tree: unknown }) => JSON.stringify(render.tree);

/** Runs the application against a target that records what it was given, through `steps` (a command and its one argument), and returns what it saw and what a fresh render gives. */
const run = async (withPatch: boolean, steps: ReadonlyArray<readonly [string, string]>) => {
  const calls: Array<string> = [];
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application).pipe(Scope.extend(scope)));
  const running = runningOf(handle);
  const factory: Valance.TargetFactory<Valance.Target> = () => ({
    draw: () => { calls.push("draw"); },
    update: () => { calls.push("update"); },
    ...(withPatch ? { patch: (patches: Mesh.Mesh.RenderPatches) => { calls.push(`patch:${patches.patches.map((patch) => (patch as { readonly op: string }).op).join(",")}`); } } : {}),
    unmount: () => undefined,
  });

  await Effect.runPromise(Valance.mount(handle, factory).pipe(Scope.extend(scope)));

  for (const [name, argument] of steps) {
    await Effect.runPromise(handle.invoke(`app/${name}`, [{ value: argument }]).pipe(Effect.orDie));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await Effect.runPromise(Scope.close(scope, Exit.void));

  return calls;
};

describe("only what changed is drawn", () => {
  it("a later render of the same view is the patches that turn the drawn tree into it", async () => {
    const calls = await run(true, [["title", "U"], ["add", "c"]]);

    expect(calls[0]).toBe("draw");
    expect(calls[1]).toBe("patch:setText");
    expect(calls[2]).toMatch(/^patch:.*insert/);
    expect(calls).not.toContain("update");
  });

  it("another view is another program: it is drawn afresh, and the view after it is patched again", async () => {
    const calls = await run(true, [["page", "other"], ["page", "main"], ["title", "V"]]);

    expect(calls.slice(0, 3)).toEqual(["draw", "draw", "draw"]);
    expect(calls[3]).toBe("patch:setText");
  });

  it("a target without `patch` is given `update`, as before", async () => {
    const calls = await run(false, [["title", "U"], ["add", "c"]]);

    expect(calls).toEqual(["draw", "update", "update"]);
  });

  it("the stream's last render is the render of the state, and only the later ones carry patches", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(application).pipe(Scope.extend(scope)));
    const running = runningOf(handle);
    const collected = Effect.runPromise(Stream.runCollect(Stream.take(running.values, 3)).pipe(Effect.map(Chunk.toReadonlyArray)));

    await new Promise((resolve) => setTimeout(resolve, 25));
    await Effect.runPromise(handle.invoke("app/title", [{ value: "U" }]).pipe(Effect.orDie));
    await new Promise((resolve) => setTimeout(resolve, 25));
    await Effect.runPromise(handle.invoke("app/add", [{ value: "c" }]).pipe(Effect.orDie));

    const seen = await collected;
    const fresh = await Effect.runPromise(running.render);

    expect(seen.map((viewed) => viewed.patches !== undefined)).toEqual([false, true, true]);
    expect(treeOf(seen[2]!.render)).toBe(treeOf(fresh.render));
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
