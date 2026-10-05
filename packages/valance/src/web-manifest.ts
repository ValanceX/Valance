/**
 * The MESH component manifest, derived. A manifest says which tags a view's templates may use and what each takes, and what the view itself may read and run. All of that
 * is already stated by the application:
 *
 *   tags and their props and events   the Web primitives table (PORT's realization of each tag), the same one the target is given
 *   what a view may read              the view's scope Schema, which also types its `scope` function
 *   what a view may run               the command table: each bare command's input Schema gives its parameters, in field order (the order `start` already binds arguments in)
 *
 * What is fixed plumbing and never written by anyone: the format version, the (empty) named types, the (empty) commands and scope of a primitive, and the two reserved
 * structural tags, `mesh-if` and `mesh-each`.
 *
 * What is NOT derived, and why (each is an error here, not a silent default):
 *   - an exact `"component/name"` command key: `entry`'s adapter turns an event's arguments into the command's input with an opaque function, so the parameters a template
 *     passes cannot be known. Name the command by its bare name (arguments in field order), or write the manifest by hand.
 *   - the kind of an event's payload: a payload function does not say what it builds. Build the event with `Web.event(type, { kind, of })`.
 *   - an optional text prop: whether a prop must be written is not stated by its realization, so every prop is required except a boolean one (a boolean attribute is absent
 *     when false). To make a text prop optional, write the manifest by hand.
 * Build time only; it imports nothing at run time and is pure.
 */
import type { WebPrimitives } from "@valancex/port-web";
import type * as Nexus from "@valancex/nexus";

import { Schema, SchemaAST as AST } from "effect";

import { payloadKindOf } from "./web-payload.js";

export class ManifestError extends Error {
  readonly _tag = "ManifestError";

  constructor(readonly path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = "ManifestError";
  }
}

/** A MESH type (manifest format 1). */
export type MeshType =
  | { readonly kind: "string" | "number" | "boolean" | "null" | "any" }
  | { readonly kind: "list"; readonly element: MeshType }
  | { readonly kind: "record"; readonly fields: Readonly<Record<string, { readonly type: MeshType; readonly required: boolean }>> }
  | { readonly kind: "optional"; readonly type: MeshType };

export interface Manifest {
  readonly version: 1;
  readonly types: Readonly<Record<string, never>>;
  readonly components: Readonly<Record<string, {
    readonly props: Readonly<Record<string, { readonly type: MeshType; readonly required: boolean }>>;
    readonly events: Readonly<Record<string, { readonly payload?: MeshType }>>;
    readonly commands: Readonly<Record<string, { readonly parameters: ReadonlyArray<{ readonly name: string; readonly type: MeshType }> }>>;
    readonly scope: Readonly<Record<string, MeshType>>;
  }>>;
}

export interface ManifestOptions {
  /** The application's Web realization table: its tags, and each tag's props and events. */
  readonly primitives: WebPrimitives;
  /** Each view's scope Schema, by the view's name (its key in `define`'s `views`): every name the view's template may read. */
  readonly scopes: Readonly<Record<string, Schema.Schema<any, any, never>>>;
  /** The application's `commands`: the very function `define` takes. It is called once, with a state that fails if the table reads it while being built. */
  readonly commands: (state: Nexus.State.StateHandle<any>) => Readonly<Record<string, unknown>>;
}

// ---- Schema → MESH type -------------------------------------------------------------------------------------------------------------------------------------------

type Field = { readonly type: MeshType; readonly required: boolean };

const typeOf = (ast: AST.AST, path: string): MeshType => {
  switch (ast._tag) {
    case "StringKeyword": return { kind: "string" };
    case "NumberKeyword": return { kind: "number" };
    case "BooleanKeyword": return { kind: "boolean" };
    case "AnyKeyword":
    case "UnknownKeyword": return { kind: "any" };
    case "Literal":
      if (ast.literal === null) {
        return { kind: "null" };
      }

      return { kind: typeof ast.literal === "number" ? "number" : typeof ast.literal === "boolean" ? "boolean" : "string" };
    case "Refinement": return typeOf(ast.from, path);
    case "Union": {
      const members = ast.types.filter((member) => member._tag !== "UndefinedKeyword");
      const kinds = new Set(members.map((member) => typeOf(member, path)).map((type) => JSON.stringify(type)));

      if (kinds.size !== 1) {
        throw new ManifestError(path, `a union of different kinds has no MESH type${members.some((member) => member._tag === "Literal" && member.literal === null) ? " (null is a value in MESH, a type of its own; MESH has no union, so say which)" : ""}`);
      }

      const only = typeOf(members[0]!, path);

      return members.length === ast.types.length ? only : { kind: "optional", type: only };
    }
    case "TupleType":
      if (ast.elements.length === 0 && ast.rest.length === 1) {
        return { kind: "list", element: typeOf(ast.rest[0]!.type, `${path}[]`) };
      }

      throw new ManifestError(path, "a fixed-length tuple has no MESH type; use an array");
    case "TypeLiteral": {
      if (ast.indexSignatures.length > 0) {
        throw new ManifestError(path, "a record with an index signature has no MESH type; name its fields");
      }

      return { kind: "record", fields: Object.fromEntries(ast.propertySignatures.map((property) => [String(property.name), fieldOf(property, `${path}.${String(property.name)}`)])) };
    }
    default:
      throw new ManifestError(path, `${ast._tag} has no MESH type`);
  }
};

const fieldOf = (property: AST.PropertySignature, path: string): Field => {
  const withoutUndefined = property.type._tag === "Union" ? AST.Union.make(property.type.types.filter((member) => member._tag !== "UndefinedKeyword")) : property.type;

  // `p?: T` (and `p?: T | undefined`) may be left out; `p: T | undefined` must be written but may be absent.
  return property.isOptional
    ? { type: typeOf(withoutUndefined, path), required: false }
    : { type: typeOf(property.type, path), required: true };
};

const structOf = (schema: Schema.Schema<any, any, never>, path: string): AST.TypeLiteral => {
  const ast = AST.typeAST(schema.ast);

  if (ast._tag !== "TypeLiteral" || ast.indexSignatures.length > 0) {
    throw new ManifestError(path, "must be a Schema.Struct: it names the values the view reads");
  }

  return ast;
};

// ---- the three sources ---------------------------------------------------------------------------------------------------------------------------------------------

const propOf = (name: string, realization: NonNullable<WebPrimitives[string]["props"]>[string], path: string): Field => {
  switch (realization.kind) {
    case "attribute":
    case "controlled":
    case "text-property": return { type: { kind: "string" }, required: true };
    case "boolean-attribute": return { type: { kind: "boolean" }, required: false };
    case "property": return { type: { kind: realization.holds === "value" ? "any" : realization.holds }, required: realization.holds !== "boolean" };
    default: throw new ManifestError(path, `the realization of prop \`${name}\` is not one this version derives (${String((realization as { kind: unknown }).kind)})`);
  }
};

const tagOf = (tag: string, primitive: WebPrimitives[string]): Manifest["components"][string] => ({
  props: Object.fromEntries(Object.entries(primitive.props ?? {}).map(([name, realization]) => [name, propOf(name, realization, `${tag}.${name}`)])),
  events: Object.fromEntries(Object.entries(primitive.events ?? {}).map(([name, realization]) => {
    if (realization.payload === undefined) {
      return [name, {}];
    }

    const kind = payloadKindOf(realization);

    if (kind === undefined) {
      throw new ManifestError(`${tag}.${name}`, "the event builds a payload, but the kind of that payload is not declared. Build it with Web.event(type, { kind, of }): a function does not say what it builds");
    }

    return [name, { payload: { kind } as MeshType }];
  })),
  commands: {},
  scope: {},
});

const commandsOf = (table: Readonly<Record<string, unknown>>, views: ReadonlySet<string>): Manifest["components"][string]["commands"] => {
  const commands: Record<string, { readonly parameters: ReadonlyArray<{ readonly name: string; readonly type: MeshType }> }> = {};

  for (const [key, value] of Object.entries(table)) {
    if (key.startsWith("app/")) {
      continue;                                            // an entry for `invoke`, history and `start`: no template runs it
    }

    if (key.includes("/")) {
      throw new ManifestError(key, `an exact "component/name" key binds an \`entry\`, whose adapter turns the event's arguments into the command's input with a function; the parameters a template passes cannot be derived from it${views.has(key.split("/")[0]!) ? "" : " (and the component is not one of the views)"}. Name the command by its bare name, whose arguments are its input's fields in order, or write the manifest by hand`);
    }

    if (typeof value !== "object" || value === null || !("input" in value)) {
      throw new ManifestError(key, "a bare name must hold a command (a function such as an `entry` belongs under an exact key)");
    }

    const input = (value as { readonly input: Schema.Schema<any, any, never> }).input;
    const ast = AST.typeAST(input.ast);

    commands[key] = {
      parameters: ast._tag === "TypeLiteral" && ast.indexSignatures.length === 0
        ? ast.propertySignatures.map((property) => {
          const field = fieldOf(property, `${key}.${String(property.name)}`);

          if (!field.required) {
            throw new ManifestError(`${key}.${String(property.name)}`, "an optional input field cannot be a manifest parameter: every parameter is required, and an invocation passes exactly that many arguments");
          }

          return { name: String(property.name), type: field.type };
        })
        : [{ name: "value", type: typeOf(ast, key) }],
    };
  }

  return commands;
};

const noState = new Proxy({}, { get: (_target, property) => { throw new ManifestError("commands", `the table read state.${String(property)} while it was being built; a table is built without reading state (commands read it when they RUN)`); } }) as Nexus.State.StateHandle<any>;

/** The manifest of an application, derived from its Web primitives table, its views' scope Schemas and its command table. Pass it to `compileProgram` as JSON. */
export const manifest = (options: ManifestOptions): Manifest => {
  const views = new Set(Object.keys(options.scopes));
  const commands = commandsOf(options.commands(noState), views);

  for (const name of [...Object.keys(options.primitives), ...views]) {
    if (name === "mesh-if" || name === "mesh-each") {
      throw new ManifestError(name, "is reserved by MESH for conditional and repeated structure, and is declared for you");
    }
  }

  for (const view of views) {
    if (Object.hasOwn(options.primitives, view)) {
      throw new ManifestError(view, "is both a view and a primitive tag");
    }
  }

  return {
    version: 1,
    types: {},
    components: {
      ...Object.fromEntries(Object.entries(options.primitives).map(([tag, primitive]) => [tag, tagOf(tag, primitive)])),
      "mesh-if": { props: { when: { type: { kind: "boolean" }, required: true } }, events: {}, commands: {}, scope: {} },
      "mesh-each": { props: { items: { type: { kind: "list", element: { kind: "any" } }, required: true }, as: { type: { kind: "string" }, required: true }, key: { type: { kind: "any" }, required: true } }, events: {}, commands: {}, scope: {} },
      ...Object.fromEntries(Object.entries(options.scopes).map(([view, schema]) => [view, {
        props: {},
        events: {},
        commands,                                            // a bare command is every view's, as `start` binds it to every declared `component/name`
        scope: Object.fromEntries(structOf(schema, view).propertySignatures.map((property) => {
          const field = fieldOf(property, `${view}.${String(property.name)}`);

          return [String(property.name), field.required ? field.type : { kind: "optional", type: field.type }];
        })),
      }])),
    },
  };
};
