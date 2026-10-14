// The engine as a program, from files: `node dist/main.js [address]` (the address it is opened at, `/` by default), the to-do application behind stdin and stdout for a native renderer.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Programs } from "./app.js";
import { run } from "./engine.js";

const programs = JSON.parse(readFileSync(fileURLToPath(new URL("./programs.json", import.meta.url)), "utf8")) as Programs;

await run({ programs }, process.argv[2] ?? "/");
process.exit(0);
