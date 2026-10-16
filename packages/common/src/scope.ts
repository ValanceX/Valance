// What a layout reads. A MESH scope is flat and typed, so this is the one place that says what exists; `frame` fills it from the content and the current page. The author's own state fields
// are added to it by name (see ./app.ts), so a layout reads `theme` if the application's state has a `theme`.
import { Schema } from "effect";

import type { ColorScheme, TitleParts, Viewport } from "./index.js";
import type { Block, Content, Page, Span } from "./model.js";
import { pageUrl } from "./url.js";

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
  /** The declared route shown (`routes` in `defineApp`), or `""` for a content page and for the not-found page. */
  route: Schema.String,
  /** The address of the first page, under the base. */
  home: Schema.String,
  /** The current page's title, and its description. */
  title: Schema.String,
  description: Schema.String,
  /** False on the page shown for an address that is not a page. */
  found: Schema.Boolean,
  /** Pages grouped by directory. A top-level page is in a group with no title. `current` is `"page"` for the page being shown and `"false"` otherwise (the value of `aria-current`). */
  sections: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      items: Schema.Array(Schema.Struct({ id: Schema.String, href: Schema.String, label: Schema.String, current: Schema.String })),
    }),
  ),
  /** The `##` and `###` headings of the current page; `hasToc` is false when there are none. */
  hasToc: Schema.Boolean,
  toc: Schema.Array(Schema.Struct({ id: Schema.String, href: Schema.String, label: Schema.String, level: Schema.Number })),
  /** How much room the page has: `"compact"`, `"medium"` or `"expanded"` (see `Viewport`). `{#if viewport == "compact"}` chooses a layout for a phone. The server renders `expanded`; the browser corrects it after it starts. */
  viewport: Schema.Literal("compact", "medium", "expanded"),
  /** The colors the person's system asks for: `"light"` or `"dark"`. `theme={theme == "system" ? colorScheme : theme}` lets an application offer "follow the system" beside its own choices. The server renders `light`; the page corrects it after it starts. */
  colorScheme: Schema.Literal("light", "dark"),
  /** Whether there is a page before this one in the trail (`back()` goes to it). `disabled={!canGoBack}` greys a Back button. */
  canGoBack: Schema.Boolean,
  /** Whether there is a page after this one in the trail (`forward()` goes to it), as there is after a `back()`. */
  canGoForward: Schema.Boolean,
  /** The page's body. Draw it with `<blocks items={blocks} />`, or draw each block yourself. */
  blocks: Schema.Array(BlockView),
  /** Neighbours in navigation order; `href` is empty when there is none. */
  prev: Ref,
  next: Ref,
});

/** The names a layout may read from the framework; an application's own state may not reuse them. */
export const RESERVED: ReadonlyArray<string> = Object.keys(FrameScope.fields);

const NONE = { href: "", label: "" };

const view = (blocks: ReadonlyArray<Block>): (typeof FrameScope.Type)["blocks"] => blocks;

const withBase = (content: Content, path: string): string => pageUrl(content.site.base, path, content.site.trailingSlash);

export const sectionLabel = (dir: string): string => dir.replace(/[-_]+/g, " ").replace(/^./, (first) => first.toUpperCase());

/** The page shown for an address that is not a page: `content/404.md` if the author wrote one. */
export const notFoundPage = (content: Content): Page =>
  content.notFound ?? {
    path: "/404",
    file: "",
    title: "Page not found",
    description: "",
    order: 0,
    section: "",
    outline: [],
    blocks: [
      {
        id: "b0",
        kind: "heading",
        level: 1,
        anchor: "page-not-found",
        spans: [{ id: "b0.0", kind: "text", text: "Page not found", href: "" }] as ReadonlyArray<Span>,
        items: [],
        ordered: false,
        lang: "",
        text: "",
        src: "",
        alt: "",
      },
      {
        id: "b1",
        kind: "paragraph",
        level: 0,
        anchor: "",
        spans: [
          { id: "b1.0", kind: "text", text: "There is no page at this address.", href: "" },
          { id: "b1.1", kind: "text", text: " ", href: "" },
          { id: "b1.2", kind: "link", text: "Go to the start.", href: withBase(content, "/") },
        ],
        items: [],
        ordered: false,
        lang: "",
        text: "",
        src: "",
        alt: "",
      },
    ],
  };

export const pageAt = (content: Content, path: string): Page | undefined => content.pages.find((page) => page.path === path);

/**
 * The text of the document's `<title>` for a page: the project's format (`{page} · {site}`) with the parts filled in, and the status first, in parentheses. A page whose title is the site's name
 * (the home page, usually) is that name alone. The author's `title` function may replace the parts; the caller cleans the result (control and direction-override characters out, length limited).
 */
export const documentTitle = (content: Content, page: Page | undefined, parts: TitleParts = {}): string => {
  const shown = parts.page ?? (page === undefined ? notFoundPage(content).title : page.title);
  const app = parts.app ?? content.site.name;
  const body = shown === app ? shown : content.site.title.replaceAll("{page}", shown).replaceAll("{site}", app);

  return parts.status === undefined || parts.status === "" ? body : `(${parts.status}) ${body}`;
};

export const frame = (
  content: Content,
  path: string,
  viewport: Viewport = "expanded",
  colorScheme: ColorScheme = "light",
  trail: { readonly canGoBack: boolean; readonly canGoForward: boolean } = { canGoBack: false, canGoForward: false },
  /** The declared route being shown, when the address is one (`title` is the route's, or `""`). */
  declared?: { readonly name: string; readonly title: string },
): typeof FrameScope.Type => {
  const page = declared === undefined ? pageAt(content, path) : undefined;
  const shown = page ?? notFoundPage(content);
  const at = page === undefined ? -1 : content.pages.indexOf(page);
  const ref = (to: Page | undefined): typeof NONE => (to === undefined ? NONE : { href: withBase(content, to.path), label: to.title });
  const groups: Array<{ id: string; title: string; items: Array<{ id: string; href: string; label: string; current: string }> }> = [];

  for (const each of content.pages) {
    let group = groups.find((candidate) => candidate.id === each.section);

    if (group === undefined) {
      group = { id: each.section, title: each.section === "" ? "" : sectionLabel(each.section), items: [] };
      groups.push(group);
    }

    group.items.push({ id: each.path, href: withBase(content, each.path), label: each.title, current: each.path === path ? "page" : "false" });
  }

  return {
    site: content.site.name,
    viewport,
    colorScheme,
    canGoBack: trail.canGoBack,
    canGoForward: trail.canGoForward,
    home: withBase(content, "/"),
    route: declared?.name ?? "",
    title: declared === undefined ? shown.title : declared.title,
    description: declared === undefined ? shown.description : "",
    found: page !== undefined || declared !== undefined,
    sections: groups,
    hasToc: declared === undefined && shown.outline.length > 0,
    toc: declared === undefined ? shown.outline.map((heading) => ({ id: heading.id, href: `#${heading.anchor}`, label: heading.label, level: heading.level })) : [],
    blocks: declared === undefined ? view(shown.blocks) : [],
    prev: ref(content.pages[at - 1]),
    next: ref(at < 0 ? undefined : content.pages[at + 1]),
  };
};
