// Stage 44: the repository's web host function (`src/api/shape-b.ts`, `run`: start + mount|hydrate + history in one operation) consuming the PUBLIC
// host contract, `Mounted`. A host that discards `mount`'s result silently loses one thing nothing else tells it: that the page STOPPED FOLLOWING the
// application (a render failed after the first draw). `Mounted.followed` is the only public observation of that, and `run` is the host that owes it to
// whoever operates the page. Imports only the public entries (`@valancex/valance`, `/web`) plus this example's own host.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Effect, Logger, Schema } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import * as Host from "../src/api/shape-b.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";

const State = Schema.Struct({ bad: Schema.Boolean });
type State = Schema.Schema.Type<typeof State>;

describe("the web host (`run`) and the end of a mount", () => {
  it("a render that fails AFTER the first draw ends the page's updates; the host reports it, once, through `Mounted.followed`", async () => {
    const programs = await compilePrograms();
    const app = Valance.define({
      name: "host-run",
      state: { schema: State, initial: { bad: false } },
      views: { only: { program: programs.notfound, scope: (state: State) => ({ title: state.bad ? (42 as never) : "ok" }) } },   // the second render violates the program's manifest
      view: () => "only" as const,
      commands: (state: Nexus.State.StateHandle<State>) => ({
        "notfound/back": Nexus.Mesh.bind(Nexus.Command.define("t.back", Schema.Struct({}), () => Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ bad: true })))), () => ({})),
      }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
    });
    const win = new JSDOM(`<!doctype html><html><body><main></main></body></html>`, { url: "http://localhost/" }).window;
    const container = win.document.querySelector("main")!;
    const logs: Array<string> = [];
    const logger = Logger.replace(Logger.defaultLogger, Logger.make(({ logLevel, message }) => { logs.push(`${logLevel.label}: ${String(message)}`); }));

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      yield* Host.run(app, { container, primitives });                              // the host returns nothing: this is all a caller sees
      expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("ok");

      container.querySelector("button")!.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      yield* Effect.promise(() => until(() => logs.length > 0));
      yield* Effect.yieldNow();
    }).pipe(Effect.provide(logger))));

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^ERROR: the page stopped following the application/);
    expect(container.innerHTML).toBe("");                                             // closing the Scope afterwards still unmounts: the host's observation is not a second owner
  });
});
