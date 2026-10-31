// Forms from the schema (direction Bet 11). One description of valid: the schema the submitted command takes. A form reads it once for what a screen needs (a field's name, kind, title, constraints), keeps
// what the person typed as text, and decides from the same schema what is wrong and when to say so. It is a model, not a primitive: the fields are drawn with the ordinary `textfield`, `checkbox` and
// `radiogroup`, and the state is the application's own (a field of its state), so the command that submits reads every draft.
//
//   const Signup = Schema.Struct({ name: Schema.String.check(Schema.isMinLength(2)).annotate({ title: "Name", message: "Enter at least 2 characters" }), … });
//   const signup = Form.make(Signup);
//   defineApp({ state: { signup: signup.field() }, derived: (derive) => ({ form: signup.view(derive, (s) => s.signup) }), commands: (command) => signup.commands(command, { … }), … });
//
// What it keeps for each field: the text typed (`value`), whether the person has left the field (`touched`), and the message a server gave it (`remote`). `dirty` and the message are worked out. An error is
// shown for a field when it is wrong and the person has left the field once or tried to submit (stricter than Angular's dirty-or-touched and Phoenix's used-input, so the first keystroke is not an error); once
// shown it follows the typing. A failed submit touches every field. The defaults are the whole interface for most forms; the options (`initial`, `message`, `required`) are for the rest.
import { Cause, Exit, Option, Schema, SchemaAST as AST, SchemaIssue } from "effect";

import type { Derived, DeriveMaker, Field } from "./index.js";
import { FIELD, FORM } from "./index.js";

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
  /** How many times a submit has been tried, or a server has answered one with messages: the count a host watches to take the person to the first field in error (`ApplicationDefinition.focusFirstInvalid`). */
  readonly attempts: number;
  /** The messages a server gave, by field name; a field's is gone when it is edited. */
  readonly remote: Readonly<Record<string, string>>;
}

/** The schema of a form's state: a struct with a named entry for each field (the model has no type for a record with free keys), so it can be a field of the application's state and be read in a template. */
const stateSchemaOf = (fields: ReadonlyArray<Descriptor>): Schema.Codec<State> =>
  Schema.Struct({
    values: Schema.Struct(Object.fromEntries(fields.map((each) => [each.name, each.kind === "boolean" ? Schema.Boolean : Schema.String]))),
    touched: Schema.Struct(Object.fromEntries(fields.map((each) => [each.name, Schema.optional(Schema.Literal(true))]))),
    attempts: Schema.Number,
    remote: Schema.Struct(Object.fromEntries(fields.map((each) => [each.name, Schema.optional(Schema.String)]))),
  }) as unknown as Schema.Codec<State>;

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
  /** The address of the element that shows the message, always drawn (empty when there is no message): what the control's `describedby` names. */
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
  kind: Schema.Literals(["text", "password", "number", "boolean", "choice"]),
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
export const ViewSchema: Schema.Codec<View> = Schema.Struct({
  fields: Schema.Array(FieldViewSchema),
  valid: Schema.Boolean,
  message: Schema.String,
  first: Schema.String,
  submitted: Schema.Boolean,
}) as unknown as Schema.Codec<View>;

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
  /** The state field that holds the form (`state: { signup: signup.field() }` is `"signup"`): the usual way to say where it is. */
  readonly field?: string;
  /** Where the form is, when it is not simply a field of the state. */
  readonly get?: (state: S) => State;
  readonly set?: (state: S, form: State) => S;
  /** The application's state after a submit that the schema accepted, from the decoded value. The form keeps what was typed. */
  readonly submitted: (state: S, value: A) => S;
}

/** The part of `Valance.CommandMaker` the form uses, so this file imports no more of Valance than that. */
export interface CommandMaker<S> {
  <I>(input: Schema.Codec<I, any, never>, transition: (input: I, current: S) => S): unknown;
  (transition: (current: S) => S): unknown;
}

// ---- describing a schema ----------------------------------------------------------------------------------------------------------------------------------------

/** The titles Effect gives a refinement or a keyword by itself: `minLength(2)`, `int`, `string`. An author's title is anything else. */
const generated = (title: string): boolean =>
  /^\w+\(.*\)$/.test(title) || ["string", "number", "boolean", "int", "nonEmpty", "trimmed", "lowercased", "uppercased", "finite", "nonNaN"].includes(title);

/** What can carry an author's annotations in Effect 4: a node, or a check on one (`.annotate` after `.check` annotates the last check). */
type Annotated = { readonly annotations?: Readonly<Record<string, unknown>> | undefined };

const titleOf = (node: Annotated): string | undefined => {
  const given = node.annotations?.["title"];

  return typeof given === "string" && !generated(given) ? given : undefined;
};

const messageOf = (node: Annotated | undefined): string | undefined => {
  const given = node?.annotations?.["message"];

  return typeof given === "string" ? given : undefined;
};

const unwrapOptional = (ast: AST.AST): AST.AST => {
  if (ast._tag !== "Union") {
    return ast;
  }

  const rest = ast.types.filter((each) => each._tag !== "Undefined");

  return rest.length === 1 ? rest[0]! : ast;
};

/** The encoded base of a type (what is typed) or its decoded base, and the checks on it. Effect 4 keeps the checks on the node and picks the side with `toEncoded`/`toType`. */
const baseOf = (given: AST.AST, side: "encoded" | "decoded"): { readonly base: AST.AST; readonly checks: ReadonlyArray<AST.Check<unknown>> } => {
  const ast = unwrapOptional(side === "encoded" ? AST.toEncoded(given) : AST.toType(given));

  if (ast._tag === "Suspend") {
    return baseOf(ast.thunk(), side);
  }

  return { base: ast, checks: ast.checks ?? [] };
};

/** A check's constraint as JSON Schema keywords, from the check's representation: its payload, except the two whose keyword Effect 4 does not name the same way. */
const keywordsOf = (check: AST.Check<unknown>): Record<string, unknown> => {
  const representation = check.annotations?.representation;
  const payload = representation?.payload;

  if (representation?.id === "effect/schema/isInt") {
    return { type: "integer" };
  }

  if (representation?.id === "effect/schema/isPattern" && typeof payload === "object" && payload !== null && "source" in payload) {
    return { pattern: payload.source };
  }

  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? { ...payload } : {};
};

/**
 * The struct a schema is made of, with its fields as written: the node itself, or what it is encoded as (a class). Not `toType`/`toEncoded`, which would strip the fields' own
 * encodings too (a number typed as text would look like text).
 */
const recordOf = (given: AST.AST): AST.Objects | undefined => {
  const ast = unwrapOptional(given._tag === "Suspend" ? given.thunk() : given);
  const link = ast.encoding?.[0];

  return ast._tag === "Objects" ? ast : link === undefined ? undefined : recordOf(link.to);
};

const literalsOf = (ast: AST.AST): ReadonlyArray<string | number | boolean> | undefined => {
  if (ast._tag === "Literal") {
    return typeof ast.literal === "bigint" ? undefined : [ast.literal];
  }

  if (ast._tag === "Union") {
    const each = ast.types.map(literalsOf);

    return each.every((one) => one !== undefined) ? (each.flat() as ReadonlyArray<string | number | boolean>) : undefined;
  }

  return undefined;
};

const describeField = (path: ReadonlyArray<string>, ps: AST.PropertySignature): Descriptor => {
  const name = path.join(".");
  const encoded = baseOf(ps.type, "encoded");
  const decoded = baseOf(ps.type, "decoded");
  const chain = [...encoded.checks, ...decoded.checks.filter((each) => !encoded.checks.includes(each))];
  const title = titleOf(ps.type) ?? chain.map(titleOf).find((each) => each !== undefined);

  if (title === undefined) {
    throw new FormError(`Form: the field "${name}" has no title: give the schema \`.annotate({ title: "…" })\`, the label the person reads (and the name a screen reader says)`);
  }

  const optional = AST.isOptional(ps.type) || (ps.type._tag === "Union" && ps.type.types.some((each) => each._tag === "Undefined"));
  const constraints = Object.assign({}, ...chain.map(keywordsOf)) as Record<string, unknown>;
  const hasMessage = chain.some((each) => messageOf(each) !== undefined) || messageOf(ps.type) !== undefined;
  const typed = encoded.base;
  const literals = literalsOf(typed);
  let kind: Kind;
  let choices: ReadonlyArray<string> = [];
  let redacted = false;

  if (typed._tag === "String" && decoded.base._tag === "Declaration") {
    kind = "password";
    redacted = true;
  } else if (typed._tag === "String") {
    kind = decoded.base._tag === "Number" ? "number" : "text";
  } else if (typed._tag === "Number") {
    kind = "number";
  } else if (typed._tag === "Boolean" || (literals !== undefined && literals.length === 1 && typeof literals[0] === "boolean")) {
    kind = "boolean";
  } else if (literals !== undefined && literals.every((each) => typeof each === "string")) {
    kind = "choice";
    choices = literals as ReadonlyArray<string>;
  } else if (typed._tag === "Objects" || typed._tag === "Arrays") {
    throw new FormError(
      `Form: the field "${name}" is ${typed._tag === "Arrays" ? "a list" : "a record"} where a value is needed (lists of fields are not supported yet; flat and nested records are)`,
    );
  } else {
    throw new FormError(`Form: the field "${name}" has a type a form cannot draw (${typed._tag}): text, a number typed as text, a boolean, a closed set of strings, or a secret`);
  }

  return { name, path, title, kind, required: !optional && kind !== "boolean", choices, constraints, redacted, hasMessage };
};

/**
 * The message the author wrote on a field's type, by field name: what the field says whichever of its checks fails. In Effect 4 it is on the outermost node: on the last check
 * when the type has checks (where `.annotate` after `.check` puts it), else on the node.
 */
const fieldMessagesOf = (ast: AST.AST, path: ReadonlyArray<string> = []): Map<string, string> => {
  const found = new Map<string, string>();
  const record = recordOf(ast);

  if (record === undefined) {
    return found;
  }

  for (const ps of record.propertySignatures) {
    if (typeof ps.name !== "string") {
      continue;
    }

    const here = [...path, ps.name];

    if (recordOf(ps.type) !== undefined) {
      fieldMessagesOf(ps.type, here).forEach((value, key) => found.set(key, value));
      continue;
    }

    const outer = unwrapOptional(ps.type);
    const said = messageOf(outer.checks?.[outer.checks.length - 1]) ?? messageOf(outer) ?? messageOf(ps.type);

    if (said !== undefined) {
      found.set(here.join("."), said);
    }
  }

  return found;
};

const describe = (ast: AST.AST, path: ReadonlyArray<string> = []): ReadonlyArray<Descriptor> => {
  const record = recordOf(ast);

  if (record === undefined) {
    throw new FormError("Form: a form is made from a struct: `Schema.Struct({ … })`");
  }

  return record.propertySignatures.flatMap((ps) => {
    if (typeof ps.name !== "string") {
      return [];
    }

    const here = [...path, ps.name];

    return recordOf(ps.type) !== undefined ? describe(ps.type, here) : [describeField(here, ps)];
  });
};

// ---- the report of a decode ------------------------------------------------------------------------------------------------------------------------------------

interface Leaf {
  readonly path: ReadonlyArray<string>;
  readonly issue: SchemaIssue.Issue;
  /** Whether a rule over the whole struct gave it, with a message of its own. */
  readonly spoken: boolean;
}

const leaves = (issue: SchemaIssue.Issue, path: ReadonlyArray<string>, spoken = false): ReadonlyArray<Leaf> => {
  switch (issue._tag) {
    case "Pointer":
      return leaves(issue.issue, [...path, ...issue.path.map(String)], spoken);
    case "Composite":
      return issue.issues.flatMap((each) => leaves(each, path, spoken));
    case "Filter":
      // A rule over a whole struct reports at the paths it names (a Pointer inside): those are the leaves, not the rule.
      return issue.issue._tag === "Pointer" || issue.issue._tag === "Composite" ? leaves(issue.issue, path, true) : [{ path, issue, spoken }];
    case "Encoding":
      return leaves(issue.issue, path, spoken);
    default:
      return [{ path, issue, spoken }];
  }
};

/** Effect 3's names for the kinds of report that are not a check, which `Issue.code` has always said. */
const KINDS: Readonly<Record<string, string>> = { InvalidType: "Type", MissingKey: "Missing", UnexpectedKey: "Unexpected" };

const codeOf = (issue: SchemaIssue.Issue): { readonly code: string; readonly params: Record<string, unknown> } => {
  if (issue._tag !== "Filter") {
    return { code: KINDS[issue._tag] ?? issue._tag, params: {} };
  }

  const id = issue.filter.annotations?.representation?.id;

  return { code: id === undefined ? issue._tag : id.replace(/^effect\/schema\/(is)?/, ""), params: keywordsOf(issue.filter) };
};

/** The message the author gave the failed check (or the node, or a rule over the struct gave the leaf), if any. */
const ownMessageOf = (issue: SchemaIssue.Issue): string | undefined => {
  switch (issue._tag) {
    case "Filter":
      return messageOf(issue.filter);
    case "InvalidType":
      return messageOf(issue.ast);
    case "InvalidValue":
    case "Forbidden":
      return messageOf(issue);
    default:
      return undefined;
  }
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

export function make<A, I>(schema: Schema.Codec<A, I, never>, options: Options<I> = {}): Form<A, I> {
  const fields = describe(schema.ast);
  const byName = new Map(fields.map((each) => [each.name, each] as const));
  const fieldMessages = fieldMessagesOf(schema.ast);
  const warnings = fields
    .filter((each) => !each.hasMessage && Object.keys(each.constraints).length > 0)
    .map(
      (each) =>
        `${each.name}: its constraints (${Object.keys(each.constraints).join(", ")}) have no message of their own: add \`message\` to the schema, or a \`message\` function to the form's options`,
    );
  const stateSchema = stateSchemaOf(fields);
  const given = (options.initial ?? {}) as Record<string, unknown>;
  const valueOf = (descriptor: Descriptor): string | boolean => {
    const at = descriptor.path.reduce<unknown>((value, step) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[step] : undefined), given);

    return typeof at === "boolean" ? at : at === undefined ? (descriptor.kind === "boolean" ? false : "") : String(at);
  };
  const initial: State = { values: Object.fromEntries(fields.map((each) => [each.name, valueOf(each)])), touched: {}, attempts: 0, remote: {} };
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

    // Effect 4 keeps what was typed in the report only when asked (`reportInput`): a translation function is told it as `actual`.
    const result = Schema.decodeUnknownExit(schema as Schema.Codec<A, any, never>, { errors: "all", onExcessProperty: "ignore", reportInput: true })(encoded);

    if (Exit.isSuccess(result)) {
      return { value: result.value, errors: new Map() };
    }

    const failure = Cause.findErrorOption(result.cause);

    if (Option.isNone(failure)) {
      throw Cause.squash(result.cause); // a defect in a transformation is not a field's error
    }

    const errors = new Map<string, string>();

    for (const { path, issue, spoken } of leaves(failure.value.issue, [])) {
      const name = path.join(".");

      if (errors.has(name)) {
        continue;
      }

      const descriptor = byName.get(name);
      const { code, params } = codeOf(issue);
      // A leaf's own words count when they are a check's, a node's, or a rule's over the whole struct (which is how a value-level leaf gets words).
      const own = (issue._tag === "InvalidValue" || issue._tag === "Forbidden") && !spoken ? undefined : ownMessageOf(issue);
      const fromField = own !== undefined || issue._tag === "MissingKey" ? undefined : fieldMessages.get(name);
      // The author's message on the check, else on the field (it speaks for every check of the field), else "Required", the application's words, the schema's own words.
      const message =
        own ??
        fromField ??
        (issue._tag === "MissingKey" ? "Required" : undefined) ??
        options.message?.({ path, code, params, actual: descriptor?.redacted === true ? undefined : SchemaIssue.hasInput(issue) ? issue.input : undefined }) ??
        (descriptor === undefined ? SchemaIssue.makeFormatterDefault()(issue) : summary(descriptor));

      errors.set(name, message);
    }

    return { errors };
  };

  const touchedAll = (state: State): State => ({ ...state, attempts: state.attempts + 1, touched: Object.fromEntries(fields.map((each) => [each.name, true as const])) });

  const view = ((state: State | DeriveMaker<any>, from?: (state: any) => State): View | Derived<View> => {
    if (typeof state === "function") {
      return (state as DeriveMaker<any>)(ViewSchema, (application) => view(from!(application)) as View);
    }

    const found = problems(state).errors;
    const shown = (name: string): string => state.remote[name] ?? (state.touched[name] === true || state.attempts > 0 ? (found.get(name) ?? "") : "");
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
        errorId: `${each.name.replace(/\./g, "-")}-error`,
        touched: state.touched[each.name] === true,
        dirty: value !== initial.values[each.name],
      };
    });
    const count = views.filter((each) => each.invalid).length;

    return {
      fields: views,
      valid: found.size === 0 && Object.keys(state.remote).length === 0,
      message: state.attempts > 0 && count > 0 ? `${count} ${count === 1 ? "field needs" : "fields need"} attention` : "",
      first: views.find((each) => each.invalid)?.name ?? "",
      submitted: state.attempts > 0,
    };
  }) as Form<A, I>["view"];

  const without = (record: Readonly<Record<string, string>>, name: string): Record<string, string> => Object.fromEntries(Object.entries(record).filter(([key]) => key !== name));

  const form: Form<A, I> = {
    fields,
    initial,
    standard: Schema.toStandardSchemaV1(schema as Schema.Codec<A, I, never>),
    warnings,
    field: () => ({ [FIELD]: true, [FORM]: true, schema: stateSchema as Schema.Codec<State, any, never>, initial }) as unknown as Field<State>,
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

      return {
        ...state,
        attempts: state.attempts + 1,
        touched: { ...state.touched, ...Object.fromEntries(Object.keys(errors).map((name) => [name, true as const])) },
        remote: { ...state.remote, ...errors },
      };
    },
    draft: (state) => ({ version, values: Object.fromEntries(fields.filter((each) => !each.redacted).map((each) => [each.name, state.values[each.name]!])) }),
    restore: (draft) =>
      draft.version !== version
        ? initial
        : { ...initial, values: { ...initial.values, ...Object.fromEntries(Object.entries(draft.values).filter(([name]) => byName.has(name) && !byName.get(name)!.redacted)) } },
    commands: (command, given) => {
      const field = given.field;
      const how = {
        get: given.get ?? ((state: never) => (state as Record<string, State>)[field!]!),
        set: given.set ?? ((state: never, form: State) => ({ ...(state as object), [field!]: form }) as never),
        submitted: given.submitted,
      };

      if (given.field === undefined && (given.get === undefined || given.set === undefined)) {
        throw new FormError('Form: say where the form is: `field: "signup"`, or `get` and `set`');
      }

      return {
        edit: command(
          Schema.Struct({ name: Schema.String, value: Schema.String }),
          ({ name, value }, current) => how.set(current as never, form.edit(how.get(current as never), name, value)) as never,
        ),
        check: command(
          Schema.Struct({ name: Schema.String, value: Schema.Boolean }),
          ({ name, value }, current) => how.set(current as never, form.check(how.get(current as never), name, value)) as never,
        ),
        blur: command(Schema.Struct({ name: Schema.String }), ({ name }, current) => how.set(current as never, form.blur(how.get(current as never), name)) as never),
        submit: command((current: unknown) => {
          const result = form.submit(how.get(current as never));
          const next = how.set(current as never, result.state);

          return (result.ok ? how.submitted(next, result.value) : next) as never;
        }),
      } as unknown as Commands;
    },
  };

  return form;
}
