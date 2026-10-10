// Build time, in Node: a site's directory (`site.json`, its `content/` and its `snippets/`) becomes the site's data (../model/site.ts). Nothing here knows the application or how a
// page is drawn. A mistake in the content (a page that does not exist, a heading with no title, an example that is not there, a link to nowhere) fails the build, with the file and
// the line.
//
// A site is collections of pages. A collection is a directory of markdown with a layout and a path: `docs` (pages in an order the site gives, in sections), `posts` (pages found in the
// directory, newest first, with an index and a page for each tag), `pages` (a landing page). A collection may have versions (a directory for each) and the site may have languages (a
// file for each, `name.fr.md` beside `name.md`). Each page of each language and version is a page of the site, at its own address, and the same slug in another language or version is the
// same page, translated or older.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import type { Block, Layout, Locale, Page, Site, Span, Version } from "../model/site.js";
import type { Ui } from "../model/ui.js";
import { say, uiFor } from "../model/ui.js";

import { slug } from "../model/slug.js";

import { ContentError, parseMarkdown, plainText } from "./markdown.js";

export { ContentError } from "./markdown.js";

interface CollectionConfig {
  readonly name: string;
  readonly dir: string;
  /** Where its pages are: `/docs`, `/blog`; empty for a landing page at the site's root. */
  readonly path: string;
  readonly layout: Layout;
  /** Pages in this order, in sections; `titles` are the section's title in other languages. Absent: every file in the directory. */
  readonly sections?: ReadonlyArray<{ readonly title: string; readonly titles?: Readonly<Record<string, string>>; readonly pages: ReadonlyArray<string> }>;
  /** Versions, newest first: a directory each. The first is served without a prefix. */
  readonly versions?: ReadonlyArray<string | { readonly code: string; readonly label?: string }>;
  /** An index of the collection's pages, and a page for each tag. */
  readonly list?: { readonly title: string; readonly description?: string; readonly tags?: boolean };
  /** A feed of the collection's newest pages (`feed.xml`). */
  readonly feed?: boolean;
}

interface SiteConfig {
  readonly name: string;
  /** Where the site is served from: `/` (the default), or a path such as `/docs-site/`. */
  readonly base?: string;
  /** The origin the site is published at, such as `https://example.com`: for the sitemap and absolute canonical URLs. Absent: the site is not published anywhere yet. */
  readonly url?: string;
  readonly header?: ReadonlyArray<{ readonly label: string; readonly href: string; readonly labels?: Readonly<Record<string, string>> }>;
  readonly footer?: string;
  readonly defaultLocale?: string;
  readonly locales?: ReadonlyArray<{ readonly code: string; readonly name: string; readonly ui?: Readonly<Record<string, string>> }>;
  readonly collections: ReadonlyArray<CollectionConfig>;
}

const LAYOUTS: ReadonlyArray<Layout> = ["doc", "post", "landing", "list"];
const KEYS = new Set(["title", "description", "date", "author", "tags", "layout"]);

interface Front {
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly author: string;
  readonly tags: ReadonlyArray<string>;
  readonly layout: Layout | undefined;
  readonly body: string;
  readonly offset: number;
}

/** The `---` block at the top of a page: `title:` (required), and `description:`, `date:`, `author:`, `tags:` (comma separated) and `layout:`. The rest of the file is the page. */
const frontMatter = (source: string, file: string): Front => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));

  if (match === null) { throw new ContentError(file, 1, "a page starts with a --- block that has a title"); }

  const fields = new Map([...match[1]!.matchAll(/^([\w-]+):\s*(.+?)\s*$/gm)].map((found) => [found[1]!, found[2]!] as const));
  const title = fields.get("title");

  if (title === undefined) { throw new ContentError(file, 1, "the --- block at the top of a page needs a title: line"); }

  for (const key of fields.keys()) {
    if (!KEYS.has(key)) { throw new ContentError(file, 1, `unknown front matter "${key}"; a page has ${[...KEYS].join(", ")}`); }
  }

  const date = fields.get("date") ?? "";
  const layout = fields.get("layout");

  if (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { throw new ContentError(file, 1, `date "${date}" must be a day, such as 2026-03-12`); }

  if (layout !== undefined && !LAYOUTS.includes(layout as Layout)) { throw new ContentError(file, 1, `unknown layout "${layout}"; the layouts are ${LAYOUTS.join(", ")}`); }

  return {
    title,
    description: fields.get("description") ?? "",
    date,
    author: fields.get("author") ?? "",
    tags: (fields.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter((tag) => tag !== ""),
    layout: layout as Layout | undefined,
    body: match[2]!,
    offset: match[1]!.split("\n").length + 2,
  };
};

/** The files of a directory, recursively, as names without the extension and the language: `guides/state` for `guides/state.md` and `guides/state.fr.md`. */
const namesIn = (dir: string, locales: ReadonlySet<string>): ReadonlyArray<string> => {
  const names = new Set<string>();

  for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".md")) { continue; }

    const bare = file.slice(0, -3).split(sep).join("/");
    const dot = bare.lastIndexOf(".");

    names.add(dot > bare.lastIndexOf("/") && locales.has(bare.slice(dot + 1)) ? bare.slice(0, dot) : bare);
  }

  return [...names].sort();
};

const slugTag = (tag: string): string => slug(tag) || "tag";

const mapSpans = (block: Block, fn: (span: Span) => Span): Block => {
  switch (block.kind) {
    case "heading": case "paragraph": case "callout": return { ...block, spans: block.spans.map(fn) };
    case "list": return { ...block, items: block.items.map((item) => ({ ...item, spans: item.spans.map(fn), children: item.children.map((child) => ({ ...child, spans: child.spans.map(fn) })) })) };
    case "table": return { ...block, head: block.head.map((cell) => ({ ...cell, spans: cell.spans.map(fn) })), rows: block.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, spans: cell.spans.map(fn) })) })) };
    case "hero": return { ...block, title: block.title.map(fn), lead: block.lead.map(fn) };
    case "cards": return { ...block, cards: block.cards.map((card) => ({ ...card, spans: card.spans.map(fn) })) };
    default: return block;
  }
};

/** The block with every address it links to changed by `change(href, text)`: the links of its spans, a hero's actions, a card's title. */
const rewriteLinks = (block: Block, change: (href: string, text: string) => string): Block => {
  const spans = mapSpans(block, (span) => span.kind === "link" ? { ...span, href: change(span.href, span.text) } : span);

  if (spans.kind === "hero") { return { ...spans, actions: spans.actions.map((action) => ({ ...action, href: change(action.href, action.label) })) }; }

  if (spans.kind === "cards") { return { ...spans, cards: spans.cards.map((card) => ({ ...card, href: change(card.href, card.title) })) }; }

  return spans;
};

/** One language and version of one collection: where its pages are, and the pages. */
interface Variant {
  readonly collection: CollectionConfig;
  readonly locale: string;
  readonly version: string;
  readonly latest: boolean;
  /** `/fr`, `/v1`, `/fr/v1` or empty: in front of the collection's path. */
  readonly prefix: string;
  readonly pages: Array<Page>;
}

const idOf = (address: string): string => address.slice(1).replaceAll("/", "-") || "home";

/** A generated page of a collection that lists its posts: the index, the tags, a tag. Its blocks are made here, in the page's language. */
const generated = (variant: Variant, address: string, slugOf: string, title: string, description: string, blocks: (id: string) => ReadonlyArray<Block>, ui: Ui): Page => {
  const id = idOf(address);
  const heading: Block = { id: `${id}:0`, kind: "heading", level: 1, anchor: slug(title) || "page", spans: [{ id: `${id}:0.0`, kind: "text", text: title }] };

  void ui;

  return {
    id, path: address, title, description, section: "", layout: "list", collection: variant.collection.name, slug: slugOf, locale: variant.locale, version: variant.version, date: "", tags: [],
    author: "", outline: [], blocks: [heading, ...blocks(id)],
  };
};

/** The index of a collection's posts, a page of its tags, and a page for each tag. */
const listPages = (variant: Variant, members: ReadonlyArray<Page>, ui: Ui): ReadonlyArray<Page> => {
  const { collection, prefix } = variant;
  const list = collection.list!;
  const root = `${prefix}${collection.path}`;
  const postsOf = (of: ReadonlyArray<Page>, id: string): Block => ({
    id: `${id}:1`,
    kind: "postlist",
    posts: of.map((post) => ({
      id: post.id,
      title: post.title,
      href: post.path,
      date: post.date,
      summary: post.description,
      tags: post.tags.map((tag) => ({ id: `${post.id}:${slugTag(tag)}`, label: tag, href: `${root}/tags/${slugTag(tag)}` })),
    })),
  });
  const tags = [...new Set(members.flatMap((post) => post.tags))].sort((a, b) => a.localeCompare(b));
  const index = generated(variant, root || "/", `${collection.name}/index`, list.title, list.description ?? list.title, (id) => [postsOf(members, id)], ui);

  if (list.tags !== true) { return [index]; }

  const cards = (id: string): Block => ({
    id: `${id}:1`,
    kind: "cards",
    cards: tags.map((tag) => ({
      id: `${id}:${slugTag(tag)}`,
      title: tag,
      href: `${root}/tags/${slugTag(tag)}`,
      spans: [{ id: `${id}:${slugTag(tag)}.0`, kind: "text", text: say(ui.postsCount, { count: members.filter((post) => post.tags.includes(tag)).length }) }],
    })),
  });

  return [
    index,
    generated(variant, `${root}/tags`, `${collection.name}/tags`, ui.allTags, ui.tagsIntro, (id) => [cards(id)], ui),
    ...tags.map((tag) => generated(variant, `${root}/tags/${slugTag(tag)}`, `${collection.name}/tags/${slugTag(tag)}`, say(ui.taggedWith, { tag }), say(ui.taggedWith, { tag }), (id) => [postsOf(members.filter((post) => post.tags.includes(tag)), id)], ui)),
  ];
};

export const readSite = (siteDir: string): Site => {
  const dir = resolve(siteDir);
  const shown = (file: string): string => relative(dir, file).split(sep).join("/");
  const configFile = join(dir, "site.json");
  const where = shown(configFile);
  const config = JSON.parse(readFileSync(configFile, "utf8")) as SiteConfig;
  const base = config.base ?? "/";
  const url = config.url ?? "";
  const defaultLocale = config.defaultLocale ?? "en";
  const locales: ReadonlyArray<Locale> = config.locales === undefined ? [{ code: defaultLocale, name: defaultLocale }] : config.locales.map(({ code, name }) => ({ code, name }));
  const ui = Object.fromEntries((config.locales ?? []).filter((locale) => locale.ui !== undefined).map((locale) => [locale.code, locale.ui!]));

  if (!/^\/([\w.~-]+\/)*$/.test(base)) { throw new ContentError(where, 1, `base "${base}" must start and end with a slash: "/" or "/docs-site/"`); }

  if (url !== "" && !/^https?:\/\/[^/\s]+$/.test(url)) { throw new ContentError(where, 1, `url "${url}" must be an origin such as https://example.com, with no path and no trailing slash`); }

  if (!locales.some((locale) => locale.code === defaultLocale)) { throw new ContentError(where, 1, `the default locale "${defaultLocale}" is not among the locales`); }

  const localeCodes = new Set(locales.map((locale) => locale.code));
  const include = (path: string): string => {
    const snippets = join(dir, "snippets");
    const target = resolve(dir, path);

    if (!target.startsWith(snippets + sep)) { throw new Error(`file=${path}: an example is included from snippets/`); }

    try { return readFileSync(target, "utf8"); } catch { throw new Error(`file=${path}: there is no such example`); }
  };

  const versions: Array<Version> = [];
  const variants: Array<Variant> = [];
  const files = new Map<string, string>();
  const taken = new Set<string>();

  for (const collection of config.collections) {
    const root = join(dir, "content", collection.dir);
    const codes = (collection.versions ?? [""]).map((version) => typeof version === "string" ? { code: version, label: version } : { code: version.code, label: version.label ?? version.code });

    for (const [position, version] of codes.entries()) {
      if (version.code !== "" && !versions.some((known) => known.code === version.code)) { versions.push({ code: version.code, label: version.label, latest: position === 0 }); }

      const latest = position === 0;
      const directory = version.code === "" ? root : join(root, version.code);
      const named = collection.sections?.flatMap((section) => section.pages.map((name) => ({ name, section })));
      let names: ReadonlyArray<{ readonly name: string; readonly section: { readonly title: string; readonly titles?: Readonly<Record<string, string>> } | undefined }>;

      try {
        names = named ?? namesIn(directory, localeCodes).map((name) => ({ name, section: undefined }));
      } catch {
        throw new ContentError(where, 1, `the collection "${collection.name}" needs ${shown(directory)} and it does not exist`);
      }

      for (const locale of locales) {
        const prefix = `${locale.code === defaultLocale ? "" : `/${locale.code}`}${latest || version.code === "" ? "" : `/${version.code}`}`;
        const variant: Variant = { collection, locale: locale.code, version: version.code, latest, prefix, pages: [] };

        for (const { name, section } of names) {
          const file = join(directory, `${name}${locale.code === defaultLocale ? "" : `.${locale.code}`}.md`);
          let source: string;

          try {
            source = readFileSync(file, "utf8");
          } catch {
            // Every page must exist in the default language; another language need not have it.
            if (locale.code === defaultLocale) { throw new ContentError(where, 1, `site.json names the page "${name}" of "${collection.name}" and ${shown(file)} does not exist`); }

            continue;
          }

          const front = frontMatter(source, shown(file));
          const address = name === "index" ? `${prefix}${collection.path}` || "/" : `${prefix}${collection.path}/${name}`;
          const layout = front.layout ?? collection.layout;
          const id = idOf(address);

          if (layout === "post" && front.date === "") { throw new ContentError(shown(file), 1, "a post needs a date: line, such as date: 2026-03-12"); }

          if (taken.has(id)) { throw new ContentError(where, 1, `two pages have the id "${id}" (${address})`); }

          taken.add(id);

          const parsed = parseMarkdown(front.body, id, { file: shown(file), offset: front.offset, include });
          const first = parsed.blocks.find((block) => block.kind === "paragraph");

          files.set(id, shown(file));
          variant.pages.push({
            id,
            path: address,
            title: front.title,
            description: front.description !== "" ? front.description : first?.kind === "paragraph" ? plainText(first.spans).slice(0, 160) : front.title,
            section: section === undefined ? "" : section.titles?.[locale.code] ?? section.title,
            layout,
            collection: collection.name,
            slug: `${collection.name}/${name}`,
            locale: locale.code,
            version: version.code,
            date: front.date,
            tags: front.tags,
            author: front.author,
            outline: parsed.outline,
            blocks: parsed.blocks,
          });
        }

        if (variant.pages.length > 0) { variants.push(variant); }
      }
    }
  }

  // A collection's pages in the order it keeps them (posts: newest first), with the pages it generates (an index, the tags) in front of them.
  const ordered: Array<Page> = [];

  for (const variant of variants) {
    const members = variant.collection.layout === "post" ? [...variant.pages].sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path)) : variant.pages;
    const extra = variant.collection.list === undefined ? [] : listPages(variant, members.filter((page) => page.layout === "post"), uiFor(ui, variant.locale));

    for (const page of extra) {
      if (taken.has(page.id)) { throw new ContentError(where, 1, `a generated page has the id "${page.id}" that a page of the site already has (${page.path})`); }

      taken.add(page.id);
    }

    ordered.push(...extra, ...members);
  }

  const prefixes = new Map(variants.flatMap((variant) => variant.pages.map((page) => [page.id, variant.prefix] as const)));
  const pages = resolveLinks(ordered, prefixes, defaultLocale, versions, files, config.collections);
  const header = Object.fromEntries(locales.map((locale) => [locale.code, (config.header ?? []).map((link) => ({ label: link.labels?.[locale.code] ?? link.label, href: link.href }))]));

  return { name: config.name, base, url, header, footer: config.footer ?? "", defaultLocale, locales, versions, ui, roots: rootsOf(pages, locales, defaultLocale, versions, config.collections), feeds: config.collections.filter((collection) => collection.feed === true).map((collection) => collection.name), pages };
};

/** The addresses that are not pages and lead somewhere: `/` and a collection's own path, in each language and version, to the first page there. */
const rootsOf = (pages: ReadonlyArray<Page>, locales: ReadonlyArray<Locale>, defaultLocale: string, versions: ReadonlyArray<Version>, collections: ReadonlyArray<CollectionConfig>): ReadonlyArray<{ path: string; page: string }> => {
  const roots: Array<{ path: string; page: string }> = [];
  const taken = new Set(pages.map((page) => page.path));

  for (const locale of locales) {
    for (const version of versions.length === 0 ? [undefined] : versions) {
      const prefix = `${locale.code === defaultLocale ? "" : `/${locale.code}`}${version === undefined || version.latest ? "" : `/${version.code}`}`;
      const here = pages.filter((page) => page.locale === locale.code && (version === undefined || page.version === "" || page.version === version.code));

      for (const collectionPath of new Set(["", ...collections.map((collection) => collection.path)])) {
        const address = `${prefix}${collectionPath}` || "/";
        const target = here.find((page) => collectionPath === "" || page.path.startsWith(`${prefix}${collectionPath}/`));

        if (!taken.has(address) && target !== undefined && !roots.some((root) => root.path === address)) { roots.push({ path: address, page: target.id }); }
      }
    }
  }

  return roots;
};

/**
 * Every internal link in the content, resolved: authors write the address of a page without its language and version (`/docs/guides/state`), and the link goes to the page in the
 * language and version of the page it is in, or, if that one is not there, the nearest that is (its language in the newest version, the default language in its version, the default
 * language in the newest). A link to no page, or to a heading that is not on the page it reaches, is a broken link: all of them are reported at once.
 */
const resolveLinks = (
  pages: ReadonlyArray<Page>,
  prefixes: ReadonlyMap<string, string>,
  defaultLocale: string,
  versions: ReadonlyArray<Version>,
  files: ReadonlyMap<string, string>,
  collections: ReadonlyArray<CollectionConfig>,
): ReadonlyArray<Page> => {
  const bare = (page: Page): string => page.path.slice((prefixes.get(page.id) ?? "").length) || "/";
  const index = new Map(pages.filter((page) => prefixes.has(page.id)).map((page) => [`${page.locale}|${page.version}|${bare(page)}`, page] as const));
  const latest = versions.find((version) => version.latest)?.code ?? "";
  const problems: Array<string> = [];

  const resolveFor = (from: Page) => (given: string, text: string): string => {
    // `latest:/docs/x` is the page in the newest version, wherever the link is written: how an older version points at the current one.
    const newest = given.startsWith("latest:");
    const href = newest ? given.slice("latest:".length) : given;

    if ((!newest && /^[a-z][a-z0-9+.-]*:/i.test(href)) || href.startsWith("//") || href === "") { return href; }

    const where = `${files.get(from.id)}: [${text}](${href})`;

    if (!href.startsWith("/") && !href.startsWith("#")) { problems.push(`${where} is a relative link; link to a page by its path (/docs/...)`); return href; }

    const [path, anchor] = href.split("#") as [string, string | undefined];
    // The page in the reader's language and version, or the nearest; failing that, a page whose own address this is (a link to a particular version: /v1/docs/...).
    const target = path === "" ? from : (newest ? [latest, ""] : [from.version, "", latest])
      .flatMap((version) => [from.locale, defaultLocale].map((locale) => index.get(`${locale}|${version}|${path}`)))
      .find((candidate) => candidate !== undefined) ?? pages.find((candidate) => candidate.path === path);

    if (target === undefined) {
      // The site's root and a collection's own path are addresses with no page: they are roots, and lead to their first page.
      if (path === "/" || collections.some((collection) => collection.path === path)) { return `${prefixes.get(from.id) ?? ""}${path === "/" ? "" : path}` || "/"; }

      problems.push(`${where} leads to no page`);

      return href;
    }

    if (anchor !== undefined && !target.blocks.some((block) => block.kind === "heading" && block.anchor === anchor)) {
      problems.push(`${where} leads to no heading "${anchor}" on ${target.path}`);

      return href;
    }

    return `${target.path}${anchor === undefined ? "" : `#${anchor}`}`;
  };

  const resolved = pages.map((page) => (files.has(page.id) ? { ...page, blocks: page.blocks.map((block) => rewriteLinks(block, resolveFor(page))) } : page));

  if (problems.length > 0) { throw new ContentError("content", 0, `${problems.length} broken link${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`); }

  return resolved;
};
