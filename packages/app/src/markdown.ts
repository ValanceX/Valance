// Build time, in Node: the Markdown a page is written in, as the typed blocks of ./model.ts.
//
//   blocks   headings (# to ###, each with an anchor), paragraphs, bullet and numbered lists (one level), fenced code, block quotes, and an image on a line of its own
//   inline   **strong**, *emphasis* or _emphasis_, `code`, [links](href)
//
// Anything else is an error that names the file and the line, not something quietly drawn as text: a build that accepts what it cannot draw teaches authors the wrong thing.
// The dialect is deliberately a subset; the documentation verifier's richer one (tables, callouts, tabs, included snippets) is the path to a fuller one (docs/EXTERNALS.md, X2).
import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic } from "./diagnostics.js";
import type { Block, Heading, Item, Span } from "./model.js";

export interface LinkRef {
  readonly href: string;
  readonly line: number;
  readonly image: boolean;
}

export interface Parsed {
  readonly blocks: ReadonlyArray<Block>;
  readonly outline: ReadonlyArray<Heading>;
  /** Every link and image address, for the checks that need the other pages. */
  readonly links: ReadonlyArray<LinkRef>;
  /** The anchors of the page's headings. */
  readonly anchors: ReadonlySet<string>;
}

export const slug = (text: string): string => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const MARKS = /\*\*([^*]+)\*\*|`([^`]+)`|!\[[^\]]*\]\([^)\s]*\)|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])/g;

const empty = { level: 0, anchor: "", spans: [], items: [], ordered: false, lang: "", text: "", src: "", alt: "" } as const;

export const plain = (spans: ReadonlyArray<Span>): string => spans.map((span) => span.text).join("");

/**
 * Parses `text`. `file` and `offset` (the lines before `text` in the file, the front matter) only make diagnostics point at the right line.
 */
export const parseMarkdown = (text: string, file: string, offset: number): Parsed => {
  const lines = text.split("\n");
  const blocks: Array<Block> = [];
  const links: Array<LinkRef> = [];
  const problems: Array<Diagnostic> = [];
  const anchors = new Set<string>();
  const fail = (at: number, code: string, message: string): void => { problems.push(diagnostic(file, offset + at + 1, code, message)); };

  const inline = (source: string, blockId: string, at: number): ReadonlyArray<Span> => {
    const spans: Array<Span> = [];
    const add = (kind: Span["kind"], value: string, href = ""): void => {
      if (value !== "") { spans.push({ id: `${blockId}.${spans.length}`, kind, text: value, href }); }
    };
    let from = 0;

    for (let found = MARKS.exec(source); found !== null; found = MARKS.exec(source)) {
      add("text", source.slice(from, found.index));

      if (found[1] !== undefined) { add("strong", found[1]); }
      else if (found[2] !== undefined) { add("code", found[2]); }
      else if (found[3] !== undefined) { add("link", found[3], found[4]!); links.push({ href: found[4]!, line: offset + at + 1, image: false }); }
      else if (found[5] !== undefined || found[6] !== undefined) { add("emphasis", found[5] ?? found[6]!); }
      else { fail(at, "md-inline-image", "an image must be on a line of its own"); }

      from = found.index + found[0].length;
    }

    add("text", source.slice(from));
    MARKS.lastIndex = 0;

    return spans;
  };

  const next = (): string => `b${blocks.length}`;
  let at = 0;

  while (at < lines.length) {
    const line = lines[at]!;

    if (line.trim() === "") { at += 1; continue; }

    const fence = /^```\s*([\w+-]*)\s*$/.exec(line);

    if (fence !== null) {
      const start = at;
      const body: Array<string> = [];

      at += 1;
      while (at < lines.length && !/^```\s*$/.test(lines[at]!)) { body.push(lines[at]!); at += 1; }

      if (at >= lines.length) { fail(start, "md-unclosed-fence", "this code fence is never closed"); break; }

      blocks.push({ ...empty, id: next(), kind: "code", lang: fence[1]!, text: body.join("\n") });
      at += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);

    if (heading !== null) {
      const level = heading[1]!.length;
      const id = next();

      if (level > 3) { fail(at, "md-heading-level", "headings go from # to ###"); at += 1; continue; }

      const spans = inline(heading[2]!, id, at);
      const base = slug(plain(spans)) || "section";
      let anchor = base;

      for (let n = 2; anchors.has(anchor); n += 1) { anchor = `${base}-${n}`; }

      anchors.add(anchor);
      blocks.push({ ...empty, id, kind: "heading", level, anchor, spans });
      at += 1;
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);

    if (image !== null) {
      blocks.push({ ...empty, id: next(), kind: "image", alt: image[1]!, src: image[2]! });
      links.push({ href: image[2]!, line: offset + at + 1, image: true });
      at += 1;
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const id = next();
      const ordered = /^\s*\d+\./.test(line);
      const items: Array<Item> = [];

      while (at < lines.length && lines[at]!.trim() !== "") {
        const item = /^(\s*)([-*]|\d+\.)\s+(.*\S)\s*$/.exec(lines[at]!);

        if (item !== null) {
          if (item[1]! !== "") { fail(at, "md-nested-list", "lists nest one level at most: this build draws a single level"); }
          else if (/\d/.test(item[2]!) !== ordered) { fail(at, "md-mixed-list", "a list is either bulleted or numbered, not both"); }

          items.push({ id: `${id}.i${items.length}`, spans: inline(item[3]!, `${id}.i${items.length}`, at) });
        } else if (/^\s+\S/.test(lines[at]!) && items.length > 0) {
          const last = items[items.length - 1]!;
          const more = inline(lines[at]!.trim(), last.id, at);

          items[items.length - 1] = { id: last.id, spans: [...last.spans, { id: `${last.id}.c${last.spans.length}`, kind: "text", text: " ", href: "" }, ...more.map((span, n) => ({ ...span, id: `${last.id}.c${last.spans.length + n + 1}` }))] };
        } else { break; }

        at += 1;
      }

      blocks.push({ ...empty, id, kind: "list", ordered, items });
      continue;
    }

    if (/^>/.test(line)) {
      const id = next();
      const body: Array<string> = [];
      const first = at;

      while (at < lines.length && /^>/.test(lines[at]!)) { body.push(lines[at]!.replace(/^>\s?/, "")); at += 1; }

      blocks.push({ ...empty, id, kind: "quote", spans: inline(body.join(" ").trim(), id, first) });
      continue;
    }

    if (/^\s*</.test(line)) { fail(at, "md-html", "raw HTML is not supported: use Markdown, or a component in your layout"); at += 1; continue; }
    if (/^\s*\|/.test(line)) { fail(at, "md-table", "tables are not supported yet"); at += 1; continue; }
    if (/^(-{3,}|\*{3,}|_{3,}|={3,})\s*$/.test(line)) { fail(at, "md-rule", "horizontal rules and setext headings are not supported: use # headings"); at += 1; continue; }

    const id = next();
    const first = at;
    const body: Array<string> = [line.trim()];

    at += 1;
    while (at < lines.length && lines[at]!.trim() !== "" && !/^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s|!\[)/.test(lines[at]!)) { body.push(lines[at]!.trim()); at += 1; }

    blocks.push({ ...empty, id, kind: "paragraph", spans: inline(body.join(" "), id, first) });
  }

  if (problems.length > 0) { throw new AppError(problems); }

  const outline: Array<Heading> = blocks.filter((block) => block.kind === "heading" && block.level >= 2).map((block) => ({ id: block.id, label: plain(block.spans), anchor: block.anchor, level: block.level }));

  return { blocks, outline, links, anchors };
};
