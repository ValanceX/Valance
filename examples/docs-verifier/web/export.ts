// The static site generator (the stand-in for the external in ../EXTERNALS.md, X3): the application's routes say which pages there are, each is rendered once with `renderToHtml` (the
// same `renderDocument` a server uses, so the documents are the same bytes), and the files are written beside the built assets. Nothing here knows what a page is: it asks the routes.
//
//   <base>docs/guides/state/index.html   the document        .../index.json   the page's content, which the browser fetches when the reader goes there
//   <base>index.html, docs/index.html    the addresses that lead to a page without being one (the root, a collection's path); each page's canonical address is its own
//   feed.xml                              an Atom feed of the newest posts, for a site with a feed collection that says where it is published
//   404.html                             the application's not-found page (a static host serves it, with a 404, for an address it has no file for)
//   sitemap.xml, robots.txt              when the site says where it is published (`url` in content/nav.json); robots.txt always
import { staticPaths } from "@valancex/valance/web/plugin";
import type { Delivery } from "@valancex/valance/web/plugin";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { contentOf } from "../app/content.js";
import { contentFile, routes } from "../app/routes.js";
import type { Site } from "../model/site.js";
import { mapOf } from "../model/site.js";

import type { Built } from "./built.js";
import { renderDocument } from "./document.js";

export interface Exported {
  /** Every file written, relative to the output directory. */
  readonly files: ReadonlyArray<string>;
  /** The pages (documents with content) written, by their address. */
  readonly pages: ReadonlyArray<string>;
}

const escapeXml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The file a document at `address` is written to: a directory's index. */
const indexOf = (base: string, address: string): string => `${address.slice(base.length).replace(/\/+$/, "")}/index.html`.replace(/^\//, "");

export interface ExportOptions {
  /** How an address is delivered (the route table's `delivery`): an address delivered `server` is left to a server (./serve.ts, `serveSsr`) and written as no file. Absent: all static. */
  readonly delivery?: (address: string) => Delivery;
}

/** An Atom feed of the newest pages of the site's feed collections, in the default language and the newest version. */
const feedOf = (site: Site): string => {
  const newest = site.pages
    .filter((page) => site.feeds.includes(page.collection) && page.layout === "post" && page.locale === site.defaultLocale && (page.version === "" || site.versions.find((version) => version.latest)?.code === page.version))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);
  const address = (path: string): string => `${site.url}${site.base}${path.replace(/^\//, "")}`;
  const entries = newest.map((page) => `  <entry>
    <title>${escapeXml(page.title)}</title>
    <link href="${escapeXml(address(page.path))}"/>
    <id>${escapeXml(address(page.path))}</id>
    <updated>${page.date}T00:00:00Z</updated>
${page.author === "" ? "" : `    <author><name>${escapeXml(page.author)}</name></author>\n`}    <summary>${escapeXml(page.description)}</summary>
  </entry>`);

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(site.name)}</title>
  <link href="${escapeXml(address("feed.xml"))}" rel="self"/>
  <link href="${escapeXml(`${site.url}${site.base}`)}"/>
  <id>${escapeXml(`${site.url}${site.base}`)}</id>
  <updated>${newest[0]?.date ?? "1970-01-01"}T00:00:00Z</updated>
${entries.join("\n")}
</feed>
`;
};

export const exportSite = async (site: Site, dir: string, built: Built, options: ExportOptions = {}): Promise<Exported> => {
  const map = mapOf(site);
  const table = routes(map);
  const files: Array<string> = [];
  const write = async (name: string, body: string): Promise<void> => {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), body);
    files.push(name);
  };
  const addresses = staticPaths({ ...table, ...(options.delivery === undefined ? {} : { delivery: options.delivery }) });

  for (const address of addresses) {
    await write(indexOf(site.base, address), await renderDocument(site, address, built));
  }

  // A page's content is a file whether its document is one or not: a page delivered by a server is navigated to in the browser all the same.
  for (const page of site.pages) {
    await write(contentFile(page.path), JSON.stringify(contentOf(site, page.id)));
  }

  // The addresses that lead to a page without being its own (the site's root, a collection's path, in each language and version): documents too, with the page's canonical address.
  for (const address of table.aliases()) {
    await write(indexOf(site.base, address), await renderDocument(site, address, built));
  }

  await write("404.html", await renderDocument(site, `${site.base}this-page-does-not-exist`, built));

  const origin = site.url;

  await write("robots.txt", `User-agent: *\nAllow: /\n${origin === "" ? "" : `Sitemap: ${origin}${site.base}sitemap.xml\n`}`);

  if (origin !== "") {
    await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${addresses.map((address) => `  <url><loc>${escapeXml(`${origin}${address}`)}</loc></url>`).join("\n")}\n</urlset>\n`);
  }

  // A feed needs absolute addresses, so a site that is not published anywhere has none (and its pages do not point at one: ./seo.ts says so only when there is one).
  if (origin !== "" && site.feeds.length > 0) {
    await write("feed.xml", feedOf(site));
  }

  return { files, pages: addresses };
};
