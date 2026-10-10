// Build time, in Node: the small markdown this site is written in, as a flat list of blocks (../model/site.ts). Headings (#, ##, ###), paragraphs, bullet lists, fenced code
// and callouts (a `> [!NOTE]` quote). Inline marks are not parsed: text is plain (see FINDINGS.md).
import type { Block, Span } from "../model/site.js";

const TONES: Readonly<Record<string, string>> = { NOTE: "note", TIP: "tip", WARNING: "warning" };

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const parseInline = (text: string, blockId: string): ReadonlyArray<Span> => {
  const spans: Array<Span> = [];
  const add = (kind: Span["kind"], run: string, href = ""): void => { if (run !== "") { spans.push({ id: `${blockId}.${spans.length}`, kind, text: run, href }); } };
  const marks = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let from = 0;

  for (let found = marks.exec(text); found !== null; found = marks.exec(text)) {
    add("text", text.slice(from, found.index));

    if (found[1] !== undefined) { add("strong", found[1]); } else if (found[2] !== undefined) { add("code", found[2]); } else { add("link", found[3]!, found[4]!); }

    from = found.index + found[0].length;
  }

  add("text", text.slice(from));

  return spans;
};

export const parseMarkdown = (source: string, pageId: string): ReadonlyArray<Block> => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<Block> = [];
  const add = (kind: Block["kind"], text: string, extra: Partial<Pick<Block, "level" | "lang" | "tone">> = {}): void => {
    const id = `${pageId}:${blocks.length}`;
    blocks.push({ id, kind, text, spans: kind === "code" ? [] : parseInline(text, id), level: extra.level ?? 0, lang: extra.lang ?? "", tone: extra.tone ?? "" });
  };
  let paragraph: Array<string> = [];
  const flush = (): void => {
    if (paragraph.length > 0) { add("paragraph", paragraph.join(" ")); paragraph = []; }
  };

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]!;
    const fence = /^```(\w*)\s*$/.exec(line);
    const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    const item = /^[-*]\s+(.*\S)\s*$/.exec(line);
    const callout = /^>\s*\[!(NOTE|TIP|WARNING)\]\s*$/.exec(line);

    if (fence !== null) {
      flush();
      const code: Array<string> = [];

      for (at += 1; at < lines.length && !/^```\s*$/.test(lines[at]!); at += 1) { code.push(lines[at]!); }

      add("code", code.join("\n"), { lang: fence[1] ?? "" });
    } else if (heading !== null) {
      flush();
      add("heading", heading[2]!, { level: heading[1]!.length });
    } else if (callout !== null) {
      flush();
      const quoted: Array<string> = [];

      for (; at + 1 < lines.length && /^>/.test(lines[at + 1]!); at += 1) { quoted.push(lines[at + 1]!.replace(/^>\s?/, "")); }

      add("callout", quoted.join(" ").trim(), { tone: TONES[callout[1]!] ?? "note" });
    } else if (item !== null) {
      flush();
      add("item", item[1]!);
    } else if (line.trim() === "") {
      flush();
    } else {
      paragraph.push(line.trim());
    }
  }

  flush();

  return blocks;
};

export { slug };
