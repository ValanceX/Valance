import { defineConfig } from "vitest/config";

import { renderDocument } from "./src/document.js";

export default defineConfig({
  // The dev server also serves the tracer's REAL pages: a request under the application's own base path ("/tracer") is answered with the server-rendered
  // document (./src/document.ts), whose script (./src/page.ts) the same server then transforms and serves.
  plugins: [{
    name: "tracer-pages",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url === undefined || !request.url.startsWith("/tracer")) { next(); return; }

        try {
          let html = await renderDocument(request.url);

          // Test-only fault injection for the startup-failure tracer (Stage 47): a corrupt embedded state, as a stale or damaged server payload would be, and an
          // inline observer that records what the page reports, installed BEFORE the page script runs. The page script itself is untouched.
          if (request.url.includes("__corrupt=state")) {
            html = html.replace('"count":0', '"count":"zero"').replace("<script type=\"application/json\"", "<script>window.__seen=[];addEventListener('error',(e)=>__seen.push('error: '+e.message));addEventListener('unhandledrejection',(e)=>__seen.push('unhandledrejection: '+String(e.reason)));for(const k of ['error','warn','log']){const o=console[k];console[k]=(...a)=>{__seen.push(k+': '+a.map(String).join(' '));o.apply(console,a);};}</script><script type=\"application/json\"");
          }

          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  }],
  test: {
    include: ["browser/**/*.test.ts"],
    globalSetup: ["browser/setup.ts", "browser/conditional-setup.ts", "browser/keyed-setup.ts", "browser/composition-setup.ts", "browser/items-setup.ts", "browser/docs-benchmark-setup.ts", "browser/links-setup.ts"],
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
