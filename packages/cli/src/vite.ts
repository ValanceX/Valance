// The one place that knows about Vite. It is how the browser script is bundled, how the author's TypeScript is loaded in Node, and what a development server is built on; an author never
// configures it, and `valance.json` does not mention it.
import type { InlineConfig, ViteDevServer } from "vite";
import { createLogger, createServer } from "vite";
import { join } from "node:path";

import type { Config } from "./config.js";
import { GENERATED_DIR, OUTPUT_DIR } from "./project.js";

export const CLIENT_ENTRY = `${GENERATED_DIR}/client.ts`;
export const SERVER_ENTRY = `/${GENERATED_DIR}/server.ts`;

// Published packages ship source maps whose sources they do not ship; Vite warns about each, in every project, and the author can do nothing about it. Every other warning is kept.
const logger = createLogger("warn");
const noise = (message: string): boolean => /^Sourcemap for .* points to missing source files/.test(message.replace(/\u001b\[[0-9;]*m/g, ""));
const { warn, warnOnce } = logger;

logger.warn = (message, options) => { if (!noise(message)) { warn(message, options); } };
logger.warnOnce = (message, options) => { if (!noise(message)) { warnOnce(message, options); } };

export const baseConfig = (root: string, config: Config): InlineConfig => ({
  root,
  configFile: false,
  base: config.web.base,
  appType: "custom",
  publicDir: join(root, "public"),
  // The bundler's cache is an intermediate like any other.
  cacheDir: join(root, GENERATED_DIR, "cache"),
  customLogger: logger,
  clearScreen: false,
  build: { outDir: join(root, OUTPUT_DIR), emptyOutDir: true, target: "esnext", manifest: true, chunkSizeWarningLimit: 1500, rollupOptions: { input: join(root, CLIENT_ENTRY) } },
  // The MESH runtime refers to node:fs/promises on a path the browser never takes.
  optimizeDeps: { exclude: ["@valancex/mesh-runtime", "@valancex/cli"] },
});

/** A Vite server that serves nothing: it loads the author's TypeScript and the generated server entry in Node. Used by build and check. */
export const createLoader = async (root: string, config: Config): Promise<ViteDevServer> =>
  createServer({ ...baseConfig(root, config), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null, ws: false } });
