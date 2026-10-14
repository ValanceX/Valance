// The application's state beyond the page, however it was declared: field by field (`field(type, default)`), or as a hand-built schema with a separate initial value. Both become one thing here.
// No Node and no Vite: the browser entry loads this too.
import { Schema } from "effect";

import type { DefinedApp, Field } from "@valancex/common";
import { FIELD } from "@valancex/common";

export interface State {
  /** The struct of the state's fields. */
  readonly schema: Schema.Struct<Schema.Struct.Fields>;
  readonly initial: Readonly<Record<string, unknown>>;
  /** Whether it was declared field by field (so each default can be checked against its own type). */
  readonly declared: boolean;
}

const isField = (value: unknown): value is Field => typeof value === "object" && value !== null && FIELD in value;

/** The state a definition declares, or `undefined` for none. */
export const stateOf = (author: DefinedApp | undefined): State | undefined => {
  const state = author?.state as Record<string, unknown> | undefined;

  if (state === undefined) {
    return undefined;
  }

  const entries = Object.entries(state);

  // A hand-built state is `{ schema, initial }` where `schema` is a Schema; a field named `schema` is a Field.
  if (!entries.some(([, value]) => isField(value)) && "schema" in state && Schema.isSchema(state["schema"])) {
    return { schema: state["schema"] as State["schema"], initial: (state["initial"] ?? {}) as State["initial"], declared: false };
  }

  const fields = entries.filter((entry): entry is [string, Field] => isField(entry[1]));

  return {
    schema: Schema.Struct(Object.fromEntries(fields.map(([name, each]) => [name, each.schema]))) as State["schema"],
    initial: Object.fromEntries(fields.map(([name, each]) => [name, each.initial])),
    declared: true,
  };
};

/** The fields whose default is not a value of the field's own type (only for a state declared field by field). */
export const badDefaults = (author: DefinedApp | undefined): ReadonlyArray<string> => {
  const state = stateOf(author);

  if (state === undefined || !state.declared) {
    return [];
  }

  return Object.entries(state.schema.fields)
    .filter(([name, schema]) => !Schema.is(schema as Schema.Schema<unknown>)(state.initial[name]))
    .map(([name]) => name);
};
