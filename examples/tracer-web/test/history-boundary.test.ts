// Probes of the navigation boundary: what Web.history does with the application's navigate entry.
// Real stack (NEXUS, MESH, PORT Web) over a jsdom window that has a real URL and a real history.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Logger } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, primitives, stateOf, urlOf, type AppState } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { until } from "./helpers.js";

type Options = Partial<Pick<Parameters<typeof Web.history<AppState, never>>[1], "navigate" | "stateOf" | "urlOf">>;

/** The application at /tracer/?tab=overview, History on its window, and every log line the run produced. */
const run = async <A>(options: Options, body: (context: {
  readonly win: Window;
  readonly handle: Valance.ApplicationHandle<AppState, unknown>;
  readonly main: Element;
  readonly logs: Array<string>;
  readonly settle: Effect.Effect<void>;
  readonly pushed: Array<string>;
}) => Effect.Effect<A, unknown>): Promise<A> => {
  const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/tracer/?tab=overview" });
  const win = dom.window as unknown as Window;
  const main = dom.window.document.querySelector("main")!;
  const logs: Array<string> = [];
  const pushed: Array<string> = [];
  const push = win.history.pushState.bind(win.history);
  win.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
  const app = application(await compilePrograms());
  const logger = Logger.replace(Logger.defaultLogger, Logger.make(({ message, cause }) => { logs.push(`${String(message)} ${String(cause)}`); }));

  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const handle = yield* Valance.start(app);

    yield* Valance.mount(handle, Web.target({ container: main, primitives }));
    yield* Web.history(handle, { window: win, urlOf, stateOf, navigate: "app/navigate", ...options });
    const settle = Effect.sleep("40 millis");
    yield* settle;

    return yield* body({ win, handle, main, logs, settle, pushed });
  })).pipe(Effect.provide(logger)));
};

const navigate = (handle: Valance.ApplicationHandle<AppState, unknown>, path: string, tab: string) => handle.invoke("app/navigate", [{ value: { path, tab } }]);
const url = (win: Window): string => win.location.pathname + win.location.search;

describe("Web.history boundary", () => {
  it("A/D: a MESH intent, invoke and Back all run the one navigate command, and the meaning of the entry survives the round trip", async () => {
    const result = await run({}, ({ win, handle, main, settle, pushed }) => Effect.gen(function* () {
      yield* Effect.promise(() => until(() => main.querySelectorAll("button").length > 0));
      main.querySelectorAll("button")[1]!.dispatchEvent(new (win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("click", { bubbles: true }));   // MESH: counter/goAbout
      yield* Effect.promise(() => until(() => url(win) === "/tracer/about?tab=overview"));
      yield* navigate(handle, "/about", "details");                                   // invoke
      yield* settle;
      win.history.back();                                                              // history: popstate → stateOf(url) → the same command
      yield* Effect.promise(() => until(() => main.textContent!.includes("tab: overview")));
      yield* settle;

      return { pushed, state: yield* handle.state, location: url(win) };
    }));

    expect(result.pushed).toEqual(["/tracer/about?tab=overview", "/tracer/about?tab=details"]);
    expect(result.state).toMatchObject({ path: "/about", tab: "overview" });          // Back came back to what the first navigation meant
    expect(result.location).toBe("/tracer/about?tab=overview");
  });

  it("B: a navigate key the application never bound: popstate is a logged UnmappedCommand, state and URL stay where they were, and later navigation still works", async () => {
    const result = await run({ navigate: "app/nvaigate" }, ({ win, handle, logs, settle, pushed }) => Effect.gen(function* () {
      yield* navigate(handle, "/about", "overview");
      yield* settle;
      win.history.back();                                                              // the browser is at /tracer/?tab=overview
      yield* settle;
      const afterBack = { location: url(win), state: yield* handle.state, logs: [...logs] };
      yield* navigate(handle, "/about", "details");
      yield* settle;

      return { afterBack, pushed, state: yield* handle.state };
    }));

    expect(result.afterBack.location).toBe("/tracer/?tab=overview");
    expect(result.afterBack.state).toMatchObject({ path: "/about", tab: "overview" });  // unchanged: the application never heard of it
    expect(result.afterBack.logs.join("\n")).toContain("UnmappedCommand");
    expect(result.pushed).toEqual(["/tracer/about?tab=overview", "/tracer/about?tab=details"]);
    expect(result.state).toMatchObject({ path: "/about", tab: "details" });
  });

  it("C1: stateOf yields an argument the command's schema rejects: a logged validation failure, state unchanged", async () => {
    const result = await run({ stateOf: () => ({ path: 42 } as never) }, ({ win, handle, logs, settle }) => Effect.gen(function* () {
      yield* navigate(handle, "/about", "overview");
      yield* settle;
      win.history.back();
      yield* settle;

      return { state: yield* handle.state, logs: logs.join("\n") };
    }));

    expect(result.state).toMatchObject({ path: "/about", tab: "overview" });
    expect(result.logs).toContain("CommandValidationError");
  });

  it("C2: a throwing stateOf is a logged failed synchronization, not the end of history: state unchanged, and later navigation still writes the URL", async () => {
    const result = await run({ stateOf: () => { throw new Error("stateOf defect"); } }, ({ win, handle, logs, settle, pushed }) => Effect.gen(function* () {
      yield* navigate(handle, "/about", "overview");
      yield* settle;
      win.history.back();
      yield* settle;
      const afterBack = { state: yield* handle.state, logs: logs.join("\n") };
      yield* navigate(handle, "/about", "details");                                    // an ordinary application navigation afterwards
      yield* settle;

      return { afterBack, pushed };
    }));

    expect(result.afterBack.state).toMatchObject({ path: "/about", tab: "overview" });
    expect(result.afterBack.logs).toContain("stateOf defect");
    expect(result.pushed).toEqual(["/tracer/about?tab=overview", "/tracer/about?tab=details"]);
  });

  it("C3: a throwing urlOf is logged for that state and the baseline stays; the next state it can name is compared with it", async () => {
    const fragile = (state: AppState): string => { if (state.path === "/about" && state.tab === "boom") { throw new Error("urlOf defect"); } return urlOf(state); };
    const result = await run({ urlOf: fragile }, ({ handle, logs, settle, pushed }) => Effect.gen(function* () {
      yield* navigate(handle, "/about", "boom");
      yield* settle;
      const afterBoom = { pushed: [...pushed], logs: logs.join("\n") };
      yield* navigate(handle, "/about", "details");
      yield* settle;

      return { afterBoom, pushed };
    }));

    expect(result.afterBoom.pushed).toEqual([]);
    expect(result.afterBoom.logs).toContain("urlOf defect");
    expect(result.pushed).toEqual(["/tracer/about?tab=details"]);
  });
});
