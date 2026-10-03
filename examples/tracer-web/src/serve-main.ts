// The standalone entry: an ordinary Node process serving the already-built page (`pnpm run build:page`) from ../page relative to this compiled file
// (`pnpm run build:server` puts it in dist/server). `PORT` picks the port (default 4173; 0 = any free port). It prints its origin and nothing more.
import { fileURLToPath } from "node:url";

import { servePage } from "./serve.js";

const { origin, script } = await servePage(fileURLToPath(new URL("../page", import.meta.url)), Number(process.env["PORT"] ?? 4173));

console.log(`listening ${origin} (page script ${script})`);
