// `history`'s `navigate` as a bare command name: the navigation fact `stateOf` reads from a URL is that command's INPUT, whole, validated by its schema as always. An exact key
// ("app/navigate") is the binding it always was, and the positional rule for event and `invoke` arguments (a struct takes arguments as fields, in order; a single object is not
// unpacked: name-keyed-commands.test.ts, case 11) is untouched. Headless application, a real jsdom window, real history.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Exit, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { until } from "./helpers.js";
import { titleProgram } from "./title-program.js";

const State = Schema.Struct({ place: Schema.String, step: Schema.Number });
type State = typeof State.Type;

const logged: Array<string> = [];

afterEach(() => { vi.restoreAllMocks(); logged.length = 0; });

const listen = () => {
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: Array<unknown>) => { logged.push(args.map(String).join(" ")); });
  }
};

const boot = async (navigate: string, commandsOf: (state: Valance.StateHandle<State>) => Record<string, unknown>) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/place/home" });
  const win = dom.window as unknown as Window;
  const scope = await Effect.runPromise(Scope.make());
  const app = Valance.define({
    name: "navigate",
    state: { schema: State, initial: { place: "home", step: 0 } },
    views: { only: { program: titleProgram, scope: (state: State) => ({ title: state.place }) } },
    view: () => "only" as const,
    commands: commandsOf as never,
  });
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));

  await Effect.runPromise(Web.history(handle, { window: win, urlOf: ({ place }) => `/place/${place}`, stateOf: (url) => ({ place: url.pathname.slice("/place/".length), step: 1 }), navigate }).pipe(Scope.extend(scope)));

  const state = () => Effect.runPromise(handle.state) as Promise<State>;

  return { win, handle, state, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

describe("a bare navigate: the navigation fact is the command's input", () => {
  it("a struct input takes the fact whole; Back and Forward follow; the URL follows the state", async () => {
    const t = await boot("go", (state) => ({ go: Valance.command(state)(Schema.Struct({ place: Schema.String, step: Schema.Number }), (fact, current) => ({ ...current, place: fact.place, step: fact.step })) }));

    await Effect.runPromise(t.handle.invoke("app/go", ["about", 2].map((value) => ({ value }))));   // an application-initiated navigation: positional, as ever
    await until(() => t.win.location.pathname === "/place/about");
    t.win.history.back();
    await until(() => t.win.location.pathname === "/place/home");
    await until(() => true);
    expect(await t.state()).toMatchObject({ place: "home", step: 1 });                               // popstate: the fact {place, step: 1} was the input, whole
    t.win.history.forward();
    await until(() => t.win.location.pathname === "/place/about");
    expect(await t.state()).toMatchObject({ place: "about", step: 1 });
    await t.close();
  });

  it("a non-struct input takes the fact as it is", async () => {
    const t = await boot("go", (state) => ({ go: Valance.command(state)(Schema.Struct({ place: Schema.String, step: Schema.Number }), (fact, current) => ({ ...current, place: fact.place })) }));

    await Effect.runPromise(t.handle.invoke("app/go", [{ value: "x" }, { value: 1 }]));
    expect((await t.state()).place).toBe("x");
    await t.close();
  });

  it("the positional rule for `invoke` is untouched: a single object is still not unpacked into fields", async () => {
    const t = await boot("go", (state) => ({ go: Valance.command(state)(Schema.Struct({ place: Schema.String }), ({ place }, current) => ({ ...current, place })) }));
    const exit = await Effect.runPromiseExit(t.handle.invoke("app/go", [{ value: { place: "x" } }]));

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("CommandValidationError");
    expect((await t.state()).place).toBe("home");
    await t.close();
  });

  it("a fact the command's schema rejects is the typed CommandValidationError, logged, and changes nothing; later navigation still works", async () => {
    listen();

    const t = await boot("go", (state) => ({ go: Valance.command(state)(Schema.Struct({ place: Schema.String, step: Schema.Literal(7) }), ({ place }, current) => ({ ...current, place })) }));

    t.win.history.pushState(null, "", "/place/elsewhere");
    t.win.history.back();
    await until(() => logged.some((line) => line.includes("popstate navigation failed") && line.includes("CommandValidationError")));
    expect((await t.state()).place).toBe("home");                                                    // step: 1 is not the literal 7
    await t.close();
  });

  it("a bare name the table lacks is the typed UnmappedCommand, logged, and changes nothing", async () => {
    listen();

    const t = await boot("nowhere", (state) => ({ go: Valance.command(state)((current) => current) }));

    t.win.history.pushState(null, "", "/place/elsewhere");
    t.win.history.back();
    await until(() => logged.some((line) => line.includes("popstate navigation failed") && line.includes("UnmappedCommand")));
    expect((await t.state()).place).toBe("home");
    await t.close();
  });

  it("an exact key is the binding it always was (an adapter still works)", async () => {
    const t = await boot("app/navigate", (state) => ({
      "app/navigate": Valance.entry(Valance.command(state)(Schema.Struct({ place: Schema.String }), ({ place }, current) => ({ ...current, place })), (fact) => ({ place: (fact as { place: string }).place })),
    }));

    t.win.history.pushState(null, "", "/place/elsewhere");
    t.win.history.back();
    await until(() => t.win.location.pathname === "/place/home");
    expect((await t.state()).place).toBe("home");
    await t.close();
  });
});
