// The smallest server for the site: documents (./document.ts, rendered per request) and the built assets from `dist/page`, over node:http. No framework, no caching headers.
import type { Server } from "node:http";

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { routes } from "../app/routes.js";
import type { Site } from "../model/site.js";

import type { Built } from "./built.js";
import { renderDocument } from "./document.js";

const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".json": "application/json", ".css": "text/css; charset=utf-8" };

/** The URLs of the built page script and the stylesheet it imports, from the manifest `vite build` wrote. */
export const builtAssets = async (dir: string): Promise<Built> => {
  const manifest = JSON.parse(await readFile(join(dir, ".vite", "manifest.json"), "utf8")) as Record<string, { readonly file: string; readonly isEntry?: boolean; readonly css?: ReadonlyArray<string> }>;
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

  if (entry === undefined) { throw new Error("the build has no entry chunk"); }

  const style = entry.css?.[0];
  const search = (JSON.parse(await readFile(join(dir, "built.json"), "utf8").catch(() => "{}")) as { readonly search?: string }).search;

  return { script: `/${entry.file}`, ...(style === undefined ? {} : { style: `/${style}` }), ...(search === undefined ? {} : { search }) };
};

export const serve = async (site: Site, dir: string, port = 0): Promise<{ readonly server: Server; readonly origin: string }> => {
  const built = await builtAssets(dir);
  const { known } = routes(site);
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");

      try {
        if (url.pathname.startsWith("/assets/")) {
          const file = normalize(join(dir, url.pathname));

          if (!file.startsWith(join(dir, "assets") + sep)) { response.writeHead(403).end(); return; }

          // Built assets are named by their content: they never change, so a reader keeps them.
          const body = await readFile(file).catch(() => undefined);

          if (body === undefined) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found"); return; }

          response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" }).end(body);
        } else {
          // An unknown page is still a page (the application's own "Not found"), with the status a browser and a crawler expect.
          response.writeHead(known(url.pathname) ? 200 : 404, { "content-type": "text/html; charset=utf-8" }).end(await renderDocument(site, url.pathname, built));
        }
      } catch {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end("the server could not draw this page");
      }
    })();
  });

  await new Promise<void>((resolve) => { server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();

  return { server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : port}` };
};
