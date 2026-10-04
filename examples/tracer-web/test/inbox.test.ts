// The second application (src/inbox): a different shape from Tally (two views; a detail over a list selected by a state field; URL = query), driven
// only through the public API. It runs through `Web.run`, the ordinary browser host: start, presentation and URL synchronization in one lifetime that
// `stop` closes. Tally's test (test/tally.test.ts) still composes the same steps by hand over the core.
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, stateFor, stateOf, urlOf } from "../src/inbox/app.js";
import { compilePrograms } from "../src/inbox/compile.js";
import { primitives } from "../src/inbox/web.js";
import { until } from "./helpers.js";

const source = (file: string): string => readFileSync(new URL(`../src/inbox/${file}`, import.meta.url), "utf8");

describe("second application: inbox", () => {
  it("the definition imports only the public entry, NEXUS and effect", () => {
    expect([...source("app.ts").matchAll(/from "([^"]+)"/g)].map((match) => match[1]).sort()).toEqual(["@valancex/nexus", "@valancex/valance", "effect"]);
  });

  it("one mount: open a message (a view change), star it (a same-view update), Back closes it, Forward reopens it; the URL follows", async () => {
    const app = application(await compilePrograms());
    const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/inbox" });
    const win = dom.window as unknown as Window;
    const main = dom.window.document.querySelector("main")!;
    const writes: Array<string> = [];
    const push = win.history.pushState.bind(win.history);

    win.history.pushState = (data, unused, target) => { writes.push(String(target)); push(data, unused, target); };

    const texts = (): string => [...main.querySelectorAll("span")].map((span) => span.textContent).join("|");
    const press = (label: string, index = 0): void => { [...main.querySelectorAll("button")].filter((button) => button.textContent!.startsWith(label))[index]!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); };
    const url = (): string => win.location.pathname + win.location.search;

    const seen: Array<{ step: string; texts: string; url: string; sameRoot: boolean }> = [];
    const host = await Web.run(app, { container: main, primitives, present: "mount", history: { window: win, urlOf, stateOf, navigate: "app/navigate" } });

    await new Promise((resolve) => setTimeout(resolve, 40));

    let root = main.firstElementChild;
    const step = (name: string): void => { seen.push({ step: name, texts: texts(), url: url(), sameRoot: main.firstElementChild === root }); root = main.firstElementChild; };

    step("list");
    press("Open", 1);                                        // open m2: marks it read
    await until(() => texts().startsWith("Invoice"));
    step("open m2");
    press("Star");                                           // same view, new data
    await until(() => [...main.querySelectorAll("button")].some((button) => button.textContent === "Star on"));
    step("star");
    win.history.back();                                      // the browser's Back: the same navigation
    await until(() => texts().includes("1 unread"));
    step("Back");
    win.history.forward();
    await until(() => texts().startsWith("Invoice"));
    step("Forward");
    await host.stop();

    expect(seen.map(({ step, texts: t, url: u, sameRoot }) => [step, t, u, sameRoot])).toEqual([
      ["list", "2 unread|*Welcome|*Invoice", "/inbox", true],
      ["open m2", "Invoice|Due Friday.", "/inbox?open=m2", false],
      ["star", "Invoice|Due Friday.", "/inbox?open=m2", true],
      ["Back", "1 unread|*Welcome| Invoice", "/inbox", false],
      ["Forward", "Invoice|Due Friday.", "/inbox?open=m2", false],
    ]);
    expect(writes).toEqual(["/inbox?open=m2"]);                // one navigation by the application; Back and Forward wrote nothing
  });

  it("SSR → hydrate at /inbox?open=m1: the served message view is adopted; Close is a view change", async () => {
    const app = application(await compilePrograms());
    const served = await Effect.runPromise(renderToHtml(app, { primitives, state: stateFor("/inbox?open=m1") }));
    const dom = new JSDOM(`<!doctype html><main>${served.html}</main>`, { url: "http://localhost/inbox?open=m1" });
    const main = dom.window.document.querySelector("main")!;
    const nodes = [...main.querySelectorAll("*")];

    const host = await Web.run(app, { container: main, primitives, present: "hydrate", state: served.state });
    const adopted = nodes.every((node) => main.contains(node));

    [...main.querySelectorAll("button")].find((button) => button.textContent === "Close")!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await until(() => main.textContent!.includes("unread"));

    const result = { hydration: host.mounted.hydration, adopted, text: main.textContent, state: await Effect.runPromise(host.handle.state) };

    await host.stop();

    expect(result.hydration).toEqual({ adopted: true });
    expect(result.adopted).toBe(true);
    expect(result.state.open).toBe("");
    expect(result.text).toContain("2 unread");                // the server's state only said which message was open; nothing marked it read
  });
});
