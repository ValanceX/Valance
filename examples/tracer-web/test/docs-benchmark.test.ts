// The V1 composition benchmark (src/docs-benchmark), executed: server rendering of a home, a guide and a reference page; hydration of a guide; sidebar navigation with
// the active page, previous / next, an expandable section, browser Back / Forward; search with loading, results, failure and stale answers; keyed identity across navigation.
// What the author had to think below VALANCE is in src/docs-benchmark/COGNITIVE_LOAD.md.
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, stateFor, stateOf, titleOf, urlOf, type SearchDocs } from "../src/docs-benchmark/app.js";
import { compilePrograms } from "../src/docs-benchmark/compile.js";
import { primitives } from "../src/docs-benchmark/web.js";
import { until } from "./helpers.js";

const programs = await compilePrograms();

type Hit = ReadonlyArray<{ readonly id: string; readonly title: string }>;

/** The search service: every call waits on a gate the test opens, and notes whether its signal was aborted. */
const service = () => {
  const calls: Array<{ readonly query: string; readonly resolve: (hits: Hit) => void; readonly reject: (reason: string) => void; aborted: boolean }> = [];
  const searchDocs: SearchDocs = (query, signal) => new Promise<Hit>((resolve, reject) => {
    const call = { query, resolve, reject, aborted: false };

    signal.addEventListener("abort", () => { call.aborted = true; });
    calls.push(call);
  });

  return { calls, searchDocs };
};

const serve = (url: string) => Effect.runPromise(renderToHtml(application(programs, () => new Promise<Hit>(() => undefined)), { primitives, state: stateFor(url) }));

const page = (url: string, html: string) => {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, { url });
  const win = dom.window as unknown as Window;
  const container = dom.window.document.querySelector("#root")!;
  const link = (label: string) => [...container.querySelectorAll("a")].find((candidate) => candidate.textContent === label)!;
  const click = (label: string, init: MouseEventInit = {}) => { const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }); link(label).dispatchEvent(event); return event; };
  const press = (label: string) => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label)!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  const type = (value: string) => { const input = container.querySelector("input")!; input.value = value; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); };
  const title = () => container.querySelector("main > h1")?.textContent ?? container.querySelector("h1")?.textContent;
  const navItems = () => [...container.querySelectorAll("nav > ul > li")];
  const active = () => navItems().find((item) => item.querySelector("span")!.textContent === "›")?.querySelector("a")!.textContent;
  const status = () => container.querySelector("header > span")?.textContent;
  const results = () => [...container.querySelectorAll("header ul a")].map((a) => a.textContent);

  return { win, container, link, click, press, type, title, navItems, active, status, results };
};

describe("server rendering: the same application, three kinds of page", () => {
  it("home, a guide and a reference page", async () => {
    const home = await serve("/docs/");
    const guide = await serve("/docs/guides/state");
    const reference = await serve("/docs/reference/api");

    expect(home.html).toContain("<h1>Valance</h1>");
    expect(home.html).toContain('<a href="/docs/guides/state">State</a>');
    expect(guide.html).toContain("<h1>State</h1>");
    expect(guide.html).toContain('<span>›</span><a href="/docs/guides/state">Guides: State</a>');   // the active page is marked in the server's HTML
    expect(guide.html).toContain('<a href="/docs/guides/getting-started">← Getting Started</a>');
    expect(reference.html).toContain("<pre>Valance.define(definition)</pre>");
    expect((await serve("/docs/reference/configuration")).html).not.toContain("→");                   // the last page has no next
    expect(guide.state).toMatchObject({ page: "state" });
    // the server's document writes the title from the state it rendered, with the same function history later keeps in step in the browser
    expect([home, guide, reference].map(({ state }) => titleOf(state))).toEqual(["Valance", "State · Valance", "API · Valance"]);
  });
});

describe("the browser: hydrate a guide, then use the site", () => {
  const boot = async (path = "/docs/guides/state") => {
    const served = await serve(path);
    const p = page(`http://localhost${path}`, served.html);
    const s = service();
    const host = await Web.run(application(programs, s.searchDocs), { container: p.container, primitives, present: "hydrate", state: served.state, history: { window: p.win, urlOf, stateOf, titleOf, navigate: "go" } });

    return { p, s, host, served };
  };

  it("hydrates, navigates by the sidebar (keyed identity kept), prev / next, details, Back / Forward; a link click never navigates the document", async () => {
    const { p, host } = await boot();

    expect(host.mounted.hydration).toMatchObject({ adopted: true });
    expect(p.title()).toBe("State");
    expect(p.active()).toBe("Guides: State");
    await until(() => p.win.document.title === "State · Valance");               // history sets it for the first state (its baseline is taken just after attaching): hydration need not

    const items = p.navItems();
    const event = p.click("Reference: API");

    expect(event.defaultPrevented).toBe(true);
    await until(() => p.title() === "API");
    expect(p.win.document.title).toBe("API · Valance");                          // client navigation updated the document's title with the URL
    expect(p.win.location.pathname).toBe("/docs/reference/api");
    expect(p.active()).toBe("Reference: API");
    expect(p.navItems()).toEqual(items);                                  // the same <li> elements: keyed identity through the whole stack

    // the browser keeps what is not a plain click: a modified click, and a link to another site (the author wrote no code for either)
    expect(p.click("Configuration →", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(p.title()).toBe("API");
    const foreign = p.container.ownerDocument.createElement("a");

    foreign.setAttribute("href", "https://example.com/docs");
    p.container.append(foreign);
    expect(foreign.dispatchEvent(new (p.win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))).toBe(true);

    p.click("Configuration →");
    await until(() => p.title() === "Configuration");
    p.click("← API");
    await until(() => p.title() === "API");

    p.press("Show details");                                              // an expandable section is ordinary state
    await until(() => p.container.textContent!.includes("Every export, by name."));
    p.press("Hide details");
    await until(() => !p.container.textContent!.includes("Every export, by name."));

    p.win.history.back();                                                 // the browser's Back: popstate → the application's navigate command
    await until(() => p.title() === "Configuration");
    p.win.history.back();
    await until(() => p.title() === "API");
    p.win.history.forward();
    await until(() => p.title() === "Configuration");

    p.click("Guides: Getting Started");
    await until(() => p.title() === "Getting Started");
    await host.stop();
  });

  it("search: loading, results, failure; a late answer for an older query is dropped; going to a page supersedes a search in flight", async () => {
    const { p, s, host } = await boot();

    p.type("a");
    await until(() => s.calls.length === 1 && p.status() === "Searching…");
    p.type("as");                                                         // a second query while the first is in flight
    await until(() => s.calls.length === 2);
    s.calls[1]!.resolve([{ id: "async-work", title: "Async Work" }]);
    await until(() => p.results().join() === "Async Work");
    s.calls[0]!.resolve([{ id: "api", title: "API" }, { id: "state", title: "State" }]);   // the stale one, late
    await new Promise((r) => setTimeout(r, 30));
    expect(p.results()).toEqual(["Async Work"]);                          // the newer answer is still what is shown

    p.type("zzz");                                                        // a failure is state and a view
    await until(() => s.calls.length === 3);
    s.calls[2]!.reject("offline");
    await until(() => p.status() === "Search failed: offline");

    p.type("st");                                                         // a search in flight when the reader picks a page
    await until(() => s.calls.length === 4 && p.status() === "Searching…");
    p.click("Reference: API");
    await until(() => p.title() === "API");
    s.calls[3]!.resolve([{ id: "state", title: "State" }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(p.results()).toEqual([]);                                      // going to a page superseded the search
    expect(p.status()).toBeUndefined();
    // The application cleared the query and the box shows it (PORT `controlled`): state and screen agree. The benchmark's pinned mismatch ("st" here) is gone.
    expect((await Effect.runPromise(host.handle.state)).search.query).toBe("");
    expect(p.container.querySelector("input")!.value).toBe("");
    expect(s.calls[3]!.aborted).toBe(false);                              // delivery was dropped; the work itself was left alone

    p.type("last");                                                       // work in flight when the page stops is aborted
    await until(() => s.calls.length === 5);
    await host.stop();
    expect(s.calls[4]!.aborted).toBe(true);
  });
});
