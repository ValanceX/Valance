// Plugins through `Web.run` and `renderToHtml`, in jsdom: an application that declares only its state, views and commands, and gets its tags, its URL policy and its head from plugins.
// The same plugins drive the server and the browser, so the document the server writes and the page the browser keeps say the same thing.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { HEAD_MARK, renderHead, type Plugin } from "@valancex/valance/web/plugin";
import { renderToHtml } from "@valancex/valance/web/server";
import { compileProgram } from "@valancex/mesh-compiler";
import { Effect } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { until } from "./helpers.js";
import { application, manifest, primitives, source, stateOf, urlOf, type State } from "./links-fixture.js";

const compiled = await compileProgram({ model: { manifest, path: "components.json" }, root: "shell", components: [{ component: "shell", path: "shell.mprx", source }] });

if (compiled.program === undefined) { throw new Error(JSON.stringify(compiled.assembly ?? compiled.components, null, 1)); }

const app = application(compiled.program);

/** The three plugins an application like a documentation site composes: its tags, its URL policy, its head. Each is a value; none is registered anywhere. */
const kit: Plugin<State> = { name: "kit", primitives };
const navigations: Array<string> = [];
const router: Plugin<State> = {
  name: "router",
  routes: {
    urlOf,
    stateOf,
    navigate: "go",
    known: (pathname) => pathname === "/app/home" || pathname === "/app/about",
    paths: () => ["/app/home", "/app/about"],
    onNavigated: ({ kind, url }) => { navigations.push(`${kind} ${url.pathname}${url.hash}`); },
  },
};
const seo: Plugin<State> = { name: "seo", head: ({ page }) => ({ title: `${page} · Docs`, meta: [{ name: "description", content: `the ${page} page` }], links: [{ rel: "canonical", href: `/app/${page}` }] }) };

const page = (url: string, html = "", head = "") => {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body><main>${html}</main></body></html>`, { url });

  return { dom, win: dom.window as unknown as Window, container: dom.window.document.querySelector("main")!, doc: dom.window.document };
};

describe("an application whose tags, URL policy and head all come from plugins", () => {
  it("runs: the plugins' tags are drawn, a link click is the plugin's navigation, the URL, the head and the hook follow", async () => {
    navigations.length = 0;
    const p = page("http://localhost/app/home");
    const host = await Web.run(app, { container: p.container, present: "mount", plugins: [kit, router, seo] });

    expect(p.container.querySelector("span")?.textContent).toBe("page home");
    await until(() => p.doc.title === "home · Docs");                                      // the first state's head is applied by the follower, as the first title always was
    expect(p.doc.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("the home page");

    const link = [...p.container.querySelectorAll("a")].find((anchor) => anchor.textContent === "About")!;

    link.dispatchEvent(new p.dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await until(() => p.doc.title === "about · Docs");
    expect(p.win.location.pathname).toBe("/app/about");
    expect(p.doc.head.querySelectorAll(`[${HEAD_MARK}]`)).toHaveLength(2);                // replaced, not accumulated
    expect(p.doc.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("/app/about");
    expect(navigations).toEqual(["link /app/about"]);

    p.win.history.back();
    await until(() => p.doc.title === "home · Docs");
    expect(navigations).toEqual(["link /app/about", "popstate /app/home"]);
    await host.stop();
  });

  it("is the same page the server writes: the HTML renderToHtml draws, its head as the document's, and the browser hydrates it and keeps the head", async () => {
    const served = await Effect.runPromise(renderToHtml(app, { plugins: [kit, seo], state: { page: "about" } }));
    const p = page("http://localhost/app/about", served.html, renderHead(served.head));
    const before = p.container.innerHTML;
    const host = await Web.run(app, { container: p.container, present: "hydrate", state: served.state, plugins: [kit, router, seo] });

    expect(host.mounted.hydration?.adopted).toBe(true);
    expect(p.container.innerHTML).toBe(before);                                          // adopted, not redrawn
    expect(p.doc.title).toBe("about · Docs");
    expect(p.doc.head.querySelectorAll(`[${HEAD_MARK}]`)).toHaveLength(2);                // the server's elements are the ones the browser then replaces
    await host.stop();
  });

  it("a plugin and the application's own history both declaring the URL policy fail the run before anything is started or drawn", async () => {
    const p = page("http://localhost/app/home");

    await expect(Web.run(app, { container: p.container, present: "mount", plugins: [kit, router], history: { window: p.win, urlOf, stateOf, navigate: "go" } }))
      .rejects.toSatisfy((error: unknown) => Valance.isValanceError(error) && error.code === "plugin-conflict");
    expect(p.container.innerHTML).toBe("");
  });

  it("a tag the application and a plugin both declare fails the run the same way", async () => {
    const p = page("http://localhost/app/home");

    await expect(Web.run(app, { container: p.container, present: "mount", primitives: { page: { element: "section" } }, plugins: [kit] }))
      .rejects.toSatisfy((error: unknown) => Valance.isValanceError(error) && error.code === "plugin-conflict");
  });

  it("without plugins a run is exactly what it was: nothing is composed, nothing is added", async () => {
    const p = page("http://localhost/app/home");
    const host = await Web.run(app, { container: p.container, present: "mount", primitives, history: { window: p.win, urlOf, stateOf, navigate: "go" } });

    expect(p.doc.title).toBe("");
    expect(p.doc.head.querySelectorAll(`[${HEAD_MARK}]`)).toHaveLength(0);
    await host.stop();
  });
});
