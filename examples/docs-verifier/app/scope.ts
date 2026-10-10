// What the page view reads: a function of the state and the site. The view is a template (../views/page.mprx); this is the only place that decides what it is given.
//
// The site's blocks are a union of kinds (../model/site.ts); a MESH scope is flat, so each block is projected to one record that has every field a template may read, empty for the
// kinds that have no use for it. `BlockView` is the one declaration of that shape, and `view` the one function that fills it.
import { Schema } from "effect";

import type { Block, Page, Site, Span, Token } from "../model/site.js";

import { NOT_FOUND } from "./routes.js";
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

export const PageScope = Schema.Struct({
  site: Schema.String,
  /** The home page's URL. */
  home: Schema.String,
  theme: Schema.String,
  /** `true` or `false`, as the text of `data-menu` and `aria-pressed`: an attribute's value is text. */
  menu: Schema.Literal("true", "false"),
  /** The navigation, grouped as the content groups it. `current` is the value of `aria-current`: `page` for the page shown, `false` for the rest. */
  sections: Schema.Array(NavSection),
  /** Whether the page has headings for "On this page". */
  hasToc: Schema.Boolean,
  /** The headings of the page, for "On this page". */
  toc: Schema.Array(Schema.Struct({ id: Schema.String, href: Schema.String, label: Schema.String, cls: Schema.String })),
  blocks: Schema.Array(BlockView),
  prev: Link,
  next: Link,
});
export type PageScope = typeof PageScope.Type;

const text = (id: string, content: string): Span => ({ id, kind: "text", text: content });
const missing: Page = {
  id: NOT_FOUND,
  path: "",
  title: "Not found",
  description: "",
  section: "",
  outline: [],
  blocks: [
    { id: "not-found:0", kind: "heading", level: 1, anchor: "not-found", spans: [text("not-found:0.0", "Not found")] },
    { id: "not-found:1", kind: "paragraph", spans: [text("not-found:1.0", "There is no such page.")] },
  ],
};

const none = { href: "", label: "" };

const spanView = (span: Span) => ({ id: span.id, kind: span.kind, text: span.text, href: span.kind === "link" ? span.href : "" });
const tokenView = (token: Token) => ({ id: token.id, kind: token.kind, cls: token.kind === "plain" ? "" : `tok-${token.kind}`, text: token.text });

const empty: BlockView = {
  id: "", kind: "", level: 0, anchor: "", hash: "", tone: "", title: "", lang: "", src: "", alt: "", ordered: false, copyLabel: "", group: "",
  spans: [], tokens: [], items: [], head: [], rows: [], tabs: [], panels: [],
};

/** One block, as the record the templates read. The copy label belongs to the state: a block is "Copied" when it is the one last copied. */
const view = (block: Block, state: AppState): BlockView => {
  const copy = (id: string): string => state.copied === id ? "Copied" : "Copy";

  switch (block.kind) {
    case "heading": return { ...empty, id: block.id, kind: block.kind, level: block.level, anchor: block.anchor, hash: `#${block.anchor}`, spans: block.spans.map(spanView) };
    case "paragraph": return { ...empty, id: block.id, kind: block.kind, spans: block.spans.map(spanView) };
    case "callout": return { ...empty, id: block.id, kind: block.kind, tone: block.tone, title: block.title, spans: block.spans.map(spanView) };
    case "image": return { ...empty, id: block.id, kind: block.kind, src: block.src, alt: block.alt };
    case "code": return { ...empty, id: block.id, kind: block.kind, lang: block.lang, title: block.title, copyLabel: copy(block.id), tokens: block.tokens.map(tokenView) };
    case "list": return { ...empty, id: block.id, kind: block.kind, ordered: block.ordered, items: block.items.map((item) => ({ id: item.id, spans: item.spans.map(spanView), nested: item.children.length > 0, children: item.children.map((child) => ({ id: child.id, spans: child.spans.map(spanView) })) })) };
    case "table": return {
      ...empty, id: block.id, kind: block.kind,
      head: block.head.map((cell) => ({ id: cell.id, align: cell.align, spans: cell.spans.map(spanView) })),
      rows: block.rows.map((row) => ({ id: row.id, cells: row.cells.map((cell) => ({ id: cell.id, align: cell.align, spans: cell.spans.map(spanView) })) })),
    };
    case "codegroup": {
      const chosen = block.tabs.find((tab) => tab.label === state.tabs[block.group]) ?? block.tabs[0];

      const tabs = block.tabs.map((tab) => ({ id: tab.id, label: tab.label, key: `${block.group}|${tab.label}`, selected: tab === chosen ? "true" : "false", lang: tab.lang, copyLabel: copy(tab.id), tokens: tab.tokens.map(tokenView) }));

      return { ...empty, id: block.id, kind: block.kind, group: block.group, tabs, panels: tabs.filter((tab) => tab.selected === "true") };
    }
  }
};

export const pageScope = (site: Site, state: AppState): PageScope => {
  const at = site.pages.findIndex((page) => page.id === state.page);
  const page = site.pages[at] ?? missing;
  const link = (target: Page | undefined, arrow: (title: string) => string) => target === undefined ? none : { href: target.path, label: arrow(target.title) };
  const sections: Array<{ id: string; title: string; items: Array<{ id: string; href: string; label: string; current: string }> }> = [];

  for (const entry of site.pages) {
    const id = entry.section === "" ? "top" : entry.section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const section = sections.find((candidate) => candidate.id === id) ?? sections[sections.push({ id, title: entry.section, items: [] }) - 1]!;

    section.items.push({ id: entry.id, href: entry.path, label: entry.title, current: entry.id === state.page ? "page" : "false" });
  }

  return {
    site: site.name,
    home: site.pages[0]?.path ?? "/",
    theme: state.theme,
    menu: state.menu ? "true" : "false",
    sections,
    hasToc: page.outline.length > 0,
    toc: page.outline.map((entry) => ({ id: entry.id, href: `#${entry.anchor}`, label: entry.label, cls: `toc-link toc-level-${entry.level}` })),
    blocks: page.blocks.map((block) => view(block, state)),
    prev: at > 0 ? link(site.pages[at - 1], (title) => `← ${title}`) : none,
    next: at >= 0 ? link(site.pages[at + 1], (title) => `${title} →`) : none,
  };
};
