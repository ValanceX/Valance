// What the page view reads, as a declaration: the Schemas of the records a template may read (`PageScope`, and the `BlockView` and `UiView` inside it). A MESH scope is flat, so this is
// the one place that says what exists; ./index.ts fills it.
import { Schema } from "effect";

import { defaultUi } from "../../model/ui.js";

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
