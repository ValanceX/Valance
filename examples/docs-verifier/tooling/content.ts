// Build time, in Node: the content directory (markdown pages and nav.json) becomes the site's data (../model/site.ts). Nothing here knows the application or how a page is drawn.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page, Site } from "../model/site.js";

import { parseMarkdown } from "./markdown.js";

interface Nav {
  readonly site: string;
  readonly sections: ReadonlyArray<{ readonly title: string; readonly pages: ReadonlyArray<string> }>;
}

/** `title: Text` from a leading `---` block; the rest is the page body. */
const frontMatter = (source: string): { readonly title: string; readonly body: string } => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));
  const title = match === null ? undefined : /^title:\s*(.+)$/m.exec(match[1]!)?.[1]?.trim();

  if (match === null || title === undefined) { throw new Error("a page starts with a --- block that has a title"); }

  return { title, body: match[2]! };
};

/** Reads `<dir>/nav.json` and the pages it names (`<dir>/docs/<name>.md`); the order of `nav.json` is the order of the site. */
export const readSite = (dir: string): Site => {
  const nav = JSON.parse(readFileSync(join(dir, "nav.json"), "utf8")) as Nav;
  const pages: Array<Page> = [];

  for (const section of nav.sections) {
    for (const name of section.pages) {
      const { title, body } = frontMatter(readFileSync(join(dir, "docs", `${name}.md`), "utf8"));
      const id = name.replaceAll("/", "-");

      pages.push({ id, path: `/docs/${name}`, title, section: section.title, blocks: parseMarkdown(body, id) });
    }
  }

  const ids = new Set(pages.map((page) => page.id));

  if (ids.size !== pages.length) { throw new Error("two pages have the same id"); }

  return { name: nav.site, pages };
};
