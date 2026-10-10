// The one place that knows about Vite. It is how the browser script is bundled, how the author's TypeScript is loaded in Node, and what a development server is built on; an author never
// configures it, and `valance.json` does not mention it.
import type { InlineConfig, ViteDevServer } from "vite";
import { createServer } from "vite";
import { join } from "node:path";

import type { Config } from "./config.js";
import { GENERATED_DIR, OUTPUT_DIR } from "./project.js";

export const CLIENT_ENTRY = `${GENERATED_DIR}/client.ts`;
export const SERVER_ENTRY = `/${GENERATED_DIR}/server.ts`;

export const baseConfig = (root: string, config: Config): InlineConfig => ({
  root,
  configFile: false,
  base: config.web.base,
  appType: "custom",
  publicDir: join(root, "public"),
  // The bundler's cache is an intermediate like any other.
  cacheDir: join(root, GENERATED_DIR, "cache"),
  logLevel: "warn",
  clearScreen: false,
  build: { outDir: join(root, OUTPUT_DIR), emptyOutDir: true, target: "esnext", manifest: true, chunkSizeWarningLimit: 1500, rollupOptions: { input: join(root, CLIENT_ENTRY) } },
  // The MESH runtime refers to node:fs/promises on a path the browser never takes.
  optimizeDeps: { exclude: ["@valancex/mesh-runtime", "@valancex/cli"] },
});

/** A Vite server that serves nothing: it loads the author's TypeScript and the generated server entry in Node. Used by build and check. */
export const createLoader = async (root: string, config: Config): Promise<ViteDevServer> =>
  createServer({ ...baseConfig(root, config), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null, ws: false } });
