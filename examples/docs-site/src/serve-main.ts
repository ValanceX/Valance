// The standalone entry: an ordinary Node process serving the built site (`pnpm build`) from ../page relative to this compiled file. `PORT` picks the port (default 4173).
import { fileURLToPath } from "node:url";

import { serve } from "./serve.js";

const { origin } = await serve(fileURLToPath(new URL("../page", import.meta.url)), Number(process.env["PORT"] ?? 4173));

console.log(`listening ${origin}`);
