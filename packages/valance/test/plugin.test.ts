// The plugin contract (`./web/plugin`): composition and its conflicts, the platform merge, the head as HTML and as DOM, delivery, and the three entry points that take plugins
// (`manifest`, `renderToHtml`, and, in examples/tracer-web, `Web.run`). Pure unless a test says otherwise.
import * as Nexus from "@valancex/nexus";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { isValanceError } from "../src/errors.js";
import type { Plugin, RouteTable } from "../src/web-plugin.js";
import { applyHead, compose, deliveryOf, HEAD_MARK, mergeHeads, mergePlatforms, renderHead, staticPaths } from "../src/web-plugin.js";
import { manifest } from "../src/web-manifest.js";
import { renderToHtml } from "../src/web-server.js";
import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

type S = { readonly page: string };

const plugin = (name: string, rest: Omit<Plugin<S>, "name"> = {}): Plugin<S> => ({ name, ...rest });
const conflict = (action: () => unknown): string => {
  try { action(); } catch (error) { expect(isValanceError(error) && error.code === "plugin-conflict").toBe(true); return String((error as Error).message); }

  throw new Error("expected a plugin-conflict");
};

describe("compose: a fact declared twice is an error, never an override", () => {
  it("collects tags from the application and every plugin, in one table", () => {
    const composed = compose<S>({ primitives: { page: { element: "div" } } }, [plugin("a", { primitives: { note: { element: "aside" } } }), plugin("b", { primitives: { tab: { element: "button" } } })]);

    expect(Object.keys(composed.primitives)).toEqual(["page", "note", "tab"]);
  });

  it("names both owners when a tag is declared twice, whoever they are", () => {
    expect(conflict(() => compose<S>({ primitives: { note: { element: "p" } } }, [plugin("kit", { primitives: { note: { element: "aside" } } })]))).toBe('the tag "note" is declared by the application and by the plugin "kit"; a tag is declared once (remove one, or rename it)');
    expect(conflict(() => compose<S>({}, [plugin("a", { primitives: { x: { element: "p" } } }), plugin("b", { primitives: { x: { element: "p" } } })]))).toContain('declared by the plugin "a" and by the plugin "b"');
  });

  it("refuses two plugins with one name, since the name is how a conflict is reported", () => {
    expect(conflict(() => compose<S>({}, [plugin("a"), plugin("a")]))).toContain('two plugins are named "a"');
  });

  const routes: RouteTable<S> = { urlOf: ({ page }) => `/${page}`, stateOf: (url) => ({ page: url.pathname.slice(1) }), navigate: "go", known: () => true, paths: () => ["/a", "/b"] };

  it("has one URL policy: the application's history, or one plugin's routes", () => {
    expect(compose<S>({}, [plugin("router", { routes })]).routes).toBe(routes);
    expect(conflict(() => compose<S>({ routes: true }, [plugin("router", { routes })]))).toContain("declared by the application and by the plugin \"router\"");
    expect(conflict(() => compose<S>({}, [plugin("r1", { routes }), plugin("r2", { routes })]))).toContain('declared by the plugin "r1" and by the plugin "r2"');
  });

  it("with nothing to compose, nothing is made up", () => {
    expect(compose<S>({}, [])).toEqual({ primitives: {}, platform: undefined, routes: undefined, head: undefined });
  });
});

describe("the platform merge", () => {
  const A = Nexus.Capability.define<{ readonly who: string }>("test/a");
  const B = Nexus.Capability.define<{ readonly who: string }>("test/b");
  const environment = (entries: Record<string, string>): Nexus.Application.Platform => Nexus.Capability.EnvironmentLive(new Map(Object.entries(entries).map(([id, who]) => [id, { _tag: "Available", implementation: { who } }] as const)));
  const who = (platform: Nexus.Application.Platform, capability: typeof A) => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const context = yield* Layer.build(platform);

    return yield* Nexus.Capability.require(capability).pipe(Effect.provide(context), Effect.map((value) => value.who), Effect.catchAll((error) => Effect.succeed(`unavailable: ${error.id}`)));
  })));

  it("keeps the capabilities of every platform (two Environments are not two Layers to stack)", async () => {
    const merged = mergePlatforms([environment({ "test/a": "plugin" }), environment({ "test/b": "app" })]);

    expect(await who(merged, A)).toBe("plugin");
    expect(await who(merged, B)).toBe("app");
  });

  it("gives a capability provided twice to the later platform: plugins as listed, the application's own last", async () => {
    const composed = compose<S>({ platform: environment({ "test/a": "app" }) }, [plugin("one", { platform: environment({ "test/a": "one" }) }), plugin("two", { platform: environment({ "test/a": "two" }) })]);

    expect(await who(composed.platform!, A)).toBe("app");
    expect(await who(compose<S>({}, [plugin("one", { platform: environment({ "test/a": "one" }) }), plugin("two", { platform: environment({ "test/a": "two" }) })]).platform!, A)).toBe("two");
  });

  it("releases what each platform acquired when the merged platform ends, the last acquired first", async () => {
    const log: Array<string> = [];
    const acquiring = (name: string): Nexus.Application.Platform => Layer.scoped(Nexus.Capability.Environment, Effect.acquireRelease(Effect.sync(() => { log.push(`open ${name}`); return { resolutions: new Map() }; }), () => Effect.sync(() => { log.push(`close ${name}`); })));

    await Effect.runPromise(Effect.scoped(Layer.build(mergePlatforms([acquiring("one"), acquiring("two")]))));
    expect(log).toEqual(["open one", "open two", "close two", "close one"]);
  });
});

describe("the head", () => {
  it("merges in order with the application's first: the first title, then metas and links without repeating an identity", () => {
    const merged = mergeHeads([
      { title: "App", meta: [{ name: "description", content: "mine" }], links: [{ rel: "stylesheet", href: "/a.css" }] },
      { title: "Plugin", meta: [{ name: "description", content: "theirs" }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "/a.css" }, { rel: "canonical", href: "/x" }] },
    ]);

    expect(merged).toEqual({ title: "App", meta: [{ name: "description", content: "mine" }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "/a.css" }, { rel: "canonical", href: "/x" }] });
  });

  it("composes the application's head function with the plugins' for the state asked", () => {
    const head = compose<S>({ head: ({ page }) => ({ title: page }) }, [plugin("seo", { head: ({ page }) => ({ title: "ignored", links: [{ rel: "canonical", href: `/docs/${page}` }] }) })]).head!;

    expect(head({ page: "intro" })).toEqual({ title: "intro", meta: [], links: [{ rel: "canonical", href: "/docs/intro" }] });
  });

  it("renders as HTML with the text and every attribute escaped, and each meta and link marked as VALANCE's", () => {
    const html = renderHead({ title: "A <b> & B", meta: [{ name: "description", content: 'say "hi" & <go>' }, { property: "og:title", content: "t" }], links: [{ rel: "stylesheet", href: "/a.css?x=1&y=2", as: "style", type: "text/css" }] });

    expect(html).toBe(
      `<title>A &lt;b&gt; &amp; B</title>`
      + `<meta name="description" content="say &quot;hi&quot; &amp; &lt;go&gt;" ${HEAD_MARK}>`
      + `<meta property="og:title" content="t" ${HEAD_MARK}>`
      + `<link rel="stylesheet" href="/a.css?x=1&amp;y=2" as="style" type="text/css" ${HEAD_MARK}>`
    );
    expect(renderHead({})).toBe("");
  });

  it("a link may say what language it points to and what it is called: an alternate in another language, a feed", () => {
    expect(renderHead({ links: [{ rel: "alternate", hreflang: "fr", href: "/fr/a" }, { rel: "alternate", type: "application/atom+xml", title: "Notes", href: "/feed.xml" }] })).toBe(
      `<link rel="alternate" href="/fr/a" hreflang="fr" ${HEAD_MARK}><link rel="alternate" href="/feed.xml" type="application/atom+xml" title="Notes" ${HEAD_MARK}>`
    );
  });

  it("the same address in two languages is two alternates, not one", () => {
    expect(mergeHeads([{ links: [{ rel: "alternate", hreflang: "en", href: "/" }, { rel: "alternate", hreflang: "fr", href: "/" }] }]).links).toHaveLength(2);
  });

  it.each(["javascript:alert(1)", "  JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "vbscript:x", "data:text/html,<script>1</script>"])("refuses a link whose href carries script: %s", (href) => {
    try { renderHead({ links: [{ rel: "stylesheet", href }] }); } catch (error) { expect(isValanceError(error) && error.code === "invalid-head").toBe(true); return; }

    throw new Error("expected invalid-head");
  });

  it("allows the URLs a head needs: relative, absolute, protocol-relative, https", () => {
    expect(() => renderHead({ links: [{ rel: "a", href: "/x" }, { rel: "b", href: "x.css" }, { rel: "c", href: "//cdn.example/x.css" }, { rel: "d", href: "https://example.com/" }] })).not.toThrow();
  });

  /** The few members of a document that `applyHead` uses. */
  const fakeDocument = () => {
    type Element = { readonly tag: string; readonly attributes: Map<string, string>; setAttribute: (name: string, value: string) => void; remove: () => void };
    const children: Array<Element> = [];
    const element = (tag: string): Element => ({ tag, attributes: new Map(), setAttribute(name, value) { this.attributes.set(name, value); }, remove() { children.splice(children.indexOf(this), 1); } });
    const document = {
      title: "",
      createElement: element,
      head: {
        append: (child: Element) => { children.push(child); },
        querySelectorAll: (selector: string) => children.filter((child) => child.attributes.has(selector.slice(1, -1))),
      },
    };

    return { document: document as unknown as Document, children, foreign: () => { const own = element("link"); own.setAttribute("rel", "stylesheet"); children.push(own); return own; } };
  };

  it("sets the title and replaces the metas and links it wrote before, never one it did not write", () => {
    const page = fakeDocument();
    const foreign = page.foreign();

    applyHead(page.document, { title: "one", meta: [{ name: "description", content: "1" }], links: [{ rel: "canonical", href: "/one" }] });
    applyHead(page.document, { title: "two", meta: [{ name: "description", content: "2" }] });

    expect(page.document.title).toBe("two");
    expect(page.children.map((child) => [child.tag, child.attributes.get("content") ?? child.attributes.get("rel")])).toEqual([["link", "stylesheet"], ["meta", "2"]]);
    expect(page.children).toContain(foreign);
    expect(page.children.every((child) => child === foreign || child.attributes.has(HEAD_MARK))).toBe(true);
  });

  it("leaves the document as it was when the head is refused, and leaves the title alone when there is none", () => {
    const page = fakeDocument();

    page.document.title = "kept";
    applyHead(page.document, { meta: [{ name: "a", content: "b" }] });
    expect(page.document.title).toBe("kept");
    expect(() => applyHead(page.document, { title: "never", links: [{ rel: "x", href: "javascript:1" }] })).toThrow();
    expect(page.document.title).toBe("kept");
    expect(page.children).toHaveLength(1);
  });
});

describe("delivery: static unless a route says otherwise", () => {
  const table = (delivery?: RouteTable<S>["delivery"]): RouteTable<S> => ({ urlOf: () => "/", stateOf: () => ({}), navigate: "go", known: () => true, paths: () => ["/docs/a", "/account", "/docs/b"], ...(delivery === undefined ? {} : { delivery }) });

  it("defaults to static, and a static export renders the static paths in the order the table lists them", () => {
    expect(deliveryOf(table(), "/account")).toBe("static");
    expect(staticPaths(table())).toEqual(["/docs/a", "/account", "/docs/b"]);
  });

  it("leaves a server route out of the static paths", () => {
    const routes = table((pathname) => pathname === "/account" ? "server" : "static");

    expect(deliveryOf(routes, "/account")).toBe("server");
    expect(staticPaths(routes)).toEqual(["/docs/a", "/docs/b"]);
  });
});

describe("manifest and renderToHtml take plugins", () => {
  const Scope = Schema.Struct({});

  it("the manifest declares the tags plugins add, exactly as it declares the application's own", () => {
    const derived = manifest({ primitives: { text: { element: "span" } }, scopes: { main: Scope }, commands: () => ({}), plugins: [plugin("kit", { primitives: { note: { element: "aside" } } })] });

    expect(Object.keys(derived.components)).toEqual(expect.arrayContaining(["text", "note", "main"]));
  });

  it("a tag declared by the application and a plugin fails the manifest before anything is derived", () => {
    expect(conflict(() => manifest({ primitives: { text: { element: "span" } }, scopes: { main: Scope }, commands: () => ({}), plugins: [plugin("kit", { primitives: { text: { element: "p" } } })] }))).toContain('the tag "text"');
  });

  const app = Valance.define({ name: "plugins", state: { schema: Schema.Struct({ page: Schema.String }), initial: { page: "intro" } }, views: { only: { program: eventFreeProgram, scope: () => ({}) } }, view: () => "only" as const, commands: () => ({}) });

  it("renders with the tags a plugin adds and returns the head for the state it rendered", async () => {
    const served = await Effect.runPromise(renderToHtml(app, { plugins: [plugin("kit", { primitives: { main: { element: "div" }, text: { element: "span" } }, head: ({ page }) => ({ title: `${page} · Docs`, links: [{ rel: "canonical", href: `/docs/${page}` }] }) })] }));

    expect(served.html).toBe("<span>main</span>");
    expect(served.head).toEqual({ title: "intro · Docs", links: [{ rel: "canonical", href: "/docs/intro" }] });
    expect(renderHead(served.head)).toContain("<title>intro · Docs</title>");
  });

  it("returns an empty head when there is none, and the application's own head function is used", async () => {
    const primitives = { main: { element: "div" }, text: { element: "span" } } as const;

    expect((await Effect.runPromise(renderToHtml(app, { primitives }))).head).toEqual({});
    expect((await Effect.runPromise(renderToHtml(app, { primitives, head: () => ({ title: "own" }) }))).head).toEqual({ title: "own" });
  });

  it("a conflict is a defect of the call, with nothing started", async () => {
    const exit = await Effect.runPromiseExit(renderToHtml(app, { primitives: { main: { element: "div" } }, plugins: [plugin("kit", { primitives: { main: { element: "section" } } })] }));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(Exit.isFailure(exit) && Option.isSome(Cause.dieOption(exit.cause)) && isValanceError(Cause.dieOption(exit.cause).pipe(Option.getOrThrow))).toBe(true);
  });
});
