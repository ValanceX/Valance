// `derived`: values worked out from the state, readable by name in a layout, with the type they were given; computed from each state, and the same on every target.
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { application, checkDefinition, frame, scopeSchema } from "../src/internal.js";
import type { Content } from "../src/internal.js";
import { defineApp, field } from "../src/index.js";

const content = { site: { name: "Site", base: "/", url: "", title: "{page} · {site}", api: "", announce: true }, pages: [] } as unknown as Content;

const author = defineApp({
  state: { items: field(Schema.Array(Schema.Struct({ id: Schema.String, done: Schema.Boolean })), []) },
  derived: (derive) => ({
    open: derive(Schema.Number, (state) => state.items.filter((item) => !item.done).length),
    summary: derive(Schema.String, (state) => `${state.items.filter((item) => !item.done).length} of ${state.items.length} open`),
  }),
});

describe("derived values", () => {
  it("are names the layout reads, with their types, beside the state's fields", () => {
    const accepts = Schema.is(scopeSchema(author) as Schema.Schema<unknown>);
    const known = frame(content, "/", "expanded");

    // a scope without the derived names, or with one of the wrong type, is not a scope of this application
    expect(accepts({ ...known, items: [], open: 0, summary: "" })).toBe(true);
    expect(accepts({ ...known, items: [], summary: "" })).toBe(false);
    expect(accepts({ ...known, items: [], open: "0", summary: "" })).toBe(false);
  });

  it("are computed from each state the layout is given", () => {
    const scope = application(content, {} as never, author).views["layout"]!.scope as (state: unknown) => Record<string, unknown>;
    const items = [
      { id: "a", done: true },
      { id: "b", done: false },
      { id: "c", done: false },
    ];

    expect(scope({ page: "/", viewport: "expanded", items })).toMatchObject({ open: 2, summary: "2 of 3 open" });
    expect(scope({ page: "/", viewport: "expanded", items: [] })).toMatchObject({ open: 0, summary: "0 of 0 open" });
  });

  it("may not take the name of a state field or of one the framework owns", () => {
    expect(() => checkDefinition(defineApp({ state: { items: field(Schema.Number, 0) }, derived: (derive) => ({ items: derive(Schema.Number, () => 1) }) }))).toThrow(
      /both a state field and a derived value/,
    );
    expect(() => checkDefinition(defineApp({ derived: (derive) => ({ viewport: derive(Schema.Number, () => 1) }) }))).toThrow(/already reads from the framework/);
  });
});
