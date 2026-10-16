import { component, defineApp, field, route } from "@valancex/common";
import { request } from "@valancex/common/http";
import type { HttpError } from "@valancex/common/http";
import { Schema } from "effect";
import { Effect } from "effect";
import layout from "./layout.mprx";
import signupForm from "./signup-form.js";
import themeToggle from "./theme-toggle.js";
import { Form, Plan, problemsOf, valid } from "./validation.js";

const Created = Schema.Struct({ id: Schema.String });

/** What a failed request means to the person: the kind of failure, not what the server wrote (a failure never carries the answer). */
const describe = (error: unknown): string => {
  const failed = error as HttpError | { readonly _tag: "Invalid" };

  switch (failed._tag) {
    case "Offline":
      return "You are offline. Check the connection and try again.";
    case "Timeout":
      return "The server took too long. Try again.";
    case "Status":
      return failed.status >= 500 ? "The server had a problem. Try again in a moment." : "The server did not accept this.";
    default:
      return "Something went wrong. Try again.";
  }
};

export default defineApp({
  layout: component(layout),
  components: [themeToggle, signupForm],
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"),
    name: field(Schema.String, ""),
    email: field(Schema.String, ""),
    password: field(Schema.String, ""),
    terms: field(Schema.Boolean, false),
    plan: field(Plan, "free"),
    // Where the form is: a person has pressed Create at least once (so errors are shown), the request is out, the account exists.
    attempted: field(Schema.Boolean, false),
    phase: field(Schema.Literal("editing", "sending", "done"), "editing"),
    // What the server said about this email, if it said the address is taken; it stays until the email changes.
    takenEmail: field(Schema.String, ""),
    failure: field(Schema.String, ""),
  },
  // Worked out from the state: what the screen shows. The form the button sends is one of them, because a command that waits is given its input and nothing else.
  derived: (derive) => ({
    form: derive(Form, (s) => ({ name: s.name, email: s.email, password: s.password, terms: s.terms, plan: s.plan })),
    nameError: derive(Schema.String, (s) => (s.attempted ? problemsOf(s).name : "")),
    emailError: derive(Schema.String, (s) => {
      const own = s.attempted ? problemsOf(s).email : "";

      return own !== "" ? own : s.takenEmail !== "" && s.takenEmail === s.email ? "That email already has an account" : "";
    }),
    passwordError: derive(Schema.String, (s) => (s.attempted ? problemsOf(s).password : "")),
    termsError: derive(Schema.String, (s) => (s.attempted ? problemsOf(s).terms : "")),
    sending: derive(Schema.Boolean, (s) => s.phase === "sending"),
    done: derive(Schema.Boolean, (s) => s.phase === "done"),
  }),
  routes: {
    signup: route("/signup", {
      query: Schema.Struct({ plan: Schema.optional(Plan) }),
      title: "Sign up",
      enter: ({ plan }, state) => (plan === undefined ? state : { ...state, plan }),
      screen: signupForm,
    }),
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
    setName: command(Schema.Struct({ value: Schema.String }), ({ value }, s) => ({ ...s, name: value })),
    setEmail: command(Schema.Struct({ value: Schema.String }), ({ value }, s) => ({ ...s, email: value })),
    setPassword: command(Schema.Struct({ value: Schema.String }), ({ value }, s) => ({ ...s, password: value })),
    setTerms: command(Schema.Struct({ value: Schema.Boolean }), ({ value }, s) => ({ ...s, terms: value })),
    setPlan: command(Schema.Struct({ value: Plan }), ({ value }, s) => ({ ...s, plan: value })),
    reset: command((s) => ({ ...s, name: "", email: "", password: "", terms: false, attempted: false, phase: "editing", failure: "", takenEmail: "" })),
    submit: command.waiting(Schema.Struct({ form: Form }), {
      // Errors show from the first press; the request starts only for a form that is sound (the check is the same one the screen shows).
      begin: ({ form }, s) => ({ ...s, attempted: true, failure: "", phase: valid(form) ? "sending" : "editing" }),
      work: ({ form }) => (valid(form) ? request({ method: "POST", path: "/signup", body: form, response: Created }) : Effect.fail({ _tag: "Invalid" as const })),
      wanted: (_input, s) => s.phase === "sending",
      settle: (outcome, { form }, s) =>
        outcome.ok
          ? { ...s, phase: "done", failure: "" }
          : (outcome.error as { _tag?: string; status?: number })._tag === "Status" && (outcome.error as { status: number }).status === 409
            ? { ...s, phase: "editing", takenEmail: form.email, failure: "" }
            : { ...s, phase: "editing", failure: describe(outcome.error) },
    }),
  }),
});
