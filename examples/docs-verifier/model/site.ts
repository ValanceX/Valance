// The shape of the site's content: what the build step (../tooling) produces and the application (../app) consumes. Pure data and its Schemas; nothing here reads a file,
// names a framework or draws anything. A block is one of a closed set of kinds, each with exactly the fields it has: no field is there "for the other kinds".
import { Schema } from "effect";

/** A run of inline text: plain, strong, emphasised, code or a link. */
export const Span = Schema.Union(
  Schema.Struct({ id: Schema.String, kind: Schema.Literal("text", "strong", "emphasis", "code"), text: Schema.String }),
  Schema.Struct({ id: Schema.String, kind: Schema.Literal("link"), text: Schema.String, href: Schema.String }),
);
export type Span = typeof Span.Type;

/** What a token of code is, for the stylesheet to colour. `plain` is text no rule claimed. */
export const TokenKind = Schema.Literal("plain", "keyword", "string", "comment", "number", "punctuation", "name", "tag", "attribute");
export type TokenKind = typeof TokenKind.Type;

/** A token of highlighted code. Highlighting is done at build time: the browser draws tokens, it never tokenizes. */
export const Token = Schema.Struct({ id: Schema.String, kind: TokenKind, text: Schema.String });
export type Token = typeof Token.Type;

export const Tone = Schema.Literal("note", "tip", "warning");
export type Tone = typeof Tone.Type;

export const Align = Schema.Literal("left", "center", "right");
export type Align = typeof Align.Type;

/** A heading of level 1 (the page's title), 2 or 3. `anchor` is its id on the page, unique within it. */
export const Heading = Schema.Struct({ id: Schema.String, kind: Schema.Literal("heading"), level: Schema.Literal(1, 2, 3), anchor: Schema.String, spans: Schema.Array(Span) });
export const Paragraph = Schema.Struct({ id: Schema.String, kind: Schema.Literal("paragraph"), spans: Schema.Array(Span) });

/** A list item, and the items nested one level under it (a deeper level is refused by the build). */
export const ListItem = Schema.Struct({ id: Schema.String, spans: Schema.Array(Span), children: Schema.Array(Schema.Struct({ id: Schema.String, spans: Schema.Array(Span) })) });
export const List = Schema.Struct({ id: Schema.String, kind: Schema.Literal("list"), ordered: Schema.Boolean, items: Schema.Array(ListItem) });

/** A code block: its language, an optional title (a file name), the source, and the source as tokens. */
export const Code = Schema.Struct({ id: Schema.String, kind: Schema.Literal("code"), lang: Schema.String, title: Schema.String, text: Schema.String, tokens: Schema.Array(Token) });

/** Alternatives of one piece of code (npm, pnpm, yarn). `group` names the choice, so picking pnpm once picks it wherever the group appears. */
export const CodeTab = Schema.Struct({ id: Schema.String, label: Schema.String, lang: Schema.String, text: Schema.String, tokens: Schema.Array(Token) });
export type CodeTab = typeof CodeTab.Type;
export const CodeGroup = Schema.Struct({ id: Schema.String, kind: Schema.Literal("codegroup"), group: Schema.String, tabs: Schema.Array(CodeTab) });

export const Callout = Schema.Struct({ id: Schema.String, kind: Schema.Literal("callout"), tone: Tone, title: Schema.String, spans: Schema.Array(Span) });

export const Cell = Schema.Struct({ id: Schema.String, align: Align, spans: Schema.Array(Span) });
export const Table = Schema.Struct({ id: Schema.String, kind: Schema.Literal("table"), head: Schema.Array(Cell), rows: Schema.Array(Schema.Struct({ id: Schema.String, cells: Schema.Array(Cell) })) });

export const Image = Schema.Struct({ id: Schema.String, kind: Schema.Literal("image"), src: Schema.String, alt: Schema.String });

/** One block of a page. A page is a flat list of these: the views have no recursion, so nesting is bounded by what a kind carries (a list item's children, a table's cells). */
export const Block = Schema.Union(Heading, Paragraph, List, Code, CodeGroup, Callout, Table, Image);
export type Block = typeof Block.Type;
export type BlockKind = Block["kind"];

/** A heading in the table of contents of a page: levels 2 and 3. */
export const Outline = Schema.Struct({ id: Schema.String, level: Schema.Literal(2, 3), anchor: Schema.String, label: Schema.String });
export type Outline = typeof Outline.Type;

export const Page = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  title: Schema.String,
  /** One line for a search result and a link preview. Absent in the front matter: the first paragraph's text. */
  description: Schema.String,
  section: Schema.String,
  outline: Schema.Array(Outline),
  blocks: Schema.Array(Block),
});
export type Page = typeof Page.Type;

export const Site = Schema.Struct({
  name: Schema.String,
  pages: Schema.Array(Page),
});
export type Site = typeof Site.Type;
