import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { readContent } from "../src/content.js";
import { AppError } from "../src/diagnostics.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const read = (files: Record<string, string>) => { const root = project(files); return readContent(root, loadConfig(root)); };

const problems = (files: Record<string, string>): ReadonlyArray<string> => {
  try { read(files); } catch (error) { if (error instanceof AppError) { return error.diagnostics.map(({ file, line, code }) => `${file}:${line} ${code}`); } throw error; }

  return [];
};

describe("content/ is the pages", () => {
  it("makes the path of a file its address, and orders navigation by section, then order, then path", () => {
    const { pages } = read({
      "content/index.md": PAGE("Home"),
      "content/about.md": PAGE("About"),
      "content/guide/index.md": PAGE("Guide"),
      "content/guide/b.md": "---\ntitle: B\norder: 2\n---\n\nText\n",
      "content/guide/a.md": "---\ntitle: A\norder: 1\n---\n\nText\n",
    });

    expect(pages.map(({ path, section }) => `${path}|${section}`)).toEqual(["/|", "/about|", "/guide/a|guide", "/guide/b|guide", "/guide|guide"]);
  });

  it("takes the title from the front matter, else the first heading, else it is an error", () => {
    expect(read({ "content/index.md": "# From heading\n" }).pages[0]!.title).toBe("From heading");
    expect(problems({ "content/index.md": "Just text\n" })).toEqual(["content/index.md:1 page-title"]);
  });

  it("refuses an unknown front matter key, naming its line", () => {
    expect(problems({ "content/index.md": "---\ntitle: X\ndate: 2026\n---\n\n# X\n" })).toEqual(["content/index.md:3 front-unknown"]);
  });

  it("needs a first page, and refuses files that are not pages or not addresses", () => {
    expect(problems({ "content/a.md": PAGE("A") })).toEqual(["content:0 content-home"]);
    expect(problems({ "content/index.md": PAGE(), "content/notes.txt": "x" })).toEqual(["content/notes.txt:0 content-file"]);
    expect(problems({ "content/index.md": PAGE(), "content/has space.md": PAGE() })).toEqual(["content/has space.md:0 content-name"]);
    expect(problems({ "content/index.md": PAGE(), "content/a.md": PAGE("A"), "content/a/index.md": PAGE("A2") })).toEqual(["content/a.md:0 content-duplicate"]);
  });

  it("keeps content/404.md out of the pages and offers it as the not-found page", () => {
    const content = read({ "content/index.md": PAGE(), "content/404.md": PAGE("Gone") });

    expect(content.pages.map((page) => page.path)).toEqual(["/"]);
    expect(content.notFound?.title).toBe("Gone");
  });

  it("reports every mistake in every file together", () => {
    expect(problems({ "content/index.md": "---\ntitle: X\n---\n\n<b>x</b>\n", "content/a.md": "---\ncolor: red\n---\n\n# A\n" })).toEqual(["content/a.md:2 front-unknown", "content/index.md:5 md-html"]);
  });
});

describe("links and images are checked against what exists", () => {
  const files = (body: string, more: Record<string, string> = {}): Record<string, string> => ({
    "content/index.md": PAGE("Home", body),
    "content/guide/a.md": PAGE("A", "## Part\n\nText\n"),
    "public/logo.svg": "<svg/>",
    ...more,
  });

  it("accepts pages by address, by file, with a fragment, within the page, external and mailto; writes them under the base", () => {
    const root = project({ ...files("[a](/guide/a) [b](./guide/a.md#part) [c](#home) [d](https://x.dev) [e](mailto:a@b.c) [f](/logo.svg)\n\n![logo](/logo.svg)"), "valance.web.json": '{ "base": "/docs/" }' });
    const { pages } = readContent(root, loadConfig(root));
    const hrefs = pages[0]!.blocks.flatMap((block) => block.spans.filter((span) => span.kind === "link").map((span) => span.href));

    expect(hrefs).toEqual(["/docs/guide/a", "/docs/guide/a#part", "/docs/#home", "https://x.dev", "mailto:a@b.c", "/docs/logo.svg"]);
    expect(pages[0]!.blocks.find((block) => block.kind === "image")!.src).toBe("/docs/logo.svg");
  });

  it("resolves a relative address from the file it is written in", () => {
    const { pages } = read(files("x", { "content/guide/b.md": PAGE("B", "[up](../index.md) [side](./a.md)") }));

    expect(pages.find((page) => page.path === "/guide/b")!.blocks.flatMap((block) => block.spans.filter((span) => span.kind === "link").map((span) => span.href))).toEqual(["/", "/guide/a"]);
  });

  it("names the file and line of a broken link, a missing heading, a missing image and a forbidden scheme", () => {
    expect(problems(files("[x](/guide/missing)"))).toEqual(["content/index.md:7 link-broken"]);
    expect(problems(files("[x](/guide/a#nope)"))).toEqual(["content/index.md:7 link-fragment"]);
    expect(problems(files("![x](/nope.png)"))).toEqual(["content/index.md:7 image-missing"]);
    expect(problems(files("![x](logo.svg)"))).toEqual(["content/index.md:7 image-path"]);
    expect(problems(files("[x](javascript:alert(1))"))).toEqual(["content/index.md:7 link-scheme"]);
  });
});
