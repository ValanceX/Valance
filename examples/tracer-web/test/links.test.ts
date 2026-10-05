// Links: `<a href>` inside the container is the application's navigation when the click is a plain, primary, same-origin one, and the browser's otherwise.
// A click is a navigation request exactly as a popstate is: the application's own navigate command runs with `stateOf(destination)`, and the URL follows the state.
// jsdom reports "navigation not implemented" whenever a click's DEFAULT action runs, so `browserNavigations` counts the clicks the browser was left to handle.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { compileProgram } from "@valancex/mesh-compiler";
import { Deferred, Effect, Exit, Scope } from "effect";
import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it } from "vitest";

import { until } from "./helpers.js";
import { application as fixtureApplication, manifest, primitives, source, stateOf, urlOf, type State } from "./links-fixture.js";

const compiled = await compileProgram({ model: { manifest, path: "components.json" }, root: "shell", components: [{ component: "shell", path: "shell.mprx", source }] });

if (compiled.program === undefined) { throw new Error(JSON.stringify(compiled.assembly ?? compiled.components, null, 1)); }

const program = compiled.program;
const application = (gate?: Deferred.Deferred<void>) => fixtureApplication(program, gate);

const page = (url: string, html = "") => {
  const browserNavigations: Array<string> = [];
  const virtualConsole = new VirtualConsole();

  virtualConsole.on("jsdomError", (error) => { if (String(error.message).includes("navigation")) { browserNavigations.push(String(error.message)); } });

  const dom = new JSDOM(`<!doctype html><html><body><main>${html}</main></body></html>`, { url, virtualConsole });
  const win = dom.window as unknown as Window;
  const container = dom.window.document.querySelector("main")!;
  const anchors = (): ReadonlyArray<HTMLAnchorElement> => [...container.querySelectorAll("a")];
  const anchor = (label: string) => anchors().find((candidate) => candidate.textContent === label)!;
  /** Dispatches a click on `target` and says whether the application took it (the default was prevented). Awaits a macrotask so a browser default runs inside. */
  const click = async (target: Element, init: MouseEventInit = {}): Promise<boolean> => {
    const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });

    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 5));

    return event.defaultPrevented;
  };
  /** An anchor of the page's own that PORT did not draw, inside the container. */
  const raw = (href: string, attributes: Readonly<Record<string, string>> = {}): HTMLAnchorElement => {
    const element = dom.window.document.createElement("a");

    element.setAttribute("href", href);
    for (const [name, value] of Object.entries(attributes)) { element.setAttribute(name, value); }
    element.textContent = href;
    container.append(element);

    return element;
  };

  return { dom, win, container, anchor, click, raw, browserNavigations, title: () => container.querySelector("span")?.textContent };
};

const run = async (p: ReturnType<typeof page>, gate?: Deferred.Deferred<void>, present: "mount" | "hydrate" = "mount", state?: State) =>
  Web.run(application(gate), { container: p.container, primitives, present, ...(state === undefined ? {} : { state }), history: { window: p.win, urlOf, stateOf, navigate: "go" } });

describe("a plain left click on a link is the application's navigation", () => {
  it("runs navigate with stateOf(destination), draws the new state, pushes the URL, and the browser keeps nothing", async () => {
    const p = page("http://localhost/app/home");
    const host = await run(p);

    expect(p.title()).toBe("page home");
    expect(await p.click(p.anchor("About"))).toBe(true);
    await until(() => p.title() === "page about");
    expect(p.win.location.pathname).toBe("/app/about");
    expect(p.browserNavigations).toEqual([]);

    p.win.history.back();                                                   // Back and Forward are the existing popstate path
    await until(() => p.title() === "page home");
    p.win.history.forward();
    await until(() => p.title() === "page about");
    await host.stop();
  });

  it("a click inside the link (on a child) is the link's", async () => {
    const p = page("http://localhost/app/home");
    const host = await run(p);
    const inner = p.dom.window.document.createElement("b");

    p.anchor("About").append(inner);
    expect(await p.click(inner)).toBe(true);
    await until(() => p.title() === "page about");
    await host.stop();
  });

  it("the URL is pushed while a waiting navigate command is still running: a wait does not hold the URL back", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>());
    const p = page("http://localhost/app/home");
    const host = await run(p, gate);

    await p.click(p.anchor("About"));
    await until(() => p.title() === "page about" && p.win.location.pathname === "/app/about");
    await Effect.runPromise(Deferred.succeed(gate, undefined));
    await host.stop();
  });
});

describe("the browser keeps every other click", () => {
  const cases: ReadonlyArray<readonly [string, MouseEventInit]> = [
    ["Ctrl", { ctrlKey: true }], ["Meta (Cmd)", { metaKey: true }], ["Shift", { shiftKey: true }], ["Alt", { altKey: true }],
    ["the middle button", { button: 1 }], ["the secondary button", { button: 2 }],
  ];

  for (const [name, init] of cases) {
    it(`${name}: not prevented, the application is not asked, the browser's own navigation runs`, async () => {
      const p = page("http://localhost/app/home");
      const host = await run(p);

      expect(await p.click(p.anchor("About"), init)).toBe(false);
      expect(p.title()).toBe("page home");
      expect(p.win.location.pathname).toBe("/app/home");
      expect(p.browserNavigations).toHaveLength(1);
      await host.stop();
    });
  }

  it("target other than _self, download, another origin, mailto:, and a #fragment in the current page", async () => {
    const p = page("http://localhost/app/home");
    const host = await run(p);
    const kept = [
      p.raw("/app/about", { target: "_blank" }),
      p.raw("/app/about", { download: "" }),
      p.raw("https://example.com/app/about"),
      p.raw("mailto:someone@example.com"),
      p.raw("#section"),
      p.raw("/app/home#section"),
    ];

    for (const anchor of kept) {
      expect(await p.click(anchor), anchor.outerHTML).toBe(false);
    }

    expect(p.title()).toBe("page home");
    expect(p.win.location.pathname).toBe("/app/home");
    await host.stop();
  });

  it("target=\"_self\", and a link to the current URL, are the application's (no push for an unchanged state)", async () => {
    const p = page("http://localhost/app/home");
    const host = await run(p);

    expect(await p.click(p.raw("/app/about", { target: "_self" }))).toBe(true);
    await until(() => p.title() === "page about");
    expect(await p.click(p.anchor("About"))).toBe(true);                     // the state does not change: nothing is pushed
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.win.history.length).toBe(2);
    await host.stop();
  });

  it("a click something else already handled (default prevented) is not taken again", async () => {
    const p = page("http://localhost/app/home");
    const host = await run(p);

    p.container.addEventListener("click", (event) => event.preventDefault(), true);   // an earlier listener, before the application's
    await p.click(p.anchor("About"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.title()).toBe("page home");
    await host.stop();
  });

  it("without a container, links are ordinary anchors (the pre-existing behavior); and after stop, the application no longer takes them", async () => {
    const p = page("http://localhost/app/home");
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(application()).pipe(Scope.extend(scope)));

    await Effect.runPromise(Valance.mount(handle, Web.target({ container: p.container, primitives })).pipe(Scope.extend(scope)));
    await Effect.runPromise(Web.history(handle, { window: p.win, urlOf, stateOf, navigate: "go" }).pipe(Scope.extend(scope)));   // no `container`
    expect(await p.click(p.anchor("About"))).toBe(false);
    expect(p.title()).toBe("page home");
    await Effect.runPromise(Scope.close(scope, Exit.void));

    const q = page("http://localhost/app/home");
    const host = await run(q);

    await host.stop();
    expect(await q.click(q.raw("/app/about"))).toBe(false);                  // history's listener is gone with its Scope
  });
});

describe("server rendering and hydration", () => {
  it("the server writes a real anchor with its href; the browser adopts it and a click is the application's", async () => {
    const served = await Effect.runPromise(renderToHtml(application(), { primitives, state: { page: "home" } }));

    expect(served.html).toBe('<div><span>page home</span><a href="/app/home">Home</a><a href="/app/about">About</a></div>');

    const p = page("http://localhost/app/home", served.html);
    const aboutBefore = p.anchor("About");
    const host = await run(p, undefined, "hydrate", served.state);

    expect(host.mounted.hydration).toEqual({ adopted: true });
    expect(p.anchor("About")).toBe(aboutBefore);
    expect(await p.click(p.anchor("About"))).toBe(true);
    await until(() => p.title() === "page about");
    await host.stop();
  });
});
