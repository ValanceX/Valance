// The application's URL policy, with and without a base: a function from state to a URL and from a URL to the fact `go` takes.
import { describe, expect, it } from "vitest";

import { hrefOf, NOT_FOUND, routes } from "../../src/app/routes.js";
import { initial } from "../../src/app/state.js";
import type { SiteMap } from "../../src/model/site.js";

const page = (id: string, path: string, title: string) => ({ id, path, title, description: title, section: "", layout: "doc" as const, collection: "docs", slug: `docs/${id}`, locale: "en", version: "", date: "", tags: [] });
const pages = [page("docs-introduction", "/docs/introduction", "Introduction"), page("docs-guides-state", "/docs/guides/state", "State")];
const at = (base: string, url = ""): SiteMap => ({ name: "Valance", base, url, header: {}, footer: "", defaultLocale: "en", locales: [{ code: "en", name: "English" }], versions: [], ui: {}, roots: [{ path: "/", page: "docs-introduction" }, { path: "/docs", page: "docs-introduction" }], feeds: [], pages });

describe("at the root", () => {
  const table = routes(at("/"));

  it("a state's URL is its page's path, and a URL's fact is its page's id", () => {
    expect(table.urlOf({ ...initial, page: "docs-guides-state" })).toBe("/docs/guides/state");
    expect(table.stateOf(new URL("http://x/docs/guides/state"))).toEqual({ id: "docs-guides-state" });
  });

  it("a trailing slash is the same page, and the site's root, /docs and /docs/ are the first", () => {
    expect(table.stateOf(new URL("http://x/docs/guides/state/"))).toEqual({ id: "docs-guides-state" });

    for (const pathname of ["/", "/docs", "/docs/"]) { expect(table.stateOf(new URL(`http://x${pathname}`))).toEqual({ id: "docs-introduction" }); }
  });

  it("an address that is not a page is not found, and is not known", () => {
    expect(table.stateOf(new URL("http://x/docs/nowhere"))).toEqual({ id: NOT_FOUND });
    expect(table.known("/docs/nowhere")).toBe(false);
    expect(table.known("/docs/guides/state")).toBe(true);
  });
});

describe("under a base", () => {
  const map = at("/docs-site/", "https://example.com");
  const table = routes(map);

  it("every address is under the base: the URL of a state, the paths a build lists, the canonical address", () => {
    expect(table.urlOf({ ...initial, page: "docs-guides-state" })).toBe("/docs-site/docs/guides/state");
    expect(table.paths()).toEqual(["/docs-site/docs/introduction", "/docs-site/docs/guides/state"]);
    expect(table.canonicalOf({ ...initial, page: "docs-guides-state" })).toBe("https://example.com/docs-site/docs/guides/state");
    expect(hrefOf(map, "/docs/x")).toBe("/docs-site/docs/x");
  });

  it("a URL under the base names its page; the base itself (with or without its slash) is the first page", () => {
    expect(table.stateOf(new URL("http://x/docs-site/docs/guides/state"))).toEqual({ id: "docs-guides-state" });
    expect(table.stateOf(new URL("http://x/docs-site/"))).toEqual({ id: "docs-introduction" });
    expect(table.stateOf(new URL("http://x/docs-site"))).toEqual({ id: "docs-introduction" });
    expect(table.stateFor("/docs-site/docs/guides/state").page).toBe("docs-guides-state");
  });

  it("an address outside the base is not this site's, even when its path is a page's", () => {
    expect(table.stateOf(new URL("http://x/docs/guides/state"))).toEqual({ id: NOT_FOUND });
    expect(table.known("/docs/guides/state")).toBe(false);
    expect(table.known("/docs-site/docs/guides/state")).toBe(true);
  });

  it("a site not yet published has a canonical address without an origin", () => {
    expect(routes(at("/docs-site/")).canonicalOf({ ...initial, page: "docs-guides-state" })).toBe("/docs-site/docs/guides/state");
    expect(table.canonicalOf({ ...initial, page: NOT_FOUND })).toBeUndefined();
  });
});
