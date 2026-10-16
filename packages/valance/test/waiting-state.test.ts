// RF-5 (docs/application-model/COMMAND-SURFACE.md C-1): `work` is given the state as it is after `begin`.
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { waitingRun } from "../src/waiting.js";

interface S {
  readonly phase: string;
  readonly choice: string;
}

const handle = (initial: S) => {
  let current = initial;

  return {
    get: Effect.sync(() => current),
    update: (f: (state: S) => Effect.Effect<S>) => Effect.flatMap(f(current), (next) => Effect.sync(() => void (current = next))),
    read: () => current,
  };
};

describe("a waiting run", () => {
  it("gives `work` the state after `begin`, and a two-argument `work` still works", async () => {
    const state = handle({ phase: "idle", choice: "paid" });
    const seen: Array<S> = [];

    await Effect.runPromise(
      waitingRun<S, {}, string>(
        state as never,
        {
          begin: (_input, s) => ({ ...s, phase: "saving" }),
          work: async (_input, _signal, s) => (seen.push(s), s.choice),
          wanted: () => true,
          settle: (outcome, _input, s) => ({ ...s, phase: outcome.ok ? `saved ${outcome.value}` : "failed" }),
        },
        { latest: 0 },
      )({}),
    );
    expect(seen).toEqual([{ phase: "saving", choice: "paid" }]); // after begin
    expect(state.read().phase).toBe("saved paid");

    await Effect.runPromise(
      waitingRun<S, {}, string>(
        state as never,
        { work: async () => "two", wanted: () => true, settle: (outcome, _input, s) => ({ ...s, phase: outcome.ok ? outcome.value : "failed" }) },
        { latest: 0 },
      )({}),
    );
    expect(state.read().phase).toBe("two");
    void Schema;
  });
});
