// Build time, in Node: the content directory (markdown pages and nav.json) becomes the site's data (../model/site.ts). Nothing here knows the application or how a page is drawn.
// A mistake in the content (a page that does not exist, a heading with no title, an example that is not there, a link to nowhere) fails the build, with the file and the line.
import { readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import type { Page, Site } from "../model/site.js";

import { ContentError, parseMarkdown, plainText } from "./markdown.js";

export { ContentError } from "./markdown.js";

interface Nav {
  readonly site: string;
  /** Where the site is served from: `/` (the default), or a path such as `/docs-site/`. */
  readonly base?: string;
  /** The origin the site is published at, such as `https://example.com`: for the sitemap and absolute canonical URLs. Absent: the site is not published anywhere yet. */
  readonly url?: string;
  readonly sections: ReadonlyArray<{ readonly title: string; readonly pages: ReadonlyArray<string> }>;
}

/** The `---` block at the top of a page: `title:` (required) and `description:`. The rest of the file is the page. */
const frontMatter = (source: string, file: string): { readonly title: string; readonly description: string; readonly body: string; readonly offset: number } => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));

  if (match === null) { throw new ContentError(file, 1, "a page starts with a --- block that has a title"); }

  const fields = new Map([...match[1]!.matchAll(/^([\w-]+):\s*(.+?)\s*$/gm)].map((found) => [found[1]!, found[2]!] as const));
  const title = fields.get("title");

  if (title === undefined) { throw new ContentError(file, 1, "the --- block at the top of a page needs a title: line"); }

  for (const key of fields.keys()) {
    if (key !== "title" && key !== "description") { throw new ContentError(file, 1, `unknown front matter "${key}"; a page has a title and may have a description`); }
  }

  return { title, description: fields.get("description") ?? "", body: match[2]!, offset: match[1]!.split("\n").length + 2 };
};

/** Reads `<dir>/nav.json` and the pages it names (`<dir>/docs/<name>.md`); the order of `nav.json` is the order of the site. Examples are included from `<dir>/../snippets`. */
export const readSite = (dir: string): Site => {
  const root = resolve(dir, "..");
  const snippets = join(root, "snippets");
  const shown = (file: string): string => relative(root, file).split(sep).join("/");
  const nav = JSON.parse(readFileSync(join(dir, "nav.json"), "utf8")) as Nav;
  const where = shown(join(dir, "nav.json"));
  const base = nav.base ?? "/";
  const url = nav.url ?? "";

  if (!/^\/([\w.~-]+\/)*$/.test(base)) { throw new ContentError(where, 1, `base "${base}" must start and end with a slash: "/" or "/docs-site/"`); }

  if (url !== "" && !/^https?:\/\/[^/\s]+$/.test(url)) { throw new ContentError(where, 1, `url "${url}" must be an origin such as https://example.com, with no path and no trailing slash`); }

  const pages: Array<Page> = [];
  const files = new Map<string, string>();

  for (const section of nav.sections) {
    for (const name of section.pages) {
      const file = join(dir, "docs", `${name}.md`);
      let source: string;

      try { source = readFileSync(file, "utf8"); } catch { throw new ContentError(shown(join(dir, "nav.json")), 1, `nav.json names the page "${name}" and ${shown(file)} does not exist`); }

      const { title, description, body, offset } = frontMatter(source, shown(file));
      const id = name.replaceAll("/", "-");
      const include = (path: string): string => {
        const target = resolve(root, path);

        if (!target.startsWith(snippets + sep)) { throw new Error(`file=${path}: an example is included from snippets/`); }

        try { return readFileSync(target, "utf8"); } catch { throw new Error(`file=${path}: there is no such example`); }
      };
      const parsed = parseMarkdown(body, id, { file: shown(file), offset, include });
      const first = parsed.blocks.find((block) => block.kind === "paragraph");

      if (pages.some((page) => page.id === id)) { throw new ContentError(shown(join(dir, "nav.json")), 1, `two pages have the id "${id}" (${name})`); }

      files.set(id, shown(file));
      pages.push({
        id,
        path: `/docs/${name}`,
        title,
        description: description !== "" ? description : first?.kind === "paragraph" ? plainText(first.spans).slice(0, 160) : title,
        section: section.title,
        outline: parsed.outline,
        blocks: parsed.blocks,
      });
    }
  }

  checkLinks(pages, files);

  return { name: nav.site, base, url, pages };
};

/** Every internal link must reach a page, and a `#fragment` must reach a heading on it. A link elsewhere (`https:`, `mailto:`) is not checked; a relative one is refused (pages move). */
const checkLinks = (pages: ReadonlyArray<Page>, files: ReadonlyMap<string, string>): void => {
  const byPath = new Map(pages.map((page) => [page.path, page] as const));
  const problems: Array<string> = [];

  for (const page of pages) {
    const spans = page.blocks.flatMap((block) => {
      switch (block.kind) {
        case "heading": case "paragraph": case "callout": return block.spans;
        case "list": return block.items.flatMap((item) => [...item.spans, ...item.children.flatMap((child) => child.spans)]);
        case "table": return [...block.head, ...block.rows.flatMap((row) => row.cells)].flatMap((cell) => cell.spans);
        default: return [];
      }
    });

    for (const span of spans) {
      if (span.kind !== "link") { continue; }

      const [path, anchor] = span.href.split("#") as [string, string | undefined];
      const target = path === "" ? page : byPath.get(path === "/" || path === "/docs" ? pages[0]!.path : path);
      const where = `${files.get(page.id)}: [${span.text}](${span.href})`;

      if (/^[a-z][a-z0-9+.-]*:/i.test(span.href)) { continue; }

      if (!path.startsWith("/") && path !== "") { problems.push(`${where} is a relative link; link to a page by its path (/docs/...)`); }
      else if (target === undefined) { problems.push(`${where} leads to no page`); }
      else if (anchor !== undefined && !target.blocks.some((block) => block.kind === "heading" && block.anchor === anchor)) { problems.push(`${where} leads to no heading "${anchor}" on ${target.path}`); }
    }
  }

  if (problems.length > 0) { throw new ContentError("content", 0, `${problems.length} broken link${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`); }
};

