// The smallest server for the site: documents (./document.ts, rendered per request) and the built assets from `dist/page`, over node:http. No framework, no caching headers.
import type { Server } from "node:http";

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { routes } from "../app/routes.js";
import type { Site } from "../model/site.js";

import { renderDocument } from "./document.js";

const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".json": "application/json", ".css": "text/css; charset=utf-8" };

/** The URL of the built page script, from the manifest `vite build` wrote. */
export const builtScript = async (dir: string): Promise<string> => {
  const manifest = JSON.parse(await readFile(join(dir, ".vite", "manifest.json"), "utf8")) as Record<string, { readonly file: string; readonly isEntry?: boolean }>;
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

  if (entry === undefined) { throw new Error("the build has no entry chunk"); }

  return `/${entry.file}`;
};

export const serve = async (site: Site, dir: string, port = 0): Promise<{ readonly server: Server; readonly origin: string }> => {
  const script = await builtScript(dir);
  const { known } = routes(site);
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");

      try {
        if (url.pathname.startsWith("/assets/")) {
          const file = normalize(join(dir, url.pathname));

          if (!file.startsWith(join(dir, "assets"))) { response.writeHead(403).end(); return; }

          response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
        } else {
          // An unknown page is still a page (the application's own "Not found"), with the status a browser and a crawler expect.
          response.writeHead(known(url.pathname) ? 200 : 404, { "content-type": "text/html; charset=utf-8" }).end(await renderDocument(site, url.pathname, script));
        }
      } catch {
        response.writeHead(500).end();
      }
    })();
  });

  await new Promise<void>((resolve) => { server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();

  return { server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : port}` };
};
