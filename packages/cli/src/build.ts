// `vlx build`: the project → a static site in `dist/web/`. The stages, in order: configuration, content, templates, the browser bundle, then one document per page (and a 404 page, a sitemap
// when the site has a published address). Everything is generated under `.valance/` first; `dist/` holds only what is built.
import { build as bundle, defaultServerConditions } from "vite";

import { CONDITION } from "./libraries.js";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import type { TargetId } from "./targets.js";
import type { BudgetResult, SizeReport } from "./size.js";
import { check, DEFAULT_BUDGETS, failure, lines, measure } from "./size.js";
import { assertOneRuntime } from "./runtime-guard.js";
import { baseConfig, createLoader, SERVER_ENTRY, templates } from "./vite.js";
import { GENERATED_DIR } from "./project.js";

export interface Built {
  readonly dir: string;
  readonly files: ReadonlyArray<string>;
  readonly pages: ReadonlyArray<string>;
  /** The web build's start-up and after-start sets, measured, and each budget it was held to (a production build only). */
  readonly size?: SizeReport;
  readonly budgets?: ReadonlyArray<BudgetResult>;
  /** The size report as the lines a terminal prints. */
  readonly report?: ReadonlyArray<string>;
}

interface ManifestChunk {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: ReadonlyArray<string>;
  readonly dynamicImports?: ReadonlyArray<string>;
  readonly css?: ReadonlyArray<string>;
  readonly assets?: ReadonlyArray<string>;
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
  /** Which of the project's targets to build; all of them by default. */
  readonly targets?: ReadonlyArray<TargetId>;
  /** Called with the size report as soon as the bundle is measured, before a budget error stops the build (a terminal prints it). */
  readonly onReport?: (lines: ReadonlyArray<string>) => void;
}

/** The MESH runtime's module, found the way the project's own dependency would be: through `@valancex/common`, which depends on it. */
const wasmOf = (root: string): string => {
  const fromRoot = createRequire(join(root, "package.json"));
  const fromCommon = createRequire(fromRoot.resolve("@valancex/common/package.json"));

  return fromCommon.resolve("@valancex/mesh-runtime/mesh-runtime.wasm");
};

/** The desktop build: the engine, one ES module with everything it needs bundled in, and the MESH runtime's module beside it, in `dist/desktop/`. The window is the Desktop PORT's. */
const buildDesktop = async (root: string): Promise<Built> => {
  const out = join(root, OUTPUT_DIR, "desktop");

  rmSync(out, { recursive: true, force: true });
  await bundle({
    root,
    configFile: false,
    publicDir: false, // the site's public files are the web's
    logLevel: "warn",
    plugins: [templates(root)],
    cacheDir: join(root, GENERATED_DIR, "cache"),
    // the desktop engine is one file: everything is bundled, and a library resolves by its `valance` condition (K4)
    resolve: { conditions: [CONDITION, ...defaultServerConditions] },
    ssr: { noExternal: true, target: "node", resolve: { conditions: [CONDITION, ...defaultServerConditions] } },
    esbuild: { keepNames: true },
    build: {
      ssr: join(root, GENERATED_DIR, "desktop.ts"),
      outDir: out,
      emptyOutDir: true,
      target: "node22",
      // W10: the engine is minified (half the bytes; start-up measured no worse, 2026-10-24). Names are kept: errors and their `_tag` are read by name.
      minify: "esbuild",
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

  // The files images are drawn from, beside the engine (the site's `public/`, which the desktop's content refers to the same way).
  const publicDir = join(root, "public");

  if (existsSync(publicDir)) {
    cpSync(publicDir, join(out, "public"), { recursive: true });
  }

  return { dir: out, files: ["desktop/engine.mjs", "desktop/mesh-runtime.wasm"], pages: [] };
};

/** The web build: the browser bundle into `out`, then one document per page. The loader is the one the templates were compiled with. */
const buildWeb = async (
  root: string,
  config: Config,
  loader: Awaited<ReturnType<typeof createLoader>>,
  content: Content,
  out: string,
  prefix: string,
  stage: (stage: BuildStage) => void,
  onReport: (lines: ReadonlyArray<string>) => void,
): Promise<Built> => {
  // The browser bundle first: it empties its directory, and the documents are written into it after.
  stage("bundle");

  await bundle({ ...baseConfig(root, config, out), mode: "production" });

  const rendered = (await loader.ssrLoadModule(SERVER_ENTRY)) as {
    readonly render: (pathname: string, built: { readonly script: string; readonly styles: ReadonlyArray<string> }) => Promise<{ readonly status: number; readonly html: string }>;
    readonly paths: () => ReadonlyArray<string>;
  };

  {
    const dist = join(root, out);
    const manifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8")) as Record<string, ManifestChunk>;
    const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

    if (entry === undefined) {
      throw new AppError([{ file: out, line: 0, column: 0, code: "build-entry", message: "the bundle has no entry chunk" }]);
    }

    rmSync(join(dist, ".vite"), { recursive: true, force: true }); // the bundler's bookkeeping is not part of the site

    // The WebAssembly runtime is in the start-up set (H7): the head starts compiling it while the page's script downloads (W11).
    const wasm = Object.values(manifest).find((chunk) => chunk.file.endsWith(".wasm"))?.file;
    const built = {
      script: `${config.web.base}${entry.file}`,
      styles: (entry.css ?? []).map((file) => `${config.web.base}${file}`),
      ...(wasm === undefined ? {} : { wasm: `${config.web.base}${wasm}` }),
    };

    // The size report: the start-up set and the after-start set, held to the project's budgets or the framework's (W9, W14). Production only.
    const size = measure(dist, manifest, wasm);
    const budgets = check(size, config.budgets ?? DEFAULT_BUDGETS);
    const report = lines(size, budgets);

    onReport(report);

    const over = failure(budgets);

    if (over !== undefined) {
      throw over;
    }
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

    return { dir: dist, files: files.map((file) => `${prefix}${file}`), pages, size, budgets, report };
  }
};

export const build = async (root: string, options: BuildOptions = {}): Promise<Built> => {
  const stage = options.onStage ?? (() => undefined);

  stage("configuration");

  const config = loadConfig(root);
  const selected = options.targets ?? config.targets;
  const unknown = selected.filter((id) => !config.targets.includes(id));

  if (unknown.length > 0) {
    throw new AppError([
      {
        file: "valance.json",
        line: 0,
        column: 0,
        code: "build-target",
        message: `this project is not built for ${unknown.join(", ")} (its targets: ${config.targets.join(", ")}): add valance.${unknown[0]}.json`,
      },
    ]);
  }

  // Production only (`vlx dev` does not build through here): one copy of the MESH runtime, or the site ships its WebAssembly module more than once (W20).
  assertOneRuntime(root);
  generateEntries(root, config);

  stage("content");

  const content = generateContent(root, config);
  const loader = await createLoader(root, config);
  const built: Array<Built> = [];

  try {
    stage("templates");

    await generateProgram(root, await loadAuthor(loader, root), config, selected);

    // Each target writes to a directory of its own, whatever else the project has: dist/web/ and dist/desktop/.
    if (selected.includes("web")) {
      built.push(await buildWeb(root, config, loader, content, `${OUTPUT_DIR}/web`, "web/", stage, options.onReport ?? (() => undefined)));
    }

    if (selected.includes("desktop")) {
      stage("bundle");
      built.push(await buildDesktop(root));
    }
  } finally {
    await loader.close();
  }

  const web = built.find((each) => each.size !== undefined);

  return {
    dir: join(root, OUTPUT_DIR),
    files: built.flatMap((each) => each.files),
    pages: built.flatMap((each) => each.pages),
    ...(web?.size === undefined ? {} : { size: web.size, budgets: web.budgets!, report: web.report! }),
  };
};
