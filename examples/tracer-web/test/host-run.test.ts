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
  it("a render that fails AFTER the first draw ends the page's updates; the host reports it once through `Mounted.followed`, then, through `settled` and `dispatched`, what the page's events had done", async () => {
    const programs = await compilePrograms();
    let clicks = 0;
    const app = Valance.define({
      name: "host-run",
      state: { schema: State, initial: { bad: false } },
      views: { only: { program: programs.notfound, scope: (state: State) => ({ title: state.bad ? (42 as never) : "ok" }) } },   // the render after the second click violates the program's manifest
      view: () => "only" as const,
      commands: (state: Nexus.State.StateHandle<State>) => ({
        // click 1: the event command FAILS (typed); click 2: it succeeds, and its commit is the state whose render fails
        "notfound/back": Nexus.Mesh.bind(Nexus.Command.define("t.back", Schema.Struct({}), () => {
          clicks += 1;

          return clicks === 1 ? Effect.fail("nope") as Effect.Effect<void, string> : Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ bad: true })));
        }), () => ({})),
      }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
    });
    const win = new JSDOM(`<!doctype html><html><body><main></main></body></html>`, { url: "http://localhost/" }).window;
    const container = win.document.querySelector("main")!;
    const logs: Array<string> = [];
    const logger = Logger.replace(Logger.defaultLogger, Logger.make(({ logLevel, message }) => { logs.push(`${logLevel.label}: ${String(message).split("\n")[0]}`); }));
    const click = () => container.querySelector("button")!.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      yield* Host.run(app, { container, primitives });                              // the host returns nothing: this is all a caller sees
      expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("ok");

      click();                                                                      // a FAILED event command on a healthy page
      yield* Effect.promise(() => until(() => clicks === 1));
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(logs).toEqual([]);                                                     // observed limitation: nothing tells the host, the failure waits in `dispatched` until the host's one moment

      click();                                                                      // a SUCCESSFUL event command whose commit cannot be rendered
      yield* Effect.promise(() => until(() => logs.length >= 3));
    }).pipe(Effect.provide(logger))));

    expect(logs).toHaveLength(3);                                                   // one report per fact: how the mount ended, the tally, the one failed command
    expect(logs.filter((line) => line.startsWith("ERROR: the page stopped following the application"))).toHaveLength(1);
    expect(logs).toContain("INFO: event commands in this mount: 1 succeeded, 1 failed, 0 interrupted");   // success and failure are distinguished
    expect(logs.filter((line) => line.startsWith("ERROR: event command failed"))).toHaveLength(1);
    expect(container.innerHTML).toBe("");                                             // closing the Scope afterwards still unmounts: the host's observation is not a second owner
  });
});
