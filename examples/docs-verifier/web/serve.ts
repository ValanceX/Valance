// Two small servers over node:http, for two ways of delivering the site. No framework.
//
//   serveStatic   the exported site (`dist/site`) exactly as a static host serves it: the file, or the directory's index.html, or 404.html with a 404. It renders nothing. This is the
//                 primary delivery, and what a deployment is.
//   serveSsr      the same site rendered per request by the application (./document.ts), with the built assets from the same directory. Opt-in: for a route that must be rendered per
//                 request, and for working on the site without exporting it. Its documents are byte for byte the exported ones (test/export.test.ts).
//
// Both serve the site under its `base`, and a path outside it is a plain 404.
import type { Server } from "node:http";

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { contentOf } from "../app/content.js";
import { routes } from "../app/routes.js";
import type { Site } from "../model/site.js";
import { mapOf } from "../model/site.js";

import type { Built } from "./built.js";
import { renderDocument } from "./document.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
};

/** The URLs of the built page script, the stylesheet it imports and the search index, from what `vite build` and `scripts/finish-build.mjs` wrote. Every one is under `base`. */
export const builtAssets = async (dir: string, base = "/"): Promise<Built> => {
  const manifest = JSON.parse(await readFile(join(dir, ".vite", "manifest.json"), "utf8")) as Record<string, { readonly file: string; readonly isEntry?: boolean; readonly css?: ReadonlyArray<string> }>;
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry === true);

  if (entry === undefined) { throw new Error("the build has no entry chunk"); }

  const style = entry.css?.[0];
  const search = (JSON.parse(await readFile(join(dir, "built.json"), "utf8").catch(() => "{}")) as { readonly search?: string }).search;

  return { base, script: `${base}${entry.file}`, ...(style === undefined ? {} : { style: `${base}${style}` }), ...(search === undefined ? {} : { search: `${base}${search}` }) };
};

/** The path of `pathname` inside the site, or nothing when it is outside `base`. */
const inside = (base: string, pathname: string): string | undefined => pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : undefined;

/** Built assets are named by their content: they never change, so a reader keeps them. */
const IMMUTABLE = "public, max-age=31536000, immutable";

type Respond = (status: number, headers: Record<string, string>, body?: string | Buffer) => void;

const listen = async (handle: (pathname: string, respond: Respond) => Promise<void>, port: number): Promise<{ readonly server: Server; readonly origin: string }> => {
  const server = createServer((request, response) => {
    void (async () => {
      const respond: Respond = (status, headers, body) => { response.writeHead(status, headers).end(body); };

      try {
        if (request.method !== "GET" && request.method !== "HEAD") { respond(405, { allow: "GET, HEAD" }); return; }

        await handle(decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname), respond);
      } catch {
        respond(500, { "content-type": "text/plain; charset=utf-8" }, "the server could not draw this page");
      }
    })();
  });

  await new Promise<void>((resolve) => { server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();

  return { server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : port}` };
};

const notFound = (respond: Respond, html?: string): void => { respond(404, html === undefined ? { "content-type": "text/plain; charset=utf-8" } : { "content-type": TYPES[".html"]! }, html ?? "not found"); };

/** The exported site, as a static host serves it. */
export const serveStatic = async (dir: string, options: { readonly base?: string; readonly port?: number } = {}) => {
  const base = options.base ?? "/";
  const root = normalize(dir);

  return listen(async (pathname, respond) => {
    const path = inside(base, pathname);

    if (path === undefined) { notFound(respond); return; }

    const file = normalize(join(root, path));

    if (file !== root && !file.startsWith(root + sep)) { respond(403, {}); return; }

    // A file, or a directory's index.
    for (const candidate of [file, join(file, "index.html")]) {
      const body = await readFile(candidate).catch(() => undefined);

      if (body !== undefined && !candidate.endsWith(sep)) {
        respond(200, { "content-type": TYPES[extname(candidate)] ?? "application/octet-stream", "cache-control": candidate.includes(`${sep}assets${sep}`) ? IMMUTABLE : "no-cache" }, body);

        return;
      }
    }

    notFound(respond, (await readFile(join(root, "404.html"), "utf8").catch(() => undefined)));
  }, options.port ?? 0);
};

/** The site rendered per request. `dir` holds the built assets; the documents and the pages' content come from `site`. */
export const serveSsr = async (site: Site, dir: string, options: { readonly port?: number } = {}) => {
  const built = await builtAssets(dir, site.base);
  const map = mapOf(site);
  const { known } = routes(map);
  const byPath = new Map<string, string>(site.pages.map((page) => [`${site.base}${page.path.slice(1)}/index.json`, page.id]));
  const root = normalize(dir);

  return listen(async (pathname, respond) => {
    const path = inside(site.base, pathname);

    if (path === undefined) { notFound(respond); return; }

    if (path.startsWith("/assets/")) {
      const file = normalize(join(root, path));

      if (!file.startsWith(join(root, "assets") + sep)) { respond(403, {}); return; }

      const body = await readFile(file).catch(() => undefined);

      if (body === undefined) { notFound(respond); } else { respond(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": IMMUTABLE }, body); }

      return;
    }

    // A page's content, for the client navigating (the exported site has these as files).
    const id = byPath.get(pathname);

    if (id !== undefined) { respond(200, { "content-type": TYPES[".json"]!, "cache-control": "no-cache" }, JSON.stringify(contentOf(site, id))); return; }

    // An unknown page is still a page (the application's own "Not found"), with the status a browser and a crawler expect.
    respond(known(pathname) ? 200 : 404, { "content-type": TYPES[".html"]!, "cache-control": "no-cache" }, await renderDocument(site, pathname, built));
  }, options.port ?? 0);
};
