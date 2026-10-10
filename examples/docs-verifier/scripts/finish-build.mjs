// What `vite build` does not do: the search index is named by its content and put beside the page script, and `built.json` says where, so the server, the exporter and the page can
// link it. (Paths are relative to the site's base; web/serve.ts puts the base in front.)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const dir = process.argv[2] ?? "dist/site";

const index = readFileSync("generated/search.json");
const name = `search-${createHash("sha256").update(index).digest("base64url").slice(0, 8)}.json`;

writeFileSync(`${dir}/assets/${name}`, index);
writeFileSync(`${dir}/built.json`, `${JSON.stringify({ search: `assets/${name}` })}\n`);
