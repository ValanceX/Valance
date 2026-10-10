// Search: the index the build writes from the site, and the pure function that answers a query from it.
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { search, wordsOf } from "../app/search.js";
import type { SearchIndex } from "../model/search.js";
import type { Site } from "../model/site.js";
import { readSite } from "../tooling/content.js";
import { buildSearchIndex } from "../tooling/search.js";

let site: Site;
let index: SearchIndex;

beforeAll(() => {
  site = readSite(fileURLToPath(new URL("../content", import.meta.url)));
  index = buildSearchIndex(site);
});

describe("the index", () => {
  it("has an entry for the start of each page and for each section under a heading, linking to the section", () => {
    const state = index.entries.filter((entry) => entry.id.startsWith("guides-state#"));

    expect(state.map((entry) => [entry.href, entry.heading])).toEqual([
      ["/docs/guides/state", ""],
      ["/docs/guides/state#rules", "Rules"],
      ["/docs/guides/state#commands", "Commands"],
      ["/docs/guides/state#a-command-that-waits", "A command that waits"],
      ["/docs/guides/state#ending", "Ending"],
    ]);
    expect(state.every((entry) => entry.title === "State")).toBe(true);
  });

  it("holds the words of every kind of block, code included, and none of the marks", () => {
    const text = (id: string) => index.entries.find((entry) => entry.id === id)!.text;

    expect(text("guides-state#commands")).toContain("Pure command(state)(schema, handler)");                       // a table
    expect(text("guides-state#a-command-that-waits")).toContain("encodeURIComponent");                           // code
    expect(text("guides-state#rules")).toContain("A view only reads it.");                                       // a nested list
    expect(text("guides-state#rules")).not.toContain("**");
    expect(index.entries.every((entry) => entry.text !== "")).toBe(true);
  });

  it("every section of every page with something in it is there, and every link leads to a heading that exists", () => {
    for (const entry of index.entries) {
      const [path, anchor] = entry.href.split("#") as [string, string | undefined];
      const page = site.pages.find((candidate) => candidate.path === path)!;

      expect(page, entry.href).toBeDefined();
      expect(anchor === undefined || page.blocks.some((block) => block.kind === "heading" && block.anchor === anchor), entry.href).toBe(true);
    }
  });
});

describe("a query", () => {
  const first = (query: string) => search(index, query)[0];

  it("is words: case and punctuation do not matter", () => {
    expect(wordsOf("  Waiting-Command, 2x! ")).toEqual(["waiting", "command", "2x"]);
    expect(search(index, "   ")).toEqual([]);
    expect(search(index, "")).toEqual([]);
  });

  it("finds a section by its heading, ahead of a page that only mentions the word", () => {
    expect(first("waits")).toMatchObject({ href: "/docs/guides/state#a-command-that-waits" });
    expect(first("Ending")).toMatchObject({ href: "/docs/guides/state#ending" });
  });

  it("finds a page by its title", () => {
    expect(first("plugins")).toMatchObject({ href: "/docs/guides/plugins" });
    expect(first("errors")).toMatchObject({ title: "Errors" });
  });

  it("finds a name in code", () => {
    expect(first("renderToHtml")).toBeDefined();
    expect(search(index, "renderToHtml").some((hit) => hit.href.startsWith("/docs/guides/plugins"))).toBe(true);
  });

  it("a word is the start of a word: a prefix finds, the middle of one does not", () => {
    expect(search(index, "compo").length).toBeGreaterThan(0);
    expect(search(index, "mposit")).toEqual([]);
  });

  it("every word must match: more words narrow the answer", () => {
    expect(search(index, "refusal shutdown").length).toBeLessThanOrEqual(search(index, "refusal").length);
    expect(search(index, "refusal zzzzzz")).toEqual([]);
  });

  it("answers at most eight, each with an excerpt around the match", () => {
    const hits = search(index, "a");

    expect(hits.length).toBeLessThanOrEqual(8);

    const hit = search(index, "supersedes")[0]!;

    expect(hit.excerpt.toLowerCase()).toContain("supersedes");
    expect(hit.excerpt.length).toBeLessThan(200);
  });

  it("treats what looks like a pattern as text", () => {
    expect(() => search(index, "(*[")).not.toThrow();
    expect(search(index, "(*[")).toEqual([]);
  });

  it("is deterministic: the same query gives the same answer in the same order", () => {
    expect(search(index, "command")).toEqual(search(index, "command"));
  });
});
