// Masking the embedded state (north-star refinements C-3). A state field typed `Schema.Redacted` is a secret: `renderToHtml` leaves it out of the `state` it returns, `Web.run` puts the
// field's declared default back when it hydrates, and `vlx check` refuses a Redacted field with no default or one a view's `scope` reads. A view cannot read it, so the tree does not depend on it.
// ponytail: `context` (Task 19) is a second projection that crosses to the client; add its reads to `problemsOf` the way `scope`'s are checked.
import type { Schema } from "effect";

import type { Ambient, ApplicationDefinition } from "./index.js";
import { redactedFields } from "./index.js";

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
  readonly code: "redacted-no-default" | "redacted-in-view";
  readonly field: string;
  readonly message: string;
}

/** What `vlx check` reports about Redacted fields: no default, and a view whose `scope` reads one (read for the initial state, through a proxy that notes each read). */
export const problemsOf = <S, E, R extends Ambient, V extends string>(app: ApplicationDefinition<S, E, R, V>): ReadonlyArray<RedactedProblem> => {
  const hidden = redactedFields(app.state.schema);
  const initial = app.state.initial as Record<string, unknown>;
  const found: Array<RedactedProblem> = hidden
    .filter((name) => initial[name] === undefined)
    .map((field) => ({ code: "redacted-no-default", field, message: `the state field "${field}" is Schema.Redacted and has no default: a client hydrates it to its default, so give it one` }));

  for (const [name, view] of Object.entries<{ readonly scope: (state: S) => unknown }>(app.views)) {
    const read = new Set<string>();

    try {
      view.scope(new Proxy(initial, { get: (target, key, receiver) => (typeof key === "string" && hidden.includes(key) && read.add(key), Reflect.get(target, key, receiver)) }) as S);
    } catch {
      // a scope that throws for the initial state is not this check's to report
    }

    for (const field of read) {
      found.push({ code: "redacted-in-view", field, message: `the view "${name}" reads the state field "${field}", which is Schema.Redacted: a view (and what it shows) may not depend on a secret` });
    }
  }

  return found;
};
