// Build time, in Node: the small markdown this site is written in, as a list of typed blocks (../model/site.ts) and the outline of the page's headings.
//
//   blocks    headings (# to ###, each with an anchor), paragraphs, bullet and numbered lists (one level of nesting), fenced code (with `title="..."`, or `file=snippets/...` to include a
//             checked example), consecutive `tab="..." group="..."` fences as one code group, tables, an image on a line of its own, and callouts (`> [!NOTE] Title`)
//   containers  `::: hero` (a headline, a lead, a list of links as actions) and `::: cards` (a list of `[Title](href) a few words`), closed by `:::`
//   inline    **strong**, *emphasis* or _emphasis_, `code`, [links](href)
//
// Anything else is an error that names the file and the line, not something quietly drawn as text: a build that accepts what it cannot draw teaches authors the wrong thing.
import type { Align, Block, CodeTab, Outline, Span, Tone } from "../../src/model/site.js";
import type { Cards, Hero } from "../../src/model/site.js";

import { slug } from "../../src/model/slug.js";

import { highlight } from "./highlight.js";

/** A mistake in the content, with where it is. */
export class ContentError extends Error {
  readonly file: string;
  readonly line: number;

  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = "ContentError";
    this.file = file;
    this.line = line;
  }
}

export interface Source {
  /** The file the text is from, as the author knows it (`content/docs/x.md`), for errors. */
  readonly file: string;
  /** How many lines of the file come before this text (the front matter), so a line in an error is the file's. */
  readonly offset: number;
  /** Reads an example named by `file=` (a path under `snippets/`), or throws. */
  readonly include: (path: string) => string;
}

export interface Parsed {
  readonly blocks: ReadonlyArray<Block>;
  readonly outline: ReadonlyArray<Outline>;
}

const TONES: Readonly<Record<string, Tone>> = { NOTE: "note", TIP: "tip", WARNING: "warning" };
/** Languages whose examples are real code: they must be included from `snippets/`, where the project compiles them, not typed inline where nothing checks them. */
const CHECKED = new Set(["ts", "typescript", "tsx", "js", "javascript", "mjs"]);

export { slug } from "../../src/model/slug.js";

/** The text of spans, without marks: what a heading's anchor and an outline entry are made from. */
export const plainText = (spans: ReadonlyArray<Span>): string => spans.map((span) => span.text).join("");

export const parseInline = (text: string, blockId: string): ReadonlyArray<Span> => {
  const spans: Array<Span> = [];
  const add = (span: Omit<Span, "id"> & { href?: string }): void => {
    if (span.text !== "") { spans.push({ ...span, id: `${blockId}.${spans.length}` } as Span); }
  };
  const marks = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])/g;
  let from = 0;

  for (let found = marks.exec(text); found !== null; found = marks.exec(text)) {
    add({ kind: "text", text: text.slice(from, found.index) });

    if (found[1] !== undefined) { add({ kind: "strong", text: found[1] }); }
    else if (found[2] !== undefined) { add({ kind: "code", text: found[2] }); }
    else if (found[3] !== undefined) { add({ kind: "link", text: found[3], href: found[4]! }); }
    else { add({ kind: "emphasis", text: found[5] ?? found[6]! }); }

    from = found.index + found[0].length;
  }

  add({ kind: "text", text: text.slice(from) });

  return spans;
};

/** `key="value"`, `key=value` and bare `key` words of a fence's info string. */
const attributesOf = (info: string): Readonly<Record<string, string>> =>
  Object.fromEntries([...info.matchAll(/([\w-]+)(?:=(?:"([^"]*)"|(\S+)))?/g)].map((found) => [found[1]!, found[2] ?? found[3] ?? ""]));

const extensionOf = (path: string): string => /\.([A-Za-z0-9]+)$/.exec(path)?.[1] ?? "";

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cells = (line: string): ReadonlyArray<string> => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.replaceAll("\\|", "|").trim());
const alignOf = (cell: string): Align => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left";

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*\S)\s*$/;

/** The first link of an item and what follows it: a card's title and its few words, an action's label. */
const linkAndRest = (spans: ReadonlyArray<Span>): { readonly link: Extract<Span, { kind: "link" }>; readonly rest: ReadonlyArray<Span> } | undefined => {
  const [first, ...rest] = spans;

  if (first === undefined || first.kind !== "link") { return undefined; }

  const [head, ...tail] = rest;
  // What separates a title from its words (a dash, a colon) is not part of the words.
  const words = head !== undefined && head.kind === "text" ? [{ ...head, text: head.text.replace(/^[\s\u2014\u2013:-]+/, "") }, ...tail].filter((span) => span.text !== "") : rest;

  return { link: first, rest: words };
};

/** A `:::` container as the block it is, from the blocks inside it. */
const containerBlock = (kind: string, id: string, inner: ReadonlyArray<Block>, fail: (message: string) => never): Block => {
  if (kind === "cards") {
    const [list, ...extra] = inner;

    if (list === undefined || list.kind !== "list" || extra.length > 0) { return fail("a ::: cards container holds one list, and each item is [Title](href) and a few words"); }

    return {
      id,
      kind: "cards",
      cards: list.items.map((item) => {
        const found = linkAndRest(item.spans);

        if (found === undefined) { return fail(`a card starts with a link: [Title](href) and a few words (this one is "${plainText(item.spans)}")`); }

        return { id: item.id, title: found.link.text, href: found.link.href, spans: found.rest };
      }),
    } satisfies Cards;
  }

  if (kind === "hero") {
    const title = inner.find((block) => block.kind === "heading" && block.level === 1);
    const lead = inner.find((block) => block.kind === "paragraph");
    const actions = inner.find((block) => block.kind === "list");

    if (title === undefined || title.kind !== "heading") { return fail("a ::: hero container starts with a # headline"); }

    return {
      id,
      kind: "hero",
      title: title.spans,
      lead: lead?.kind === "paragraph" ? lead.spans : [],
      actions: actions?.kind === "list"
        ? actions.items.map((item) => {
          const found = linkAndRest(item.spans);

          if (found === undefined) { return fail(`an action is a link: [Label](href) (this one is "${plainText(item.spans)}")`); }

          return { id: item.id, label: found.link.text, href: found.link.href };
        })
        : [],
    } satisfies Hero;
  }

  return fail(`unknown container ::: ${kind}; the kinds are ::: hero and ::: cards`);
};

export const parseMarkdown = (source: string, pageId: string, from: Source): Parsed => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<Block> = [];
  const outline: Array<Outline> = [];
  const anchors = new Set<string>();
  const fail = (at: number, message: string): never => { throw new ContentError(from.file, at + 1 + from.offset, message); };
  const idFor = (): string => `${pageId}:${blocks.length}`;
  const startsBlock = (line: string): boolean => /^(#{1,6}\s|```|:::|>|\s*([-*]|\d+\.)\s|!\[)/.test(line);

  /** A fenced block starting at `at`: its info string, its text, and the index of its closing fence. */
  const fence = (at: number): { readonly lang: string; readonly attributes: Readonly<Record<string, string>>; readonly text: string; readonly end: number } => {
    const opening = /^```(\S*)\s*(.*)$/.exec(lines[at]!)!;
    const attributes = attributesOf(opening[2]!);
    const body: Array<string> = [];
    let end = at + 1;

    while (end < lines.length && !/^```\s*$/.test(lines[end]!)) { body.push(lines[end]!); end += 1; }

    if (end >= lines.length) { fail(at, "a code fence is opened and never closed"); }

    let lang = opening[1]!;
    let text = body.join("\n");

    if (attributes["file"] !== undefined) {
      if (body.some((line) => line.trim() !== "")) { fail(at, `a fence with file="${attributes["file"]}" has no text of its own`); }

      try { text = from.include(attributes["file"]).replace(/\n+$/, ""); } catch (error) { fail(at, error instanceof Error ? error.message : String(error)); }

      lang = lang === "" ? extensionOf(attributes["file"]) : lang;
    } else if (CHECKED.has(lang.toLowerCase())) {
      fail(at, `an inline ${lang} example is not checked by anything; put it in snippets/ (it is compiled there) and include it with \`\`\`${lang} file=snippets/<name>.ts`);
    }

    return { lang, attributes, text, end };
  };

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]!;

    if (line.trim() === "") { continue; }

    const id = idFor();

    const container = /^:::\s*(\w+)\s*$/.exec(line);

    if (container !== null) {
      let end = at + 1;

      while (end < lines.length && !/^:::\s*$/.test(lines[end]!)) { end += 1; }

      if (end >= lines.length) { fail(at, `a ::: ${container[1]} container is opened and never closed`); }

      const inner = parseMarkdown(lines.slice(at + 1, end).join("\n"), `${id}~`, { ...from, offset: from.offset + at + 1 });

      blocks.push(containerBlock(container[1]!, id, inner.blocks, (message) => fail(at, message)));
      at = end;
      continue;
    }

    if (/^```/.test(line)) {
      const first = fence(at);

      if (first.attributes["tab"] === undefined) {
        blocks.push({ id, kind: "code", lang: first.lang, title: first.attributes["title"] ?? (first.attributes["file"] === undefined ? "" : first.attributes["file"].replace(/^.*\//, "")), text: first.text, tokens: highlight(first.text, first.lang, `${id}.k`) });
        at = first.end;
        continue;
      }

      // Consecutive fences with `tab=` are one group: the alternatives of one piece of code.
      const group = first.attributes["group"] ?? "tabs";
      const tabs: Array<CodeTab> = [];
      let current = first;
      let cursor = at;

      for (;;) {
        const label = current.attributes["tab"]!;

        if (label === "") { fail(cursor, 'a tab needs a label: ```bash tab="npm"'); }

        if (tabs.some((tab) => tab.label === label)) { fail(cursor, `the group "${group}" has two tabs named "${label}"`); }

        const tabId = `${id}.t${tabs.length}`;

        tabs.push({ id: tabId, label, lang: current.lang, text: current.text, tokens: highlight(current.text, current.lang, `${tabId}.k`) });
        cursor = current.end;

        let next = cursor + 1;

        while (next < lines.length && lines[next]!.trim() === "") { next += 1; }

        if (next >= lines.length || !/^```/.test(lines[next]!)) { break; }

        const candidate = fence(next);

        if (candidate.attributes["tab"] === undefined) { break; }

        if ((candidate.attributes["group"] ?? "tabs") !== group) { break; }

        current = candidate;
        cursor = next;
      }

      blocks.push({ id, kind: "codegroup", group, tabs });
      at = cursor;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);

    if (heading !== null) {
      const level = heading[1]!.length;

      if (level > 3) { fail(at, `a heading goes down to ### (this is level ${level}); restructure the page`); }

      const spans = parseInline(heading[2]!, id);
      const base = slug(plainText(spans)) || "section";
      let anchor = base;

      for (let suffix = 2; anchors.has(anchor); suffix += 1) { anchor = `${base}-${suffix}`; }

      anchors.add(anchor);
      blocks.push({ id, kind: "heading", level: level as 1 | 2 | 3, anchor, spans });

      if (level > 1) { outline.push({ id, level: level as 2 | 3, anchor, label: plainText(spans) }); }

      continue;
    }

    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(line);

    if (callout !== null) {
      const tone = TONES[callout[1]!.toUpperCase()];

      if (tone === undefined) { fail(at, `unknown callout [!${callout[1]}]; the kinds are ${Object.keys(TONES).map((name) => `[!${name}]`).join(", ")}`); }

      const quoted: Array<string> = [];

      for (; at + 1 < lines.length && /^>/.test(lines[at + 1]!); at += 1) { quoted.push(lines[at + 1]!.replace(/^>\s?/, "")); }

      blocks.push({ id, kind: "callout", tone: tone!, title: callout[2]!.trim() || tone!.toUpperCase(), spans: parseInline(quoted.join(" ").trim(), id) });
      continue;
    }

    if (/^>/.test(line)) { fail(at, "a quote is not supported; use a callout (> [!NOTE])"); }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { fail(at, "a horizontal rule is not supported"); }

    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);

    if (image !== null) {
      if (image[1]!.trim() === "") { fail(at, "an image needs alt text: ![what it shows](src)"); }

      blocks.push({ id, kind: "image", src: image[2]!, alt: image[1]!.trim() });
      continue;
    }

    if (line.includes("|") && at + 1 < lines.length && SEPARATOR.test(lines[at + 1]!)) {
      const head = cells(line);
      const aligns = cells(lines[at + 1]!).map(alignOf);

      if (head.length !== aligns.length) { fail(at, "a table's header and its separator have different numbers of columns"); }

      const rows: Array<{ readonly id: string; readonly cells: ReadonlyArray<{ readonly id: string; readonly align: Align; readonly spans: ReadonlyArray<Span> }> }> = [];
      let end = at + 2;

      for (; end < lines.length && lines[end]!.trim() !== "" && lines[end]!.includes("|"); end += 1) {
        const row = cells(lines[end]!);

        if (row.length !== head.length) { fail(end, `a table row has ${row.length} cells; the header has ${head.length}`); }

        const rowId = `${id}.r${rows.length}`;

        rows.push({ id: rowId, cells: row.map((cell, column) => ({ id: `${rowId}.c${column}`, align: aligns[column]!, spans: parseInline(cell, `${rowId}.c${column}`) })) });
      }

      blocks.push({ id, kind: "table", head: head.map((cell, column) => ({ id: `${id}.h${column}`, align: aligns[column]!, spans: parseInline(cell, `${id}.h${column}`) })), rows });
      at = end - 1;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items: Array<{ id: string; spans: ReadonlyArray<Span>; children: Array<{ id: string; spans: ReadonlyArray<Span> }>; text: string }> = [];
      const ordered = /^\s*\d+\./.test(line);
      let childIndent: number | undefined;
      let last = at;

      for (let cursor = at; cursor < lines.length; cursor += 1) {
        const row = lines[cursor]!;
        const found = LIST_ITEM.exec(row);

        if (found === null) {
          // A continuation of the last item or child: an indented line that is not a new item.
          if (row.trim() !== "" && /^\s+\S/.test(row) && items.length > 0) {
            const item = items[items.length - 1]!;
            const child = item.children[item.children.length - 1];

            if (child !== undefined && childIndent !== undefined && row.search(/\S/) >= childIndent) {
              const text = `${child.spans.map((span) => span.text).join("")} ${row.trim()}`;

              item.children[item.children.length - 1] = { id: child.id, spans: parseInline(text, child.id) };
            } else {
              item.text = `${item.text} ${row.trim()}`;
              item.spans = parseInline(item.text, item.id);
            }

            last = cursor;
            continue;
          }

          break;
        }

        const indent = found[1]!.length;
        const marker = /^\d+\./.test(found[2]!);

        if (indent === 0) {
          if (marker !== ordered) { fail(cursor, "a list is bulleted or numbered, not both"); }

          const itemId = `${id}.i${items.length}`;

          items.push({ id: itemId, spans: parseInline(found[3]!, itemId), children: [], text: found[3]! });
          childIndent = undefined;
        } else {
          const item = items[items.length - 1];

          if (item === undefined) { fail(cursor, "a list starts at the left margin"); }

          childIndent ??= indent;

          if (indent !== childIndent) { fail(cursor, "a list nests one level; this item is deeper (or shallower) than its siblings"); }

          const childId = `${item!.id}.c${item!.children.length}`;

          item!.children.push({ id: childId, spans: parseInline(found[3]!, childId) });
        }

        last = cursor;
      }

      blocks.push({ id, kind: "list", ordered, items: items.map(({ id: itemId, spans, children }) => ({ id: itemId, spans, children })) });
      at = last;
      continue;
    }

    // A paragraph: lines up to a blank line or the start of another block.
    const paragraph = [line.trim()];

    while (at + 1 < lines.length && lines[at + 1]!.trim() !== "" && !startsBlock(lines[at + 1]!) && !(lines[at + 1]!.includes("|") && at + 2 < lines.length && SEPARATOR.test(lines[at + 2]!))) {
      at += 1;
      paragraph.push(lines[at]!.trim());
    }

    blocks.push({ id, kind: "paragraph", spans: parseInline(paragraph.join(" "), id) });
  }

  return { blocks, outline };
};
