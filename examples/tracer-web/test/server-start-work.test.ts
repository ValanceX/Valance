// Characterization (interface review): `renderToHtml` is `start` + one render + end, so an application's declared start-time work BEGINS during a server render
// and is interrupted when the render ends. It is neither skipped nor awaited. The returned html and state are those read right after the first render:
// before the work could change anything. This is today's behavior of two public entries meeting, not a requirement; the application's guard is its own state
// (application-start-work probe 5), and a server platform that lacks the capability makes the work fail harmlessly.
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Deferred, Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";

const State = Schema.Struct({ phase: Schema.Literal("loading", "ready") });
type State = typeof State.Type;

describe("start-time work during a server render", () => {
  it("begins, is interrupted when the render ends, and the served state/html are the pre-work ones", async () => {
    const log: Array<string> = [];
    const gate = Effect.runSync(Deferred.make<void>());
    const app = Valance.define({
      name: "server-start", state: { schema: State, initial: { phase: "loading" } satisfies State },
      views: { only: { program: titleProgram, scope: (s: State) => ({ title: s.phase }) } }, view: () => "only" as const,
      commands: (state: Nexus.State.StateHandle<State>) => ({
        "app/load": Valance.entry(Nexus.Command.define("load", Schema.Struct({}), () => Effect.gen(function* () {
          log.push("started");
          yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push("interrupted"); })));
          yield* state.update((): Effect.Effect<State> => Effect.succeed({ phase: "ready" }));
        }))),
      }),
      start: "app/load",
    });
    const served = await Effect.runPromise(renderToHtml(app, { primitives: { page: { element: "main", props: { title: Web.attribute("aria-label") } }, text: { element: "p" } } }));

    expect(log).toEqual(["started", "interrupted"]);
    expect(served.state).toEqual({ phase: "loading" });
    expect(served.html).toContain("loading");
    await Effect.runPromise(Deferred.succeed(gate, undefined));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(log).toEqual(["started", "interrupted"]);
  });
});
