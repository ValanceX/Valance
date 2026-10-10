import { describe, expect, it } from "vitest";

import { AppError } from "../src/diagnostics.js";
import { parseMarkdown, slug } from "../src/markdown.js";

const fail = (text: string): ReadonlyArray<string> => {
  try { parseMarkdown(text, "content/x.md", 0); } catch (error) { if (error instanceof AppError) { return error.diagnostics.map(({ line, code }) => `${line} ${code}`); } throw error; }

  return [];
};

describe("the Markdown a page is written in", () => {
  it("makes typed blocks with anchors and an outline", () => {
    const { blocks, outline } = parseMarkdown("# Title\n\nText with **bold**, *em*, `code` and [a link](/x).\n\n## Second part\n\n- one\n- two\n\n1. a\n2. b\n\n```ts\nconst x = 1;\n```\n\n> quoted\n\n![alt](/a.svg)\n", "content/x.md", 0);

    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "heading", "list", "list", "code", "quote", "image"]);
    expect(blocks[1]!.spans.map((span) => span.kind)).toEqual(["text", "strong", "text", "emphasis", "text", "code", "text", "link", "text"]);
    expect(blocks[3]).toMatchObject({ ordered: false, items: [{ spans: [{ text: "one" }] }, { spans: [{ text: "two" }] }] });
    expect(blocks[4]).toMatchObject({ ordered: true });
    expect(blocks[5]).toMatchObject({ lang: "ts", text: "const x = 1;" });
    expect(outline).toEqual([{ id: "b2", label: "Second part", anchor: "second-part", level: 2 }]);
  });

  it("makes the anchors of repeated headings different", () => {
    expect(parseMarkdown("## Same\n\n## Same\n", "x", 0).blocks.map((block) => block.anchor)).toEqual(["same", "same-2"]);
    expect(slug("Héllo, Wörld!")).toBe("hello-world");
  });

  it("draws nothing it cannot draw: each unsupported construct is an error with its line", () => {
    expect(fail("ok\n\n<div>raw</div>\n")).toEqual(["3 md-html"]);
    expect(fail("| a | b |\n")).toEqual(["1 md-table"]);
    expect(fail("- a\n  - nested\n")).toEqual(["2 md-nested-list"]);
    expect(fail("#### too deep\n")).toEqual(["1 md-heading-level"]);
    expect(fail("```\nnever closed\n")).toEqual(["1 md-unclosed-fence"]);
    expect(fail("text ![inline](/a.svg) image\n")).toEqual(["1 md-inline-image"]);
    expect(fail("---\n")).toEqual(["1 md-rule"]);
  });

  it("counts lines from the file, not from the text after the front matter", () => {
    expect(() => parseMarkdown("<b>\n", "content/x.md", 4)).toThrow("content/x.md:5 md-html");
  });
});
