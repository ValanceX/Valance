// The shape of the site's content: what the build step (../../build/content) produces and the application (../app) consumes. Pure data and its Schemas; nothing here reads a file,
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

/** The top of a landing page: a headline, a lead, and the actions a visitor can take (the first is the main one). */
export const Hero = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("hero"),
  title: Schema.Array(Span),
  lead: Schema.Array(Span),
  actions: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, href: Schema.String })),
});

export type Hero = typeof Hero.Type;

/** A grid of cards, each a title that links somewhere and a few words under it. */
export const Cards = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("cards"),
  cards: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, href: Schema.String, spans: Schema.Array(Span) })),
});

export type Cards = typeof Cards.Type;

/** A list of pages of a collection, newest first: what a blog's index and a tag's page are made of. `date` is ISO (`2026-03-12`) and is formatted for the reader by the application. */
export const PostList = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("postlist"),
  posts: Schema.Array(Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    href: Schema.String,
    date: Schema.String,
    summary: Schema.String,
    tags: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, href: Schema.String })),
  })),
});

/** One block of a page. A page is a flat list of these: the views have no recursion, so nesting is bounded by what a kind carries (a list item's children, a table's cells). */
export const Block = Schema.Union(Heading, Paragraph, List, Code, CodeGroup, Callout, Table, Image, Hero, Cards, PostList);
export type Block = typeof Block.Type;
export type BlockKind = Block["kind"];

/** A heading in the table of contents of a page: levels 2 and 3. */
export const Outline = Schema.Struct({ id: Schema.String, level: Schema.Literal(2, 3), anchor: Schema.String, label: Schema.String });
export type Outline = typeof Outline.Type;

/**
 * How a page is laid out. `doc`: a page of documentation, with the navigation beside it and its outline. `post`: an article, one column, with its date, author and tags. `landing`:
 * a page that sells or introduces, the full width. `list`: an index of pages (a blog, a tag).
 */
export const Layout = Schema.Literal("doc", "post", "landing", "list");
export type Layout = typeof Layout.Type;

/** A page without its content: what the navigation, the routes, the head, the switchers and a sitemap need. */
export const PageInfo = Schema.Struct({
  id: Schema.String,
  /** Its address in the site, without the base: `/docs/guides/state`, `/fr/docs/guides/state`, `/v1/docs/guides/state`. */
  path: Schema.String,
  title: Schema.String,
  /** One line for a search result and a link preview. Absent in the front matter: the first paragraph's text. */
  description: Schema.String,
  /** The group it is listed under in the navigation of a collection that has them. */
  section: Schema.String,
  layout: Layout,
  /** The collection it belongs to (`docs`, `posts`). */
  collection: Schema.String,
  /** What it is, apart from which language and version it is in: `docs/guides/state`. The same slug in another locale or version is the same page, translated or older. */
  slug: Schema.String,
  /** Its language, `en`; and its version, empty when the collection has none. */
  locale: Schema.String,
  version: Schema.String,
  /** ISO date (`2026-03-12`) of a post; empty for the other layouts. */
  date: Schema.String,
  tags: Schema.Array(Schema.String),
});
export type PageInfo = typeof PageInfo.Type;

export const Page = Schema.Struct({
  ...PageInfo.fields,
  author: Schema.String,
  outline: Schema.Array(Outline),
  blocks: Schema.Array(Block),
});
export type Page = typeof Page.Type;

/** A language the site is in. */
export const Locale = Schema.Struct({ code: Schema.String, name: Schema.String });
export type Locale = typeof Locale.Type;
/** A version of the documentation. `latest` is served without a prefix. */
export const Version = Schema.Struct({ code: Schema.String, label: Schema.String, latest: Schema.Boolean });
export type Version = typeof Version.Type;

/** Where a path that is not a page leads: `/docs` to the first page of the documentation, and `/` to the first page of the site when nothing is at `/`. */
export const Root = Schema.Struct({ path: Schema.String, page: Schema.String });
export type Root = typeof Root.Type;

/**
 * The site's place on the web, shared by the build and the browser: its name, where it is served from (`base`, such as `/` or `/docs-site/`), the origin it is published at
 * (`url`, empty when it is not published), the links at the top and the words at the bottom, its languages and versions, the words the interface speaks in each language, and every
 * page without its content. This is what travels in each document; a page's content is its own file.
 */
export const SiteMap = Schema.Struct({
  name: Schema.String,
  base: Schema.String,
  url: Schema.String,
  /** The links at the top, by language: the labels in that language, the addresses those of the pages in it. */
  header: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.Struct({ label: Schema.String, href: Schema.String })) }),
  footer: Schema.String,
  defaultLocale: Schema.String,
  locales: Schema.Array(Locale),
  versions: Schema.Array(Version),
  /** The interface's words, by language: only what a site changed from the kit's own English. */
  ui: Schema.Record({ key: Schema.String, value: Schema.Record({ key: Schema.String, value: Schema.String }) }),
  roots: Schema.Array(Root),
  /** The collections that have a feed of their newest pages (`feed.xml`). */
  feeds: Schema.Array(Schema.String),
  pages: Schema.Array(PageInfo),
});
export type SiteMap = typeof SiteMap.Type;

/** The whole site: the map, and the content of every page. Only the build holds this. */
export const Site = Schema.Struct({
  ...SiteMap.fields,
  pages: Schema.Array(Page),
});
export type Site = typeof Site.Type;

const infoOf = ({ id, path, title, description, section, layout, collection, slug, locale, version, date, tags }: Page): PageInfo =>
  ({ id, path, title, description, section, layout, collection, slug, locale, version, date, tags });

export const mapOf = (site: Site): SiteMap => ({ ...site, pages: site.pages.map(infoOf) });
