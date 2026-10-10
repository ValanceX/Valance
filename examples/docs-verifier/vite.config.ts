import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// The browser half, built for production: one hashed JS module (the compiled views are in it) plus the stylesheet it imports and the hashed MESH runtime WASM it references, and a
// manifest naming the entry. There is no HTML entry: each document is rendered by build/document.ts, once at build time for a static site, or per request for a server. The output
// directory is the site (`dist/<site>`, with `SITE` in the environment, `docs` by default): `build/export.ts` writes the documents beside it. `base` is the site's (sites/<site>/site.json), so every address the build writes is under it. `esnext` because the
// page script uses top-level await.
const site = process.env["SITE"] ?? "docs";
const base = (JSON.parse(readFileSync(`sites/${site}/site.json`, "utf8")) as { readonly base?: string }).base ?? "/";

export default defineConfig({
  base,
  build: { outDir: `dist/${site}`, emptyOutDir: true, target: "esnext", manifest: true, rollupOptions: { input: "src/main.ts" } },
});
