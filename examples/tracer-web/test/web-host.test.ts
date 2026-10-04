// `Web.run`: the ordinary browser host. It is a CALLER of the unchanged core (start, mount | hydrate, history in one Scope), so what is pinned here is
// what it adds (one lifetime and a `stop`), what it must not decide (presentation, URL policy, failure), and that the core still stands on its own.
// Real MESH rendering, real PORT DOM (jsdom), real clicks. Nothing here tests a disposition for an unobserved UI-entry failure: there is none.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Cause, Effect, Exit, Layer, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { application as catalogApplication, stateOf, urlOf, type Item } from "../src/catalog/app.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { initialStateAt, primitives } from "../src/catalog/web.js";
import { until } from "./helpers.js";
import { titleProgram } from "./title-program.js";

const programs = await compilePrograms();

const Row = Schema.Struct({ id: Schema.String, name: Schema.String });
const State = Schema.Struct({ items: Schema.Array(Row), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;

const initial: State = { items: ["success", "hang", "typed"].map((id) => ({ id, name: id })), value: "init" };

/** A page: a real document at a real URL (so history works) with the container the host presents in. */
const page = (html = "") => {
  const dom = new JSDOM(`<!doctype html><html><body><main>${html}</main></body></html>`, { url: "http://localhost/" });
  const win = dom.window as unknown as Window;
  const container = dom.window.document.querySelector("main")!;
  const click = (target: Element) => target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  const button = (label: string) => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label)!;
  const rowButton = (index: number) => container.querySelectorAll("div")[index]!.querySelector("button")!;
  const label = () => (container.querySelector("span")?.textContent ?? "").replace(/^\d+ items: /, "");

  return { win, container, click, button, rowButton, label };
};

/** A platform whose one resource says when it was acquired and released, and what the container held when it was released. */
const logging = (events: Array<string>, container: () => Element | undefined) => {
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(new Map()),
    Layer.scopedDiscard(Effect.acquireRelease(
      Effect.sync(() => { events.push("platform acquired"); }),
      () => Effect.sync(() => { events.push(`platform released (container ${container()?.innerHTML === "" ? "empty" : "drawn"})`); })
    ))
  );

  return platform;
};

/** One application: a pure command, and an effectful one selected by the id of the row that was clicked (success, a command that never ends, a typed failure). */
const build = (events: Array<string>, container: () => Element | undefined) => Valance.define({
  name: "web-host",
  state: { schema: State, initial },
  views: { home: { program: programs.home, scope: (state: State) => ({ title: "Host", count: state.items.length, summary: state.value, firstId: state.items[0]?.id ?? "", items: state.items.map(({ id, name }) => ({ id, name })) }) } },
  view: () => "home" as const,
  commands: (state) => {
    const command = Valance.command(state);
    const reverse = command(Schema.Struct({}), (_input, current) => ({ ...current, items: [...current.items].reverse(), value: "reversed" }));
    const behavior = (id: string): Effect.Effect<void, "typed-boom"> => id === "success"
      ? Effect.asVoid(state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value: "opened" })))
      : id === "hang"
        ? Effect.sync(() => { events.push("hang started"); }).pipe(Effect.zipRight(Effect.never), Effect.onInterrupt(() => Effect.sync(() => { events.push(`hang interrupted (container ${container()?.innerHTML === "" ? "empty" : "drawn"})`); })))
        : Effect.fail("typed-boom");
    const open = Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), ({ id }) => behavior(id));

    return {
      "home/open": Valance.entry(open, (id) => ({ id })),
      "home/reverse": Valance.entry(reverse),
    };
  },
});

/** Everything the console received while `body` ran (Effect's default logger writes every level through `console.log`). */
const logged: Array<string> = [];
const listen = () => {
  logged.length = 0;

  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: Array<unknown>) => { logged.push(args.map(String).join(" ")); });
  }
};

afterEach(() => { vi.restoreAllMocks(); });

describe("Web.run: one ordinary page", () => {
  it("1. starts a real application, presents it, and a real click reaches the application (a pure command through an entry)", async () => {
    const p = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "mount", platform: logging(events, () => p.container) });

    expect(await Effect.runPromise(host.handle.state)).toEqual(initial);          // the application is running and readable
    expect(p.label()).toBe("init");                                               // and presented
    expect(Object.keys(host).sort()).toEqual(["handle", "mounted", "stop"]);       // the whole surface the host adds

    p.click(p.button("Reverse"));
    await until(() => p.label() === "reversed");
    expect((await Effect.runPromise(host.handle.state)).items.map(({ id }) => id)).toEqual(["typed", "hang", "success"]);

    p.click(p.rowButton(2));                                                      // the effectful command, selected by the clicked row
    await until(() => p.label() === "opened");

    await host.stop();
  });

  it("2. the handle is the core's own: an outside caller enters the application through it, and the presentation follows", async () => {
    const p = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "mount" });

    await Effect.runPromise(host.handle.invoke("home/reverse", []));
    await until(() => p.label() === "reversed");

    await host.stop();
  });

  it("3. presentation is the caller's explicit choice and is never inferred from the container", async () => {
    const events: Array<string> = [];
    const app = build(events, () => undefined);
    const served = await Effect.runPromise(renderToHtml(app, { primitives, state: initial }));
    const tagged = (container: Element): ReadonlyArray<Element> => [...container.querySelectorAll("*")];

    // Server markup is present, and the caller says "mount": the presentation is created afresh; nothing is adopted, whatever the container held.
    const mounting = page(served.html);
    const before = tagged(mounting.container);
    const mounted = await Web.run(app, { container: mounting.container, primitives, present: "mount", state: served.state });

    expect(mounted.mounted.hydration).toBeUndefined();
    expect(before.some((node) => mounting.container.contains(node))).toBe(false);
    await mounted.stop();

    // The same markup, and the caller says "hydrate": the server's nodes are adopted, and the outcome is PORT's result, unchanged.
    const hydrating = page(served.html);
    const adoptable = tagged(hydrating.container);
    const hydrated = await Web.run(app, { container: hydrating.container, primitives, present: "hydrate", state: served.state });

    expect(hydrated.mounted.hydration).toEqual({ adopted: true });
    expect(adoptable.every((node) => hydrating.container.contains(node))).toBe(true);
    await hydrated.stop();

    // Markup that does not match the client's own render: PORT draws afresh and says so; hydration is verification, not a promise to adopt.
    const stale = page(served.html.replace("init", "stale"));
    const mismatched = await Web.run(app, { container: stale.container, primitives, present: "hydrate", state: served.state });

    expect(mismatched.mounted.hydration).toMatchObject({ adopted: false });
    expect(stale.label()).toBe("init");
    await mismatched.stop();
  });

  it("4. the application's URL policy runs through the host unchanged: it canonicalizes before the host, the host writes nothing at start, the application's urlOf is what is pushed, and Back goes through the application's own navigate entry", async () => {
    const p = page();
    const writes: Array<string> = [];
    const push = p.win.history.pushState.bind(p.win.history);
    const items: ReadonlyArray<Item> = [{ id: "A", name: "Alpha" }, { id: "B", name: "Beta" }, { id: "C", name: "Gamma" }];

    p.win.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => { writes.push(`push ${String(url)}`); push(data, unused, url); };
    p.win.history.replaceState(null, "", "/items/zzz");                             // a URL naming an item the application does not hold
    const entries = p.win.history.length;
    const state = initialStateAt(p.win, items);                                     // the application's first act, BEFORE the host: its canonical URL, replaced and never pushed

    expect(p.win.location.pathname).toBe("/not-found");
    expect(p.win.history.length).toBe(entries);
    expect(writes).toEqual([]);

    const host = await Web.run(catalogApplication(programs), { container: p.container, primitives, present: "mount", state, history: { window: p.win, urlOf, stateOf, navigate: "app/navigate" } });

    expect(writes).toEqual([]);                                                     // starting the host wrote nothing, and left the URL where the application put it
    expect(p.win.location.pathname).toBe("/not-found");

    p.click(p.container.querySelector("button")!);                                  // the not-found view's own intent: the application navigates home
    await until(() => p.container.querySelectorAll("div").length === 3);
    p.click([...p.container.querySelectorAll("div")].find((row) => row.querySelector("span")?.textContent === "Beta")!.querySelector("button")!);
    await until(() => p.container.textContent?.startsWith("Item B: Beta") === true);
    expect(writes).toEqual(["push /", "push /items/B"]);                             // each the application's own urlOf, written once, by history

    p.win.history.back();                                                           // the browser's Back: the application's navigate entry, not the host
    await until(() => p.win.location.pathname === "/" && p.container.querySelectorAll("div").length === 3);
    expect(writes).toEqual(["push /", "push /items/B"]);                             // and nothing was written for it

    await host.stop();
  });

  it("4b. without a URL policy the host keeps no URL in step", async () => {
    const p = page();
    const writes: Array<string> = [];
    const push = p.win.history.pushState.bind(p.win.history);

    p.win.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => { writes.push(String(url)); push(data, unused, url); };
    const host = await Web.run(catalogApplication(programs), { container: p.container, primitives, present: "mount" });

    p.click([...p.container.querySelectorAll("div")][0]!.querySelector("button")!);
    await until(() => p.container.textContent?.startsWith("Item A") === true);
    expect(writes).toEqual([]);
    await host.stop();
  });
});

describe("Web.run: one lifetime, one stop", () => {
  it("5. one shared lifetime: the platform is acquired once by the host's start, held while the page runs, and released once by stop", async () => {
    const p = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "mount", platform: logging(events, () => p.container) });

    expect(events).toEqual(["platform acquired"]);
    p.click(p.button("Reverse"));
    await until(() => p.label() === "reversed");
    expect(events).toEqual(["platform acquired"]);                                 // nothing released while the page runs

    await host.stop();
    expect(events).toEqual(["platform acquired", "platform released (container empty)"]);
    expect(p.container.innerHTML).toBe("");
  });

  it("6. stop ends the presentation first, then the application: an admitted command is interrupted with the container already empty, before the platform is released", async () => {
    const p = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "mount", platform: logging(events, () => p.container) });

    p.click(p.rowButton(1));                                                       // a command that never ends
    await until(() => events.includes("hang started"));

    await host.stop();
    expect(events).toEqual(["platform acquired", "hang started", "hang interrupted (container empty)", "platform released (container empty)"]);

    const exit = host.mounted.dispatched[0]!;                                      // the dispatching mount's record, as the core keeps it
    expect(Exit.isFailure(exit) && Cause.isInterruptedOnly(exit.cause)).toBe(true);
  });

  it("7. stop does not alter committed state, and the state stays readable afterwards", async () => {
    const p = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "mount" });

    p.click(p.rowButton(0));
    await until(() => p.label() === "opened");
    const committed = await Effect.runPromise(host.handle.state);

    await host.stop();
    expect(await Effect.runPromise(host.handle.state)).toEqual(committed);
    expect(committed.value).toBe("opened");
  });

  it("8. stopping again is the same completion: the application's lifetime is not restarted or released twice, and later entries are refused", async () => {
    const p = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "mount", platform: logging(events, () => p.container) });
    const first = host.stop();
    const second = host.stop();

    expect(second).toBe(first);
    await Promise.all([first, second]);
    await host.stop();
    expect(events).toEqual(["platform acquired", "platform released (container empty)"]);   // acquired once, released once

    const refused = await Effect.runPromise(Effect.exit(host.handle.invoke("home/reverse", [])));

    expect(Exit.isFailure(refused) && Cause.isDie(refused.cause)).toBe(true);      // the core's own terminal refusal: a defect, not a typed failure
    expect(p.container.innerHTML).toBe("");
  });
});

describe("Web.run: failure facts are the core's own", () => {
  it("9. a startup failure rejects with the existing typed StartError, after the lifetime it began is closed; the container is untouched and nothing is logged", async () => {
    listen();
    const p = page("<span>server markup</span>");
    const events: Array<string> = [];
    const rejection = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "hydrate", state: { items: "not items", value: 1 } as never, platform: logging(events, () => p.container) }).then(() => undefined, (error: unknown) => error);

    expect(rejection).toMatchObject({ _tag: "InitialValueInvalid" });
    expect(events).toEqual(["platform acquired", "platform released (container drawn)"]);   // acquired by start, released by the closed lifetime
    expect(p.container.innerHTML).toBe("<span>server markup</span>");
    expect(logged).toEqual([]);
  });

  it("10. a first presentation that cannot render rejects with the existing MeshDiagnostics, after the lifetime is closed", async () => {
    const p = page();
    const events: Array<string> = [];
    const Bad = Schema.Struct({ bad: Schema.Boolean });
    const app = Valance.define({
      name: "bad-first-render", state: { schema: Bad, initial: { bad: true } },
      views: { only: { program: titleProgram, scope: (state: { readonly bad: boolean }) => ({ title: state.bad ? (42 as never) : "ok" }) } },   // the first render violates the manifest
      view: () => "only" as const,
      commands: () => ({}),
    });
    const rejection = await Web.run(app, { container: p.container, primitives, present: "mount", platform: logging(events, () => p.container) }).then(() => undefined, (error: unknown) => error);

    expect(rejection).toMatchObject({ _tag: "MeshDiagnostics" });
    expect(events).toEqual(["platform acquired", "platform released (container empty)"]);   // nothing was ever drawn
  });

  it("11. a presentation that stops following is observable through the existing `followed`; the application keeps running and the host reports nothing", async () => {
    listen();
    const p = page();
    const Bad = Schema.Struct({ bad: Schema.Boolean });
    const app = Valance.define({
      name: "stops-following", state: { schema: Bad, initial: { bad: false } },
      views: { only: { program: programs.notfound, scope: (state: { readonly bad: boolean }) => ({ title: state.bad ? (42 as never) : "ok" }) } },   // the render after the click violates the manifest
      view: () => "only" as const,
      commands: (state) => ({ "notfound/back": Valance.entry(Valance.command(state)(Schema.Struct({}), () => ({ bad: true }))) }),
    });
    const host = await Web.run(app, { container: p.container, primitives, present: "mount" });

    p.click(p.container.querySelector("button")!);
    const ended = await Effect.runPromise(host.mounted.followed);                   // the mechanism the core already gives

    expect(Exit.isFailure(ended) && Cause.isFailType(ended.cause) && ended.cause.error._tag).toBe("MeshDiagnostics");
    expect((await Effect.runPromise(host.handle.state)).bad).toBe(true);            // the application committed and is alive
    await Effect.runPromise(host.handle.invoke("notfound/back", []));              // and still takes entries
    expect(logged).toEqual([]);

    await host.stop();
    expect(p.container.innerHTML).toBe("");                                         // stop still unmounts the inert presentation
  });

  it("12. a UI-entered command's failure is exactly what it is without the host: recorded in `dispatched`, nothing else changes, nothing is reported, and the page keeps working", async () => {
    listen();
    const p = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => p.container), { container: p.container, primitives, present: "mount" });

    p.click(p.rowButton(2));                                                        // the command that fails with a typed failure
    await Effect.runPromise(host.mounted.settled);

    const exit = host.mounted.dispatched[0]!;

    expect(Exit.isFailure(exit) && Cause.isFailType(exit.cause) && exit.cause.error).toBe("typed-boom");
    expect((await Effect.runPromise(host.handle.state)).value).toBe("init");        // no commit, no error state
    expect(p.label()).toBe("init");                                                 // nothing rendered
    expect(logged).toEqual([]);                                                     // no report, no global event

    p.click(p.button("Reverse"));                                                   // the application is the same application
    await until(() => p.label() === "reversed");
    await host.stop();
  });
});

describe("Web.run: a convenience over the core, not the definition of it", () => {
  it("13. the core stands alone: start gives a handle, and a caller can enter and read the application with no host and no DOM", async () => {
    const events: Array<string> = [];
    const value = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(build(events, () => undefined));

      yield* handle.invoke("home/reverse", []);

      return (yield* handle.state).value;
    })));

    expect(value).toBe("reversed");
  });

  it("14. the host's handle composes with the core: an independent mount in its own Scope shares the application, and closing it leaves the host's presentation alone", async () => {
    const first = page();
    const second = page();
    const events: Array<string> = [];
    const host = await Web.run(build(events, () => first.container), { container: first.container, primitives, present: "mount" });
    const scope = await Effect.runPromise(Scope.make());

    await Effect.runPromise(Valance.mount(host.handle, Web.target({ container: second.container, primitives })).pipe(Scope.extend(scope)));
    first.click(first.button("Reverse"));
    await until(() => first.label() === "reversed" && second.label() === "reversed");   // one application, two presentations

    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect(second.container.innerHTML).toBe("");                                    // the independent mount ended by its own Scope
    expect(first.label()).toBe("reversed");                                         // the host's presentation did not

    await host.stop();
  });

  it("15. the presentation choice is required by the type: it cannot be left to a default or to inspection", () => {
    const p = page();
    const never = () => {
      // @ts-expect-error `present` is required: the caller chooses "mount" or "hydrate"
      void Web.run(build([], () => p.container), { container: p.container, primitives });
    };

    expect(typeof never).toBe("function");
  });
});
