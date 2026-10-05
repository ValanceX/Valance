// Real-application pressure test (src/items): one small application through the public API only, at every level the contract names: headless, server-rendered, hydrated
// with URL history, stopped while work is in flight. The platform's one service (where an item's text comes from) is a gate per call, so nothing depends on timing.
// What the author had to reach below VALANCE for is in src/items/FRICTION.md.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect, Exit, Fiber, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, stateFor, stateOf, urlOf, type AppState, type FetchDetail } from "../src/items/app.js";
import { compilePrograms } from "../src/items/compile.js";
import { primitives } from "../src/items/web.js";
import { until } from "./helpers.js";

const programs = await compilePrograms();

/** The fetch service: every call waits on a gate the test opens, and notes whether its signal was aborted. */
const service = () => {
  const calls: Array<{ readonly id: string; readonly resolve: (text: string) => void; readonly reject: (reason: string) => void; aborted: boolean }> = [];
  const fetchDetail: FetchDetail = (id, signal) => new Promise<string>((resolve, reject) => {
    const call = { id, resolve, reject, aborted: false };

    signal.addEventListener("abort", () => { call.aborted = true; });
    calls.push(call);
  });

  return { calls, fetchDetail };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const headless = async () => {
  const s = service();
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application(programs, s.fetchDetail)).pipe(Scope.extend(scope)));
  const state = (): Promise<AppState> => Effect.runPromise(handle.state);
  // An invoked command that waits is awaited by its caller: the host runs it as a fiber of the application's own Scope and does not wait here.
  const invoke = (key: string, args: Parameters<typeof handle.invoke>[1]) => Effect.runPromise(Effect.forkIn(Effect.exit(handle.invoke(key, args)), scope));
  const select = (id: string) => invoke("app/select", [{ value: id }]);

  return { ...s, handle, scope, state, select, invoke, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

describe("headless: the application with no screen and no URL", () => {
  it("select → loading → ready; a failure is state; Reload recovers", async () => {
    const t = await headless();

    expect((await t.state()).detail.status).toBe("idle");
    await t.select("a");
    await until(() => t.calls.length === 1);
    expect(await t.state()).toMatchObject({ selected: "a", detail: { status: "loading" } });
    t.calls[0]!.resolve("alpha text");
    await settle();
    expect(await t.state()).toMatchObject({ selected: "a", detail: { status: "ready", text: "alpha text" } });

    await t.select("b");
    await until(() => t.calls.length === 2);
    t.calls[1]!.reject("offline");
    await settle();
    expect(await t.state()).toMatchObject({ selected: "b", detail: { status: "failed", text: "offline" } });

    await t.invoke("app/reload", []);
    await until(() => t.calls.length === 3);
    t.calls[2]!.resolve("beta text");
    await settle();
    expect(await t.state()).toMatchObject({ selected: "b", detail: { status: "ready", text: "beta text" } });
    await t.close();
  });

  it("overlap: B completes, then A: the state stays B's", async () => {
    const t = await headless();

    await t.select("a"); await until(() => t.calls.length === 1);
    await t.select("b"); await until(() => t.calls.length === 2);
    t.calls[1]!.resolve("beta text");
    await settle();
    t.calls[0]!.resolve("alpha text");                         // late
    await settle();
    expect(await t.state()).toMatchObject({ selected: "b", detail: { status: "ready", text: "beta text" } });
    await t.close();
  });

  it("Back while A is loading supersedes A: A's late completion changes nothing", async () => {
    const t = await headless();

    await t.select("a"); await until(() => t.calls.length === 1);
    await Effect.runPromise(t.handle.invoke("app/back", []));
    t.calls[0]!.resolve("alpha text");
    await settle();
    expect(await t.state()).toMatchObject({ selected: "", detail: { status: "idle", text: "" } });
    await t.close();
  });

  it("closing the application while work is in flight aborts the work", async () => {
    const t = await headless();

    await t.select("a"); await until(() => t.calls.length === 1);
    await t.close();
    expect(t.calls[0]!.aborted).toBe(true);
  });
});

/** A page: a real document at a real URL (so history works) holding what the server rendered. */
const page = (url: string, html: string) => {
  const dom = new JSDOM(`<!doctype html><html><body><main>${html}</main></body></html>`, { url });
  const win = dom.window as unknown as Window;
  const container = dom.window.document.querySelector("main")!;
  const click = (label: string) => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label)!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  const texts = () => [...container.querySelectorAll("span")].map((span) => span.textContent);
  const buttons = () => [...container.querySelectorAll("button")].map((button) => button.textContent);

  return { win, container, click, texts, buttons };
};

/** The server: the SAME definition, rendered for a request URL. Its fetch never completes: startup work begins during a render and is not awaited. */
const serve = (url: string) => Effect.runPromise(renderToHtml(application(programs, () => new Promise<string>(() => undefined)), { primitives, state: stateFor(url) }));

describe("server rendering: another way to run the same application", () => {
  it("a list URL and a detail URL render from the application's own stateFor; the returned state is what the browser hydrates with", async () => {
    const list = await serve("/items");
    const detail = await serve("/items?item=b");

    expect(list.html).toBe('<section aria-label="Items"><div><button>Alpha</button></div><div><button>Beta</button></div><div><button>Gamma</button></div></section>');
    expect(detail.html).toBe('<section aria-label="Item"><span>Beta</span><span>Loading…</span><button>Reload</button><button>Back</button></section>');
    expect(detail.state).toMatchObject({ selected: "b", detail: { status: "loading" } });
  });
});

describe("the browser: hydrate a server-rendered detail, then use it", () => {
  it("deep link → hydrate → startup work loads the text → Back (a click) → pick another → the browser's Back and Forward", async () => {
    const served = await serve("/items?item=b");
    const p = page("http://localhost/items?item=b", served.html);
    const s = service();
    const host = await Web.run(application(programs, s.fetchDetail), { container: p.container, primitives, present: "hydrate", state: served.state, history: { window: p.win, urlOf, stateOf, navigate: "select" } });

    // hydration adopted the server's markup; the application's own startup work (not the host's) starts the fetch the server could not complete
    expect(host.mounted.hydration).toMatchObject({ adopted: true });
    expect(p.texts()).toEqual(["Beta", "Loading…"]);
    await until(() => s.calls.length === 1);
    expect(s.calls[0]!.id).toBe("b");
    s.calls[0]!.resolve("beta text");
    await until(() => p.texts()[1] === "beta text");

    // Back (the button) is an application command: the view is the list, and the URL follows the state: one push, never a write from the view
    p.click("Back");
    await until(() => p.buttons().join() === "Alpha,Beta,Gamma");
    await until(() => p.win.location.search === "");
    expect(p.win.location.pathname + p.win.location.search).toBe("/items");

    // pick Gamma: loading, then a failure that is state and a view; Reload recovers
    p.click("Gamma");
    await until(() => p.texts()[1] === "Loading…" && s.calls.length === 2);
    expect(p.win.location.search).toBe("?item=c");
    s.calls[1]!.reject("offline");
    await until(() => p.texts()[1] === "Failed: offline");
    p.click("Reload");
    await until(() => s.calls.length === 3);
    s.calls[2]!.resolve("gamma text");
    await until(() => p.texts()[1] === "gamma text");

    // the browser's Back: popstate → the application's own navigate command → the list; Forward → detail again, fetched again
    p.win.history.back();
    await until(() => p.buttons().join() === "Alpha,Beta,Gamma");
    p.win.history.forward();
    await until(() => p.texts()[0] === "Gamma" && s.calls.length === 4);
    s.calls[3]!.resolve("gamma again");
    await until(() => p.texts()[1] === "gamma again");

    // stopping the page ends the application: work in flight is aborted
    p.click("Reload");
    await until(() => s.calls.length === 5);
    await host.stop();
    expect(s.calls[4]!.aborted).toBe(true);
  });

  it("the browser's Back while a request is in flight supersedes it: the late answer cannot reappear", async () => {
    const p = page("http://localhost/items", (await serve("/items")).html);
    const s = service();
    const host = await Web.run(application(programs, s.fetchDetail), { container: p.container, primitives, present: "hydrate", state: stateFor("/items"), history: { window: p.win, urlOf, stateOf, navigate: "select" } });

    p.click("Alpha");
    await until(() => s.calls.length === 1 && p.texts()[1] === "Loading…");
    p.win.history.back();
    await until(() => p.buttons().join() === "Alpha,Beta,Gamma");
    s.calls[0]!.resolve("alpha text");
    await new Promise((r) => setTimeout(r, 30));
    expect(p.buttons().join()).toBe("Alpha,Beta,Gamma");
    expect(await Effect.runPromise(host.handle.state)).toMatchObject({ selected: "", detail: { status: "idle" } });
    expect(s.calls[0]!.aborted).toBe(false);                   // delivery was dropped; the underlying work was not cancelled (replacement is not cancellation)
    await host.stop();
  });
});
