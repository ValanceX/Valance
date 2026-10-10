// What the page view reads: a function of the state and the site. The view is a template (../views/page.mprx); this is the only place that decides what it is given.
//
// The site's blocks are a union of kinds (../model/site.ts); a MESH scope is flat, so each block is projected to one record that has every field a template may read, empty for the
// kinds that have no use for it. `BlockView` is the one declaration of that shape, and `view` the one function that fills it.
import { Schema } from "effect";

import type { Block, Page, SiteMap, Span, Token } from "../model/site.js";

import { hrefOf } from "./routes.js";
import type { AppState } from "./state.js";

const Link = Schema.Struct({ href: Schema.String, label: Schema.String });
const NavItem = Schema.Struct({ id: Schema.String, href: Schema.String, label: Schema.String, current: Schema.String });
const NavSection = Schema.Struct({ id: Schema.String, title: Schema.String, items: Schema.Array(NavItem) });

const SpanView = Schema.Struct({ id: Schema.String, kind: Schema.String, text: Schema.String, href: Schema.String });
const TokenView = Schema.Struct({ id: Schema.String, kind: Schema.String, cls: Schema.String, text: Schema.String });
const CellView = Schema.Struct({ id: Schema.String, align: Schema.String, spans: Schema.Array(SpanView) });
const ChildView = Schema.Struct({ id: Schema.String, spans: Schema.Array(SpanView) });
const ItemView = Schema.Struct({ id: Schema.String, spans: Schema.Array(SpanView), /** Whether the item has nested items to draw. */ nested: Schema.Boolean, children: Schema.Array(ChildView) });
const TabView = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  /** `<group>|<label>`: what `selectTab` takes. */
  key: Schema.String,
  /** `true` or `false`, as the text of `aria-selected`. */
  selected: Schema.String,
  lang: Schema.String,
  /** What the tab's copy button says: its own id is what it reports. */
  copyLabel: Schema.String,
  tokens: Schema.Array(TokenView),
});

export const BlockView = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  /** A heading's level; 0 for the other kinds. */
  level: Schema.Number,
  anchor: Schema.String,
  /** `#<anchor>`: where a heading's permalink goes. */
  hash: Schema.String,
  tone: Schema.String,
  /** A callout's or a code block's title. */
  title: Schema.String,
  lang: Schema.String,
  src: Schema.String,
  alt: Schema.String,
  ordered: Schema.Boolean,
  copyLabel: Schema.String,
  group: Schema.String,
  spans: Schema.Array(SpanView),
  tokens: Schema.Array(TokenView),
  items: Schema.Array(ItemView),
  head: Schema.Array(CellView),
  rows: Schema.Array(Schema.Struct({ id: Schema.String, cells: Schema.Array(CellView) })),
  tabs: Schema.Array(TabView),
  /** The tabs to draw the code of: the chosen one (a template cannot choose among repeated items). */
  panels: Schema.Array(TabView),
});
export type BlockView = typeof BlockView.Type;

const HitView = Schema.Struct({ id: Schema.String, href: Schema.String, title: Schema.String, where: Schema.String, excerpt: Schema.String });

export const PageScope = Schema.Struct({
  site: Schema.String,
  /** The home page's URL. */
  home: Schema.String,
  theme: Schema.String,
  /** `true` or `false`, as the text of `data-menu` and `aria-pressed`: an attribute's value is text. */
  menu: Schema.Literal("true", "false"),
  /** The navigation, grouped as the content groups it. `current` is the value of `aria-current`: `page` for the page shown, `false` for the rest. */
  sections: Schema.Array(NavSection),
  /** What the reader typed in the search box, and what the search says about it: nothing (empty), that it is working, how many answers, or that it cannot. */
  query: Schema.String,
  searching: Schema.Boolean,
  status: Schema.String,
  hits: Schema.Array(HitView),
  /** `true` while the next page is being brought, as the text of `aria-busy`; and what the content is: `ready`, `loading` or `failed`, as the text of `data-status`. */
  loading: Schema.Literal("true", "false"),
  contentStatus: Schema.String,
  /** Whether the page has headings for "On this page". */
  hasToc: Schema.Boolean,
  /** The headings of the page, for "On this page". */
  toc: Schema.Array(Schema.Struct({ id: Schema.String, href: Schema.String, label: Schema.String, cls: Schema.String, current: Schema.String })),
  blocks: Schema.Array(BlockView),
  prev: Link,
  next: Link,
});
export type PageScope = typeof PageScope.Type;

const none = { href: "", label: "" };

/** An address inside the site (`/docs/...`) is under the base; an address elsewhere, and a fragment, are as written. */
const insideSite = (base: string, href: string): string => href.startsWith("/") && !href.startsWith("//") ? `${base}${href.slice(1)}` : href;

const spanView = (base: string) => (span: Span) => ({ id: span.id, kind: span.kind, text: span.text, href: span.kind === "link" ? insideSite(base, span.href) : "" });
const tokenView = (token: Token) => ({ id: token.id, kind: token.kind, cls: token.kind === "plain" ? "" : `tok-${token.kind}`, text: token.text });

const empty: BlockView = {
  id: "", kind: "", level: 0, anchor: "", hash: "", tone: "", title: "", lang: "", src: "", alt: "", ordered: false, copyLabel: "", group: "",
  spans: [], tokens: [], items: [], head: [], rows: [], tabs: [], panels: [],
};

/** One block, as the record the templates read. The copy label belongs to the state: a block is "Copied" when it is the one last copied. */
const view = (block: Block, state: AppState, base: string): BlockView => {
  const spanView_ = spanView(base);
  const copy = (id: string): string => state.copied === id ? "Copied" : state.copyFailed === id ? "Failed" : "Copy";

  switch (block.kind) {
    case "heading": return { ...empty, id: block.id, kind: block.kind, level: block.level, anchor: block.anchor, hash: `#${block.anchor}`, spans: block.spans.map(spanView_) };
    case "paragraph": return { ...empty, id: block.id, kind: block.kind, spans: block.spans.map(spanView_) };
    case "callout": return { ...empty, id: block.id, kind: block.kind, tone: block.tone, title: block.title, spans: block.spans.map(spanView_) };
    case "image": return { ...empty, id: block.id, kind: block.kind, src: insideSite(base, block.src), alt: block.alt };
    case "code": return { ...empty, id: block.id, kind: block.kind, lang: block.lang, title: block.title, copyLabel: copy(block.id), tokens: block.tokens.map(tokenView) };
    case "list": return { ...empty, id: block.id, kind: block.kind, ordered: block.ordered, items: block.items.map((item) => ({ id: item.id, spans: item.spans.map(spanView_), nested: item.children.length > 0, children: item.children.map((child) => ({ id: child.id, spans: child.spans.map(spanView_) })) })) };
    case "table": return {
      ...empty, id: block.id, kind: block.kind,
      head: block.head.map((cell) => ({ id: cell.id, align: cell.align, spans: cell.spans.map(spanView_) })),
      rows: block.rows.map((row) => ({ id: row.id, cells: row.cells.map((cell) => ({ id: cell.id, align: cell.align, spans: cell.spans.map(spanView_) })) })),
    };
    case "codegroup": {
      const chosen = block.tabs.find((tab) => tab.label === state.tabs[block.group]) ?? block.tabs[0];

      const tabs = block.tabs.map((tab) => ({ id: tab.id, label: tab.label, key: `${block.group}|${tab.label}`, selected: tab === chosen ? "true" : "false", lang: tab.lang, copyLabel: copy(tab.id), tokens: tab.tokens.map(tokenView) }));

      return { ...empty, id: block.id, kind: block.kind, group: block.group, tabs, panels: tabs.filter((tab) => tab.selected === "true") };
    }
  }
};

/** What the search says, in words: shown to the reader, and announced to a screen reader. */
const statusOf = ({ query, status, hits }: AppState["search"]): string => {
  switch (status) {
    case "idle": return "";
    case "loading": return "Searching…";
    case "failed": return "Search is not available right now.";
    case "ready": return hits.length === 0 ? `No results for “${query.trim()}”.` : `${hits.length} ${hits.length === 1 ? "result" : "results"}`;
  }
};

/** What the page says while its content could not be had: what happened, and the way to try again (the same address, which is the same `go`). */
const failure = (page: string, href: string): ReadonlyArray<Block> => [
  { id: "failed:0", kind: "heading", level: 1, anchor: "failed", spans: [{ id: "failed:0.0", kind: "text", text: "This page could not be loaded" }] },
  { id: "failed:1", kind: "paragraph", spans: [{ id: "failed:1.0", kind: "text", text: "The connection may have dropped. " }, { id: "failed:1.1", kind: "link", text: "Try again", href }] },
].map((block) => ({ ...block, id: `${block.id}:${page}` })) as ReadonlyArray<Block>;

export const pageScope = (map: SiteMap, state: AppState): PageScope => {
  const at = map.pages.findIndex((page) => page.id === state.page);
  const here = map.pages[at];
  const page: Page = state.content;
  const link = (target: { readonly path: string; readonly title: string } | undefined, arrow: (title: string) => string) => target === undefined ? none : { href: hrefOf(map, target.path), label: arrow(target.title) };
  const sections: Array<{ id: string; title: string; items: Array<{ id: string; href: string; label: string; current: string }> }> = [];

  for (const entry of map.pages) {
    const id = entry.section === "" ? "top" : entry.section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const section = sections.find((candidate) => candidate.id === id) ?? sections[sections.push({ id, title: entry.section, items: [] }) - 1]!;

    section.items.push({ id: entry.id, href: hrefOf(map, entry.path), label: entry.title, current: entry.id === state.page ? "page" : "false" });
  }

  const blocks = state.status === "failed" ? failure(state.page, here === undefined ? map.base : hrefOf(map, here.path)) : page.blocks;
  const outline = state.status === "failed" ? [] : page.outline;

  return {
    site: map.name,
    home: hrefOf(map, map.pages[0]?.path ?? "/"),
    theme: state.theme,
    menu: state.menu ? "true" : "false",
    sections,
    query: state.search.query,
    searching: state.search.status !== "idle",
    status: statusOf(state.search),
    hits: state.search.hits.map((hit) => ({ id: hit.id, href: hrefOf(map, hit.href), title: hit.title, where: [hit.section, hit.heading].filter((part) => part !== "").join(" › "), excerpt: hit.excerpt })),
    loading: state.status === "loading" ? "true" : "false",
    contentStatus: state.status,
    hasToc: outline.length > 0,
    toc: outline.map((entry) => ({ id: entry.id, href: `#${entry.anchor}`, label: entry.label, cls: `toc-link toc-level-${entry.level}`, current: entry.anchor === state.active ? "location" : "false" })),
    blocks: blocks.map((block) => view(block, state, map.base)),
    prev: at > 0 ? link(map.pages[at - 1], (title) => `← ${title}`) : none,
    next: at >= 0 ? link(map.pages[at + 1], (title) => `${title} →`) : none,
  };
};
