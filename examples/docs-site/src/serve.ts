// The smallest server for the site: documents (src/document.ts, rendered per request), a search endpoint, and the built assets from `dist/page`, over node:http. No framework,
// no caching headers, no compression: only what a browser needs.
import type { Server } from "node:http";

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { pages } from "./content.js";
import { renderDocument } from "./document.js";

const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".json": "application/json", ".css": "text/css; charset=utf-8" };

/** Pages whose title or text contains the query, as the search endpoint answers. */
export const searchPages = (query: string): ReadonlyArray<{ readonly id: string; readonly title: string }> => {
  const needle = query.trim().toLowerCase();

  return needle === "" ? [] : pages.filter((page) => [page.title, ...page.paragraphs].some((text) => text.toLowerCase().includes(needle))).map(({ id, title }) => ({ id, title }));
};

/** The URL of the built page script, from the manifest `vite build` wrote. */
export const builtScript = async (dir: string): Promise<string> => {
  const manifest = JSON.parse(await readFile(join(dir, ".vite", "manifest.json"), "utf8")) as Record<string, { readonly file: string; readonly isEntry?: boolean }>;
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

  if (entry === undefined) { throw new Error("the build has no entry chunk"); }

  return `/${entry.file}`;
};

const known = (pathname: string): boolean => pathname === "/" || pathname === "/docs" || pathname === "/docs/" || pages.some((page) => page.path === pathname);

export const serve = async (dir: string, port = 0): Promise<{ readonly server: Server; readonly origin: string; readonly script: string }> => {
  const script = await builtScript(dir);
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");

      try {
        if (url.pathname === "/api/search") {
          response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(searchPages(url.searchParams.get("q") ?? "")));
        } else if (url.pathname.startsWith("/assets/")) {
          const file = normalize(join(dir, url.pathname));

          if (!file.startsWith(join(dir, "assets"))) { response.writeHead(403).end(); return; }

          response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
        } else if (known(url.pathname)) {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(await renderDocument(url.pathname, script));
        } else {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
        }
      } catch {
        response.writeHead(500).end();
      }
    })();
  });

  await new Promise<void>((resolve) => { server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();

  return { server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : port}`, script };
};
