// The static site generator (the stand-in for the external in ../EXTERNALS.md, X3): the application's routes say which pages there are, each is rendered once with `renderToHtml` (the
// same `renderDocument` a server uses, so the documents are the same bytes), and the files are written beside the built assets. Nothing here knows what a page is: it asks the routes.
//
//   <base>docs/guides/state/index.html   the document        .../index.json   the page's content, which the browser fetches when the reader goes there
//   <base>index.html, docs/index.html    the first page (an alias; its canonical address is its own)
//   404.html                             the application's not-found page (a static host serves it, with a 404, for an address it has no file for)
//   sitemap.xml, robots.txt              when the site says where it is published (`url` in content/nav.json); robots.txt always
import { staticPaths } from "@valancex/valance/web/plugin";
import type { Delivery } from "@valancex/valance/web/plugin";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { contentOf } from "../app/content.js";
import { routes } from "../app/routes.js";
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
    await write(`${page.path.replace(/^\//, "")}/index.json`, JSON.stringify(contentOf(site, page.id)));
  }

  // The addresses that are the first page without being its own: the site's root, and /docs.
  await write("index.html", await renderDocument(site, site.base, built));
  await write("docs/index.html", await renderDocument(site, `${site.base}docs`, built));
  await write("404.html", await renderDocument(site, `${site.base}this-page-does-not-exist`, built));

  const origin = site.url;

  await write("robots.txt", `User-agent: *\nAllow: /\n${origin === "" ? "" : `Sitemap: ${origin}${site.base}sitemap.xml\n`}`);

  if (origin !== "") {
    await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${addresses.map((address) => `  <url><loc>${escapeXml(`${origin}${address}`)}</loc></url>`).join("\n")}\n</urlset>\n`);
  }

  return { files, pages: addresses };
};
