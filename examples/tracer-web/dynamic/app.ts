// The dynamic-structure tracer's application, written against Valance. Like src/app.ts it names NEXUS
// for behavior and nothing of MESH hosts, keys or PORT: structure that varies (a repeat, a conditional)
// is MESH's, and Valance forwards whatever render-v1 MESH gives.
//
// PROVISIONAL: `mesh-each` and `mesh-if` are MESH's tracer components (spec §9.10), not language features,
// and they are in no published MESH. These tests resolve MESH and PORT from local checkouts: see
// vitest.dynamic.config.ts.
import type { Mesh } from "@valancex/nexus";

import { compile } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Schema } from "effect";

const Item = Schema.Struct({ id: Schema.String, label: Schema.String });
export type Item = Schema.Schema.Type<typeof Item>;

export const AppState = Schema.Struct({
  mode: Schema.Literal("list", "cond", "other"),
  items: Schema.Array(Item),
  show: Schema.Boolean,
  lead: Schema.Boolean,
  picked: Schema.String,
});
export type AppState = Schema.Schema.Type<typeof AppState>;

export const initial: AppState = { mode: "list", items: [], show: true, lead: false, picked: "" };

const itemList = { kind: "list", element: { kind: "record", fields: { id: { type: { kind: "string" }, required: true }, label: { type: { kind: "string" }, required: true } } } };

const MODEL = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: {}, events: {}, commands: {}, scope: {} },
    note: { props: {}, events: {}, commands: {}, scope: {} },
    row: { props: {}, events: { tap: {} }, commands: {}, scope: {} },
    "mesh-if": { props: { when: { type: { kind: "boolean" }, required: true } }, events: {}, commands: {}, scope: {} },
    "mesh-each": { props: {
      items: { type: { kind: "list", element: { kind: "any" } }, required: true },
      as: { type: { kind: "string" }, required: true },
      key: { type: { kind: "any" }, required: true } }, events: {}, commands: {}, scope: {} },
    list: { props: {}, events: {}, commands: { pick: { parameters: [{ name: "id", type: { kind: "string" } }] } }, scope: { items: itemList } },
    other: { props: {}, events: {}, commands: {}, scope: { items: itemList } },
    cond: { props: {}, events: {}, commands: { go: { parameters: [] } }, scope: { show: { kind: "boolean" }, lead: { kind: "boolean" } } },
  },
});

const SOURCES = {
  list: '<page><note>head</note><mesh-each items={items} as="item" key={item.id}><row on.tap={pick(item.id)}>{item.label}</row></mesh-each><note>tail</note></page>',
  other: '<page><mesh-each items={items} as="item" key={item.id}><note>{item.label}</note></mesh-each></page>',
  cond: '<page><mesh-if when={lead}><note>lead</note></mesh-if><note>fixed</note><mesh-if when={show}><row on.tap={go()}>shown</row></mesh-if></page>',
} as const;

/** Build time, in Node: MPRX → template-v1 with the MESH compiler under test. */
export const compilePrograms = async (): Promise<Record<keyof typeof SOURCES, Mesh.Program>> => {
  const one = async (root: keyof typeof SOURCES): Promise<Mesh.Program> => {
    const result = await compile({ source: SOURCES[root], path: `${root}.mprx`, model: { manifest: MODEL, path: "model.json", component: root } });

    if (result.template === undefined) {
      throw new Error(`${root} doesn't compile: ${JSON.stringify(result.diagnostics)}`);
    }

    return { root, templates: [JSON.stringify(result.template)], model: MODEL };
  };

  return { list: await one("list"), other: await one("other"), cond: await one("cond") };
};

const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

export const application = (programs: Record<keyof typeof SOURCES, Mesh.Program>) => Valance.define({
  name: "tracer-dynamic",
  state: { schema: AppState, initial },
  views: {
    list: { program: programs.list, scope: ({ items }) => ({ items }) },
    other: { program: programs.other, scope: ({ items }) => ({ items }) },
    cond: { program: programs.cond, scope: ({ show, lead }) => ({ show, lead }) },
  },
  view: (state) => state.mode,
  commands: (state) => {
    const patch = (patch: Partial<AppState>) => state.update((current) => Effect.succeed({ ...current, ...patch })).pipe(Effect.asVoid);
    const setItems = Nexus.Command.define("app.setItems", Schema.Struct({ items: Schema.Array(Item) }), ({ items }) => patch({ items }));
    const setFlags = Nexus.Command.define("app.setFlags", Schema.Struct({ show: Schema.Boolean, lead: Schema.Boolean }), ({ show, lead }) => patch({ show, lead }));
    const setMode = Nexus.Command.define("app.setMode", Schema.Struct({ mode: Schema.Literal("list", "cond", "other") }), ({ mode }) => patch({ mode }));
    const pick = Nexus.Command.define("list.pick", Schema.Struct({ picked: Schema.String }), ({ picked }) => patch({ picked }));
    const go = Nexus.Command.define("cond.go", Schema.Struct({}), () => patch({ picked: "go" }));

    return {
      // Not MESH components: the application's own way to change its state, through the same table an intent uses.
      "app/setItems": Nexus.Mesh.bind(setItems, (args) => firstValue(args)),
      "app/setFlags": Nexus.Mesh.bind(setFlags, (args) => firstValue(args)),
      "app/setMode": Nexus.Mesh.bind(setMode, (args) => firstValue(args)),
      // MESH intents, from the handlers the repeat and the conditional bind.
      "list/pick": Nexus.Mesh.bind(pick, (args) => ({ picked: firstValue(args) })),
      "cond/go": Nexus.Mesh.bind(go, () => ({ picked: "go" })),
    };
  },
});

export const primitives: Web.WebPrimitives = {
  page: { element: "section" },
  note: { element: "span" },
  row: { element: "button", events: { tap: { type: "click" } } },
};
