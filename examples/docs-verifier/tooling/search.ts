// Build time, in Node: the site becomes a search index, one entry per section of a page. Nothing here knows how a result is drawn or how the index is loaded.
import type { Block, Site, Span } from "../model/site.js";
import type { SearchEntry, SearchIndex } from "../model/search.js";

const spans = (list: ReadonlyArray<Span>): string => list.map((span) => span.text).join("");

/** The words of a block, without marks. */
const textOf = (block: Block): string => {
  switch (block.kind) {
    case "heading": case "paragraph": case "callout": return spans(block.spans);
    case "list": return block.items.flatMap((item) => [spans(item.spans), ...item.children.map((child) => spans(child.spans))]).join(" ");
    case "table": return [...block.head, ...block.rows.flatMap((row) => row.cells)].map((cell) => spans(cell.spans)).join(" ");
    case "code": return block.text;
    case "codegroup": return block.tabs.map((tab) => tab.text).join(" ");
    case "image": return block.alt;
  }
};

export const buildSearchIndex = (site: Site): SearchIndex => {
  const entries: Array<SearchEntry> = [];

  for (const page of site.pages) {
    let current: { heading: string; anchor: string; level: number; words: Array<string> } = { heading: "", anchor: "", level: 1, words: [] };
    const close = (): void => {
      const text = current.words.join(" ").replace(/\s+/g, " ").trim();

      if (text !== "") {
        entries.push({ id: `${page.id}#${current.anchor}`, href: current.anchor === "" ? page.path : `${page.path}#${current.anchor}`, title: page.title, section: page.section, heading: current.heading, text });
      }
    };

    for (const block of page.blocks) {
      // The title is the page's own; a section starts at each heading below it.
      if (block.kind === "heading" && block.level > 1) {
        close();
        current = { heading: spans(block.spans), anchor: block.anchor, level: block.level, words: [] };
      } else if (!(block.kind === "heading" && block.level === 1)) {
        current.words.push(textOf(block));
      }
    }

    close();
  }

  return { entries };
};
