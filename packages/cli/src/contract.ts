// A component's declared interface, turned into the model's own entry. Types are written in the host language's schema vocabulary (Effect's `Schema`) and converted by the one set of rules state
// already uses: Valance's `manifest`, which derives a scope's types from a `Schema.Struct`. A schema is put in a struct and read back, so there is no second converter to keep in step.
import type { Manifest, MeshType } from "@valancex/valance/web/build";
import { manifest } from "@valancex/valance/web/build";
import { Schema } from "effect";

import type { Node } from "./tree.js";

type SchemaOf = Schema.Schema<any, any, never>;

/** The model's entry for a component: exactly the interface it declares. */
export interface Entry {
  readonly props: Readonly<Record<string, { readonly type: MeshType; readonly required: boolean }>>;
  readonly events: Readonly<Record<string, { readonly payload?: MeshType }>>;
  readonly commands: Readonly<Record<string, never>>;
  /** Every prop is a name the template reads: the same name and type, absent when the prop may be. */
  readonly scope: Readonly<Record<string, MeshType>>;
}

/** A schema with no model type, said at the declaration. */
export interface Problem {
  readonly kind: "props" | "events";
  readonly name: string;
  readonly reason: string;
}

/** What a schema is in the model: put in a struct, so the rules are state's. A field that may be `undefined` comes back optional. */
export const typeOf = (schema: SchemaOf): MeshType => {
  const derived: Manifest = manifest({ primitives: {}, scopes: { contract: Schema.Struct({ value: schema }) }, commands: () => ({}) });

  return derived.components["contract"]!.scope["value"]!;
};

const reasonOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  return message.replace(/^[\w.]+: /, "");
};

/** No payload: the schema of nothing. */
const isEmpty = (schema: SchemaOf): boolean => ["VoidKeyword", "UndefinedKeyword"].includes(schema.ast._tag);

/** The entry a declared interface makes, and every schema in it that has no model type. */
export const entryOf = (declared: NonNullable<Node["interface"]>): { readonly entry: Entry; readonly problems: ReadonlyArray<Problem> } => {
  const problems: Array<Problem> = [];
  const props: Record<string, Entry["props"][string]> = {};
  const scope: Record<string, MeshType> = {};
  const events: Record<string, Entry["events"][string]> = {};

  for (const [name, schema] of Object.entries(declared.props)) {
    try {
      const type = typeOf(schema);
      const optional = type.kind === "optional";

      props[name] = { type: optional ? type.type : type, required: !optional };
      scope[name] = type;
    } catch (error) {
      problems.push({ kind: "props", name, reason: reasonOf(error) });
    }
  }

  for (const [name, schema] of Object.entries(declared.events)) {
    try {
      if (isEmpty(schema)) { events[name] = {}; continue; }

      const type = typeOf(schema);

      events[name] = { payload: type.kind === "optional" ? type.type : type };
    } catch (error) {
      problems.push({ kind: "events", name, reason: reasonOf(error) });
    }
  }

  return { entry: { props, events, commands: {}, scope }, problems };
};
