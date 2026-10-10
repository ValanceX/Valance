// Web.history's two seams for plugins: `head` (the document's head follows the state like the URL) and `onNavigated` (what a router plugin hangs scroll and focus on).
// Same harness as history.test.ts: a real NEXUS application and state, a fake window that records writes, and a hand-built `running` whose `invoke` the test controls.
import type { Mesh } from "@valancex/nexus";
import type { Running } from "../src/internal.js";
import type { HeadTags, Navigation } from "../src/web-plugin.js";

import * as Nexus from "@valancex/nexus";
import { Effect, Layer, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { handleOf } from "../src/internal.js";
import { HEAD_MARK } from "../src/web-plugin.js";
import { history } from "../src/web.js";

const App = Schema.Struct({ path: Schema.String });
type App = typeof App.Type;

const urlOf = ({ path }: App): string => `/app${path}`;
const stateOf = (url: URL): { path: string } => ({ path: url.pathname.slice("/app".length) || "/" });
const NAVIGATE = "app/navigate";

type Marked = { readonly tag: string; readonly attributes: Map<string, string>; setAttribute: (name: string, value: string) => void; remove: () => void };

const fakeBrowser = (initial: string) => {
  let current = new URL(initial, "http://localhost");
  const writes: Array<string> = [];
  const scrolls: Array<string> = [];
  const listeners = new Set<() => void>();
  const children: Array<Marked> = [];
  const created = (tag: string): Marked => ({ tag, attributes: new Map(), setAttribute(name, value) { this.attributes.set(name, value); }, remove() { children.splice(children.indexOf(this), 1); } });
  const win = {
    scrollX: 0,
    scrollY: 40,
    scrollTo: () => { scrolls.push("top"); },
    document: {
      title: "",
      createElement: created,
      head: { append: (child: Marked) => { children.push(child); }, querySelectorAll: (selector: string) => children.filter((child) => child.attributes.has(selector.slice(1, -1))) },
    },
    location: { get pathname() { return current.pathname; }, get search() { return current.search; }, get href() { return current.href; } },
    history: {
      pushState: (_data: unknown, _unused: string, url: string) => { writes.push(`push ${url}`); current = new URL(url, current); },
      replaceState: (_data: unknown, _unused: string, url: string) => { writes.push(`replace ${url}`); current = new URL(url, current); },
    },
    addEventListener: (type: string, listener: () => void) => { if (type === "popstate") { listeners.add(listener); } },
    removeEventListener: (type: string, listener: () => void) => { if (type === "popstate") { listeners.delete(listener); } },
  };
  const clickHandlers = new Set<(event: unknown) => void>();
  const container = {
    contains: () => true,
    addEventListener: (type: string, listener: (event: unknown) => void) => { if (type === "click") { clickHandlers.add(listener); } },
    removeEventListener: (type: string, listener: (event: unknown) => void) => { if (type === "click") { clickHandlers.delete(listener); } },
  };

  return {
    window: win as unknown as Window,
    container: container as unknown as Element,
    writes,
    scrolls,
    children,
    title: () => win.document.title,
    pop: (url: string) => { current = new URL(url, current); for (const listener of [...listeners]) { listener(); } },
    /** A plain left click on an `<a href>` to `href`. */
    follow: (href: string) => {
      const anchor = { target: "", hasAttribute: () => false, href: new URL(href, current).href };
      const event = { defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: { closest: () => anchor }, preventDefault() { this.defaultPrevented = true; } };

      for (const handler of [...clickHandlers]) { handler(event); }
    },
  };
};

const scenario = <A>(options: { readonly head?: (state: App) => HeadTags; readonly titleOf?: (state: App) => string; readonly onNavigated?: (navigation: Navigation) => void }, body: (context: {
  readonly browser: ReturnType<typeof fakeBrowser>;
  readonly go: (path: string) => Effect.Effect<unknown>;
  readonly settle: Effect.Effect<void>;
}) => Effect.Effect<A>): Promise<A> => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const nexus = yield* Nexus.Application.start(Nexus.Application.define({ name: "history-seams", runtime: Layer.empty }));
  const state = yield* Nexus.Application.createState(nexus, App, { path: "/home" });
  const browser = fakeBrowser("/app/home");
  const go = (path: string) => state.update((current) => Effect.succeed({ ...current, path }));
  const running: Running<App, never> = {
    nexus,
    render: Effect.die("unused"),
    values: Stream.empty,
    dispatch: () => Effect.die("unused"),
    state: state.get,
    states: state.values,
    invoke: (key, args) => {
      const first = args[0];
      const value: unknown = first !== undefined && "value" in first ? first.value : undefined;
      const path: unknown = typeof value === "object" && value !== null ? Reflect.get(value, "path") : undefined;

      return key === NAVIGATE && typeof path === "string" ? go(path) : Effect.fail<Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component: "", name: key });
    },
  };

  yield* history(handleOf(running), { window: browser.window, container: browser.container, urlOf, stateOf, navigate: NAVIGATE, ...(options.head === undefined ? {} : { head: options.head }), ...(options.titleOf === undefined ? {} : { titleOf: options.titleOf }), ...(options.onNavigated === undefined ? {} : { onNavigated: options.onNavigated }) });
  const settle = Effect.sleep("30 millis");

  yield* settle;

  return yield* body({ browser, go, settle });
})));

describe("Web.history: the head follows the state", () => {
  const head = ({ path }: App): HeadTags => ({ title: `head ${path}`, meta: [{ name: "description", content: path }], links: [{ rel: "canonical", href: `/app${path}` }] });

  it("is applied for the first state and for every later one, Back and Forward included", async () => {
    const result = await scenario({ head }, ({ browser, go, settle }) => Effect.gen(function* () {
      const first = { title: browser.title(), marked: browser.children.map((child) => child.attributes.get("content") ?? child.attributes.get("href")) };

      yield* go("/about");
      yield* settle;
      const pushed = { title: browser.title(), marked: browser.children.map((child) => child.attributes.get("content") ?? child.attributes.get("href")) };

      browser.pop("/app/home");
      yield* settle;

      return { first, pushed, popped: browser.title(), elements: browser.children.length, marks: browser.children.every((child) => child.attributes.has(HEAD_MARK)) };
    }));

    expect(result.first).toEqual({ title: "head /home", marked: ["/home", "/app/home"] });
    expect(result.pushed).toEqual({ title: "head /about", marked: ["/about", "/app/about"] });
    expect(result.popped).toBe("head /home");
    expect(result.elements).toBe(2);                                                     // replaced, never accumulated
    expect(result.marks).toBe(true);
  });

  it("a title in the head wins over titleOf", async () => {
    const title = await scenario({ head: () => ({ title: "from head" }), titleOf: () => "from titleOf" }, ({ browser }) => Effect.sync(() => browser.title()));

    expect(title).toBe("from head");
  });

  it("a head with no title leaves titleOf's title", async () => {
    const title = await scenario({ head: () => ({ meta: [{ name: "a", content: "b" }] }), titleOf: () => "from titleOf" }, ({ browser }) => Effect.sync(() => browser.title()));

    expect(title).toBe("from titleOf");
  });

  it("a head that is refused is logged, the URL still follows the state, and the next state's head is applied", async () => {
    const result = await scenario({ head: ({ path }) => path === "/bad" ? { links: [{ rel: "stylesheet", href: "javascript:1" }] } : { title: path } }, ({ browser, go, settle }) => Effect.gen(function* () {
      yield* go("/bad");
      yield* settle;
      const written = [...browser.writes];

      yield* go("/good");
      yield* settle;

      return { written, writes: browser.writes, title: browser.title() };
    }));

    expect(result.written).toEqual(["push /app/bad"]);
    expect(result.writes).toEqual(["push /app/bad", "push /app/good"]);
    expect(result.title).toBe("/good");
  });
});

describe("Web.history: onNavigated", () => {
  it("is told of a link click once the URL is written, with the destination's #fragment, and the page has started at the top only when there is no fragment", async () => {
    const seen: Array<string> = [];
    const result = await scenario({ onNavigated: ({ kind, url }) => { seen.push(`${kind} ${url.pathname}${url.hash}`); } }, ({ browser, settle }) => Effect.gen(function* () {
      browser.follow("/app/about#install");
      yield* settle;
      const withFragment = { seen: [...seen], writes: [...browser.writes], scrolls: [...browser.scrolls] };

      browser.follow("/app/guide");
      yield* settle;

      return { withFragment, seen: [...seen], scrolls: browser.scrolls };
    }));

    expect(result.withFragment).toEqual({ seen: ["link /app/about#install"], writes: ["push /app/about"], scrolls: [] });
    expect(result.seen).toEqual(["link /app/about#install", "link /app/guide"]);
    expect(result.scrolls).toEqual(["top"]);
  });

  it("is told of Back and Forward after the navigate command ran, with the URL the browser holds", async () => {
    const seen: Array<string> = [];

    await scenario({ onNavigated: ({ kind, url }) => { seen.push(`${kind} ${url.pathname}`); } }, ({ browser, settle }) => Effect.gen(function* () {
      browser.pop("/app/about");
      yield* settle;
    }));

    expect(seen).toEqual(["popstate /app/about"]);
  });

  it("is not called for the first state, an unrelated state change, or a link to the page already shown", async () => {
    const seen: Array<string> = [];

    await scenario({ onNavigated: ({ url }) => { seen.push(url.pathname); } }, ({ browser, settle }) => Effect.gen(function* () {
      browser.follow("/app/home");
      yield* settle;
    }));

    expect(seen).toEqual([]);
  });

  it("a hook that throws is logged and ends nothing: the next navigation is still written and announced", async () => {
    let calls = 0;
    const result = await scenario({ onNavigated: () => { calls += 1; if (calls === 1) { throw new Error("hook"); } } }, ({ browser, settle }) => Effect.gen(function* () {
      browser.follow("/app/a");
      yield* settle;
      browser.follow("/app/b");
      yield* settle;

      return browser.writes;
    }));

    expect(result).toEqual(["push /app/a", "push /app/b"]);
    expect(calls).toBe(2);
  });
});
