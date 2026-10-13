// Build time, in Node: `content/` → the content model. One Markdown file is one page; its path is its address. This is the whole of the content pipeline for an ordinary application:
// discovery, front matter, Markdown, navigation order, and a check of every link and image against the pages and `public/` that exist.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

import type { Config } from "./config.js";
import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic } from "./diagnostics.js";
import type { Content, Page } from "./model.js";
import type { LinkRef } from "./markdown.js";
import { parseMarkdown, plain } from "./markdown.js";

export const CONTENT_DIR = "content";
export const PUBLIC_DIR = "public";

const FRONT_KEYS = ["title", "description", "order"] as const;

interface Front {
  readonly values: Readonly<Record<string, string>>;
  /** Lines the front matter occupies, delimiters included. */
  readonly lines: number;
}

const frontMatter = (source: string, file: string, problems: Array<Diagnostic>): Front & { readonly body: string } => {
  const lines = source.split("\n");

  if (lines[0]?.trim() !== "---") { return { values: {}, lines: 0, body: source }; }

  const end = lines.findIndex((line, at) => at > 0 && line.trim() === "---");

  if (end < 0) { problems.push(diagnostic(file, 1, "front-unclosed", 'the front matter starts with "---" and is never closed')); return { values: {}, lines: 0, body: source }; }

  const values: Record<string, string> = {};

  lines.slice(1, end).forEach((line, at) => {
    if (line.trim() === "" || line.trim().startsWith("#")) { return; }

    const found = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);

    if (found === null) { problems.push(diagnostic(file, at + 2, "front-syntax", `expected "key: value", found "${line.trim()}"`)); return; }

    if (!(FRONT_KEYS as ReadonlyArray<string>).includes(found[1]!)) { problems.push(diagnostic(file, at + 2, "front-unknown", `unknown front matter key "${found[1]}" (known: ${FRONT_KEYS.join(", ")})`)); return; }

    values[found[1]!] = found[2]!.replace(/^(["'])(.*)\1$/, "$2");
  });

  return { values, lines: end + 1, body: lines.slice(end + 1).join("\n") };
};

const filesUnder = (dir: string, prefix = ""): ReadonlyArray<string> =>
  !existsSync(dir) ? [] : readdirSync(dir).sort().flatMap((name) => statSync(join(dir, name)).isDirectory() ? filesUnder(join(dir, name), `${prefix}${name}/`) : [`${prefix}${name}`]);

/** `guide/getting-started.md` → `/guide/getting-started`; `index.md` → `/`; `guide/index.md` → `/guide`. */
export const pathOfFile = (relative: string): string => {
  const without = relative.replace(/\.md$/, "");
  const path = `/${without}`.replace(/\/index$/, "");

  return path === "" ? "/" : path;
};

const titleCase = (value: string): string => value.replace(/[-_]+/g, " ").replace(/^./, (first) => first.toUpperCase());

/** `/a/b#x` → `["/a/b", "x"]`; a trailing slash is not part of the path. */
const splitAddress = (href: string): readonly [string, string] => {
  const hash = href.indexOf("#");
  const path = (hash < 0 ? href : href.slice(0, hash)).replace(/(.)\/$/, "$1");

  return [path, hash < 0 ? "" : href.slice(hash + 1)];
};

/** An address under the site's base: `/guide/x#y` with base `/docs/` is `/docs/guide/x#y`. */
export const underBase = (base: string, address: string): string => `${base}${address.replace(/^\//, "")}`;

export const publicFiles = (root: string): ReadonlySet<string> => new Set(filesUnder(join(root, PUBLIC_DIR)).map((file) => `/${file}`));

/** Reads `content/` under `root`. Every mistake in every file is reported together, not the first only. */
export const readContent = (root: string, config: Config): Content => {
  const problems: Array<Diagnostic> = [];
  const dir = join(root, CONTENT_DIR);

  if (!existsSync(dir)) { throw new AppError([diagnostic(CONTENT_DIR, 0, "content-missing", `there is no ${CONTENT_DIR}/ directory: each Markdown file in it becomes a page`)]); }

  const base = config.web.base;
  const assets = publicFiles(root);
  const raw = new Map<string, { readonly page: Omit<Page, "blocks" | "outline"> & { readonly blocks: Page["blocks"]; readonly outline: Page["outline"] }; readonly links: ReadonlyArray<LinkRef>; readonly anchors: ReadonlySet<string>; readonly front: Front }>();
  let notFound: ReturnType<typeof raw.get>;

  for (const relative of filesUnder(dir)) {
    const file = `${CONTENT_DIR}/${relative}`;

    if (!relative.endsWith(".md")) { problems.push(diagnostic(file, 0, "content-file", "only .md files belong in content/; put other files in public/")); continue; }
    if (!/^[\w.\-/]+$/.test(relative)) { problems.push(diagnostic(file, 0, "content-name", "a file name becomes an address: use letters, digits, - _ and .")); continue; }

    const here: Array<Diagnostic> = [];
    const front = frontMatter(readFileSync(join(dir, relative), "utf8"), file, here);
    let parsed: ReturnType<typeof parseMarkdown> | undefined;

    try {
      parsed = parseMarkdown(front.body, file, front.lines);
    } catch (error) {
      if (error instanceof AppError) { here.push(...error.diagnostics); } else { throw error; }
    }

    problems.push(...here);

    if (parsed === undefined || here.length > 0) { continue; }

    const heading = parsed.blocks.find((block) => block.kind === "heading" && block.level === 1);
    const title = front.values["title"] ?? (heading === undefined ? "" : plain(heading.spans));
    const order = front.values["order"];

    if (title === "") { problems.push(diagnostic(file, 1, "page-title", 'a page needs a title: add "title: …" to its front matter, or start it with a # heading')); continue; }
    if (order !== undefined && !/^-?\d+$/.test(order)) { problems.push(diagnostic(file, 1, "front-order", `"order" must be a whole number, found "${order}"`)); continue; }

    const path = pathOfFile(relative);
    const entry = {
      page: { path, file, title, description: front.values["description"] ?? "", order: order === undefined ? 1000 : Number(order), section: relative.includes("/") ? relative.split("/")[0]! : "", blocks: parsed.blocks, outline: parsed.outline },
      links: parsed.links,
      anchors: parsed.anchors,
      front,
    };

    if (path === "/404") { notFound = entry; continue; }
    if (raw.has(path)) { problems.push(diagnostic(file, 0, "content-duplicate", `${path} is also the address of ${raw.get(path)!.page.file}`)); continue; }

    raw.set(path, entry);
  }

  if (!raw.has("/") && problems.length === 0) { problems.push(diagnostic(CONTENT_DIR, 0, "content-home", "there is no content/index.md: it is the page at the site's address")); }

  // Links and images are checked against what exists, then written under the base.
  type Entry = NonNullable<typeof notFound>;

  const resolve = (entry: Entry, link: LinkRef): string => {
    const from = entry.page.file;
    const href = link.href;
    const bad = (code: string, message: string): string => { problems.push(diagnostic(from, link.line, code, message)); return href; };

    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      return /^(https?:|mailto:)/i.test(href) ? href : bad("link-scheme", `"${href}" is not an address a page may link to (http, https and mailto are)`);
    }

    if (link.image) {
      if (!href.startsWith("/")) { return bad("image-path", `an image address starts with "/" and names a file in ${PUBLIC_DIR}/ (found "${href}")`); }

      return assets.has(href) ? underBase(base, href) : bad("image-missing", `${PUBLIC_DIR}${href} does not exist`);
    }

    // A relative address is relative to the file it is written in, and names another .md file.
    const absolute = href.startsWith("#") || href.startsWith("/") ? href : `${pathOfFile(posix.join(posix.dirname(from.slice(CONTENT_DIR.length + 1)), href.replace(/#.*$/, "")))}${href.includes("#") ? href.slice(href.indexOf("#")) : ""}`;
    const [target, fragment] = absolute.startsWith("#") ? [entry.page.path, absolute.slice(1)] : splitAddress(absolute);
    const page = target === entry.page.path ? entry : raw.get(target);

    if (page === undefined) {
      return assets.has(target) && fragment === "" ? underBase(base, target) : bad("link-broken", `${href} leads to no page (and no file in ${PUBLIC_DIR}/)`);
    }

    if (fragment !== "" && !page.anchors.has(fragment)) {
      return bad("link-fragment", `${page.page.file} has no heading with the address #${fragment} (it has ${[...page.anchors].map((anchor) => `#${anchor}`).join(", ") || "none"})`);
    }

    return underBase(base, target) + (fragment === "" ? "" : `#${fragment}`);
  };

  // The parser recorded the links in document order, and a page's blocks hold them in that same order.
  const rewrite = (entry: Entry): Page => {
    const resolved = entry.links.map((link) => resolve(entry, link));
    let n = 0;
    const take = (): string => resolved[n++]!;
    const spansOf = (spans: Page["blocks"][number]["spans"]): Page["blocks"][number]["spans"] => spans.map((span) => span.kind === "link" ? { ...span, href: take() } : span);

    const blocks = entry.page.blocks.map((block) => ({
      ...block,
      ...(block.kind === "image" ? { src: take() } : {}),
      spans: spansOf(block.spans),
      items: block.items.map((item) => ({ ...item, spans: spansOf(item.spans) })),
    }));

    if (n !== resolved.length) { throw new Error(`internal: ${entry.page.file} has ${resolved.length} links and the model holds ${n}`); }

    return { ...entry.page, blocks };
  };

  const pages = [...raw.values()].map(rewrite);
  const fallback = notFound === undefined ? undefined : rewrite(notFound);

  if (problems.length > 0) { throw new AppError(problems); }

  const ordered = [...pages].sort((a, b) => (a.section === "" ? 0 : 1) - (b.section === "" ? 0 : 1) || a.section.localeCompare(b.section) || a.order - b.order || a.path.localeCompare(b.path));

  return { site: { name: config.name, base: config.web.base, url: config.web.url }, pages: ordered, ...(fallback === undefined ? {} : { notFound: fallback }) };
};

export const sectionTitle = titleCase;
