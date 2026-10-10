// Searching the index: pure functions of the index and a query. The index arrives as data (the platform loads it), so this runs the same in a test, on a server and in a browser.
import type { Hit, SearchEntry, SearchIndex } from "../model/search.js";

/** The words of a query: lower case, split on anything that is not a letter or a digit. */
export const wordsOf = (query: string): ReadonlyArray<string> => query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "");

const MAX_HITS = 8;
const EXCERPT = 70;

/** How well `entry` answers `words`: every word must be at the start of a word somewhere in the entry (or the entry does not answer), and a title or a heading counts for more than text. */
const score = (entry: SearchEntry, words: ReadonlyArray<string>): number => {
  const fields = { title: entry.title.toLowerCase(), heading: entry.heading.toLowerCase(), text: entry.text.toLowerCase() };
  let total = 0;

  for (const word of words) {
    const at = (field: string): number => field.search(new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"));
    const inTitle = at(fields.title) >= 0;
    const inHeading = at(fields.heading) >= 0;
    const inText = at(fields.text) >= 0;

    if (!inTitle && !inHeading && !inText) { return 0; }

    total += (inTitle ? 8 : 0) + (inHeading ? 5 : 0) + (inText ? 1 + Math.min(3, fields.text.split(word).length - 1) * 0.25 : 0);
  }

  // A query that is the page's title is asking for that page: its start comes first. Otherwise a page's start is worth a little more than a section deep in it.
  return total + (entry.heading === "" ? (fields.title === words.join(" ") ? 20 : 0.5) : 0);
};

/** About `word` in `text`: the words around its first appearance, with an ellipsis where the text goes on. */
const excerptOf = (text: string, words: ReadonlyArray<string>): string => {
  const lower = text.toLowerCase();
  const found = words.map((word) => lower.search(new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"))).filter((at) => at >= 0).sort((a, b) => a - b)[0] ?? 0;
  const from = Math.max(0, found - EXCERPT / 2);
  const to = Math.min(text.length, from + EXCERPT * 2);

  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
};

/** The entries that answer `query`, best first, at most eight; in the reader's language and version when `within` says which. An empty query answers nothing. */
export const search = (index: SearchIndex, query: string, within?: { readonly locale: string; readonly version: string }): ReadonlyArray<Hit> => {
  const words = wordsOf(query);

  if (words.length === 0) { return []; }

  return index.entries
    .filter((entry) => within === undefined || (entry.locale === within.locale && (entry.version === within.version || entry.version === "")))
    .map((entry, at) => ({ entry, at, score: score(entry, words) }))
    .filter(({ score: value }) => value > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_HITS)
    .map(({ entry }) => ({ id: entry.id, href: entry.href, title: entry.title, section: entry.section, heading: entry.heading, excerpt: excerptOf(entry.text, words) }));
};
