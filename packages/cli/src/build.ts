// `vlx build`: the project → a static site in `dist/`. The stages, in order: configuration, content, templates, the browser bundle, then one document per page (and a 404 page, a sitemap
// when the site has a published address). Everything is generated under `.valance/` first; `dist/` holds only the site.
import { build as bundle } from "vite";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { loadAuthor } from "./author.js";
import { loadConfig } from "./config.js";
import { AppError } from "./diagnostics.js";
import { generateContent, generateEntries, generateProgram } from "./generate.js";
import type { Content } from "./model.js";
import { OUTPUT_DIR } from "./project.js";
import { baseConfig, createLoader, SERVER_ENTRY } from "./vite.js";

export interface Built {
  readonly dir: string;
  readonly files: ReadonlyArray<string>;
  readonly pages: ReadonlyArray<string>;
}

interface ManifestChunk { readonly file: string; readonly isEntry?: boolean; readonly css?: ReadonlyArray<string> }

/** The file a pathname is written to in the site: `/` → `index.html`, `/guide/x` → `guide/x/index.html`, relative to the base. */
export const fileOf = (pathname: string, base: string): string => {
  const inside = pathname.slice(base.length).replace(/\/+$/, "");

  return inside === "" ? "index.html" : `${inside}/index.html`;
};

const sitemap = (content: Content): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${content.pages.map((page) => `  <url><loc>${content.site.url}${content.site.base}${page.path.replace(/^\//, "")}</loc></url>`).join("\n")}\n</urlset>\n`;

export const build = async (root: string): Promise<Built> => {
  const config = loadConfig(root);

  generateEntries(root);

  const content = generateContent(root, config);
  const loader = await createLoader(root, config);
  let rendered: { readonly render: (pathname: string, built: { readonly script: string; readonly styles: ReadonlyArray<string> }) => Promise<{ readonly status: number; readonly html: string }>; readonly paths: () => ReadonlyArray<string> };

  try {
    const author = await loadAuthor(loader, root);

    await generateProgram(root, author);

    // The browser bundle first: it empties dist/, and the documents are written into it after.
    await bundle({ ...baseConfig(root, config), mode: "production" });

    rendered = await loader.ssrLoadModule(SERVER_ENTRY) as typeof rendered;
  } catch (error) {
    await loader.close();

    throw error;
  }

  try {
    const dist = join(root, OUTPUT_DIR);
    const manifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8")) as Record<string, ManifestChunk>;
    const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

    if (entry === undefined) { throw new AppError([{ file: OUTPUT_DIR, line: 0, column: 0, code: "build-entry", message: "the bundle has no entry chunk" }]); }

    rmSync(join(dist, ".vite"), { recursive: true, force: true });                // the bundler's bookkeeping is not part of the site

    const built = { script: `${config.web.base}${entry.file}`, styles: (entry.css ?? []).map((file) => `${config.web.base}${file}`) };
    const files: Array<string> = [];
    const write = (relative: string, text: string): void => { mkdirSync(dirname(join(dist, relative)), { recursive: true }); writeFileSync(join(dist, relative), text); files.push(relative); };
    const pages = rendered.paths();

    for (const pathname of pages) { write(fileOf(pathname, config.web.base), (await rendered.render(pathname, built)).html); }

    // An address that is not a page: the file a static host serves with a 404.
    write("404.html", (await rendered.render(`${config.web.base}404`, built)).html);

    if (config.web.url !== "") { write("sitemap.xml", sitemap(content)); }

    return { dir: dist, files, pages };
  } finally {
    await loader.close();
  }
};
