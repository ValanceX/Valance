import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./signup-form.mprx";
import { Plan } from "./validation.js";

// The screen of /signup. Its props are filled from the application's state and derived values of the same names; its events run the commands of the same names.
export default component(template, {
  props: {
    name: Schema.String,
    email: Schema.String,
    password: Schema.String,
    terms: Schema.Boolean,
    plan: Plan,
    nameError: Schema.String,
    emailError: Schema.String,
    passwordError: Schema.String,
    termsError: Schema.String,
    failure: Schema.String,
    sending: Schema.Boolean,
    done: Schema.Boolean,
  },
  events: {
    setName: Schema.String,
    setEmail: Schema.String,
    setPassword: Schema.String,
    setTerms: Schema.Boolean,
    setPlan: Plan,
    submit: Schema.Void,
    touch: Schema.String,
    reset: Schema.Void,
  },
});
