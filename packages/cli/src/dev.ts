// `vlx dev`: the project served from memory and from disk, rebuilt as its authored files change. Built on a Vite server for what Vite is good at (serving modules, style updates without a
// reload, the error overlay); everything else is this file's: each page is rendered on the server with the same code a build uses, so development shows what production will.
//
// What each change does:
//
//   content/**               the content is rebuilt; the browser reloads
//   src/**/*.mprx, src/main.ts   the templates are recompiled (the manifest derives from main.ts); the browser reloads
//   src/**/*.css             the style is replaced in the open page, no reload
//   public/**                the browser reloads
//   adding or removing a stylesheet or src/main.ts   the entries are rewritten; the browser reloads
//   valance.json, valance.web.json   the server restarts (the name and the base are fixed when it starts)
//
// A mistake in any of them leaves the last good build serving, and is shown in the terminal and as an overlay in the page, naming the file and line. Fixing it reloads the page.
import type { ViteDevServer } from "vite";
import { createServer } from "vite";
import { relative, sep } from "node:path";

import { loadAuthor } from "./author.js";
import type { Config } from "./config.js";
import { loadConfig, PROJECT_FILE, WEB_FILE } from "./config.js";
import type { Diagnostic } from "./diagnostics.js";
import { AppError, format } from "./diagnostics.js";
import { generateContent, generateEntries, generateProgram } from "./generate.js";
import { GENERATED_DIR, OUTPUT_DIR } from "./project.js";
import { baseConfig, SERVER_ENTRY } from "./vite.js";

export interface DevOptions {
  readonly port?: number;
  readonly host?: string;
  /** Called with each report (a rebuild, a mistake); defaults to the console. */
  readonly log?: (line: string) => void;
}

export interface Dev {
  readonly url: string;
  /** Resolves when a change currently being handled has been applied. For tests and tools. */
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** How long files must be quiet before a change is applied (ms). */
const QUIET = 60;

type Stage = "content" | "program" | "entries" | "reload" | "restart";

/** What a changed file (relative to the project, `/` separated) asks for. `event` is what happened to it: a stylesheet's edit is the page's to apply, its arrival or removal changes the entry. */
export const stagesFor = (file: string, event: "change" | "add" | "unlink" = "change"): ReadonlyArray<Stage> => {
  if (file === PROJECT_FILE || file === WEB_FILE) { return ["restart"]; }
  if (file.startsWith("content/")) { return ["content"]; }
  if (file.startsWith("public/")) { return ["reload"]; }
  if (file === "src/main.ts") { return event === "change" ? ["program"] : ["entries", "program"]; }
  if (file.startsWith("src/") && file.endsWith(".mprx")) { return ["program"]; }
  if (file.startsWith("src/") && file.endsWith(".css")) { return event === "change" ? [] : ["entries"]; }       // an edit is style-updated in the open page by the bundler

  return [];
};

const overlay = (diagnostics: ReadonlyArray<Diagnostic>) => {
  const first = diagnostics[0]!;

  return {
    type: "error" as const,
    err: {
      message: diagnostics.map(format).join("\n"),
      stack: "",
      plugin: "valance",
      id: first.file,
      loc: { file: first.file, line: first.line, column: first.column },
    },
  };
};

const start = async (root: string, config: Config, options: DevOptions, restart: () => Promise<void>): Promise<Dev & { readonly server: ViteDevServer }> => {
  const log = options.log ?? ((line: string) => { console.log(line); });
  const failed = new Map<string, ReadonlyArray<Diagnostic>>();
  let pending: Promise<void> = Promise.resolve();

  generateEntries(root);

  const server = await createServer({
    ...baseConfig(root, config),
    server: { port: options.port ?? 5173, host: options.host ?? "127.0.0.1", strictPort: false, fs: { allow: [root] } },
    plugins: [{
      name: "valance",
      configureServer: (vite) => () => {
        // After Vite's own middleware: modules, styles, public files and the client have had their chance. What is left is a page.
        vite.middlewares.use((request, response, next) => {
          void (async () => {
            // Vite has already removed the base from `request.url`; the application's addresses include it.
            const url = new URL((request as { originalUrl?: string }).originalUrl ?? request.url ?? "/", "http://localhost");

            if ((request.method !== "GET" && request.method !== "HEAD") || !url.pathname.startsWith(config.web.base) || /\.[A-Za-z0-9]+$/.test(url.pathname)) { next(); return; }

            try {
              const { render } = await vite.ssrLoadModule(SERVER_ENTRY) as { render: (pathname: string, built: { script: string; styles: ReadonlyArray<string> }) => Promise<{ status: number; html: string }> };
              const { status, html } = await render(url.pathname, { script: `${config.web.base}${GENERATED_DIR}/client.ts`, styles: [] });

              response.statusCode = status;
              response.setHeader("content-type", "text/html; charset=utf-8");
              response.end(await vite.transformIndexHtml(url.pathname, html));
            } catch (error) {
              vite.ssrFixStacktrace(error as Error);
              next(error);
            }
          })();
        });
      },
    }],
  });

  await server.listen();

  const rebuild = async (stages: ReadonlyArray<Stage>): Promise<void> => {
    const run = async (name: string, work: () => Promise<unknown> | unknown): Promise<void> => {
      try {
        await work();

        if (failed.delete(name)) { log(`vlx: ${name} is fine again`); }
      } catch (error) {
        if (!(error instanceof AppError)) { throw error; }

        failed.set(name, error.diagnostics);
        error.diagnostics.forEach((each) => { log(format(each)); });
      }
    };

    const wasFailing = failed.size > 0;

    if (stages.includes("entries")) { generateEntries(root); }
    if (stages.includes("content")) { await run("content", () => generateContent(root, config)); }
    if (stages.includes("program")) { await run("templates", async () => generateProgram(root, await loadAuthor(server, root))); }

    const open = [...failed.values()].flat();

    // A generated file that changes reloads the page by itself (the bundler watches `.valance/`). What it cannot know: a fix that rebuilds to the same files still has to clear the overlay,
    // and a public file is not part of any module.
    if (open.length > 0) { server.ws.send(overlay(open)); } else if (wasFailing || stages.includes("reload")) { server.ws.send({ type: "full-reload", path: "*" }); }
  };

  // Changes are applied once the files have been quiet for a moment: an editor that saves twice, or a tool that writes several files, is one change, and the file is read after the last write.
  // (The watcher itself drops a repeated event for the same file inside ~50 ms, so reading at once could read the first write and never hear about the second.)
  const queued = new Map<string, "change" | "add" | "unlink">();
  let timer: NodeJS.Timeout | undefined;

  const flush = (): void => {
    const batch = [...queued];

    queued.clear();

    const stages = new Set<Stage>(batch.flatMap(([file, event]) => stagesFor(file, event)));

    if (stages.size === 0) { return; }

    log(`vlx: ${batch.map(([file]) => file).join(", ")} changed`);
    pending = pending.then(async () => {
      if (stages.has("restart")) { await restart(); return; }

      await rebuild([...stages]);
    }).catch((error: unknown) => { log(`vlx: ${error instanceof Error ? error.stack ?? error.message : String(error)}`); });
  };

  const onChange = (event: "change" | "add" | "unlink") => (path: string): void => {
    const file = relative(root, path).split(sep).join("/");

    if (file.startsWith(`${GENERATED_DIR}/`) || file.startsWith(`${OUTPUT_DIR}/`) || file.startsWith("node_modules/") || file.startsWith("..") || stagesFor(file, event).length === 0) { return; }

    queued.set(file, event);
    clearTimeout(timer);
    timer = setTimeout(flush, QUIET);
  };

  for (const event of ["change", "add", "unlink"] as const) { server.watcher.on(event, onChange(event)); }

  // First build: a mistake here is reported like any other and the server still starts, so the overlay can show it.
  for (const [name, work] of [["content", () => generateContent(root, config)], ["templates", async () => generateProgram(root, await loadAuthor(server, root))]] as const) {
    try { await work(); } catch (error) {
      if (!(error instanceof AppError)) { throw error; }

      failed.set(name, error.diagnostics);
      error.diagnostics.forEach((each) => { log(format(each)); });
    }
  }

  // The server's own address already includes the base.
  const address = server.resolvedUrls?.local[0] ?? `http://${options.host ?? "127.0.0.1"}:${options.port ?? 5173}${config.web.base}`;

  return { server, url: address, settled: async () => { await new Promise((resolve) => setTimeout(resolve, QUIET * 2)); await pending; }, close: () => server.close() };
};

/** Starts the development server for the project at `root`. */
export const dev = async (root: string, options: DevOptions = {}): Promise<Dev> => {
  let current: Dev & { readonly server: ViteDevServer };
  const log = options.log ?? ((line: string) => { console.log(line); });

  const restart = async (): Promise<void> => {
    log("vlx: the configuration changed; restarting");
    await current.close();

    try {
      const config = loadConfig(root);

      current = await start(root, config, { ...options, port: portOf(current) }, restart);
      log(`vlx: serving ${current.url}`);
    } catch (error) {
      if (!(error instanceof AppError)) { throw error; }

      error.diagnostics.forEach((each) => { log(format(each)); });
      log("vlx: fix the configuration and save it; the server is stopped until then");
      waitForConfig();
    }
  };

  const waitForConfig = (): void => {
    // The server is down, so nothing is watching: poll the two files until the configuration loads.
    const timer = setInterval(() => {
      try { loadConfig(root); } catch { return; }

      clearInterval(timer);
      void restart();
    }, 500);
    timer.unref();
  };

  const config = loadConfig(root);

  current = await start(root, config, options, restart);

  return { get url() { return current.url; }, settled: () => current.settled(), close: () => current.close() };
};

const portOf = (running: Dev): number => Number(new URL(running.url).port);

