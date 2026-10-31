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
  /** The state and commands of one occurrence, when the component has a unit: their names join the scope and the commands in the model. */
  readonly unit?: {
    readonly state: Readonly<Record<string, { readonly type: MeshType; readonly default: unknown; readonly controllable?: boolean }>>;
    readonly commands: Readonly<Record<string, { readonly parameters: ReadonlyArray<{ readonly name: string; readonly type: MeshType }> }>>;
  };
  /** The context names the template reads (MESH 0.18): they join the scope, read only, and MESH checks each against the manifest's `context`. */
  readonly uses?: ReadonlyArray<string>;
}

/** A schema with no model type, said at the declaration. */
export interface Problem {
  readonly kind: "props" | "events" | "unit";
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

  const unit = declared.unit === undefined ? undefined : unitEntry(declared.unit, props, problems);

  // A controllable field is read in the template by the name of its prop, and the unit supplies that name (the prop's value when the caller writes it, else the unit's own); listing the prop in the scope
  // as well is `manifest-unit-clash` in MESH, for a field the docs say to declare this way (found building a tabs component outside the repository).
  for (const [name, each] of Object.entries(unit?.state ?? {})) {
    if (each.controllable === true) {
      delete scope[name];
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

  return { entry: { props, events, commands: {}, scope, ...(unit === undefined ? {} : { unit }), ...(declared.uses === undefined ? {} : { uses: declared.uses }) }, problems };
};

/** The model's `unit` of a component: each state field with its type and default, each command with its parameters. A field whose schema has no model type is a problem at the declaration. */
const unitEntry = (declared: NonNullable<NonNullable<Node["interface"]>["unit"]>, props: Entry["props"], problems: Array<Problem>): Entry["unit"] => {
  const state: Record<string, NonNullable<Entry["unit"]>["state"][string]> = {};
  const commands: Record<string, NonNullable<Entry["unit"]>["commands"][string]> = {};

  for (const [name, field] of Object.entries(declared.fields)) {
    try {
      const type = typeOf(field.schema);
      const controllable = declared.controllable.includes(name);

      if (!Schema.is(field.schema as SchemaOf)(field.initial)) {
        throw new Error("its default is not a value of its type");
      }

      if (controllable && props[name] === undefined) {
        throw new Error("it is `controllable`, so the component must declare a prop of the same name (optional, of the same type) for the caller to own it with");
      }

      state[name] = {
        type: type.kind === "optional" ? type.type : type,
        default: Schema.encodeSync(field.schema as SchemaOf)(field.initial),
        ...(controllable ? { controllable: true } : {}),
      };
    } catch (error) {
      problems.push({ kind: "unit", name, reason: reasonOf(error) });
    }
  }

  for (const [name, command] of Object.entries(declared.commands)) {
    try {
      const parameters = Object.entries(command.input?.fields ?? {}).map(([parameter, schema]) => {
        const type = typeOf(schema as SchemaOf);

        return { name: parameter, type: type.kind === "optional" ? type.type : type };
      });

      commands[name] = { parameters };
    } catch (error) {
      problems.push({ kind: "unit", name, reason: reasonOf(error) });
    }
  }

  return { state, commands };
};
