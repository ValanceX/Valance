// S5: a dispatch may itself be what shuts its application down (a "quit" command). Termination is uninterruptible and
// ends the application's in-flight dispatches, so it must not wait for the dispatch that is performing it.
// This is a guard on the shutdown fix, not a second subject: jsdom only.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Effect, Schema } from "effect";
import { expect, it } from "vitest";

import { AppState, initial } from "./app.js";
import { compileProgram } from "./compile.js";
import { recording } from "./harness.js";
import { load } from "../test/helpers.js";

it("S5 a command that shuts its own application down completes: the application stops and the command ends there", async () => {
  const program = await compileProgram();
  const page = load("");
  const seen: Array<string> = [];
  const holder: { running?: Valance.Running<AppState, never, never> } = {};
  const quit = Nexus.Command.define("app.quit", Schema.Struct({}), () => Effect.gen(function* () {
    seen.push("quitting");
    yield* Nexus.Application.shutdown(holder.running!.nexus);
    seen.push("after-shutdown");
  }));
  const app = Valance.define({
    name: "self-shutdown",
    state: { schema: AppState, initial },
    views: { page: { program, scope: ({ status, data, ticks }) => ({ status, data, ticks }) } },
    view: () => "page" as const,
    commands: () => ({
      "asyncapp/load": Nexus.Mesh.bind(quit, () => ({})),
      "asyncapp/tick": Nexus.Mesh.bind(Nexus.Command.define("app.noop", Schema.Struct({}), () => Effect.void), () => ({})),
    }),
  });

  const outcome = await Promise.race([
    Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app);

      holder.running = running as unknown as Valance.Running<AppState, never, never>;
      yield* Valance.mount(running, recording(page.container, []));
      page.click(page.container.querySelectorAll("button")[0]!);
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 100)));

      return (yield* Nexus.Application.status(running.nexus))._tag;
    }))),
    new Promise<string>((resolve) => setTimeout(() => resolve("deadlocked"), 3000)),
  ]);

  expect(outcome).toBe("Stopped");
  expect(seen).toEqual(["quitting"]);
});
