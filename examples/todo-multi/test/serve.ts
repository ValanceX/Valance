// What a static host does, and nothing more: a file, or a directory's index.html, or 404.html with a 404.
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".xml": "application/xml",
};

/** The headers a host applies from the `_headers` file the build writes (Netlify and Cloudflare Pages read it): the lines under the pattern that matches the path. Only `*` at the end of a pattern. */
const headersFor = async (root: string, pathname: string): Promise<Record<string, string>> => {
  const text = await readFile(join(root, "_headers"), "utf8").catch(() => "");
  const found: Record<string, string> = {};
  let applies = false;

  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) {
      continue;
    }
    if (!line.startsWith(" ")) {
      const pattern = line.trim();

      applies = pattern.endsWith("*") ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern;
    } else if (applies) {
      const at = line.indexOf(":");

      found[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
  }

  return found;
};

export const serveStatic = async (dir: string): Promise<{ readonly origin: string; readonly server: Server }> => {
  const root = normalize(dir);
  const server = createServer((request, response) => {
    void (async () => {
      const path = normalize(join(root, decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname)));

      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }

      const extra = await headersFor(root, new URL(request.url ?? "/", "http://x").pathname);

      for (const candidate of [path, join(path, "index.html")]) {
        const body = await readFile(candidate).catch(() => undefined);

        if (body !== undefined && !candidate.endsWith(sep)) {
          response.writeHead(200, { "content-type": TYPES[extname(candidate)] ?? "application/octet-stream", ...extra }).end(body);
          return;
        }
      }

      response.writeHead(404, { "content-type": TYPES[".html"]!, ...extra }).end(await readFile(join(root, "404.html")).catch(() => "not found"));
    })();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  return { origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`, server };
};
