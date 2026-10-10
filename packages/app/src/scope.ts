// What a layout reads. A MESH scope is flat and typed, so this is the one place that says what exists; `frame` fills it from the content and the current page. The author's own state fields
// are added to it by name (see ./app.ts), so a layout reads `theme` if the application's state has a `theme`.
import { Schema } from "effect";

import type { Block, Content, Page, Span } from "./model.js";

const SpanView = Schema.Struct({ id: Schema.String, kind: Schema.String, text: Schema.String, href: Schema.String });
const ItemView = Schema.Struct({ id: Schema.String, spans: Schema.Array(SpanView) });
const BlockView = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  level: Schema.Number,
  anchor: Schema.String,
  spans: Schema.Array(SpanView),
  items: Schema.Array(ItemView),
  ordered: Schema.Boolean,
  lang: Schema.String,
  text: Schema.String,
  src: Schema.String,
  alt: Schema.String,
});
const Ref = Schema.Struct({ href: Schema.String, label: Schema.String });

export const FrameScope = Schema.Struct({
  /** The application's name (`valance.json`). */
  site: Schema.String,
  /** The address of the first page, under the base. */
  home: Schema.String,
  /** The current page's title, and its description. */
  title: Schema.String,
  description: Schema.String,
  /** False on the page shown for an address that is not a page. */
  found: Schema.Boolean,
  /** Pages grouped by directory. A top-level page is in a group with no title. `current` is `"page"` for the page being shown and `"false"` otherwise (the value of `aria-current`). */
  sections: Schema.Array(Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    items: Schema.Array(Schema.Struct({ id: Schema.String, href: Schema.String, label: Schema.String, current: Schema.String })),
  })),
  /** The `##` and `###` headings of the current page; `hasToc` is false when there are none. */
  hasToc: Schema.Boolean,
  toc: Schema.Array(Schema.Struct({ id: Schema.String, href: Schema.String, label: Schema.String, level: Schema.Number })),
  /** The page's body. Draw it with `<blocks items={blocks} />`, or draw each block yourself. */
  blocks: Schema.Array(BlockView),
  /** Neighbours in navigation order; `href` is empty when there is none. */
  prev: Ref,
  next: Ref,
});

/** The names a layout may read from the framework; an application's own state may not reuse them. */
export const RESERVED: ReadonlyArray<string> = Object.keys(FrameScope.fields);

const NONE = { href: "", label: "" };

const view = (blocks: ReadonlyArray<Block>): typeof FrameScope.Type["blocks"] => blocks;

const withBase = (base: string, path: string): string => `${base}${path.replace(/^\//, "")}`;

export const sectionLabel = (dir: string): string => dir.replace(/[-_]+/g, " ").replace(/^./, (first) => first.toUpperCase());

/** The page shown for an address that is not a page: `content/404.md` if the author wrote one. */
export const notFoundPage = (content: Content): Page => content.notFound ?? {
  path: "/404",
  file: "",
  title: "Page not found",
  description: "",
  order: 0,
  section: "",
  outline: [],
  blocks: [
    { id: "b0", kind: "heading", level: 1, anchor: "page-not-found", spans: [{ id: "b0.0", kind: "text", text: "Page not found", href: "" }] as ReadonlyArray<Span>, items: [], ordered: false, lang: "", text: "", src: "", alt: "" },
    { id: "b1", kind: "paragraph", level: 0, anchor: "", spans: [{ id: "b1.0", kind: "text", text: "There is no page at this address.", href: "" }, { id: "b1.1", kind: "text", text: " ", href: "" }, { id: "b1.2", kind: "link", text: "Go to the start.", href: withBase(content.site.base, "/") }], items: [], ordered: false, lang: "", text: "", src: "", alt: "" },
  ],
};

export const pageAt = (content: Content, path: string): Page | undefined => content.pages.find((page) => page.path === path);

/** The text of the document's `<title>` for a page. */
export const documentTitle = (content: Content, page: Page | undefined): string =>
  page === undefined ? `${notFoundPage(content).title} · ${content.site.name}` : page.path === "/" ? page.title === content.site.name ? page.title : `${page.title} · ${content.site.name}` : `${page.title} · ${content.site.name}`;

export const frame = (content: Content, path: string): typeof FrameScope.Type => {
  const page = pageAt(content, path);
  const shown = page ?? notFoundPage(content);
  const at = page === undefined ? -1 : content.pages.indexOf(page);
  const ref = (to: Page | undefined): typeof NONE => to === undefined ? NONE : { href: withBase(content.site.base, to.path), label: to.title };
  const groups: Array<{ id: string; title: string; items: Array<{ id: string; href: string; label: string; current: string }> }> = [];

  for (const each of content.pages) {
    let group = groups.find((candidate) => candidate.id === each.section);

    if (group === undefined) { group = { id: each.section, title: each.section === "" ? "" : sectionLabel(each.section), items: [] }; groups.push(group); }

    group.items.push({ id: each.path, href: withBase(content.site.base, each.path), label: each.title, current: each.path === path ? "page" : "false" });
  }

  return {
    site: content.site.name,
    home: withBase(content.site.base, "/"),
    title: shown.title,
    description: shown.description,
    found: page !== undefined,
    sections: groups,
    hasToc: shown.outline.length > 0,
    toc: shown.outline.map((heading) => ({ id: heading.id, href: `#${heading.anchor}`, label: heading.label, level: heading.level })),
    blocks: view(shown.blocks),
    prev: ref(content.pages[at - 1]),
    next: ref(at < 0 ? undefined : content.pages[at + 1]),
  };
};
