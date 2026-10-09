// Build time: the markdown subset becomes a flat list of blocks, and the content directory becomes the site.
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { readSite } from "../tooling/content.js";
import { parseMarkdown } from "../tooling/markdown.js";

it("headings, paragraphs, lists, code and callouts become flat blocks with stable ids", () => {
  const blocks = parseMarkdown("# One\n\nSome\ntext.\n\n- a\n- b\n\n> [!TIP]\n> Careful.\n\n```ts\nconst x = 1;\n```\n", "p");

  expect(blocks.map(({ kind, text, level, lang, tone }) => [kind, text, level, lang, tone])).toEqual([
    ["heading", "One", 1, "", ""],
    ["paragraph", "Some text.", 0, "", ""],
    ["item", "a", 0, "", ""],
    ["item", "b", 0, "", ""],
    ["callout", "Careful.", 0, "", "tip"],
    ["code", "const x = 1;", 0, "ts", ""],
  ]);
  expect(blocks.map(({ id }) => id)).toEqual(["p:0", "p:1", "p:2", "p:3", "p:4", "p:5"]);
});

it("the content directory is the site: nav.json orders the pages, front matter titles them", () => {
  const site = readSite(fileURLToPath(new URL("../content", import.meta.url)));

  expect(site.pages.map(({ id }) => id)).toEqual(["introduction", "guides-getting-started", "guides-state", "reference-api"]);
  expect(site.pages.map(({ path }) => path)).toEqual(["/docs/introduction", "/docs/guides/getting-started", "/docs/guides/state", "/docs/reference/api"]);
  expect(site.pages[1]!.section).toBe("Guides");
  expect(site.pages[1]!.blocks.some(({ kind }) => kind === "code")).toBe(true);
});

it("a page without a title is refused, not guessed", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "verifier-"));

  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "nav.json"), JSON.stringify({ site: "x", sections: [{ title: "", pages: ["a"] }] }));
  writeFileSync(join(dir, "docs", "a.md"), "# No front matter\n");
  expect(() => readSite(dir)).toThrow(/title/);
});
