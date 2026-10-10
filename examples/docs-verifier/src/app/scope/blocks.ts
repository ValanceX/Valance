// The page's blocks as the records the templates read. The site's blocks are a union of kinds (../../model/site.ts); a scope is flat, so each block is projected to one `BlockView`
// that has every field a template may read, empty for the kinds that have no use for it. `blockView` is the one function that fills it.
import type { Block, Span, Token } from "../../model/site.js";
import { dateIn, type Ui } from "../../model/ui.js";
import type { AppState } from "../state.js";

import type { BlockView } from "./contract.js";

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
export const blockView = (
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


/** What the page says while its content could not be had: what happened, and the way to try again (the same address, which is the same `go`). */
export const failure = (page: string, href: string, ui: Ui): ReadonlyArray<Block> => [
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

