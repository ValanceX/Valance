// What makes a value acceptable, once, as Schemas. A message is part of the Schema (`message`), so the screen shows the author's words and not a library's.
import { Either, ParseResult, Schema } from "effect";

export const Name = Schema.String.pipe(Schema.trimmed({ message: () => "Remove the spaces around your name" }), Schema.minLength(2, { message: () => "Enter your name" }));
export const Email = Schema.String.pipe(Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: () => "Enter an email like you@example.com" }));
export const Password = Schema.String.pipe(Schema.minLength(8, { message: () => "Use at least 8 characters" }), Schema.pattern(/\d/, { message: () => "Include a number" }));
export const Terms = Schema.Boolean.pipe(Schema.filter((accepted) => accepted, { message: () => "Accept the terms to continue" }));

export const Plan = Schema.Literal("free", "pro");

/** What is sent. */
export const Form = Schema.Struct({ name: Schema.String, email: Schema.String, password: Schema.String, terms: Schema.Boolean, plan: Plan });
export type Form = typeof Form.Type;

/** The first thing wrong with a value, in the Schema's words; "" when it is fine. */
export const problem = <A>(schema: Schema.Schema<A, any>, value: unknown): string => {
  const result = Schema.decodeUnknownEither(schema)(value);

  return Either.isRight(result) ? "" : (ParseResult.ArrayFormatter.formatErrorSync(result.left)[0]?.message ?? "Check this value");
};

/** A rule that needs two fields: the Schemas above cannot see across them. */
export const passwordProblem = (form: Pick<Form, "name" | "password">): string => {
  const own = problem(Password, form.password);

  return own !== "" ? own : form.name.trim() !== "" && form.password.toLowerCase().includes(form.name.trim().toLowerCase()) ? "Do not put your name in your password" : "";
};

export const problemsOf = (form: Form): { readonly name: string; readonly email: string; readonly password: string; readonly terms: string } => ({
  name: problem(Name, form.name),
  email: problem(Email, form.email),
  password: passwordProblem(form),
  terms: problem(Terms, form.terms),
});

export const valid = (form: Form): boolean => Object.values(problemsOf(form)).every((each) => each === "");
