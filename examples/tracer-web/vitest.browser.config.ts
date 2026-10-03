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
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(await renderDocument(request.url));
        } catch (error) {
          next(error);
        }
      });
    },
  }],
  test: {
    include: ["browser/**/*.test.ts"],
    globalSetup: ["browser/setup.ts"],
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
