// What the page view reads: a function of the state and the site. The view is a template (../views/page.mprx); this is the only place that decides what it is given.
//
// The site's blocks are a union of kinds (../model/site.ts); a MESH scope is flat, so each block is projected to one record that has every field a template may read, empty for the
// kinds that have no use for it. `BlockView` is the one declaration of that shape, and `view` the one function that fills it.
import type { Block, SiteMap, Span, Token } from "../model/site.js";
import type { AppState } from "./state.js";
import type { Ui } from "../model/ui.js";

import { dateIn, defaultUi, say, uiFor } from "../model/ui.js";
import { localesFor, versionsFor } from "./variants.js";
import { hrefOf } from "./routes.js";
import { Schema } from "effect";
import { slug } from "../model/slug.js";

const Link = Schema.Struct({ href: Schema.String, label: Schema.String });
const NavItem = Schema.Struct({
  id: Schema.String,
  href: Schema.String,
  label: Schema.String,
  current: Schema.String,
});
const NavSection = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  items: Schema.Array(NavItem),
});

const SpanView = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  text: Schema.String,
  href: Schema.String,
});
const TokenView = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  cls: Schema.String,
  text: Schema.String,
});
const CellView = Schema.Struct({
  id: Schema.String,
  align: Schema.String,
  spans: Schema.Array(SpanView),
});
const ChildView = Schema.Struct({
  id: Schema.String,
  spans: Schema.Array(SpanView),
});
const ItemView = Schema.Struct({
  id: Schema.String,
  spans: Schema.Array(SpanView),
  /** Whether the item has nested items to draw. */ nested: Schema.Boolean,
  children: Schema.Array(ChildView),
});
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

const TagView = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  href: Schema.String,
});
const PostView = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  href: Schema.String,
  iso: Schema.String,
  date: Schema.String,
  summary: Schema.String,
  hasTags: Schema.Boolean,
  tags: Schema.Array(TagView),
});
const CardView = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  href: Schema.String,
  spans: Schema.Array(SpanView),
});
const ActionView = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  href: Schema.String,
  cls: Schema.String,
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
  /** The words a heading's permalink and a code group's tabs are named by. */
  linkLabel: Schema.String,
  alternatives: Schema.String,
  group: Schema.String,
  spans: Schema.Array(SpanView),
  tokens: Schema.Array(TokenView),
  items: Schema.Array(ItemView),
  head: Schema.Array(CellView),
  rows: Schema.Array(
    Schema.Struct({ id: Schema.String, cells: Schema.Array(CellView) }),
  ),
  tabs: Schema.Array(TabView),
  /** The tabs to draw the code of: the chosen one (a template cannot choose among repeated items). */
  panels: Schema.Array(TabView),
  /** A hero's lead and actions (its headline is `spans`); a card grid's cards; a post list's posts. */
  lead: Schema.Array(SpanView),
  actions: Schema.Array(ActionView),
  cards: Schema.Array(CardView),
  posts: Schema.Array(PostView),
});
export type BlockView = typeof BlockView.Type;

const HitView = Schema.Struct({
  id: Schema.String,
  href: Schema.String,
  title: Schema.String,
  where: Schema.String,
  excerpt: Schema.String,
});

/** The interface's words, one field for each: a template says `{ui.menu}`. */
export const UiView = Schema.Struct(
  Object.fromEntries(
    Object.keys(defaultUi).map((key) => [key, Schema.String]),
  ) as Record<keyof typeof defaultUi, typeof Schema.String>,
);

const Choice = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  href: Schema.String,
  code: Schema.String,
  current: Schema.String,
});
const Post = Schema.Struct({
  show: Schema.Boolean,
  iso: Schema.String,
  date: Schema.String,
  byline: Schema.String,
  hasAuthor: Schema.Boolean,
  hasTags: Schema.Boolean,
  tags: Schema.Array(TagView),
});

export const PageScope = Schema.Struct({
  site: Schema.String,
  /** The interface's words in the page's language. */
  ui: UiView,
  /** The page's language, for `lang`. */
  lang: Schema.String,
  /** How the page is laid out: `doc`, `post`, `landing` or `list`. */
  layout: Schema.String,
  /** Whether the navigation of the collection is shown beside the page (a documentation page). */
  showNav: Schema.Boolean,
  hasHeader: Schema.Boolean,
  header: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      href: Schema.String,
    }),
  ),
  footer: Schema.String,
  hasLocales: Schema.Boolean,
  locales: Schema.Array(Choice),
  hasVersions: Schema.Boolean,
  versions: Schema.Array(Choice),
  /** A post's date, author and tags, above it. */
  post: Post,
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
  toc: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      href: Schema.String,
      label: Schema.String,
      cls: Schema.String,
      current: Schema.String,
    }),
  ),
  blocks: Schema.Array(BlockView),
  /** Whether there is a page before or after, for a page of a collection. */
  hasPager: Schema.Boolean,
  prev: Link,
  next: Link,
});
export type PageScope = typeof PageScope.Type;

const none = { href: "", label: "" };

/** An address inside the site (`/docs/...`) is under the base; an address elsewhere, and a fragment, are as written. */
const insideSite = (base: string, href: string): string =>
  href.startsWith("/") && !href.startsWith("//")
    ? `${base}${href.slice(1)}`
    : href;

const spanView = (base: string) => (span: Span) => ({
  id: span.id,
  kind: span.kind,
  text: span.text,
  href: span.kind === "link" ? insideSite(base, span.href) : "",
});
const tokenView = (token: Token) => ({
  id: token.id,
  kind: token.kind,
  cls: token.kind === "plain" ? "" : `tok-${token.kind}`,
  text: token.text,
});

const empty: BlockView = {
  id: "",
  kind: "",
  level: 0,
  anchor: "",
  hash: "",
  tone: "",
  title: "",
  lang: "",
  src: "",
  alt: "",
  ordered: false,
  copyLabel: "",
  linkLabel: "",
  alternatives: "",
  group: "",
  spans: [],
  tokens: [],
  items: [],
  head: [],
  rows: [],
  tabs: [],
  panels: [],
  lead: [],
  actions: [],
  cards: [],
  posts: [],
};

/** One block, as the record the templates read. The copy label belongs to the state: a block is "Copied" when it is the one last copied. */
const view = (
  block: Block,
  state: AppState,
  base: string,
  ui: Ui,
): BlockView => {
  const spanView_ = spanView(base);
  const copy = (id: string): string =>
    state.copied === id
      ? ui.copied
      : state.copyFailed === id
        ? ui.failed
        : ui.copy;

  switch (block.kind) {
    case "heading":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        linkLabel: ui.linkToSection,
        level: block.level,
        anchor: block.anchor,
        hash: `#${block.anchor}`,
        spans: block.spans.map(spanView_),
      };
    case "paragraph":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        spans: block.spans.map(spanView_),
      };
    case "callout":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        tone: block.tone,
        title: block.title,
        spans: block.spans.map(spanView_),
      };
    case "image":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        src: insideSite(base, block.src),
        alt: block.alt,
      };
    case "code":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        lang: block.lang,
        title: block.title,
        copyLabel: copy(block.id),
        tokens: block.tokens.map(tokenView),
      };
    case "list":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        ordered: block.ordered,
        items: block.items.map((item) => ({
          id: item.id,
          spans: item.spans.map(spanView_),
          nested: item.children.length > 0,
          children: item.children.map((child) => ({
            id: child.id,
            spans: child.spans.map(spanView_),
          })),
        })),
      };
    case "table":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        head: block.head.map((cell) => ({
          id: cell.id,
          align: cell.align,
          spans: cell.spans.map(spanView_),
        })),
        rows: block.rows.map((row) => ({
          id: row.id,
          cells: row.cells.map((cell) => ({
            id: cell.id,
            align: cell.align,
            spans: cell.spans.map(spanView_),
          })),
        })),
      };
    case "hero":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        spans: block.title.map(spanView_),
        lead: block.lead.map(spanView_),
        actions: block.actions.map((action, at) => ({
          id: action.id,
          label: action.label,
          href: insideSite(base, action.href),
          cls: at === 0 ? "action action-primary" : "action action-secondary",
        })),
      };
    case "cards":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        cards: block.cards.map((card) => ({
          id: card.id,
          title: card.title,
          href: insideSite(base, card.href),
          spans: card.spans.map(spanView_),
        })),
      };
    case "postlist":
      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        posts: block.posts.map((post) => ({
          id: post.id,
          title: post.title,
          href: insideSite(base, post.href),
          iso: post.date,
          date: dateIn(ui, post.date),
          summary: post.summary,
          hasTags: post.tags.length > 0,
          tags: post.tags.map((tag) => ({
            id: tag.id,
            label: tag.label,
            href: insideSite(base, tag.href),
          })),
        })),
      };
    case "codegroup": {
      const chosen =
        block.tabs.find((tab) => tab.label === state.tabs[block.group]) ??
        block.tabs[0];

      const tabs = block.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        key: `${block.group}|${tab.label}`,
        selected: tab === chosen ? "true" : "false",
        lang: tab.lang,
        copyLabel: copy(tab.id),
        tokens: tab.tokens.map(tokenView),
      }));

      return {
        ...empty,
        id: block.id,
        kind: block.kind,
        alternatives: ui.alternatives,
        group: block.group,
        tabs,
        panels: tabs.filter((tab) => tab.selected === "true"),
      };
    }
  }
};

/** What the search says, in words: shown to the reader, and announced to a screen reader. */
const statusOf = (
  { query, status, hits }: AppState["search"],
  ui: Ui,
): string => {
  switch (status) {
    case "idle":
      return "";
    case "loading":
      return ui.searching;
    case "failed":
      return ui.searchUnavailable;
    case "ready":
      return hits.length === 0
        ? say(ui.noResults, { query: query.trim() })
        : hits.length === 1
          ? ui.oneResult
          : say(ui.results, { count: hits.length });
  }
};

/** What the page says while its content could not be had: what happened, and the way to try again (the same address, which is the same `go`). */
const failure = (page: string, href: string, ui: Ui): ReadonlyArray<Block> => [
  {
    id: `failed:0:${page}`,
    kind: "heading",
    level: 1,
    anchor: "failed",
    spans: [{ id: `failed:0.0:${page}`, kind: "text", text: ui.couldNotLoad }],
  },
  {
    id: `failed:1:${page}`,
    kind: "paragraph",
    spans: [
      { id: `failed:1.0:${page}`, kind: "text", text: ui.connectionDropped },
      { id: `failed:1.1:${page}`, kind: "link", text: ui.tryAgain, href },
    ],
  },
];

export const pageScope = (map: SiteMap, state: AppState): PageScope => {
  const at = map.pages.findIndex((page) => page.id === state.page);
  const here = map.pages[at];
  const page = state.content;
  const ui = uiFor(map.ui, page.locale);
  const link = (
    target: { readonly path: string; readonly title: string } | undefined,
    arrow: (title: string) => string,
  ) =>
    target === undefined
      ? none
      : { href: hrefOf(map, target.path), label: arrow(target.title) };
  const doc = page.layout === "doc" && here !== undefined;
  // The pages of the collection the reader is in, in its language and version: the navigation, and what comes before and after.
  const siblings =
    here === undefined
      ? []
      : map.pages.filter(
          (entry) =>
            entry.collection === here.collection &&
            entry.locale === here.locale &&
            entry.version === here.version &&
            entry.layout === here.layout,
        );
  const sections: Array<{
    id: string;
    title: string;
    items: Array<{ id: string; href: string; label: string; current: string }>;
  }> = [];

  for (const entry of doc ? siblings : []) {
    const id = entry.section === "" ? "top" : slug(entry.section) || "section";
    const section =
      sections.find((candidate) => candidate.id === id) ??
      sections[sections.push({ id, title: entry.section, items: [] }) - 1]!;

    section.items.push({
      id: entry.id,
      href: hrefOf(map, entry.path),
      label: entry.title,
      current: entry.id === state.page ? "page" : "false",
    });
  }

  const blocks =
    state.status === "failed"
      ? failure(
          state.page,
          here === undefined ? map.base : hrefOf(map, here.path),
          ui,
        )
      : page.blocks;
  // "On this page" is for a page of documentation: a post is a column, a landing page is the width, an index is a list.
  const outline =
    state.status === "failed" || page.layout !== "doc" ? [] : page.outline;
  const place = siblings.findIndex((entry) => entry.id === state.page);
  const choice =
    (kind: string) =>
    (entry: {
      readonly code: string;
      readonly label: string;
      readonly page: { readonly path: string };
      readonly current: boolean;
    }) => ({
      id: `${kind}:${entry.code}`,
      label: entry.label,
      href: hrefOf(map, entry.page.path),
      code: entry.code,
      current: entry.current ? "true" : "false",
    });
  const locales =
    here === undefined ? [] : localesFor(map, here).map(choice("locale"));
  const versions =
    here === undefined ? [] : versionsFor(map, here).map(choice("version"));
  const tags =
    page.layout === "post" && here !== undefined
      ? page.tags.flatMap((tag) => {
          const target = map.pages.find(
            (entry) =>
              entry.slug === `${here.collection}/tags/${slug(tag)}` &&
              entry.locale === here.locale &&
              entry.version === here.version,
          );

          return target === undefined
            ? []
            : [
                {
                  id: `${page.id}:${slug(tag)}`,
                  label: tag,
                  href: hrefOf(map, target.path),
                },
              ];
        })
      : [];
  const home =
    map.pages.find((entry) => entry.locale === page.locale) ?? map.pages[0];

  return {
    site: map.name,
    ui,
    lang: page.locale,
    layout: page.layout,
    showNav: doc,
    hasHeader:
      (map.header[page.locale] ?? map.header[map.defaultLocale] ?? []).length >
      0,
    header: (
      map.header[page.locale] ??
      map.header[map.defaultLocale] ??
      []
    ).map((entry, index) => ({
      id: String(index),
      label: entry.label,
      href: /^[a-z][a-z0-9+.-]*:/i.test(entry.href)
        ? entry.href
        : hrefOf(map, entry.href),
    })),
    footer: map.footer,
    hasLocales: locales.length > 1,
    locales,
    hasVersions: versions.length > 1,
    versions,
    post: {
      show: page.layout === "post",
      iso: page.date,
      date: dateIn(ui, page.date),
      byline: page.author === "" ? "" : `${ui.by} ${page.author}`,
      hasAuthor: page.author !== "",
      hasTags: tags.length > 0,
      tags,
    },
    home: hrefOf(map, home?.path ?? "/"),
    theme: state.theme,
    menu: state.menu ? "true" : "false",
    sections,
    query: state.search.query,
    searching: state.search.status !== "idle",
    status: statusOf(state.search, ui),
    hits: state.search.hits.map((hit) => ({
      id: hit.id,
      href: hrefOf(map, hit.href),
      title: hit.title,
      where: [hit.section, hit.heading]
        .filter((part) => part !== "")
        .join(" › "),
      excerpt: hit.excerpt,
    })),
    loading: state.status === "loading" ? "true" : "false",
    contentStatus: state.status,
    hasToc: outline.length > 0,
    toc: outline.map((entry) => ({
      id: entry.id,
      href: `#${entry.anchor}`,
      label: entry.label,
      cls: `toc-link toc-level-${entry.level}`,
      current: entry.anchor === state.active ? "location" : "false",
    })),
    blocks: blocks.map((block) => view(block, state, map.base, ui)),
    hasPager: place > 0 || (place >= 0 && place < siblings.length - 1),
    prev: place > 0 ? link(siblings[place - 1], (title) => `← ${title}`) : none,
    next:
      place >= 0 && place < siblings.length - 1
        ? link(siblings[place + 1], (title) => `${title} →`)
        : none,
  };
};
