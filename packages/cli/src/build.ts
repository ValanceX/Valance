// `vlx build`: the project → a static site in `dist/`. The stages, in order: configuration, content, templates, the browser bundle, then one document per page (and a 404 page, a sitemap
// when the site has a published address). Everything is generated under `.valance/` first; `dist/` holds only the site.
import { build as bundle } from "vite";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { loadAuthor } from "./author.js";
import type { Config } from "./config.js";
import { loadConfig } from "./config.js";
import { headersFile } from "./security.js";
import { AppError } from "./diagnostics.js";
import { generateContent, generateEntries, generateProgram } from "./emit.js";
import type { Content } from "@valancex/common/internal";
import { OUTPUT_DIR } from "./project.js";
import { baseConfig, createLoader, SERVER_ENTRY, templates } from "./vite.js";
import { GENERATED_DIR } from "./project.js";

export interface Built {
  readonly dir: string;
  readonly files: ReadonlyArray<string>;
  readonly pages: ReadonlyArray<string>;
}

interface ManifestChunk {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly css?: ReadonlyArray<string>;
}

/** The file a pathname is written to in the site: `/` → `index.html`, `/guide/x` → `guide/x/index.html`, relative to the base. */
export const fileOf = (pathname: string, base: string): string => {
  const inside = pathname.slice(base.length).replace(/\/+$/, "");

  return inside === "" ? "index.html" : `${inside}/index.html`;
};

const sitemap = (content: Content): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${content.pages.map((page) => `  <url><loc>${content.site.url}${content.site.base}${page.path.replace(/^\//, "")}</loc></url>`).join("\n")}\n</urlset>\n`;

/** The stages of a build, in order, as `onStage` reports them. */
export type BuildStage = "configuration" | "content" | "templates" | "bundle" | "pages";

export interface BuildOptions {
  /** Called as each stage begins. */
  readonly onStage?: (stage: BuildStage) => void;
}

/** The MESH runtime's module, found the way the project's own dependency would be: through `@valancex/common`, which depends on it. */
const wasmOf = (root: string): string => {
  const fromRoot = createRequire(join(root, "package.json"));
  const fromCommon = createRequire(fromRoot.resolve("@valancex/common/package.json"));

  return fromCommon.resolve("@valancex/mesh-runtime/mesh-runtime.wasm");
};

/** `vlx build` for a desktop project: the engine, one ES module with everything it needs bundled in, and the MESH runtime's module beside it, in `dist/desktop/`. The window is the Desktop PORT's. */
const buildDesktop = async (root: string, config: Config, stage: (stage: BuildStage) => void): Promise<Built> => {
  generateEntries(root, config);
  stage("content");
  generateContent(root, config);

  const loader = await createLoader(root, config);

  try {
    stage("templates");
    await generateProgram(root, await loadAuthor(loader, root), config);
  } finally {
    await loader.close();
  }

  stage("bundle");

  const out = join(root, OUTPUT_DIR, "desktop");

  rmSync(out, { recursive: true, force: true });
  await bundle({
    root,
    configFile: false,
    logLevel: "warn",
    plugins: [templates(root)],
    cacheDir: join(root, GENERATED_DIR, "cache"),
    ssr: { noExternal: true, target: "node" },
    build: {
      ssr: join(root, GENERATED_DIR, "desktop.ts"),
      outDir: out,
      emptyOutDir: true,
      target: "node22",
      minify: false,
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        output: {
          format: "es",
          entryFileNames: "engine.mjs",
          banner: 'import { createRequire as __vlxRequire } from "node:module"; const require = __vlxRequire(import.meta.url);',
        },
      },
    },
  });
  copyFileSync(wasmOf(root), join(out, "mesh-runtime.wasm"));

  return { dir: out, files: ["engine.mjs", "mesh-runtime.wasm"], pages: [] };
};

export const build = async (root: string, options: BuildOptions = {}): Promise<Built> => {
  const stage = options.onStage ?? (() => undefined);

  stage("configuration");

  const config = loadConfig(root);

  if (config.target === "desktop") {
    return buildDesktop(root, config, stage);
  }

  generateEntries(root, config);

  stage("content");

  const content = generateContent(root, config);
  const loader = await createLoader(root, config);
  let rendered: {
    readonly render: (pathname: string, built: { readonly script: string; readonly styles: ReadonlyArray<string> }) => Promise<{ readonly status: number; readonly html: string }>;
    readonly paths: () => ReadonlyArray<string>;
  };

  try {
    stage("templates");

    const author = await loadAuthor(loader, root);

    await generateProgram(root, author, config);

    // The browser bundle first: it empties dist/, and the documents are written into it after.
    stage("bundle");

    await bundle({ ...baseConfig(root, config), mode: "production" });

    rendered = (await loader.ssrLoadModule(SERVER_ENTRY)) as typeof rendered;
  } catch (error) {
    await loader.close();

    throw error;
  }

  try {
    const dist = join(root, OUTPUT_DIR);
    const manifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8")) as Record<string, ManifestChunk>;
    const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

    if (entry === undefined) {
      throw new AppError([{ file: OUTPUT_DIR, line: 0, column: 0, code: "build-entry", message: "the bundle has no entry chunk" }]);
    }

    rmSync(join(dist, ".vite"), { recursive: true, force: true }); // the bundler's bookkeeping is not part of the site

    const built = { script: `${config.web.base}${entry.file}`, styles: (entry.css ?? []).map((file) => `${config.web.base}${file}`) };
    const files: Array<string> = [];
    const write = (relative: string, text: string): void => {
      mkdirSync(dirname(join(dist, relative)), { recursive: true });
      writeFileSync(join(dist, relative), text);
      files.push(relative);
    };
    const pages = rendered.paths();

    stage("pages");

    for (const pathname of pages) {
      write(fileOf(pathname, config.web.base), (await rendered.render(pathname, built)).html);
    }

    // An address that is not a page: the file a static host serves with a 404.
    write("404.html", (await rendered.render(`${config.web.base}404`, built)).html);

    if (config.web.url !== "") {
      write("sitemap.xml", sitemap(content));
    }

    // The headers to serve it with: the page is only as safe as the host makes it (src/security.ts).
    if (config.web.headers) {
      write("_headers", headersFile(config));
    }

    return { dir: dist, files, pages };
  } finally {
    await loader.close();
  }
};
