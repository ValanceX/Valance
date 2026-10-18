// A component's declared interface, turned into the model's own entry. Types are written in the host language's schema vocabulary (Effect's `Schema`) and converted by the one set of rules state
// already uses: Valance's `manifest`, which derives a scope's types from a `Schema.Struct`. A schema is put in a struct and read back, so there is no second converter to keep in step.
import type { Manifest, MeshType } from "@valancex/valance/web/build";
import { manifest } from "@valancex/valance/web/build";
import { Schema } from "effect";

import { isField, isSnippet } from "@valancex/common";

import type { Node } from "./tree.js";

type SchemaOf = Schema.Schema<any, any, never>;

/** The model's entry for a component: exactly the interface it declares. */
export interface Entry {
  readonly props: Readonly<Record<string, { readonly type: MeshType; readonly required: boolean; readonly default?: unknown }>>;
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
  /** The whole message, for a problem that is not a missing type. */
  readonly message?: string;
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

  for (const [name, declaration] of Object.entries(declared.props)) {
    try {
      if (isSnippet(declaration)) {
        // A piece of template: a prop of the component and a name its template reads (`{@render name(…)}`). It is not data, so it has no default and is never absent.
        if (name === "children" && declaration.params.length > 0) {
          throw new Error("`children` is the content between the component's tags, so it takes no parameters: write `snippet()`");
        }

        const params = declaration.params.map((schema) => {
          const type = typeOf(schema);

          return type.kind === "optional" ? type.type : type;
        });
        const type: MeshType = { kind: "snippet", params };

        // An optional one is `snippet<…>?` in the scope too: the template renders it only where `has(name)` says it is there.
        props[name] = declaration.isOptional ? { type: { kind: "optional", type }, required: false } : { type, required: true };
        scope[name] = declaration.isOptional ? { kind: "optional", type } : type;
        continue;
      }

      if (name === "children") {
        throw new Error("`children` is reserved for the content between the component's tags: declare it `snippet()`");
      }

      const schema = isField(declaration) ? declaration.schema : declaration;
      const type = typeOf(schema);
      const optional = type.kind === "optional";

      if (isField(declaration)) {
        // A default is for a component that has a template (the model applies it to those only) and is written as the schema encodes it. The prop may then be left out.
        if (!Schema.is(schema as SchemaOf)(declaration.initial)) {
          throw new Error("its default is not a value of its type");
        }

        props[name] = { type: optional ? type.type : type, required: false, default: Schema.encodeSync(schema as SchemaOf)(declaration.initial) };
      } else {
        props[name] = { type: optional ? type.type : type, required: !optional };
      }

      scope[name] = type;
    } catch (error) {
      problems.push({ kind: "props", name, reason: reasonOf(error) });
    }
  }

  for (const [name, schema] of Object.entries(declared.events)) {
    try {
      if (isEmpty(schema)) {
        events[name] = {};
        continue;
      }

      const type = typeOf(schema);

      events[name] = { payload: type.kind === "optional" ? type.type : type };
    } catch (error) {
      problems.push({ kind: "events", name, reason: reasonOf(error) });
    }
  }

  if (declared.name !== undefined) {
    const named = props[declared.name];

    if (named === undefined && !problems.some((each) => each.name === declared.name)) {
      problems.push({ kind: "props", name: declared.name, reason: "", message: `"${declared.name}" is declared as the component's name (\`name\`) but is not one of its props` });
    } else if (named !== undefined && (named.type.kind !== "string" || !named.required)) {
      problems.push({
        kind: "props",
        name: declared.name,
        reason: "",
        message: `the prop "${declared.name}" is the component's name (\`name\`), so it must be a string every use writes: \`Schema.String\`, with no default and not optional`,
      });
    }
  }

  return { entry: { props, events, commands: {}, scope }, problems };
};
