// Build time: the markdown subset becomes typed blocks, the content directory becomes the site, and a mistake in the content fails the build with the file and the line.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ContentError, readSite } from "../tooling/content.js";
import { highlight, languages } from "../tooling/highlight.js";
import { parseInline, parseMarkdown, plainText } from "../tooling/markdown.js";

const source = { file: "content/docs/x.md", offset: 0, include: (path: string): string => { if (path === "snippets/ok.ts") { return "const x = 1;\n"; } throw new Error(`file=${path}: there is no such example`); } };
const parse = (text: string) => parseMarkdown(text, "p", source);
const failure = (text: string, offset = 0): ContentError => {
  try { parseMarkdown(text, "p", { ...source, offset }); } catch (error) { expect(error).toBeInstanceOf(ContentError); return error as ContentError; }

  throw new Error("expected a ContentError");
};

describe("blocks", () => {
  it("headings carry an anchor, unique on the page, and levels 2 and 3 make the outline", () => {
    const { blocks, outline } = parse("# One\n\n## Setup\n\n### Setup\n\n## Setup\n");

    expect(blocks.map((block) => block.kind === "heading" ? [block.level, block.anchor] : null)).toEqual([[1, "one"], [2, "setup"], [3, "setup-2"], [2, "setup-3"]]);
    expect(outline).toEqual([
      { id: "p:1", level: 2, anchor: "setup", label: "Setup" },
      { id: "p:2", level: 3, anchor: "setup-2", label: "Setup" },
      { id: "p:3", level: 2, anchor: "setup-3", label: "Setup" },
    ]);
  });

  it("paragraphs join their lines; ids are the page's and the block's position", () => {
    const { blocks } = parse("Some\ntext\nhere.\n\nNext.\n");

    expect(blocks.map((block) => [block.id, block.kind === "paragraph" ? plainText(block.spans) : ""])).toEqual([["p:0", "Some text here."], ["p:1", "Next."]]);
  });

  it("callouts take a tone, a title (the tone's name by default) and their quoted lines", () => {
    const { blocks } = parse("> [!TIP]\n> Careful.\n\n> [!WARNING] Not a cache\n> One\n> two\n");

    expect(blocks.map((block) => block.kind === "callout" ? [block.tone, block.title, plainText(block.spans)] : null)).toEqual([["tip", "TIP", "Careful."], ["warning", "Not a cache", "One two"]]);
  });

  it("an image is its own block and needs alt text", () => {
    expect(parse("![A diagram](/images/a.svg)\n").blocks).toEqual([{ id: "p:0", kind: "image", src: "/images/a.svg", alt: "A diagram" }]);
    expect(failure("![](/images/a.svg)\n").message).toBe("content/docs/x.md:1: an image needs alt text: ![what it shows](src)");
  });
});

describe("inline marks", () => {
  it("strong, emphasis (both spellings), code and links; a word's inner underscore is not emphasis", () => {
    const spans = parseInline("a **b** *c* _d_ `e` [f](/g) snake_case_name", "x");

    expect(spans.map((span) => [span.kind, span.text])).toEqual([["text", "a "], ["strong", "b"], ["text", " "], ["emphasis", "c"], ["text", " "], ["emphasis", "d"], ["text", " "], ["code", "e"], ["text", " "], ["link", "f"], ["text", " snake_case_name"]]);
    expect(spans.find((span) => span.kind === "link")).toMatchObject({ href: "/g" });
    expect(spans.map((span) => span.id)).toEqual(spans.map((_, index) => `x.${index}`));
  });
});

describe("lists", () => {
  it("bulleted and numbered lists, with one level of nesting and continuation lines", () => {
    const { blocks } = parse("- a\n- b\n  - b1\n  - b2 continues\n    here\n- c\n\n1. one\n2. two\n");
    const [bullets, numbers] = blocks;

    expect(bullets).toMatchObject({ kind: "list", ordered: false });
    expect(bullets!.kind === "list" && bullets!.items.map((item) => [plainText(item.spans), item.children.map((child) => plainText(child.spans))])).toEqual([["a", []], ["b", ["b1", "b2 continues here"]], ["c", []]]);
    expect(numbers).toMatchObject({ kind: "list", ordered: true });
  });

  it("a third level, a mixed list and a list that does not start at the margin are refused, at their line", () => {
    expect(failure("- a\n  - b\n    - c\n", 4).message).toBe("content/docs/x.md:7: a list nests one level; this item is deeper (or shallower) than its siblings");
    expect(failure("- a\n1. b\n").message).toContain("bulleted or numbered, not both");
    expect(failure("  - a\n").message).toContain("starts at the left margin");
  });
});

describe("tables", () => {
  it("a header, alignments and rows of cells that hold marks", () => {
    const { blocks } = parse("| Name | Count | Note |\n|:--|:-:|--:|\n| `a` | 1 | **x** |\n| b | 2 | y \\| z |\n");
    const table = blocks[0]!;

    expect(table.kind).toBe("table");

    if (table.kind !== "table") { return; }

    expect(table.head.map((cell) => [plainText(cell.spans), cell.align])).toEqual([["Name", "left"], ["Count", "center"], ["Note", "right"]]);
    expect(table.rows.map((row) => row.cells.map((cell) => plainText(cell.spans)))).toEqual([["a", "1", "x"], ["b", "2", "y | z"]]);
    expect(table.rows[0]!.cells[0]!.spans[0]).toMatchObject({ kind: "code" });
  });

  it("a row with the wrong number of cells is refused", () => {
    expect(failure("| a | b |\n|--|--|\n| 1 |\n").message).toBe("content/docs/x.md:3: a table row has 1 cells; the header has 2");
  });
});

describe("code", () => {
  it("is highlighted into tokens whose text is the source; a title names the file", () => {
    const { blocks } = parse('```json title="package.json"\n{ "a": 1 }\n```\n');
    const code = blocks[0]!;

    expect(code).toMatchObject({ kind: "code", lang: "json", title: "package.json", text: '{ "a": 1 }' });
    expect(code.kind === "code" && code.tokens.map((token) => token.text).join("")).toBe('{ "a": 1 }');
    expect(code.kind === "code" && code.tokens.map((token) => token.kind)).toEqual(["punctuation", "plain", "name", "punctuation", "plain", "number", "plain", "punctuation"]);
  });

  it("an example in TypeScript or JavaScript is included from snippets/, never typed inline", () => {
    expect(parse("```ts file=snippets/ok.ts\n```\n").blocks[0]).toMatchObject({ kind: "code", lang: "ts", title: "ok.ts", text: "const x = 1;" });
    expect(failure("# T\n\n```ts\nconst x = 1;\n```\n", 3).message).toContain("content/docs/x.md:6: an inline ts example is not checked by anything; put it in snippets/");
    expect(failure("```ts file=snippets/missing.ts\n```\n").message).toBe("content/docs/x.md:1: file=snippets/missing.ts: there is no such example");
    expect(failure("```ts file=snippets/ok.ts\nextra\n```\n").message).toContain("has no text of its own");
  });

  it("other languages may be inline", () => {
    expect(parse("```bash\nnpm install\n```\n").blocks[0]).toMatchObject({ kind: "code", lang: "bash" });
    expect(parse("```\nplain\n```\n").blocks[0]).toMatchObject({ kind: "code", lang: "" });
  });

  it("consecutive fences with tab= and the same group are one code group", () => {
    const { blocks } = parse('```bash tab="npm" group="pkg"\nnpm i\n```\n\n```bash tab="pnpm" group="pkg"\npnpm add\n```\n\n```bash\nlater\n```\n');

    expect(blocks.map((block) => block.kind)).toEqual(["codegroup", "code"]);
    expect(blocks[0]).toMatchObject({ group: "pkg", tabs: [{ id: "p:0.t0", label: "npm", text: "npm i" }, { id: "p:0.t1", label: "pnpm", text: "pnpm add" }] });
  });

  it("a group is as long as its consecutive tabs: another group starts another block", () => {
    const { blocks } = parse('```bash tab="a" group="one"\n1\n```\n\n```bash tab="b" group="two"\n2\n```\n');

    expect(blocks.map((block) => block.kind === "codegroup" ? block.group : "")).toEqual(["one", "two"]);
  });

  it("an unclosed fence, a tab without a label and a repeated tab are refused", () => {
    expect(failure("text\n\n```bash\nnever closed\n").message).toBe("content/docs/x.md:3: a code fence is opened and never closed");
    expect(failure('```bash tab\nx\n```\n').message).toContain("a tab needs a label");
    expect(failure('```bash tab="a" group="g"\n1\n```\n\n```bash tab="a" group="g"\n2\n```\n').message).toContain('two tabs named "a"');
  });
});

describe("what is refused rather than drawn as text", () => {
  it.each([
    ["#### Deep", "a heading goes down to ###"],
    ["> just a quote", "a quote is not supported; use a callout"],
    ["> [!DANGER]\n> x", "unknown callout [!DANGER]; the kinds are [!NOTE], [!TIP], [!WARNING]"],
    ["---", "a horizontal rule is not supported"],
  ])("%s", (text, message) => {
    expect(failure(text).message).toContain(message);
  });

  it("reports the line in the file, not in the body: the front matter's lines count", () => {
    expect(failure("one\n\n#### Deep\n", 4).line).toBe(7);
  });
});

describe("highlight", () => {
  const samples: Readonly<Record<string, string>> = {
    ts: 'import { a } from "b"; // note\nconst n = 42;\nexport const f = async (x: string) => `t ${x}`;\n/* c */ class Foo extends Bar {}',
    json: '{ "k": [1, 2.5, true, null], "s": "x\\"y" }',
    bash: '$ pnpm add --save-dev x # why\necho "hi"',
    mprx: '<page title="x">\n  <button on.click={go()}>Go</button><!-- c -->\n</page>',
  };

  it.each(Object.keys(samples))("%s: the tokens' texts are the source, exactly", (lang) => {
    expect(highlight(samples[lang]!, lang, "t").map((token) => token.text).join("")).toBe(samples[lang]);
  });

  it("classifies by rule, and a keyword is a word, not the start of one", () => {
    const tokens = highlight("import important from x; const imported = 1; obj.default", "ts", "t");
    const kind = (text: string) => tokens.find((token) => token.text === text)?.kind;

    expect(kind("import")).toBe("keyword");
    expect(tokens.some((token) => token.kind === "keyword" && token.text.startsWith("important"))).toBe(false);
    expect(tokens.map((token) => token.text).join("")).toContain("important");
    expect(kind("1")).toBe("number");
    expect(tokens.filter((token) => token.kind === "keyword").map((token) => token.text)).toEqual(["import", "from", "const"]);   // `obj.default` is a property, not the keyword
  });

  it("an object key is a name and a value is a string; a comment holds what it holds", () => {
    expect(highlight('{ "k": "v" }', "json", "t").filter((token) => token.kind !== "plain" && token.kind !== "punctuation").map((token) => [token.kind, token.text])).toEqual([["name", '"k"'], ["string", '"v"']]);
    expect(highlight("// import x", "ts", "t").map((token) => token.kind)).toEqual(["comment"]);
  });

  it("an unknown language, and no source, are plain and empty", () => {
    expect(highlight("whatever", "klingon", "t")).toEqual([{ id: "t.0", kind: "plain", text: "whatever" }]);
    expect(highlight("", "ts", "t")).toEqual([]);
    expect(languages()).toContain("mprx");
  });

  it("token ids are consecutive after merging", () => {
    expect(highlight("a b c", "ts", "x").map((token) => token.id)).toEqual(["x.0"]);
  });
});

describe("the content directory is the site", () => {
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

  it("nav.json orders the pages, front matter titles and describes them, and the outline is the headings", () => {
    const site = readSite(here("../content"));

    expect(site.pages.map(({ id }) => id)).toEqual(["introduction", "guides-getting-started", "guides-state", "guides-views", "guides-plugins", "reference-api", "reference-errors"]);
    expect(site.pages.map(({ path }) => path)[1]).toBe("/docs/guides/getting-started");
    expect(site.pages[1]!.section).toBe("Guides");
    expect(site.pages[0]!.description).toContain("one place");
    expect(site.pages[2]!.outline.map(({ label }) => label)).toEqual(["Rules", "Commands", "A command that waits", "Ending"]);
    expect(site.pages.every((page) => page.description !== "")).toBe(true);
  });

  it("every example in snippets/ is used by a page, and every page example is a snippet (nothing is dead, nothing is unchecked)", () => {
    const used = new Set(readdirSync(here("../content/docs"), { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".md")).flatMap((name) => [...readFileSync(join(here("../content/docs"), name), "utf8").matchAll(/file=snippets\/(\S+)/g)].map((found) => found[1]!)));
    const present = readdirSync(here("../snippets")).filter((name) => name.endsWith(".ts"));

    // `counter-views.ts` is shown on the getting-started page, and imported by `counter.ts`.
    expect(present.filter((name) => !used.has(name))).toEqual([]);
    expect([...used].filter((name) => !present.includes(name))).toEqual([]);
  });

  describe("a mistake fails the build, with where it is", () => {
    const site = (pages: Readonly<Record<string, string>>, snippets: Readonly<Record<string, string>> = {}, nav: Readonly<Record<string, unknown>> = {}): string => {
      const root = mkdtempSync(join(tmpdir(), "verifier-"));

      mkdirSync(join(root, "content", "docs", "guides"), { recursive: true });
      mkdirSync(join(root, "snippets"));
      writeFileSync(join(root, "content", "nav.json"), JSON.stringify({ site: "x", ...nav, sections: [{ title: "", pages: Object.keys(pages) }] }));

      for (const [name, text] of Object.entries(pages)) { writeFileSync(join(root, "content", "docs", `${name}.md`), text); }

      for (const [name, text] of Object.entries(snippets)) { writeFileSync(join(root, "snippets", name), text); }

      return join(root, "content");
    };
    const page = (title: string, body: string): string => `---\ntitle: ${title}\n---\n${body}`;
    const message = (dir: string): string => { try { readSite(dir); } catch (error) { return String((error as Error).message); } throw new Error("expected the build to fail"); };

    it("a page without a title, or with front matter it does not know", () => {
      expect(message(site({ a: "# No front matter\n" }))).toBe("content/docs/a.md:1: a page starts with a --- block that has a title");
      expect(message(site({ a: "---\ndescription: x\n---\n# A\n" }))).toBe("content/docs/a.md:1: the --- block at the top of a page needs a title: line");
      expect(message(site({ a: "---\ntitle: A\ncolour: red\n---\n# A\n" }))).toContain('unknown front matter "colour"');
    });

    it("a page nav.json names and nobody wrote", () => {
      const dir = site({ a: page("A", "# A\n") });

      writeFileSync(join(dir, "nav.json"), JSON.stringify({ site: "x", sections: [{ title: "", pages: ["a", "ghost"] }] }));
      expect(message(dir)).toBe('content/nav.json:1: nav.json names the page "ghost" and content/docs/ghost.md does not exist');
    });

    it("a mistake in a page is reported at the page's own line, past its front matter", () => {
      expect(message(site({ a: page("A", "# A\n\n#### Too deep\n") }))).toBe("content/docs/a.md:6: a heading goes down to ### (this is level 4); restructure the page");
    });

    it("an example that is not in snippets/, or is outside it", () => {
      expect(message(site({ a: page("A", "```ts file=snippets/none.ts\n```\n") }))).toContain("file=snippets/none.ts: there is no such example");
      expect(message(site({ a: page("A", "```ts file=../package.json\n```\n") }))).toContain("an example is included from snippets/");
    });

    it("links: all the broken ones at once, each with its page and what is wrong", () => {
      const text = message(site({
        a: page("A", "# A\n\n## Real\n\n[ok](/docs/b) [ok too](/docs/b#there) [here](#real) [site](https://example.com) [mail](mailto:a@b.c)\n\n[gone](/docs/nowhere) [no heading](/docs/b#nope) [relative](b) [self](#nope)\n"),
        b: page("B", "# B\n\n## There\n"),
      }));

      expect(text).toContain("4 broken links:");
      expect(text).toContain("content/docs/a.md: [gone](/docs/nowhere) leads to no page");
      expect(text).toContain('content/docs/a.md: [no heading](/docs/b#nope) leads to no heading "nope" on /docs/b');
      expect(text).toContain("content/docs/a.md: [relative](b) is a relative link");
      expect(text).toContain('content/docs/a.md: [self](#nope) leads to no heading "nope" on /docs/a');
    });

    it("the site's base and published address are checked: a base starts and ends with a slash, an address is an origin", () => {
      expect(readSite(site({ a: page("A", "# A\n") }, {}, { base: "/docs-site/", url: "https://example.com" }))).toMatchObject({ base: "/docs-site/", url: "https://example.com" });
      expect(readSite(site({ a: page("A", "# A\n") }))).toMatchObject({ base: "/", url: "" });
      expect(message(site({ a: page("A", "# A\n") }, {}, { base: "docs-site" }))).toContain('base "docs-site" must start and end with a slash');
      expect(message(site({ a: page("A", "# A\n") }, {}, { url: "https://example.com/docs" }))).toContain("must be an origin");
    });

    it("without a description, a page is described by its first paragraph", () => {
      const read = readSite(site({ a: page("A", "# A\n\nThe first paragraph, with `code`.\n") }));

      expect(read.pages[0]!.description).toBe("The first paragraph, with code.");
    });
  });
});
