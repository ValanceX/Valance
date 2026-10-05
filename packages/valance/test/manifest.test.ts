// The derived manifest: what is derived, that MESH still validates exactly what it did against a hand-written one (diagnostics, keyed identity, typed command arguments and
// payloads), and what is refused rather than defaulted. Real MESH compiler; nothing here renders.
import * as Nexus from "@valancex/nexus";
import { compileProgram } from "@valancex/mesh-compiler";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import * as Web from "../src/web.js";
import { ManifestError, manifest } from "../src/web-manifest.js";

const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  row: { element: "div" },
  button: { element: "button", props: { disabled: Web.booleanAttribute("disabled") }, events: { click: { type: "click" } } },
  link: Web.link,
  field: {
    element: "input",
    props: { value: Web.attribute("value") },
    events: { input: Web.event("input", { kind: "string", of: (_event, element) => (element as HTMLInputElement).value }) },
  },
};

const Board = Schema.Struct({
  title: Schema.String,
  loading: Schema.Boolean,
  query: Schema.String,
  items: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, href: Schema.String })),
});

const commands = (state: Nexus.State.StateHandle<{ n: number }>) => {
  const command = Valance.command(state);

  return {
    select: command(Schema.Struct({ id: Schema.String }), (_input, current) => current),
    search: command(Schema.Struct({ query: Schema.String }), (_input, current) => current),
    reset: command((current) => current),
    "app/navigate": Valance.entry(command(Schema.Struct({ id: Schema.String }), (_input, current) => current), (navigation) => navigation),
  };
};

const derived = manifest({ primitives, scopes: { board: Board }, commands });

const compile = async (source: string, model: unknown = derived) =>
  compileProgram({ model: { manifest: JSON.stringify(model), path: "components.json" }, root: "board", components: [{ component: "board", path: "board.mprx", source }] });

const page = (body: string): string => `<page title={title}>${body}</page>`;

describe("what is derived", () => {
  it("tags from the primitives table (props by realization, events with their declared payload kind), scope from the Schema, commands from the command table", () => {
    const c = derived.components;

    expect(c["page"]).toEqual({ props: { title: { type: { kind: "string" }, required: true } }, events: {}, commands: {}, scope: {} });
    expect(c["button"]!.props["disabled"]).toEqual({ type: { kind: "boolean" }, required: false });          // a boolean attribute is absent when false
    expect(c["button"]!.events).toEqual({ click: {} });
    expect(c["link"]!.props).toEqual({ href: { type: { kind: "string" }, required: true } });
    expect(c["link"]!.events).toEqual({});
    expect(c["field"]!.events).toEqual({ input: { payload: { kind: "string" } } });
    expect(c["board"]!.scope["items"]).toEqual({ kind: "list", element: { kind: "record", fields: { id: { type: { kind: "string" }, required: true }, label: { type: { kind: "string" }, required: true }, href: { type: { kind: "string" }, required: true } } } });
    expect(c["board"]!.commands).toEqual({
      select: { parameters: [{ name: "id", type: { kind: "string" } }] },
      search: { parameters: [{ name: "query", type: { kind: "string" } }] },
      reset: { parameters: [] },
    });                                                                                                        // "app/navigate" is no template's
    expect(Object.keys(c).sort()).toEqual(["board", "button", "field", "link", "mesh-each", "mesh-if", "page", "row", "text"]);
  });

  it("the plumbing nobody writes: version, no named types, reserved mesh-if and mesh-each with the key required", () => {
    expect(derived.version).toBe(1);
    expect(derived.types).toEqual({});
    expect(derived.components["mesh-each"]!.props["key"]).toEqual({ type: { kind: "any" }, required: true });
    expect(derived.components["mesh-if"]!.props["when"]).toEqual({ type: { kind: "boolean" }, required: true });
  });

  it("Schema → MESH type: optional, unions of one kind, nested structs, arrays, any, and the TYPE side of a transformation", () => {
    const m = manifest({
      primitives: {},
      scopes: {
        v: Schema.Struct({
          maybe: Schema.optional(Schema.String), orUndefined: Schema.UndefinedOr(Schema.Number),
          mode: Schema.Literal("a", "b"), flag: Schema.Boolean, nested: Schema.Struct({ n: Schema.Number }), tags: Schema.Array(Schema.String),
          anything: Schema.Unknown, parsed: Schema.NumberFromString,
        }),
      },
      commands: () => ({}),
    });

    expect(m.components["v"]!.scope).toEqual({
      maybe: { kind: "optional", type: { kind: "string" } },
      orUndefined: { kind: "optional", type: { kind: "number" } },
      mode: { kind: "string" }, flag: { kind: "boolean" },
      nested: { kind: "record", fields: { n: { type: { kind: "number" }, required: true } } },
      tags: { kind: "list", element: { kind: "string" } },
      anything: { kind: "any" }, parsed: { kind: "number" },
    });
  });
});

describe("MESH still validates against the derived manifest, with the same diagnostics", () => {
  const good = page(`<mesh-each items={items} as="item" key={item.id}><row><button on.click={select(item.id)}>{item.label}</button><link href={item.href}>{item.label}</link></row></mesh-each><mesh-if when={loading}><text>loading</text></mesh-if><field value={query} on.input={search($event)} />`);

  it("a view written against it compiles", async () => {
    expect((await compile(good)).program).toBeDefined();
  });

  it("a name the scope does not declare is refused", async () => {
    expect((await compile(page("<text>{nonexistent}</text>"))).program).toBeUndefined();
  });

  it("a command that is not in the table is refused", async () => {
    expect((await compile(page(`<button on.click={selct("x")}>go</button>`))).program).toBeUndefined();
  });

  it("a command's argument is checked against the command's input type", async () => {
    expect((await compile(page(`<button on.click={select(1)}>go</button>`))).program).toBeUndefined();
    expect((await compile(page(`<button on.click={select()}>go</button>`))).program).toBeUndefined();                       // every parameter is required
  });

  it("a payload is checked against its declared kind (a string payload is not a number parameter)", async () => {
    const numeric = manifest({ primitives, scopes: { board: Board }, commands: (state) => ({ count: Valance.command(state as Nexus.State.StateHandle<{ n: number }>)(Schema.Struct({ n: Schema.Number }), (_input, current) => current) }) });

    expect((await compile(page("<field value={query} on.input={count($event)} />"), numeric)).program).toBeUndefined();
    expect((await compile(page("<field value={query} on.input={search($event)} />"))).program).toBeDefined();
  });

  it("a required prop must be written, a tag that is not declared is refused, and mesh-each requires its key", async () => {
    expect((await compile("<page><text>x</text></page>")).program).toBeUndefined();                                          // page's `title`
    expect((await compile(page("<unknown-tag />"))).program).toBeUndefined();
    expect((await compile(page(`<mesh-each items={items} as="item"><text>{item.label}</text></mesh-each>`))).program).toBeUndefined();   // no key: no identity
  });

  it("a scope field of the wrong type is a type error in the template", async () => {
    expect((await compile(page("<mesh-if when={title}><text>x</text></mesh-if>"))).program).toBeUndefined();                // title is a string, `when` needs a boolean
  });
});

describe("what is refused instead of defaulted", () => {
  const refuses = (build: () => unknown, path: RegExp, reason: RegExp) => {
    let error: unknown;

    try { build(); } catch (caught) { error = caught; }

    expect(error).toBeInstanceOf(ManifestError);
    expect((error as ManifestError).path).toMatch(path);
    expect((error as ManifestError).message).toMatch(reason);
  };

  it("an exact component/name key: an entry's adapter is opaque, so its parameters cannot be derived", () => {
    refuses(() => manifest({ primitives, scopes: { board: Board }, commands: (state) => ({ "board/select": Valance.entry(Valance.command(state)(Schema.Struct({ id: Schema.String }), (_input, current) => current), (id) => ({ id })) }) }), /^board\/select$/, /adapter.*cannot be derived/);
  });

  it("an event that builds a payload without declaring its kind", () => {
    refuses(() => manifest({ primitives: { ...primitives, raw: { element: "input", events: { input: { type: "input", payload: () => "x" } } } }, scopes: { board: Board }, commands }), /^raw\.input$/, /Web\.event/);
  });

  it("a bare name that holds a binding, and an optional command input field", () => {
    refuses(() => manifest({ primitives, scopes: { board: Board }, commands: (state) => ({ select: Valance.entry(Valance.command(state)((current) => current)) }) }), /^select$/, /must hold a command/);
    refuses(() => manifest({ primitives, scopes: { board: Board }, commands: (state) => ({ find: Valance.command(state)(Schema.Struct({ q: Schema.optional(Schema.String) }), (_input, current) => current) }) }), /^find\.q$/, /optional input field/);
  });

  it("a Schema with no MESH type names where: a union of kinds, a tuple, a class, a view that is not a struct", () => {
    refuses(() => manifest({ primitives: {}, scopes: { v: Schema.Struct({ deep: Schema.Struct({ n: Schema.NullOr(Schema.String) }) }) }, commands: () => ({}) }), /^v\.deep\.n$/, /union of different kinds/);
    refuses(() => manifest({ primitives: {}, scopes: { v: Schema.Struct({ pair: Schema.Tuple(Schema.String, Schema.Number) }) }, commands: () => ({}) }), /^v\.pair$/, /tuple/);
    refuses(() => manifest({ primitives: {}, scopes: { v: Schema.Struct({ when: Schema.DateFromSelf }) }, commands: () => ({}) }), /^v\.when$/, /no MESH type/);
    refuses(() => manifest({ primitives: {}, scopes: { v: Schema.String as never }, commands: () => ({}) }), /^v$/, /Schema\.Struct/);
  });

  it("a name MESH reserves, a view that is also a tag, and a table that reads state while it is built", () => {
    refuses(() => manifest({ primitives: { "mesh-if": { element: "div" } }, scopes: {}, commands: () => ({}) }), /^mesh-if$/, /reserved/);
    refuses(() => manifest({ primitives, scopes: { page: Board }, commands }), /^page$/, /both a view and a primitive/);
    refuses(() => manifest({ primitives, scopes: { board: Board }, commands: (state) => { void Effect.runSync(state.get); return {}; } }), /^commands$/, /while it was being built/);
  });
});
