// Forms from the schema (direction Bet 11). One description of valid: the schema the submitted command takes. A form reads it once for what a screen needs (a field's name, kind, title, constraints), keeps
// what the person typed as text, and decides from the same schema what is wrong and when to say so. It is a model, not a primitive: the fields are drawn with the ordinary `textfield`, `checkbox` and
// `radiogroup`, and the state is the application's own (a field of its state), so the command that submits reads every draft.
//
//   const Signup = Schema.Struct({ name: Schema.String.pipe(Schema.minLength(2)).annotations({ title: "Name", message: () => "Enter at least 2 characters" }), … });
//   const signup = Form.make(Signup);
//   defineApp({ state: { signup: signup.field() }, derived: (derive) => ({ form: signup.view(derive, (s) => s.signup) }), commands: (command) => signup.commands(command, { … }), … });
//
// What it keeps for each field: the text typed (`value`), whether the person has left the field (`touched`), and the message a server gave it (`remote`). `dirty` and the message are worked out. An error is
// shown for a field when it is wrong and the person has left the field once or tried to submit (stricter than Angular's dirty-or-touched and Phoenix's used-input, so the first keystroke is not an error); once
// shown it follows the typing. A failed submit touches every field. Tier 1: the defaults are the whole interface; the options (`initial`, `message`, `required`) are Tier 2.
import { Either, Option, ParseResult, Schema, SchemaAST as AST } from "effect";

import type { Derived, DeriveMaker, Field } from "./index.js";
import { FIELD } from "./index.js";

/** A mistake in the schema a form is made from, said at the declaration and naming the field. */
export class FormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormError";
  }
}

/** What a field is, for choosing how to draw it: a line of text, a secret one, a number the person types as text, a yes or no, one of a closed set. */
export type Kind = "text" | "password" | "number" | "boolean" | "choice";

/** One field of the schema, as a screen needs to know it. Static: it is the same for every state. */
export interface Descriptor {
  /** Where the field is in the schema, joined with dots for a nested record: `address.zip`. */
  readonly name: string;
  readonly path: ReadonlyArray<string>;
  /** The label: the schema's `title` annotation. */
  readonly title: string;
  readonly kind: Kind;
  /** Whether a value must be given. A text field that is left empty is absent when the field is optional. */
  readonly required: boolean;
  /** The values of a closed set, in the schema's order. */
  readonly choices: ReadonlyArray<string>;
  /** The constraints the schema's refinements declare, as JSON Schema keywords: `minLength`, `maximum`, `pattern`, … */
  readonly constraints: Readonly<Record<string, unknown>>;
  /** Whether the value is a secret: it is never in a draft, and the default message never repeats it. */
  readonly redacted: boolean;
  /** Whether the schema gives its own message for the field's constraints. */
  readonly hasMessage: boolean;
}

/** What the form keeps: all of it plain data, so it can be a field of the application's state. */
export interface State {
  /** The text each field holds (a yes or no for a boolean one), by field name. */
  readonly values: Readonly<Record<string, string | boolean>>;
  /** The fields the person has left. */
  readonly touched: Readonly<Record<string, true>>;
  /** Whether a submit has been tried. */
  readonly attempted: boolean;
  /** The messages a server gave, by field name; a field's is gone when it is edited. */
  readonly remote: Readonly<Record<string, string>>;
}

export const StateSchema: Schema.Schema<State> = Schema.Struct({
  values: Schema.Record({ key: Schema.String, value: Schema.Union(Schema.String, Schema.Boolean) }),
  touched: Schema.Record({ key: Schema.String, value: Schema.Literal(true) }),
  attempted: Schema.Boolean,
  remote: Schema.Record({ key: Schema.String, value: Schema.String }),
}) as unknown as Schema.Schema<State>;

/** What a template reads about one field. */
export interface FieldView {
  readonly name: string;
  readonly title: string;
  readonly kind: Kind;
  /** The `kind` of a `textfield` that holds it: `password` for a secret, `text` otherwise. */
  readonly input: string;
  readonly required: boolean;
  readonly choices: ReadonlyArray<string>;
  readonly value: string;
  readonly checked: boolean;
  /** Whether an error is shown for the field now. */
  readonly invalid: boolean;
  /** The message to show, empty when none is shown. */
  readonly error: string;
  /** The address of the element that shows the message: what the control's `describedby` names. Empty when no message is shown. */
  readonly errorId: string;
  readonly touched: boolean;
  readonly dirty: boolean;
}

/** What a template reads about the form. */
export interface View {
  readonly fields: ReadonlyArray<FieldView>;
  /** Whether the schema accepts what is typed (whatever is shown). */
  readonly valid: boolean;
  /** After a failed submit: how many fields need attention, for a live region. Empty otherwise. */
  readonly message: string;
  /** The first field with an error shown: where a failed submit takes the person. Empty when none. */
  readonly first: string;
  readonly submitted: boolean;
}

const FieldViewSchema = Schema.Struct({
  name: Schema.String,
  title: Schema.String,
  kind: Schema.Literal("text", "password", "number", "boolean", "choice"),
  input: Schema.String,
  required: Schema.Boolean,
  choices: Schema.Array(Schema.String),
  value: Schema.String,
  checked: Schema.Boolean,
  invalid: Schema.Boolean,
  error: Schema.String,
  errorId: Schema.String,
  touched: Schema.Boolean,
  dirty: Schema.Boolean,
});

/** The type of `View`, for the derived value a template reads. */
export const ViewSchema: Schema.Schema<View> = Schema.Struct({
  fields: Schema.Array(FieldViewSchema),
  valid: Schema.Boolean,
  message: Schema.String,
  first: Schema.String,
  submitted: Schema.Boolean,
}) as unknown as Schema.Schema<View>;

/** Messages by field name that a server (or any check the client cannot make) gives: a command that fails with this has the form show them as if the schema had said so. */
export interface FieldErrors {
  readonly _tag: "FieldErrors";
  readonly errors: Readonly<Record<string, string>>;
}

export const fieldErrors = (errors: Readonly<Record<string, string>>): FieldErrors => ({ _tag: "FieldErrors", errors });

/** What a translation function is told about a leaf of the schema's own report, for a field that has no `message` of its own. */
export interface Issue {
  readonly path: ReadonlyArray<string>;
  /** Which check failed: the schema id of a refinement (`minLength`, `int`, …) or the kind of the report (`Type`, `Missing`, …). */
  readonly code: string;
  /** The check's parameters, as JSON Schema keywords: `{ minLength: 2 }`. */
  readonly params: Readonly<Record<string, unknown>>;
  /** What was typed. Absent for a secret field. */
  readonly actual: unknown;
}

export interface Options<I> {
  /** The text each field starts with. Absent: empty text, and `false` for a boolean. */
  readonly initial?: Partial<I>;
  /** The words for a field that has no `message` annotation. Absent: the schema's own text, which is for developers. */
  readonly message?: (issue: Issue) => string | undefined;
}

/** The result of trying to submit. */
export type Submitted<A> = { readonly ok: true; readonly value: A; readonly state: State } | { readonly ok: false; readonly state: State };

/** A form made from a schema. */
export interface Form<A, I> {
  /** The fields, in the schema's order. */
  readonly fields: ReadonlyArray<Descriptor>;
  /** The state a form starts in. */
  readonly initial: State;
  /** The schema, as the Standard Schema interface (`~standard`), for tools that take that. */
  readonly standard: unknown;
  /** Things in the schema worth a word to its author: a constraint with no message of its own. Empty when there are none. */
  readonly warnings: ReadonlyArray<string>;
  /** The form as a field of the application's state. */
  readonly field: () => Field<State>;
  /** What a template reads, for a state. */
  readonly view: {
    (state: State): View;
    /** As a derived value of the application: `signup.view(derive, (state) => state.signup)`. */
    <S>(derive: DeriveMaker<S>, from: (state: S) => State): Derived<View>;
  };
  readonly edit: (state: State, name: string, value: string) => State;
  readonly check: (state: State, name: string, value: boolean) => State;
  readonly blur: (state: State, name: string) => State;
  /** Tries to submit: the decoded value when the schema accepts what is typed, and in any case the state with every field touched. */
  readonly submit: (state: State) => Submitted<A>;
  /** The messages of a failed command, shown on their fields. */
  readonly reject: (state: State, errors: FieldErrors) => State;
  /** What was typed, without secrets, to keep and give back: `initial` takes it. */
  readonly draft: (state: State) => Draft;
  /** The state a draft makes. */
  readonly restore: (draft: Draft) => State;
  /** The commands of the form on the application's state: `edit(name, text)`, `check(name, yes)`, `blur(name)` and `submit()`. */
  readonly commands: <S>(command: CommandMaker<S>, how: Where<S, A>) => Commands;
  /** The encoded type, for a caller that wants to name it. */
  readonly encoded?: I;
}

/** What was typed, serializable. Never has a secret. */
export interface Draft {
  /** Which schema it is for: a draft of another shape is not restored. */
  readonly version: string;
  readonly values: Readonly<Record<string, string | boolean>>;
}

/** The commands a form adds to the application's table. */
export interface Commands {
  readonly edit: unknown;
  readonly check: unknown;
  readonly blur: unknown;
  readonly submit: unknown;
}

/** Where the form is in the application's state, and what a submit that the schema accepts does. */
export interface Where<S, A> {
  readonly get: (state: S) => State;
  readonly set: (state: S, form: State) => S;
  /** The application's state after a submit that the schema accepted, from the decoded value. The form keeps what was typed. */
  readonly then: (state: S, value: A) => S;
}

/** The part of `Valance.CommandMaker` the form uses, so this file imports no more of Valance than that. */
export interface CommandMaker<S> {
  <I>(input: Schema.Schema<I, any, never>, transition: (input: I, current: S) => S): unknown;
}

// ---- describing a schema ----------------------------------------------------------------------------------------------------------------------------------------

const SCHEMA_ID = AST.SchemaIdAnnotationId;
/** The titles Effect gives a refinement or a keyword by itself: `minLength(2)`, `int`, `string`. An author's title is anything else. */
const generated = (title: string): boolean => /^\w+\(.*\)$/.test(title) || ["string", "number", "boolean", "int", "nonEmpty", "trimmed", "lowercased", "uppercased", "finite", "nonNaN"].includes(title);

const titleOf = (node: AST.AST | AST.PropertySignature): string | undefined => {
  const given = node.annotations[AST.TitleAnnotationId];

  return typeof given === "string" && !generated(given) ? given : undefined;
};

const unwrapOptional = (ast: AST.AST): AST.AST => {
  if (ast._tag !== "Union") {
    return ast;
  }

  const rest = ast.types.filter((each) => each._tag !== "UndefinedKeyword");

  return rest.length === 1 ? rest[0]! : ast;
};

/** The encoded base of a type (what is typed) and its decoded base, the refinements met on the way down, and the titles. */
const baseOf = (given: AST.AST, side: "encoded" | "decoded", refinements: Array<AST.Refinement> = []): { readonly base: AST.AST; readonly refinements: ReadonlyArray<AST.Refinement> } => {
  const ast = unwrapOptional(given);

  if (ast._tag === "Refinement") {
    refinements.push(ast);

    return baseOf(ast.from, side, refinements);
  }

  if (ast._tag === "Transformation") {
    return baseOf(side === "encoded" ? ast.from : ast.to, side, refinements);
  }

  if (ast._tag === "Suspend") {
    return baseOf(ast.f(), side, refinements);
  }

  return { base: ast, refinements };
};

const literalsOf = (ast: AST.AST): ReadonlyArray<string | number | boolean> | undefined => {
  if (ast._tag === "Literal") {
    return typeof ast.literal === "bigint" || ast.literal === null ? undefined : [ast.literal];
  }

  if (ast._tag === "Union") {
    const each = ast.types.map(literalsOf);

    return each.every((one) => one !== undefined) ? each.flat() as ReadonlyArray<string | number | boolean> : undefined;
  }

  return undefined;
};

const describeField = (path: ReadonlyArray<string>, ps: AST.PropertySignature): Descriptor => {
  const name = path.join(".");
  const encoded = baseOf(ps.type, "encoded");
  const decoded = baseOf(ps.type, "decoded");
  const chain = [...encoded.refinements, ...decoded.refinements.filter((each) => !encoded.refinements.includes(each))];
  const title = titleOf(ps) ?? titleOf(ps.type) ?? chain.map(titleOf).find((each) => each !== undefined);

  if (title === undefined) {
    throw new FormError(`Form: the field "${name}" has no title: give the schema \`.annotations({ title: "…" })\`, the label the person reads (and the name a screen reader says)`);
  }

  const optional = ps.isOptional || (ps.type._tag === "Union" && ps.type.types.some((each) => each._tag === "UndefinedKeyword"));
  const constraints = Object.assign({}, ...chain.map((each) => (each.annotations[AST.JSONSchemaAnnotationId] as Record<string, unknown> | undefined) ?? {})) as Record<string, unknown>;
  const hasMessage = chain.some((each) => each.annotations[AST.MessageAnnotationId] !== undefined) || ps.type.annotations[AST.MessageAnnotationId] !== undefined;
  const typed = encoded.base;
  const literals = literalsOf(typed);
  let kind: Kind;
  let choices: ReadonlyArray<string> = [];
  let redacted = false;

  if (typed._tag === "StringKeyword" && decoded.base._tag === "Declaration") {
    kind = "password";
    redacted = true;
  } else if (typed._tag === "StringKeyword") {
    kind = decoded.base._tag === "NumberKeyword" ? "number" : "text";
  } else if (typed._tag === "NumberKeyword") {
    kind = "number";
  } else if (typed._tag === "BooleanKeyword" || (literals !== undefined && literals.length === 1 && typeof literals[0] === "boolean")) {
    kind = "boolean";
  } else if (literals !== undefined && literals.every((each) => typeof each === "string")) {
    kind = "choice";
    choices = literals as ReadonlyArray<string>;
  } else if (typed._tag === "TypeLiteral" || typed._tag === "TupleType") {
    throw new FormError(`Form: the field "${name}" is ${typed._tag === "TupleType" ? "a list" : "a record"} where a value is needed (lists of fields are not supported yet; flat and nested records are)`);
  } else {
    throw new FormError(`Form: the field "${name}" has a type a form cannot draw (${typed._tag}): text, a number typed as text, a boolean, a closed set of strings, or a secret`);
  }

  return { name, path, title, kind, required: !optional && kind !== "boolean", choices, constraints, redacted, hasMessage };
};

type Said = (issue: ParseResult.ParseIssue) => unknown;

/** The message the author wrote on a field's type (or on the field), by field name: what the field says whichever of its checks fails. */
const fieldMessagesOf = (ast: AST.AST, path: ReadonlyArray<string> = []): Map<string, Said> => {
  const found = new Map<string, Said>();
  const record = baseOf(ast, "decoded").base;

  if (record._tag !== "TypeLiteral") {
    return found;
  }

  for (const ps of record.propertySignatures) {
    if (typeof ps.name !== "string") {
      continue;
    }

    const here = [...path, ps.name];
    const inner = baseOf(ps.type, "encoded").base;

    if (inner._tag === "TypeLiteral") {
      fieldMessagesOf(inner, here).forEach((value, key) => found.set(key, value));
      continue;
    }

    const said = ps.annotations[AST.MessageAnnotationId] ?? unwrapOptional(ps.type).annotations[AST.MessageAnnotationId];

    if (typeof said === "function") {
      found.set(here.join("."), said as Said);
    }
  }

  return found;
};

const describe = (ast: AST.AST, path: ReadonlyArray<string> = []): ReadonlyArray<Descriptor> => {
  const { base } = baseOf(ast, "decoded");
  const record = base._tag === "TypeLiteral" ? base : baseOf(ast, "encoded").base;

  if (record._tag !== "TypeLiteral") {
    throw new FormError("Form: a form is made from a struct: `Schema.Struct({ … })`");
  }

  return record.propertySignatures.flatMap((ps) => {
    if (typeof ps.name !== "string") {
      return [];
    }

    const here = [...path, ps.name];
    const inner = baseOf(ps.type, "encoded").base;

    return inner._tag === "TypeLiteral" ? describe(inner, here) : [describeField(here, ps)];
  });
};

// ---- the report of a decode ------------------------------------------------------------------------------------------------------------------------------------

interface Leaf {
  readonly path: ReadonlyArray<string>;
  readonly issue: ParseResult.ParseIssue;
  /** Whether a rule over the whole struct gave it, with a message of its own. */
  readonly spoken: boolean;
}

const leaves = (issue: ParseResult.ParseIssue, path: ReadonlyArray<string>, spoken = false): ReadonlyArray<Leaf> => {
  switch (issue._tag) {
    case "Pointer":
      return leaves(issue.issue, [...path, ...(Array.isArray(issue.path) ? issue.path : [issue.path]).map(String)], spoken);
    case "Composite":
      return (Array.isArray(issue.issues) ? issue.issues : [issue.issues]).flatMap((each) => leaves(each, path, spoken));
    case "Refinement":
      // A rule over a whole struct reports at the paths it names (a Pointer inside): those are the leaves, not the rule.
      if (issue.kind === "From") {
        return leaves(issue.issue, path, spoken);
      }

      return issue.issue._tag === "Pointer" || issue.issue._tag === "Composite" ? leaves(issue.issue, path, true) : [{ path, issue, spoken }];
    case "Transformation":
      return leaves(issue.issue, path, spoken);
    default:
      return [{ path, issue, spoken }];
  }
};

const codeOf = (issue: ParseResult.ParseIssue): { readonly code: string; readonly params: Record<string, unknown> } => {
  const ast = "ast" in issue ? (issue.ast as AST.AST) : undefined;
  const id = ast?.annotations[SCHEMA_ID];
  const params = (ast?.annotations[AST.JSONSchemaAnnotationId] as Record<string, unknown> | undefined) ?? {};

  return { code: typeof id === "symbol" ? (id.description ?? "").replace(/^effect\/SchemaId\//, "") : issue._tag, params };
};

const summary = (descriptor: Descriptor): string => {
  const { minLength, maxLength, minimum, maximum } = descriptor.constraints as Record<string, number | undefined>;

  if (descriptor.kind === "choice") {
    return `Choose one of: ${descriptor.choices.join(", ")}`;
  }

  if (minimum !== undefined && maximum !== undefined) {
    return `Enter a number from ${minimum} to ${maximum}`;
  }

  if (minLength !== undefined) {
    return `Enter at least ${minLength} characters`;
  }

  if (maxLength !== undefined) {
    return `Enter at most ${maxLength} characters`;
  }

  return descriptor.kind === "boolean" ? "This must be checked" : "Enter a valid value";
};

// ---- making a form ----------------------------------------------------------------------------------------------------------------------------------------------------

const hash = (text: string): string => {
  let value = 5381;

  for (let at = 0; at < text.length; at += 1) {
    value = ((value << 5) + value + text.charCodeAt(at)) >>> 0;
  }

  return value.toString(36);
};

const setIn = (target: Record<string, unknown>, path: ReadonlyArray<string>, value: unknown): void => {
  let at = target;

  for (const step of path.slice(0, -1)) {
    at = (at[step] ??= {}) as Record<string, unknown>;
  }

  at[path[path.length - 1]!] = value;
};

export function make<A, I>(schema: Schema.Schema<A, I, never>, options: Options<I> = {}): Form<A, I> {
  const fields = describe(schema.ast);
  const byName = new Map(fields.map((each) => [each.name, each] as const));
  const fieldMessages = fieldMessagesOf(schema.ast);
  const warnings = fields.filter((each) => !each.hasMessage && Object.keys(each.constraints).length > 0).map((each) => `${each.name}: its constraints (${Object.keys(each.constraints).join(", ")}) have no message of their own: add \`message\` to the schema, or a \`message\` function to the form's options`);
  const given = (options.initial ?? {}) as Record<string, unknown>;
  const valueOf = (descriptor: Descriptor): string | boolean => {
    const at = descriptor.path.reduce<unknown>((value, step) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[step] : undefined), given);

    return typeof at === "boolean" ? at : at === undefined ? (descriptor.kind === "boolean" ? false : "") : String(at);
  };
  const initial: State = { values: Object.fromEntries(fields.map((each) => [each.name, valueOf(each)])), touched: {}, attempted: false, remote: {} };
  const version = hash(fields.map((each) => `${each.name}:${each.kind}`).join("|"));
  const known = (name: string): Descriptor => {
    const found = byName.get(name);

    if (found === undefined) {
      throw new FormError(`Form: there is no field "${name}" (the fields: ${fields.map((each) => each.name).join(", ")})`);
    }

    return found;
  };

  /** What the schema says is wrong with what is typed: a message for each field (and `""` for the form as a whole), the first the schema gives. */
  const problems = (state: State): { readonly value?: A; readonly errors: ReadonlyMap<string, string> } => {
    const encoded: Record<string, unknown> = {};

    for (const each of fields) {
      const value = state.values[each.name];

      if (typeof value === "string" && value === "" && !each.required) {
        continue;
      }

      if (each.kind === "choice" && value === "") {
        continue;
      }

      setIn(encoded, each.path, value);
    }

    const result = Schema.decodeUnknownEither(schema as Schema.Schema<A, any, never>, { errors: "all", onExcessProperty: "ignore" })(encoded);

    if (Either.isRight(result)) {
      return { value: result.right, errors: new Map() };
    }

    const errors = new Map<string, string>();

    for (const { path, issue, spoken } of leaves(result.left.issue, [])) {
      const name = path.join(".");

      if (errors.has(name)) {
        continue;
      }

      const descriptor = byName.get(name);
      const { code, params } = codeOf(issue);
      const own =
        ("ast" in issue && (issue.ast as AST.AST).annotations[AST.MessageAnnotationId] !== undefined) ||
        (spoken && "message" in issue && (typeof issue.message === "string" || (Option.isOption(issue.message) && Option.isSome(issue.message))));
      const ofField = fieldMessages.get(name);
      const said = own || ofField === undefined || issue._tag === "Missing" ? undefined : ofField(issue);
      const fromField = typeof said === "string" ? said : typeof said === "object" && said !== null && "message" in said ? String((said as { readonly message: unknown }).message) : undefined;
      // The author's message on the check, else on the field (it speaks for every check of the field), else "Required", the application's words, the schema's own words.
      const message =
        (own ? ParseResult.TreeFormatter.formatIssueSync(issue) : undefined) ??
        fromField ??
        (issue._tag === "Missing" ? "Required" : undefined) ??
        options.message?.({ path, code, params, actual: descriptor?.redacted === true ? undefined : (issue as { readonly actual?: unknown }).actual }) ??
        (descriptor === undefined ? ParseResult.TreeFormatter.formatIssueSync(issue) : summary(descriptor));

      errors.set(name, message);
    }

    return { errors };
  };

  const touchedAll = (state: State): State => ({ ...state, attempted: true, touched: Object.fromEntries(fields.map((each) => [each.name, true as const])) });

  const view = ((state: State | DeriveMaker<any>, from?: (state: any) => State): View | Derived<View> => {
    if (typeof state === "function") {
      return (state as DeriveMaker<any>)(ViewSchema, (application) => view(from!(application)) as View);
    }

    const found = problems(state).errors;
    const shown = (name: string): string => state.remote[name] ?? (state.touched[name] === true || state.attempted ? (found.get(name) ?? "") : "");
    const views = fields.map((each): FieldView => {
      const value = state.values[each.name];
      const error = shown(each.name);

      return {
        name: each.name,
        title: each.title,
        kind: each.kind,
        input: each.kind === "password" ? "password" : "text",
        required: each.required,
        choices: each.choices,
        value: typeof value === "string" ? value : "",
        checked: value === true,
        invalid: error !== "",
        error,
        errorId: error === "" ? "" : `${each.name.replace(/\./g, "-")}-error`,
        touched: state.touched[each.name] === true,
        dirty: value !== initial.values[each.name],
      };
    });
    const count = views.filter((each) => each.invalid).length;

    return {
      fields: views,
      valid: found.size === 0 && Object.keys(state.remote).length === 0,
      message: state.attempted && count > 0 ? `${count} ${count === 1 ? "field needs" : "fields need"} attention` : "",
      first: views.find((each) => each.invalid)?.name ?? "",
      submitted: state.attempted,
    };
  }) as Form<A, I>["view"];

  const without = (record: Readonly<Record<string, string>>, name: string): Record<string, string> => Object.fromEntries(Object.entries(record).filter(([key]) => key !== name));

  const form: Form<A, I> = {
    fields,
    initial,
    standard: Schema.standardSchemaV1(schema as Schema.Schema<A, I, never>),
    warnings,
    field: () => ({ [FIELD]: true, schema: StateSchema as Schema.Schema<State, any, never>, initial }) as unknown as Field<State>,
    view,
    edit: (state, name, value) => {
      known(name);

      return { ...state, values: { ...state.values, [name]: value }, remote: without(state.remote, name) };
    },
    check: (state, name, value) => {
      known(name);

      return { ...state, values: { ...state.values, [name]: value }, touched: { ...state.touched, [name]: true }, remote: without(state.remote, name) };
    },
    blur: (state, name) => {
      known(name);

      return { ...state, touched: { ...state.touched, [name]: true } };
    },
    submit: (state) => {
      const attempted = touchedAll(state);
      const { value, errors } = problems(attempted);

      return value !== undefined && Object.keys(state.remote).length === 0 && errors.size === 0 ? { ok: true, value, state: attempted } : { ok: false, state: attempted };
    },
    reject: (state, { errors }) => {
      for (const name of Object.keys(errors)) {
        known(name);
      }

      return { ...state, attempted: true, touched: { ...state.touched, ...Object.fromEntries(Object.keys(errors).map((name) => [name, true as const])) }, remote: { ...state.remote, ...errors } };
    },
    draft: (state) => ({ version, values: Object.fromEntries(fields.filter((each) => !each.redacted).map((each) => [each.name, state.values[each.name]!])) }),
    restore: (draft) => (draft.version !== version ? initial : { ...initial, values: { ...initial.values, ...Object.fromEntries(Object.entries(draft.values).filter(([name]) => byName.has(name) && !byName.get(name)!.redacted)) } }),
    commands: (command, how) =>
      ({
        edit: command(Schema.Struct({ name: Schema.String, value: Schema.String }), ({ name, value }, current) => how.set(current as never, form.edit(how.get(current as never), name, value)) as never),
        check: command(Schema.Struct({ name: Schema.String, value: Schema.Boolean }), ({ name, value }, current) => how.set(current as never, form.check(how.get(current as never), name, value)) as never),
        blur: command(Schema.Struct({ name: Schema.String }), ({ name }, current) => how.set(current as never, form.blur(how.get(current as never), name)) as never),
        submit: command(Schema.Struct({}), (_input, current) => {
          const result = form.submit(how.get(current as never));
          const next = how.set(current as never, result.state);

          return (result.ok ? how.then(next, result.value) : next) as never;
        }),
      }) as unknown as Commands,
  };

  return form;
}
