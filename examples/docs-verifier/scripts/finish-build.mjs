// What `vite build` does not do. The server reads the views (and the generated site) relative to its compiled files: put them beside dist/server. The search index is named by its
// content and put beside the page script, and `built.json` says where, so the server and the page can link them.
import { createHash } from "node:crypto";
import { cpSync, readFileSync, writeFileSync } from "node:fs";

cpSync("views", "dist/server/views", { recursive: true });

const index = readFileSync("generated/search.json");
const name = `search-${createHash("sha256").update(index).digest("base64url").slice(0, 8)}.json`;

writeFileSync(`dist/page/assets/${name}`, index);
writeFileSync("dist/page/built.json", `${JSON.stringify({ search: `/assets/${name}` })}\n`);
