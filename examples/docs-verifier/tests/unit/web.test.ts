// The browser half that has no application in it, in jsdom: the platform it hands the application, what it does after a navigation, and the scroll adapter. A real browser checks the
// same things in smoke/.
import * as Nexus from "@valancex/nexus";
import { Effect, Layer } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { Clipboard, Index, Pages, Storage } from "../../src/app/capabilities.js";
import type { SearchIndex } from "../../src/model/search.js";
import { followLanguage } from "../../src/web/language.js";
import { afterNavigation } from "../../src/web/navigation.js";
import { browserPlatform } from "../../src/web/platform.js";
import { activeAnchor, watchHeadings } from "../../src/web/scrollspy.js";

type Page = Window & typeof globalThis;

const page = (html = "<main tabindex='-1'><h1 id='top'>T</h1><h2 id='one'>One</h2><h2 id='two'>Two</h2><h3 id='three'>Three</h3></main>", url = "http://localhost/docs/x") => {
  const dom = new JSDOM(`<!doctype html><div id="app">${html}</div>`, { url, pretendToBeVisual: true });

  return { dom, win: dom.window as unknown as Page };
};

/** The capability `platform` provides for `capability`, as the application would find it. */
const resolve = async <S>(platform: Nexus.Application.Platform, capability: Nexus.Capability.Capability<S>) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const context = yield* Layer.build(platform);

    return yield* Nexus.Capability.resolve(capability).pipe(Effect.provide(context));
  })));
const platformOf = (win: Page, built: { search?: string } = {}) => browserPlatform(win, built).platform as Nexus.Application.Platform;

describe("the browser's platform", () => {
  it("has a clipboard when the browser has one, and writing goes to it", async () => {
    const { win } = page();
    const writeText = vi.fn(async () => undefined);

    Object.defineProperty(win.navigator, "clipboard", { value: { writeText }, configurable: true });

    const found = await resolve(platformOf(win), Clipboard);

    expect(found._tag).toBe("Available");

    if (found._tag === "Available") { await found.implementation.write("hello"); }

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("says why there is no clipboard, rather than pretending", async () => {
    const found = await resolve(platformOf(page().win), Clipboard);

    expect(found).toMatchObject({ _tag: "Unavailable", reason: expect.stringContaining("clipboard") });
  });

  it("keeps things in localStorage, and a store that throws is a store the page does not have", async () => {
    const { win } = page();
    const found = await resolve(platformOf(win), Storage);

    expect(found._tag).toBe("Available");

    if (found._tag === "Available") {
      found.implementation.set("k", "v");
      expect(found.implementation.get("k")).toBe("v");
      expect(found.implementation.get("missing")).toBeUndefined();
    }

    const blocked = page().win;

    Object.defineProperty(blocked, "localStorage", { get: () => { throw new Error("SecurityError"); } });
    expect((await resolve(platformOf(blocked), Storage))._tag).toBe("Unavailable");
  });

  it("a store that is full loses the write but does not throw to the application", async () => {
    const { win } = page();

    win.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };

    const found = await resolve(platformOf(win), Storage);

    expect(found._tag === "Available" && (() => { found.implementation.set("k", "v"); return true; })()).toBe(true);
  });

  const index: SearchIndex = { entries: [{ id: "a#", locale: "en", version: "", href: "/a", title: "A", section: "", heading: "", text: "alpha" }] };

  it("loads the index from where the build put it, once, and checks what arrives", async () => {
    const { win } = page();
    const fetched: Array<string> = [];

    win.fetch = (async (url: string) => { fetched.push(url); return { ok: true, status: 200, json: async () => index }; }) as unknown as typeof win.fetch;

    const found = await resolve(platformOf(win, { search: "/assets/search-abc.json" }), Index);

    expect(found._tag).toBe("Available");

    if (found._tag === "Available") {
      expect(await found.implementation.load()).toEqual(index);
      await found.implementation.load();
    }

    expect(fetched).toEqual(["/assets/search-abc.json"]);                                  // asked once
  });

  it("an index that is not the shape of one is refused, and the next ask tries again", async () => {
    const { win } = page();
    let body: unknown = { entries: [{ id: 1 }] };
    let asks = 0;

    win.fetch = (async () => { asks += 1; return { ok: true, status: 200, json: async () => body }; }) as unknown as typeof win.fetch;

    const found = await resolve(platformOf(win, { search: "/assets/search.json" }), Index);

    if (found._tag !== "Available") { throw new Error("expected the index"); }

    await expect(found.implementation.load()).rejects.toThrow();
    body = index;
    expect(await found.implementation.load()).toEqual(index);
    expect(asks).toBe(2);
  });

  it("fetches a page's content from beside its document: the file for a page at the root is index.json, not a protocol-relative address", async () => {
    const { win } = page();
    const asked: Array<string> = [];

    win.fetch = (async (url: string) => { asked.push(url); return { ok: true, status: 200, json: async () => ({ id: "home" }) }; }) as unknown as typeof win.fetch;

    const found = await resolve(platformOf(win, {}), Pages);

    if (found._tag === "Available") {
      await found.implementation.load("/").catch(() => undefined);                       // the content is not a page, so decoding refuses it; the address is what is checked
      await found.implementation.load("/docs/guides/state").catch(() => undefined);
    }

    expect(asked).toEqual(["/index.json", "/docs/guides/state/index.json"]);
  });

  it("a server that answers with an error is a failure, and a build with no index says so", async () => {
    const { win } = page();

    win.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof win.fetch;

    const found = await resolve(platformOf(win, { search: "/assets/gone.json" }), Index);

    if (found._tag === "Available") { await expect(found.implementation.load()).rejects.toThrow("answered 404"); }

    expect(await resolve(platformOf(win), Index)).toMatchObject({ _tag: "Unavailable", reason: "this build has no search index" });
  });
});

describe("after a navigation", () => {
  const frames = (win: Page): void => { win.requestAnimationFrame = (callback: FrameRequestCallback) => { setTimeout(() => { callback(0); }, 0); return 0; }; };
  const later = () => new Promise((resolve) => setTimeout(resolve, 20));

  it("a link to a place on another page keeps the fragment in the address and scrolls to the place once it is drawn", async () => {
    const { win } = page("<main tabindex='-1'><h1>New page</h1></main>");
    const scrolled: Array<string> = [];

    frames(win);
    win.history.pushState(null, "", "/docs/y");
    win.Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
    afterNavigation({ kind: "link", url: new URL("http://localhost/docs/y#ending") }, win);
    expect(win.location.pathname + win.location.hash).toBe("/docs/y#ending");

    await later();
    expect(scrolled).toEqual([]);                                                       // not drawn yet: it waits

    const heading = win.document.createElement("h2");

    heading.id = "ending";
    win.document.querySelector("main")!.append(heading);
    await later();
    expect(scrolled).toEqual(["ending"]);
  });

  it("a link to a page moves focus to its content", async () => {
    const { win } = page("<main tabindex='-1'><h1>New</h1></main>");

    frames(win);
    afterNavigation({ kind: "link", url: new URL("http://localhost/docs/y") }, win);
    await later();
    expect(win.document.activeElement?.tagName).toBe("MAIN");
  });

  it("Back and Forward are left to the browser", async () => {
    const { win } = page();

    frames(win);
    afterNavigation({ kind: "popstate", url: new URL("http://localhost/docs/y#x") }, win);
    await later();
    expect(win.document.activeElement?.tagName).not.toBe("MAIN");
    expect(win.location.hash).toBe("");
  });

  it("gives up on a place that never appears, rather than waiting for ever", async () => {
    const { win } = page("<main tabindex='-1'></main>");
    let asked = 0;

    win.requestAnimationFrame = (callback: FrameRequestCallback) => { asked += 1; setTimeout(() => { callback(0); }, 0); return 0; };
    afterNavigation({ kind: "link", url: new URL("http://localhost/docs/y#nothing") }, win);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(asked).toBeLessThanOrEqual(61);
  });
});

describe("the heading the reader is at", () => {
  /** jsdom lays nothing out: put each heading where the test says, and the window where it says. */
  const layout = (win: Page, tops: Record<string, number>, scroll = { y: 0, inner: 800, height: 3000 }): void => {
    for (const [id, top] of Object.entries(tops)) { win.document.getElementById(id)!.getBoundingClientRect = () => ({ top } as DOMRect); }

    Object.defineProperty(win, "scrollY", { value: scroll.y, configurable: true });
    Object.defineProperty(win, "innerHeight", { value: scroll.inner, configurable: true });
    Object.defineProperty(win.document.documentElement, "scrollHeight", { value: scroll.height, configurable: true });
  };

  it("is the last heading above the line, and none above the first", () => {
    const { win } = page();

    layout(win, { one: 300, two: 900, three: 1400 });
    expect(activeAnchor(win, 96)).toBe("");
    layout(win, { one: -200, two: 50, three: 600 });
    expect(activeAnchor(win, 96)).toBe("two");
    layout(win, { one: -900, two: -500, three: 20 });
    expect(activeAnchor(win, 96)).toBe("three");
  });

  it("at the very bottom it is the last heading, which may never reach the line", () => {
    const { win } = page();

    layout(win, { one: -2000, two: -1000, three: 400 }, { y: 2200, inner: 800, height: 3000 });
    expect(activeAnchor(win, 96)).toBe("three");
  });

  it("reports a change once, and not the same heading twice; stopping stops it", async () => {
    const { win } = page();
    const seen: Array<string> = [];
    const spy = watchHeadings(win, (anchor) => { seen.push(anchor); });

    layout(win, { one: 300, two: 900, three: 1400 });
    win.dispatchEvent(new win.Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    layout(win, { one: -100, two: 500, three: 900 });
    win.dispatchEvent(new win.Event("scroll"));
    win.dispatchEvent(new win.Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(seen).toEqual(["", "one"]);

    spy.stop();
    layout(win, { one: -900, two: -100, three: 900 });
    win.dispatchEvent(new win.Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(seen).toEqual(["", "one"]);
  });

  it("looks again when the page under it changes without a scroll", async () => {
    const { win } = page();
    const seen: Array<string> = [];

    layout(win, { one: 300, two: 900, three: 1400 });
    watchHeadings(win, (anchor) => { seen.push(anchor); });
    await new Promise((resolve) => setTimeout(resolve, 40));
    layout(win, { one: -100, two: 500, three: 900 });
    win.document.querySelector("#app")!.append(win.document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(seen).toEqual(["", "one"]);
  });
});

describe("the language of the document", () => {
  const shell = (win: Page, lang: string): Element => {
    const element = win.document.createElement("div");

    element.className = "shell";
    element.setAttribute("lang", lang);
    win.document.querySelector("#app")!.replaceChildren(element);

    return element;
  };

  it("is the language of the page drawn, at the start and when the page changes language in place or is replaced", async () => {
    const { win } = page("");
    const container = win.document.querySelector("#app")!;
    const first = shell(win, "fr");
    const stop = followLanguage(win, container);

    expect(win.document.documentElement.lang).toBe("fr");
    first.setAttribute("lang", "en");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(win.document.documentElement.lang).toBe("en");
    shell(win, "fr");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(win.document.documentElement.lang).toBe("fr");
    stop();
    shell(win, "en");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(win.document.documentElement.lang).toBe("fr");                               // stopped: it follows no more
  });

  it("leaves the document alone when the page says no language", () => {
    const { win } = page("");

    win.document.documentElement.lang = "de";
    followLanguage(win, win.document.querySelector("#app")!);
    expect(win.document.documentElement.lang).toBe("de");
  });
});
