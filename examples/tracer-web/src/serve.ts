// The smallest server for the built page: the document route (src/document.ts, rendered per request with the built script's URL) and the built assets from
// `dist/page`, over node:http. No framework, no caching headers, no compression: only what a browser needs to load the page without the dev server.
import type { Server } from "node:http";

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { renderDocument } from "./document.js";

const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".json": "application/json", ".css": "text/css; charset=utf-8" };

/** The URL of the built page script, from the manifest `vite build` wrote. */
export const builtScript = async (dir: string): Promise<string> => {
  const manifest = JSON.parse(await readFile(join(dir, ".vite", "manifest.json"), "utf8")) as Record<string, { readonly file: string; readonly isEntry?: boolean }>;
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

  if (entry === undefined) { throw new Error("the build has no entry chunk"); }

  return `/${entry.file}`;
};

export const servePage = async (dir: string, port = 0): Promise<{ readonly server: Server; readonly origin: string; readonly script: string }> => {
  const script = await builtScript(dir);
  const server = createServer((request, response) => {
    void (async () => {
      const url = request.url ?? "/";

      try {
        if (url.startsWith("/tracer")) {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(await renderDocument(url, script));
        } else if (url.startsWith("/assets/")) {
          const file = normalize(join(dir, url.split("?")[0]!));

          if (!file.startsWith(join(dir, "assets"))) { response.writeHead(403).end(); return; }

          response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
        } else {
          response.writeHead(404).end();
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
