// The search index: what the build writes and the browser loads. One entry per section of a page (the text under a heading, up to the next of its level or higher), so a result can
// link to the section that matched and not only to the page.
import { Schema } from "effect";

export const SearchEntry = Schema.Struct({
  id: Schema.String,
  /** The language and version of the page it is in: a search finds pages in the reader's own. */
  locale: Schema.String,
  version: Schema.String,
  /** Where the entry is: the page's path, and the section's `#anchor` when it is not the page's start. */
  href: Schema.String,
  /** The page's title, and the section's heading (empty for the start of the page). */
  title: Schema.String,
  section: Schema.String,
  heading: Schema.String,
  /** The section's text, without marks. Code is in it: a reader searches for `renderToHtml`. */
  text: Schema.String,
});
export type SearchEntry = typeof SearchEntry.Type;

export const SearchIndex = Schema.Struct({ entries: Schema.Array(SearchEntry) });
export type SearchIndex = typeof SearchIndex.Type;

/** A search result: an entry, with the part of its text that matched. */
export const Hit = Schema.Struct({ id: Schema.String, href: Schema.String, title: Schema.String, section: Schema.String, heading: Schema.String, excerpt: Schema.String });
export type Hit = typeof Hit.Type;
