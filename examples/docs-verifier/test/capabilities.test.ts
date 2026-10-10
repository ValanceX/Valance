// The application's abilities that come from the platform: the clipboard, a store and the search index. A fake platform stands in for the browser (./support.ts), so this is the
// application's behavior when the platform gives, refuses, or does not have each of them.
import * as Nexus from "@valancex/nexus";
import type { BoundaryValue } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { application } from "../app/application.js";
import type { AppState } from "../app/state.js";
import { pageScope } from "../app/scope.js";
import type { SearchIndex } from "../model/search.js";
import type { Site, SiteMap } from "../model/site.js";
import { mapOf } from "../model/site.js";
import { contentOf } from "../app/content.js";
import { initial } from "../app/state.js";
import { siteDir } from "./sites.js";
import { readSite } from "../tooling/content.js";
import { buildSearchIndex } from "../tooling/search.js";
import { compilePage } from "../web/compile.js";
import { fakePlatform, type Fakes } from "./support.js";

let site: Site;
let map: SiteMap;
let index: SearchIndex;

beforeAll(() => {
  site = readSite(siteDir("docs"));
  map = mapOf(site);
  index = buildSearchIndex(site);
});

/** The state on page `id`, as a server starts it. */
const onPage = (id: string): AppState => ({ ...initial, page: id, content: contentOf(site, id) });

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const run = async (fakes: Fakes = { clipboard: async () => undefined, storage: {} }) => {
  const program = await compilePage();
  const scope = Effect.runSync(Scope.make());
  const made = fakePlatform({ pages: async (path) => site.pages.find((page) => page.path === path)!, ...fakes });
  const handle = await Effect.runPromise(Valance.start(application(program, map), { platform: made.platform, state: onPage("docs-guides-getting-started") }).pipe(Scope.extend(scope))) as unknown as Valance.ApplicationHandle<AppState, never>;

  return {
    written: made.written,
    state: () => Effect.runSync(handle.state as never) as AppState,
    invoke: (key: string, value?: BoundaryValue) => Effect.runPromise(handle.invoke(key, value === undefined ? [] : [{ value }]) as never),
    exit: (key: string, value?: BoundaryValue) => Effect.runPromise(Effect.exit(handle.invoke(key, value === undefined ? [] : [{ value }]) as never)),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

const firstCode = (): { readonly id: string; readonly text: string } => {
  const page = site.pages.find((candidate) => candidate.id === "docs-guides-getting-started")!;
  const group = page.blocks.find((block) => block.kind === "codegroup")!;

  if (group.kind !== "codegroup") { throw new Error("expected a code group"); }

  return { id: group.tabs[1]!.id, text: group.tabs[1]!.text };
};

describe("the clipboard", () => {
  it("copying puts the text of the block that was asked for on the clipboard, then says so", async () => {
    const t = await run();
    const { id, text } = firstCode();

    await t.invoke("app/copyCode", id);
    expect(t.written).toEqual([text]);
    expect(t.state()).toMatchObject({ copied: id, copyFailed: "" });
    await t.close();
  });

  it("when the browser refuses, the page says Failed, not Copied", async () => {
    const t = await run({ clipboard: () => Promise.reject(new Error("denied")), storage: {} });
    const { id } = firstCode();

    await t.invoke("app/copyCode", id);
    expect(t.state()).toMatchObject({ copied: "", copyFailed: id });
    expect(pageScope(map, { ...t.state(), page: "docs-guides-getting-started" }).blocks.flatMap((block) => block.tabs).find((tab) => tab.id === id)?.copyLabel).toBe("Failed");
    await t.close();
  });

  it("with no clipboard on the platform it is Failed too, and nothing else breaks", async () => {
    const t = await run({ clipboard: undefined, storage: {} });
    const { id } = firstCode();

    expect(Exit.isSuccess(await t.exit("app/copyCode", id))).toBe(true);
    expect(t.state()).toMatchObject({ copied: "", copyFailed: id });
    await t.close();
  });

  it("a block that is not in the site is Failed, never a copy of something else", async () => {
    const t = await run();

    await t.invoke("app/copyCode", "nowhere:0");
    expect(t.written).toEqual([]);
    expect(t.state().copyFailed).toBe("nowhere:0");
    await t.close();
  });

  it("copying again after a failure, or elsewhere, replaces the mark", async () => {
    let refuse = true;
    const t = await run({ clipboard: () => refuse ? Promise.reject(new Error("denied")) : Promise.resolve(), storage: {} });
    const { id } = firstCode();

    await t.invoke("app/copyCode", id);
    expect(t.state().copyFailed).toBe(id);
    refuse = false;
    await t.invoke("app/copyCode", id);
    expect(t.state()).toMatchObject({ copied: id, copyFailed: "" });
    await t.close();
  });
});

describe("what the reader chose", () => {
  it("the theme and a code group's tab are remembered as they are chosen", async () => {
    const storage: Record<string, string> = {};
    const t = await run({ clipboard: undefined, storage });

    await t.invoke("app/setTheme", "dark");
    await t.invoke("app/selectTab", "pkg|pnpm");
    expect(storage).toEqual({ "kit.theme": "dark", "kit.tabs": '{"pkg":"pnpm"}' });
    expect(t.state()).toMatchObject({ theme: "dark", tabs: { pkg: "pnpm" } });
    await t.close();
  });

  it("and taken back, once asked, on the next visit", async () => {
    const t = await run({ clipboard: undefined, storage: { "kit.theme": "light", "kit.tabs": '{"pkg":"yarn"}' } });

    expect(t.state()).toMatchObject({ theme: "system", tabs: {} });           // nothing is applied by itself: a choice drawn before the page took over would not match the server's HTML
    await t.invoke("app/restore");
    expect(t.state()).toMatchObject({ theme: "light", tabs: { pkg: "yarn" } });
    await t.close();
  });

  it("what is stored but is not a choice is ignored, not trusted", async () => {
    const t = await run({ clipboard: undefined, storage: { "kit.theme": "sepia", "kit.tabs": "{not json" } });

    await t.invoke("app/restore");
    expect(t.state()).toMatchObject({ theme: "system", tabs: {} });
    await t.close();
  });

  it("with no store on the platform the choice still holds for the page, and restoring changes nothing", async () => {
    const t = await run({ clipboard: undefined, storage: undefined });

    await t.invoke("app/setTheme", "dark");
    expect(t.state().theme).toBe("dark");
    await t.invoke("app/restore");
    expect(t.state().theme).toBe("dark");
    await t.close();
  });

  it("a choice that is not a tab (no group) changes nothing and stores nothing", async () => {
    const storage: Record<string, string> = {};
    const t = await run({ clipboard: undefined, storage });

    await t.invoke("app/selectTab", "nogroup");
    expect(t.state().tabs).toEqual({});
    expect(storage).toEqual({});
    await t.close();
  });
});

describe("search", () => {
  it("loads the index when first asked, says it is working, then answers", async () => {
    let load: (value: SearchIndex) => void = () => undefined;
    const t = await run({ clipboard: undefined, storage: {}, index: () => new Promise((resolve) => { load = resolve; }) });

    void t.invoke("app/search", "waits");
    await settle();
    expect(t.state().search).toMatchObject({ query: "waits", status: "loading", hits: [] });
    expect(pageScope(map, t.state()).status).toBe("Searching…");
    load(index); await settle();
    expect(t.state().search).toMatchObject({ query: "waits", status: "ready" });
    expect(t.state().search.hits[0]).toMatchObject({ href: "/docs/guides/state#a-command-that-waits" });
    expect(pageScope(map, t.state()).status).toMatch(/^\d+ results?$/);
    await t.close();
  });

  it("an answer with nothing in it is said, with the query", async () => {
    const t = await run({ clipboard: undefined, storage: {}, index: async () => index });

    await t.invoke("app/search", "zzzzzz");
    expect(t.state().search).toMatchObject({ status: "ready", hits: [] });
    expect(pageScope(map, t.state()).status).toBe("No results for “zzzzzz”.");
    await t.close();
  });

  it("an index that cannot be had is a failure the page shows, and a later query tries again", async () => {
    let fail = true;
    const t = await run({ clipboard: undefined, storage: {}, index: () => fail ? Promise.reject(new Error("offline")) : Promise.resolve(index) });

    await t.invoke("app/search", "state");
    expect(t.state().search).toMatchObject({ status: "failed", hits: [] });
    expect(pageScope(map, t.state()).status).toBe("Search is not available right now.");
    fail = false;
    await t.invoke("app/search", "state");
    expect(t.state().search.status).toBe("ready");
    await t.close();
  });

  it("a platform with no index is the same failure, not a defect", async () => {
    const t = await run({ clipboard: undefined, storage: {}, index: undefined });

    expect(Exit.isSuccess(await t.exit("app/search", "state"))).toBe(true);
    expect(t.state().search.status).toBe("failed");
    await t.close();
  });

  it("an empty query is nothing asked: idle, no index loaded", async () => {
    let loads = 0;
    const t = await run({ clipboard: undefined, storage: {}, index: async () => { loads += 1; return index; } });

    await t.invoke("app/search", "state");
    await t.invoke("app/search", "  ");
    expect(t.state().search).toEqual({ query: "  ", status: "idle", hits: [] });
    expect(loads).toBe(1);
    await t.close();
  });

  it("a newer query supersedes an older one: the older answer arriving last changes nothing", async () => {
    const gates = new Map<string, () => void>();
    const slow = (query: string): Promise<SearchIndex> => new Promise((resolve) => { gates.set(query, () => resolve(index)); });
    let calls = 0;
    const t = await run({ clipboard: undefined, storage: {}, index: () => { calls += 1; return calls === 1 ? slow("first") : slow("second"); } });

    void t.invoke("app/search", "commands");
    await settle();
    void t.invoke("app/search", "plugins");
    await settle();
    gates.get("second")!(); await settle();
    gates.get("first")!(); await settle();
    expect(t.state().search).toMatchObject({ query: "plugins", status: "ready" });
    expect(t.state().search.hits[0]!.href).toContain("/docs/guides/plugins");
    await t.close();
  });

  it("moving to a page clears the search, and an answer that arrives after is dropped", async () => {
    let load: (value: SearchIndex) => void = () => undefined;
    const t = await run({ clipboard: undefined, storage: {}, index: () => new Promise((resolve) => { load = resolve; }) });

    void t.invoke("app/search", "state");
    await settle();
    await t.invoke("app/go", "docs-guides-plugins");
    load(index); await settle();
    expect(t.state().search).toEqual({ query: "", status: "idle", hits: [] });
    await t.close();
  });
});

describe("the heading the reader is at", () => {
  it("is reported by the scroll adapter, marked in the outline, and cleared by moving on", async () => {
    const t = await run();

    await t.invoke("app/go", "docs-guides-state");
    await t.invoke("app/setActive", "commands");
    expect(pageScope(map, t.state()).toc.map((entry) => [entry.href, entry.current])).toEqual([["#rules", "false"], ["#commands", "location"], ["#a-command-that-waits", "false"], ["#ending", "false"]]);
    await t.invoke("app/go", "docs-guides-views");
    expect(t.state().active).toBe("");
    await t.close();
  });

  it("the same heading again is not a change: the very state object stays, so nothing is presented again", async () => {
    const t = await run();

    await t.invoke("app/setActive", "rules");

    const before = t.state();

    await t.invoke("app/setActive", "rules");
    expect(t.state()).toBe(before);
    await t.close();
  });
});

describe("the application asks for abilities, it does not reach for them", () => {
  it("names no browser, and every capability it asks for has a contract of its own", async () => {
    const { Clipboard, Index, Storage } = await import("../app/capabilities.js");

    expect([Clipboard.id, Storage.id, Index.id]).toEqual(["kit/clipboard", "kit/storage", "kit/search-index"]);
    expect(Nexus.Capability.define).toBeTypeOf("function");
  });
});
