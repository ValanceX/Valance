// C-3: a state field typed `Schema.Redacted` never reaches the page. The server leaves it out of the state it embeds, the client puts its declared default back, and a view cannot read it,
// so the tree the client draws is the tree the server wrote.
import { Effect, Redacted, Schema } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { redactedFields } from "../src/index.js";
import { unmaskableFields } from "../src/web-redacted.js";
import { redactedProblems } from "../src/internal.js";
import type { HeadTags } from "../src/web-plugin.js";
import { restoreRedacted } from "../src/web-redacted.js";
import { renderToHtml } from "../src/web-server.js";
import { eventFreeProgram } from "./event-free-program.js";

// `RedactedFromSelf`: its encoded side is a Redacted too, so a Redacted default and a Redacted `state` option decode as they are (NEXUS decodes both).
const State = Schema.Struct({ name: Schema.String, token: Schema.RedactedFromSelf(Schema.String) });
type State = typeof State.Type;

const app = (options: { readonly scope?: (state: State) => Record<string, unknown>; readonly initial?: Partial<State> } = {}) =>
  Valance.define({
    name: "redacted",
    state: { schema: State, initial: { name: "ada", token: Redacted.make("default"), ...options.initial } as State },
    views: { only: { program: eventFreeProgram, scope: options.scope ?? ((state: State) => ({ name: state.name })) } },
    view: () => "only" as const,
    commands: () => ({}),
  });

describe("Schema.Redacted state fields (C-3)", () => {
  it("renderToHtml leaves the secret out of the embedded state, and the hydrated tree equals the server's", async () => {
    const secret = Redacted.make("hunter2");
    const served = await Effect.runPromise(renderToHtml(app(), { state: { name: "ada", token: secret } }));

    expect(served.state).toEqual({ name: "ada" });
    expect(JSON.stringify(served.state)).not.toContain("hunter2");
    expect(served.html).not.toContain("hunter2");

    // the client starts from what was embedded, restored to the declared default
    const definition = app();
    const client = restoreRedacted(definition.state.schema, definition.state.initial, served.state);

    expect(Redacted.value(client.token)).toBe("default");

    const again = await Effect.runPromise(renderToHtml(definition, { state: client }));

    expect(again.html).toBe(served.html);
  });

  it("finds a field by Schema.Redacted too, optional or not", () => {
    expect(redactedFields(Schema.Struct({ a: Schema.Redacted(Schema.String), b: Schema.optional(Schema.Redacted(Schema.String)), c: Schema.String }))).toEqual(["a", "b"]);
  });

  it("vlx check's reports: no default, and a view that reads the field", () => {
    expect(redactedProblems(app({ initial: { token: undefined as never } })).map((each) => each.code)).toEqual(["redacted-no-default"]);
    expect(redactedProblems(app({ scope: (state) => ({ name: state.name, token: state.token }) }))).toMatchObject([{ code: "redacted-in-view", field: "token" }]);
    expect(redactedProblems(app())).toEqual([]);
  });

  it("masks a union with a Redacted at the top level (NullOr)", async () => {
    const Nullable = Schema.Struct({ name: Schema.String, token: Schema.NullOr(Schema.RedactedFromSelf(Schema.String)) });
    const nullable = Valance.define({
      name: "nullable",
      state: { schema: Nullable, initial: { name: "ada", token: null } },
      views: { only: { program: eventFreeProgram, scope: (state: typeof Nullable.Type) => ({ name: state.name }) } },
      view: () => "only" as const,
      commands: () => ({}),
    });
    const served = await Effect.runPromise(renderToHtml(nullable, { state: { name: "ada", token: Redacted.make("hunter2") } }));

    expect(served.state).toEqual({ name: "ada" });
    expect(redactedFields(Nullable)).toEqual(["token"]);
    expect(redactedProblems(nullable)).toEqual([]);
  });

  it("refuses (redacted-unmaskable) a Redacted below the top level, or under a schema that is not a plain struct", () => {
    const R = Schema.RedactedFromSelf(Schema.String);
    const codes = (schema: Schema.Schema<any, any, never>) => unmaskableFields(schema);

    expect(codes(Schema.Struct({ a: Schema.Struct({ b: R }) }))).toEqual(["a"]);
    expect(codes(Schema.Struct({ a: Schema.Array(R) }))).toEqual(["a"]);
    expect(codes(Schema.Struct({ a: Schema.Union(R, Schema.Struct({ b: R })) }))).toEqual(["a"]);
    expect(codes(Schema.Struct({ a: Schema.Record({ key: Schema.String, value: R }) }))).toEqual(["a"]);
    class Held extends Schema.Class<Held>("Held")({ token: R }) {}
    expect(codes(Held)).toEqual(["(state)"]);
    expect(codes(Schema.Struct({ token: R }).pipe(Schema.filter(() => true)))).toEqual(["(state)"]);
    expect(codes(Schema.Struct({ token: Schema.optionalWith(R, { default: () => Redacted.make("d") }) }))).toEqual(["(state)"]);
    // top-level ones, and a struct with none, are fine
    expect(codes(Schema.Struct({ a: R, b: Schema.NullOr(R), c: Schema.String }))).toEqual([]);

    const nested = Valance.define({
      name: "nested",
      state: { schema: Schema.Struct({ a: Schema.Struct({ b: R }) }), initial: { a: { b: Redacted.make("x") } } },
      views: { only: { program: eventFreeProgram, scope: () => ({}) } },
      view: () => "only" as const,
      commands: () => ({}),
    });

    expect(redactedProblems(nested)).toMatchObject([{ code: "redacted-unmaskable", field: "a" }]);
  });

  it("reports a view selector that reads the field", () => {
    const selecting = Valance.define({
      name: "selecting",
      state: { schema: State, initial: { name: "ada", token: Redacted.make("d") } },
      views: { only: { program: eventFreeProgram, scope: () => ({}) } },
      view: (state: State) => (Redacted.value(state.token) === "d" ? ("only" as const) : ("only" as const)),
      commands: () => ({}),
    });

    expect(redactedProblems(selecting)).toMatchObject([{ code: "redacted-in-view", field: "token" }]);
  });

  it("gives the head the state the browser will have: a secret does not reach <head>", async () => {
    const heads: Array<unknown> = [];
    const head = (state: State): HeadTags => {
      heads.push(Redacted.value(state.token));

      return { title: `${state.name}` };
    };

    await Effect.runPromise(renderToHtml(app(), { state: { name: "ada", token: Redacted.make("hunter2") }, head }));
    expect(heads).toEqual(["default"]);
  });
});
