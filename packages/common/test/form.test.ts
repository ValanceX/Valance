// Forms from the schema (direction Bet 11, F1 to F16). One description of valid, the schema: a test changes the schema and the form changes with no other edit. Each rule is shown against the value it
// would get wrong: the first keystroke is not an error, a secret is not repeated, a server's message follows its field.
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { Form } from "../src/index.js";

const Signup = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2)).annotations({ title: "Name", message: () => "Enter at least 2 characters" }),
  age: Schema.NumberFromString.pipe(Schema.int(), Schema.between(18, 120)).annotations({ title: "Age", message: () => "Enter a whole number from 18 to 120" }),
  plan: Schema.Literal("free", "pro").annotations({ title: "Plan" }),
  accept: Schema.Literal(true).annotations({ title: "I accept the terms", message: () => "You must accept the terms" }),
});
const signup = Form.make(Signup, { initial: { plan: "free" } });

const typed = (form: typeof signup, state: Form.State, values: Record<string, string | boolean>): Form.State =>
  Object.entries(values).reduce((each, [name, value]) => (typeof value === "boolean" ? form.check(each, name, value) : form.edit(each, name, value)), state);
const shown = (form: typeof signup, state: Form.State): Record<string, string> =>
  Object.fromEntries(
    form
      .view(state)
      .fields.filter((each) => each.invalid)
      .map((each) => [each.name, each.error]),
  );

describe("what the schema says about its fields", () => {
  it("lists them in the schema's order with the kind, title, requirement, choices and constraints the annotations declare", () => {
    expect(signup.fields.map((each) => [each.name, each.kind, each.title, each.required])).toEqual([
      ["name", "text", "Name", true],
      ["age", "number", "Age", true],
      ["plan", "choice", "Plan", true],
      ["accept", "boolean", "I accept the terms", false],
    ]);
    expect(signup.fields[0]!.constraints).toEqual({ minLength: 2 });
    expect(signup.fields[1]!.constraints).toMatchObject({ minimum: 18, maximum: 120 });
    expect(signup.fields[2]!.choices).toEqual(["free", "pro"]);
    expect(signup.fields[3]!.hasMessage).toBe(true);
  });

  it("changes with the schema and nothing else: one edit of the schema moves the constraint, the message the form gives and what it accepts", () => {
    const stricter = Form.make(Schema.Struct({ name: Schema.String.pipe(Schema.minLength(5)).annotations({ title: "Name" }) }), {
      message: ({ params }) => `at least ${String(params["minLength"])} please`,
    });
    const looser = Form.make(Schema.Struct({ name: Schema.String.pipe(Schema.minLength(1)).annotations({ title: "Name" }) }), {
      message: ({ params }) => `at least ${String(params["minLength"])} please`,
    });
    const state = (form: typeof stricter) => form.blur(form.edit(form.initial, "name", "abc"), "name");

    expect(stricter.fields[0]!.constraints).toEqual({ minLength: 5 });
    expect(stricter.view(state(stricter)).fields[0]!.error).toBe("at least 5 please");
    expect(looser.view(state(looser)).fields[0]!.error).toBe("");
    expect(stricter.submit(state(stricter)).ok).toBe(false);
    expect(looser.submit(state(looser)).ok).toBe(true);
  });

  it("is refused at the declaration when a field has no title, naming the field", () => {
    expect(() => Form.make(Schema.Struct({ name: Schema.String }))).toThrow(/field "name" has no title/);
    expect(() => Form.make(Schema.Struct({ a: Schema.String.annotations({ title: "A" }), b: Schema.Array(Schema.String).annotations({ title: "B" }) }))).toThrow(
      /field "b" is a list/,
    );
  });

  it("reads a nested record as dotted names, and an optional field as not required", () => {
    const nested = Form.make(
      Schema.Struct({
        address: Schema.Struct({ zip: Schema.String.pipe(Schema.pattern(/^\d{5}$/)).annotations({ title: "Zip" }) }),
        nick: Schema.optional(Schema.String.pipe(Schema.maxLength(5))).annotations({ title: "Nickname" }),
      }),
    );

    expect(nested.fields.map((each) => [each.name, each.required])).toEqual([
      ["address.zip", true],
      ["nick", false],
    ]);
    expect(nested.fields[0]!.constraints).toEqual({ pattern: "^\\d{5}$" });
    expect(nested.submit(nested.edit(nested.initial, "address.zip", "12345"))).toMatchObject({ ok: true, value: { address: { zip: "12345" } } });
    expect(nested.submit(nested.edit(nested.initial, "address.zip", "123")).ok).toBe(false);
  });
});

describe("when an error is shown (F5)", () => {
  it("not at the first keystroke: wrong text is no error until the person has left the field, or tried to submit", () => {
    const first = signup.edit(signup.initial, "name", "A");

    expect(shown(signup, first)).toEqual({});
    expect(shown(signup, signup.blur(first, "name"))).toEqual({ name: "Enter at least 2 characters" });
    expect(Object.keys(shown(signup, signup.submit(first).state)).sort()).toEqual(["accept", "age", "name"]);
  });

  it("once shown, follows the typing: it clears the moment the text is right", () => {
    const left = signup.blur(signup.edit(signup.initial, "name", "A"), "name");

    expect(shown(signup, left)).toEqual({ name: "Enter at least 2 characters" });
    expect(shown(signup, signup.edit(left, "name", "Al"))).toEqual({});
    expect(shown(signup, signup.edit(signup.edit(left, "name", "Al"), "name", "A"))).toEqual({ name: "Enter at least 2 characters" });
  });

  it("a failed submit marks every field touched, names how many need attention and which is first; a good one gives the decoded value", () => {
    const failed = signup.submit(typed(signup, signup.initial, { name: "Ada", age: "7.5" }));

    expect(failed.ok).toBe(false);

    const view = signup.view(failed.state);

    expect(view.message).toBe("2 fields need attention");
    expect(view.first).toBe("age");
    expect(view.fields.map((each) => each.touched)).toEqual([true, true, true, true]);

    const good = signup.submit(typed(signup, signup.initial, { name: "Ada", age: "36", accept: true }));

    expect(good).toMatchObject({ ok: true, value: { name: "Ada", age: 36, plan: "free", accept: true } });
    expect(signup.view(good.state).message).toBe("");
  });

  it("a number is typed as text and decoded on submit; text that is not a number is the schema's own error", () => {
    const state = signup.blur(typed(signup, signup.initial, { age: "abc" }), "age");

    expect(shown(signup, state)["age"]).toBe("Enter a whole number from 18 to 120");
  });
});

describe("one message per field, in the author's words (F6, F15)", () => {
  it("folds the several issues of a closed set to one, and says it plainly", () => {
    const state = signup.submit(signup.edit(signup.initial, "plan", "gold")).state;

    expect(shown(signup, state)["plan"]).toBe("Choose one of: free, pro");
  });

  it("uses the application's words for a field with no message of its own, told the check and its parameters", () => {
    const told: Array<Form.Issue> = [];
    const form = Form.make(Schema.Struct({ code: Schema.String.pipe(Schema.minLength(3)).annotations({ title: "Code" }) }), {
      message: (issue) => (told.push(issue), `translated:${issue.code}:${String(issue.params["minLength"])}`),
    });
    const state = form.blur(form.edit(form.initial, "code", "ab"), "code");

    expect(form.view(state).fields[0]!.error).toBe("translated:MinLength:3");
    expect(told[0]).toMatchObject({ path: ["code"], actual: "ab", params: { minLength: 3 } });
  });

  it("says which constraints have no message of their own, for the author", () => {
    expect(signup.warnings).toEqual([expect.stringContaining("plan")].slice(0, 0));
    expect(Form.make(Schema.Struct({ code: Schema.String.pipe(Schema.minLength(3)).annotations({ title: "Code" }) })).warnings).toEqual([
      expect.stringContaining("code: its constraints (minLength)"),
    ]);
  });
});

describe("secrets (F14, F16)", () => {
  const Login = Schema.Struct({
    user: Schema.String.annotations({ title: "User" }),
    password: Schema.Redacted(Schema.String.pipe(Schema.minLength(8))).annotations({ title: "Password" }),
  });
  const login = Form.make(Login);

  it("is drawn as a password, never repeats the typed text in the message, and never is in a draft", () => {
    const state = login.blur(login.edit(login.edit(login.initial, "user", "ada"), "password", "hunter2"), "password");
    const view = login.view(state);

    expect(login.fields[1]).toMatchObject({ kind: "password", redacted: true });
    expect(view.fields[1]!.input).toBe("password");
    expect(view.fields[1]!.invalid).toBe(true);
    expect(view.fields[1]!.error).not.toContain("hunter2");
    expect(JSON.stringify(login.draft(state))).not.toContain("hunter2");
    expect(login.draft(state).values).toEqual({ user: "ada" });
  });

  it("a draft restores what was typed, and one made for another schema is not restored", () => {
    const state = typed(signup, signup.initial, { name: "Ada", age: "36" });
    const draft = signup.draft(state);
    const again = signup.restore(JSON.parse(JSON.stringify(draft)));

    expect(again.values).toEqual(state.values);
    expect(again.touched).toEqual({});
    expect(login.restore(draft)).toEqual(login.initial);
  });
});

describe("what a server says (F8)", () => {
  it("shows the messages of a failed command on their fields, and a field's goes when it is edited", () => {
    const state = signup.reject(typed(signup, signup.initial, { name: "Ada", age: "36", accept: true }), Form.fieldErrors({ name: "That name is taken" }));

    expect(shown(signup, state)).toEqual({ name: "That name is taken" });
    expect(signup.submit(state).ok).toBe(false);
    expect(shown(signup, signup.edit(state, "name", "Adaline"))).toEqual({});
    expect(() => signup.reject(state, Form.fieldErrors({ nope: "x" }))).toThrow(/no field "nope"/);
  });
});

describe("a cross-field rule (F12)", () => {
  const Passwords = Schema.Struct({
    password: Schema.String.pipe(Schema.minLength(2)).annotations({ title: "Password" }),
    confirm: Schema.String.annotations({ title: "Confirm" }),
  }).pipe(Schema.filter((value) => (value.password === value.confirm ? undefined : { path: ["confirm"], message: "Passwords must match" })));
  const form = Form.make(Passwords);

  it("is shown on the later field, once the rest is right", () => {
    const state = form.blur(form.edit(form.edit(form.initial, "password", "abc"), "confirm", "abd"), "confirm");

    expect(form.view(state).fields.find((each) => each.name === "confirm")!.error).toBe("Passwords must match");
    expect(form.submit(form.edit(state, "confirm", "abc")).ok).toBe(true);
  });
});

describe("as the Standard Schema (F10)", () => {
  it("validates what the schema validates", async () => {
    const standard = signup.standard as {
      readonly "~standard": { readonly validate: (value: unknown) => { readonly issues?: ReadonlyArray<unknown> } | Promise<{ readonly issues?: ReadonlyArray<unknown> }> };
    };

    expect((await standard["~standard"].validate({ name: "Ada", age: "36", plan: "free", accept: true })).issues).toBeUndefined();
    expect((await standard["~standard"].validate({ name: "A", age: "36", plan: "free", accept: true })).issues).toHaveLength(1);
  });
});

describe("the commands (what a template runs)", () => {
  // A command maker that gives back the transition itself, so the test applies it to a state.
  const maker = ((first: unknown, second?: unknown) =>
    !Schema.isSchema(first)
      ? { run: (state: unknown) => (first as (s: unknown) => unknown)(state) }
      : { run: (state: unknown, input: unknown) => (second as (i: unknown, s: unknown) => unknown)(input, state) }) as never;
  type App = { readonly signup: Form.State; readonly done: boolean };
  const commands = signup.commands(maker as never, { field: "signup", submitted: (state: App) => ({ ...state, done: true }) }) as unknown as Record<
    string,
    { run: (state: App, input?: unknown) => App }
  >;
  const app: App = { signup: signup.initial, done: false };

  it("edit, check and blur change the form's field of the state and nothing else; a submit that the schema refuses leaves the application as it was and a good one runs `then`", () => {
    const edited = commands["edit"]!.run(app, { name: "name", value: "Ada" });
    const checked = commands["check"]!.run(edited, { name: "accept", value: true });
    const blurred = commands["blur"]!.run(checked, { name: "name" });

    expect(blurred.signup.values).toMatchObject({ name: "Ada", accept: true });
    expect(blurred.signup.touched).toEqual({ accept: true, name: true });
    expect(blurred.done).toBe(false);
    expect(commands["submit"]!.run(blurred).done).toBe(false);
    expect(commands["submit"]!.run(blurred).signup.attempted).toBe(true);
    expect(commands["submit"]!.run(commands["edit"]!.run(commands["edit"]!.run(blurred, { name: "age", value: "36" }), { name: "plan", value: "pro" })).done).toBe(true);
  });

  it("says where the form is, or refuses", () => {
    expect(() => signup.commands(maker as never, { submitted: (state: App) => state })).toThrow(/say where the form is/);
  });
});
