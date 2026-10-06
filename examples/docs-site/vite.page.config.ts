import { defineConfig } from "vite";

// The browser half, built for production: one hashed JS module plus the hashed MESH runtime WASM it references, and a manifest naming the entry. There is no HTML entry: the
// document is rendered per request (src/document.ts), so the page script's URL is read from the manifest (src/serve.ts). `esnext` because the page script uses top-level await.
export default defineConfig({
  build: { outDir: "dist/page", emptyOutDir: true, target: "esnext", manifest: true, rollupOptions: { input: "src/page.ts" } },
});
