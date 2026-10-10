import * as Valance from "@valancex/valance";
import { Schema } from "effect";

const State = Schema.Struct({
  query: Schema.String,
  status: Schema.Literal("idle", "loading", "done", "failed"),
  result: Schema.String,
});
type State = typeof State.Type;

export const commands = (state: Valance.StateHandle<State>) => ({
  search: Valance.command(state).waiting(Schema.Struct({ query: Schema.String }), {
    // The state while the work runs.
    begin: ({ query }, current) => ({ ...current, query, status: "loading", result: "" }),
    // The work. `signal` is aborted when a newer search supersedes this one, or the application closes.
    work: ({ query }, signal) => fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal }).then((response) => response.text()),
    // Whether an answer is still wanted when it arrives.
    wanted: ({ query }, current) => current.query === query && current.status === "loading",
    // What the answer, or the failure, does to the state.
    settle: (outcome, _input, current) => outcome.ok ? { ...current, status: "done", result: outcome.value } : { ...current, status: "failed" },
  }),
});
