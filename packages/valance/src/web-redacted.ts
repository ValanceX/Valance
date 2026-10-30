// Masking the embedded state (north-star refinements C-3). A state field typed `Schema.Redacted` is a secret: `renderToHtml` leaves it out of the `state` it returns, `Web.run` puts the
// field's declared default back when it hydrates, and `vlx check` refuses a Redacted field with no default or one a view's `scope` reads. A view cannot read it, so the tree does not depend on it.
// ponytail: `context` (Task 19) is a second projection that crosses to the client; add its reads to `problemsOf` the way `scope`'s are checked.
import type { Schema, SchemaAST } from "effect";

import type { Ambient, ApplicationDefinition } from "./index.js";

const REDACTED = Symbol.for("effect/annotation/TypeConstructor");

const isRedacted = (ast: SchemaAST.AST): boolean => {
  const own = ast._tag === "Transformation" ? ast.to : ast;

  return own._tag === "Declaration" && (own.annotations[REDACTED] as { readonly _tag?: string } | undefined)?._tag === "effect/Redacted";
};

/** The names of a state struct's top-level fields whose schema is `Schema.Redacted`, or a union with one (`NullOr(Redacted(...))`). Empty for a schema that is not a struct. */
export const redactedFields = (schema: Schema.Schema<any, any, any>): ReadonlyArray<string> => {
  const ast = schema.ast;

  if (ast._tag !== "TypeLiteral") {
    return [];
  }

  return ast.propertySignatures.flatMap((each) => (isMasked(each.type) ? [String(each.name)] : []));
};

const isMasked = (type: SchemaAST.AST): boolean => isRedacted(type) || (type._tag === "Union" && type.types.some(isRedacted));

/** Whether a Redacted sits anywhere inside `ast` (a cycle through `suspend` is not followed). */
const contains = (ast: SchemaAST.AST, seen = new Set<SchemaAST.AST>()): boolean => {
  if (seen.has(ast)) {
    return false;
  }

  seen.add(ast);

  const next = (each: SchemaAST.AST): boolean => contains(each, seen);

  switch (ast._tag) {
    case "Declaration":
      return isRedacted(ast) || ast.typeParameters.some(next);
    case "TypeLiteral":
      return ast.propertySignatures.some((each) => next(each.type)) || ast.indexSignatures.some((each) => next(each.type));
    case "TupleType":
      return ast.elements.some((each) => next(each.type)) || ast.rest.some((each) => next(each.type));
    case "Union":
      return ast.types.some(next);
    case "Refinement":
      return next(ast.from);
    case "Transformation":
      return isRedacted(ast) || next(ast.from) || next(ast.to);
    case "Suspend":
      return next(ast.f());
    default:
      return false;
  }
};

/**
 * The Redacted fields that cannot be masked: a Redacted below a top-level field (in a sub-struct, an array, a union with other members), or anywhere under a state schema that is not a plain
 * struct (a class, a filter, an `optionalWith` default). Each is a name, or `"(state)"` when the whole schema is not a struct. Masking is by top-level field name only.
 */
export const unmaskableFields = (schema: Schema.Schema<any, any, any>): ReadonlyArray<string> => {
  const ast = schema.ast;

  if (ast._tag !== "TypeLiteral") {
    return contains(ast) ? ["(state)"] : [];
  }

  return ast.propertySignatures.flatMap((each) =>
    isMasked(each.type) ? (each.type._tag === "Union" && each.type.types.some((member) => !isRedacted(member) && contains(member)) ? [String(each.name)] : []) : contains(each.type) ? [String(each.name)] : [],
  ).concat(ast.indexSignatures.some((each) => contains(each.type)) ? ["(index signature)"] : []);
};

/** The state without its Redacted fields: what a server may embed. */
export const withoutRedacted = <S>(schema: Schema.Schema<S, any, any>, state: S): S => {
  const hidden = redactedFields(schema);

  return hidden.length === 0 ? state : (Object.fromEntries(Object.entries(state as object).filter(([name]) => !hidden.includes(name))) as S);
};

/** The state a client starts from: what the server embedded, with each omitted Redacted field at its declared default. */
export const restoreRedacted = <S>(schema: Schema.Schema<S, any, any>, initial: S, embedded: S): S => {
  const hidden = redactedFields(schema);

  return hidden.length === 0 ? embedded : ({ ...Object.fromEntries(hidden.map((name) => [name, (initial as Record<string, unknown>)[name]])), ...embedded } as S);
};

export interface RedactedProblem {
  readonly code: "redacted-no-default" | "redacted-in-view" | "redacted-unmaskable";
  readonly field: string;
  readonly message: string;
}

/** What `vlx check` reports about Redacted fields: one that cannot be masked, one with no default, and a view whose `scope` or `view` selector reads one (run on the initial state, through a proxy that notes each read). */
export const problemsOf = <S, E, R extends Ambient, V extends string>(app: ApplicationDefinition<S, E, R, V>): ReadonlyArray<RedactedProblem> => {
  const hidden = redactedFields(app.state.schema);
  const initial = app.state.initial as Record<string, unknown>;
  const found: Array<RedactedProblem> = [
    ...unmaskableFields(app.state.schema).map((field): RedactedProblem => ({
      code: "redacted-unmaskable",
      field,
      message: `${field === "(state)" ? "the state schema" : `the state field "${field}"`} holds a Schema.Redacted that is not a top-level field of a struct, and only top-level fields are masked: make the secret a top-level field`,
    })),
    ...hidden
      .filter((name) => initial[name] === undefined)
      .map((field): RedactedProblem => ({ code: "redacted-no-default", field, message: `the state field "${field}" is Schema.Redacted and has no default: a client hydrates it to its default, so give it one` })),
  ];
  // Reads of a hidden field by `read`, run on the initial state; a function that throws for it is not this check's to report.
  const readsOf = (run: (state: S) => unknown): ReadonlySet<string> => {
    const read = new Set<string>();

    try {
      run(new Proxy(initial, { get: (target, key, receiver) => (typeof key === "string" && hidden.includes(key) && read.add(key), Reflect.get(target, key, receiver)) }) as S);
    } catch {
      // see above
    }

    return read;
  };
  const report = (what: string, read: ReadonlySet<string>) => {
    for (const field of read) {
      found.push({ code: "redacted-in-view", field, message: `${what} reads the state field "${field}", which is Schema.Redacted: a view (and what it shows) may not depend on a secret` });
    }
  };

  for (const [name, view] of Object.entries<{ readonly scope: (state: S) => unknown }>(app.views)) {
    report(`the view "${name}"`, readsOf(view.scope));
  }

  report("the view selector", readsOf(app.view));

  return found;
};
