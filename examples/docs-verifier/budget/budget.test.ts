// A site of 500 pages, generated, read, exported: what a document costs a reader, what a build costs its author, and that neither grows with the pages that are not the one asked for.
//
// A document carries its own page and the site's map (the navigation needs every page's title), and nothing else: the compiled views are in the page script, once, and another page's
// content is another file. So a document grows with the map (a title per page) and not with the content, and the numbers below are what that comes to.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";

import { mapOf } from "../model/site.js";
import type { Site } from "../model/site.js";
import { readSite } from "../tooling/content.js";
import { buildSearchIndex } from "../tooling/search.js";
import { exportSite } from "../web/export.js";

const PAGES = 500;
const SECTIONS = 10;

/** A page with the weight of a real one: headings, prose, a list, a table, a callout, a code block. `n` is in its words so another page's content can be told from it. */
const page = (n: number): string => `---
title: Page ${n}
description: The page numbered ${n} of the generated site.
---

# Page ${n}

The page numbered ${n} says something about **topic${n}** that no other page says, in a paragraph long enough to be like prose and to give a search something to match.

## First section of ${n}

- an item about marker${n}
- another item
  - a nested item

| Name | Meaning |
|:--|:--|
| \`a${n}\` | the first |
| \`b${n}\` | the second |

> [!NOTE] A note on ${n}
> This is the note that page ${n} carries.

## Second section of ${n}

\`\`\`bash
pnpm add package-${n}
pnpm run build --filter page-${n}
\`\`\`

A closing paragraph with a [link](/docs/s0/p0) to the first page.
`;

const generate = (count: number): string => {
  const root = mkdtempSync(join(tmpdir(), `budget-${count}-`));
  const names = Array.from({ length: count }, (_, n) => `s${n % SECTIONS}/p${n}`);

  mkdirSync(join(root, "content", "docs"), { recursive: true });
  mkdirSync(join(root, "snippets"));

  for (const [n, name] of names.entries()) {
    mkdirSync(join(root, "content", "docs", name.split("/")[0]!), { recursive: true });
    writeFileSync(join(root, "content", "docs", `${name}.md`), page(n));
  }

  // The link every page makes needs a page called p0 in s0, which `names` has.
  writeFileSync(join(root, "site.json"), JSON.stringify({
    name: "Generated",
    collections: [{ name: "docs", dir: "docs", path: "/docs", layout: "doc", sections: Array.from({ length: SECTIONS }, (_, s) => ({ title: `Section ${s}`, pages: names.filter((name) => name.startsWith(`s${s}/`)) })) }],
  }));

  return root;
};

const bytes = (path: string): number => statSync(path).size;
const built = { base: "/", script: "/assets/page.js", style: "/assets/page.css", search: "/assets/search.json" };

interface Measured {
  readonly site: Site;
  readonly out: string;
  readonly readMs: number;
  readonly exportMs: number;
  readonly documents: number;
}

const measure = async (count: number): Promise<Measured> => {
  const content = generate(count);
  const out = mkdtempSync(join(tmpdir(), `budget-out-${count}-`));
  const readStart = performance.now();
  const site = readSite(content);
  const readMs = performance.now() - readStart;
  const exportStart = performance.now();
  const { pages } = await exportSite(site, out, built);

  return { site, out, readMs, exportMs: performance.now() - exportStart, documents: pages.length };
};

let small: Measured;
let large: Measured;

beforeAll(async () => {
  small = await measure(50);
  large = await measure(PAGES);
});

describe(`a site of ${PAGES} pages`, () => {
  it("is all there: a document and a content file for every page, and a not-found page", () => {
    const names = readdirSync(large.out, { recursive: true, encoding: "utf8" });

    expect(large.documents).toBe(PAGES);
    expect(names.filter((name) => name.endsWith("/index.json"))).toHaveLength(PAGES);
    expect(names.filter((name) => name.endsWith("/index.html")).length).toBe(PAGES + 1);       // the pages, and /docs
    expect(names).toContain("index.html");                                                    // and the site's root
    expect(names).toContain("404.html");
  });

  it("a document is its own page and the map, and no other page's words", () => {
    const html = readFileSync(join(large.out, "docs/s3/p253/index.html"), "utf8");

    expect(html).toContain("topic253");
    expect(html).not.toContain("topic254");
    expect(html).not.toContain("marker7");
  });

  it("costs a reader a document of a size that depends on the map and not on the content: under 200 KB, and the content file is a small fraction", () => {
    const document = bytes(join(large.out, "docs/s3/p253/index.html"));
    const content = bytes(join(large.out, "docs/s3/p253/index.json"));
    const gzipped = gzipSync(readFileSync(join(large.out, "docs/s3/p253/index.html"))).length;

    console.log(`document ${document} B (gzip ${gzipped} B), content file ${content} B, at ${PAGES} pages`);
    expect(document).toBeLessThan(200_000);
    expect(gzipped).toBeLessThan(25_000);
    expect(content).toBeLessThan(25_000);
  });

  it("grows with the map and not with the content: ten times the pages is about the map's growth, a title per page, not ten times the document", () => {
    const smallDocument = bytes(join(small.out, "docs/s3/p13/index.html"));
    const largeDocument = bytes(join(large.out, "docs/s3/p253/index.html"));
    const perPage = (largeDocument - smallDocument) / (PAGES - 50);

    console.log(`a document grows by ${perPage.toFixed(0)} B for each page added to the site`);
    expect(perPage).toBeLessThan(450);                                  // the map's entry for a page (id, path, title, description, section) and its link in the navigation
    expect(largeDocument).toBeLessThan(smallDocument * 8);
  });

  it("the content file is the same size whatever the site's size", () => {
    expect(Math.abs(bytes(join(large.out, "docs/s3/p253/index.json")) - bytes(join(small.out, "docs/s3/p13/index.json")))).toBeLessThan(150);                       // a longer id and path, and nothing else
  });

  it("reads in a few seconds and exports in under two minutes", () => {
    console.log(`read ${large.readMs.toFixed(0)} ms, export ${large.exportMs.toFixed(0)} ms (${(large.exportMs / PAGES).toFixed(1)} ms a page)`);
    expect(large.readMs).toBeLessThan(10_000);
    expect(large.exportMs).toBeLessThan(120_000);
  });

  it("the export costs about the same for each page however many there are", () => {
    const perSmall = small.exportMs / 50;
    const perLarge = large.exportMs / PAGES;

    console.log(`${perSmall.toFixed(1)} ms a page at 50, ${perLarge.toFixed(1)} ms a page at ${PAGES}`);
    expect(perLarge).toBeLessThan(perSmall * 4);
  });

  it("the search index is one file whose size is the text, and every section is in it", () => {
    const index = buildSearchIndex(large.site);
    const size = JSON.stringify(index).length;

    console.log(`search index ${size} B for ${index.entries.length} sections (gzip ${gzipSync(JSON.stringify(index)).length} B)`);
    expect(index.entries.length).toBeGreaterThanOrEqual(PAGES * 3);
    expect(size).toBeLessThan(900_000);
  });

  it("the map is what a document adds for the site, and it is the only part that grows", () => {
    const map = JSON.stringify(mapOf(large.site));

    console.log(`map ${map.length} B for ${PAGES} pages`);
    expect(map.length / PAGES).toBeLessThan(300);
  });
});
