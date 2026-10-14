// Build time: compile the screens once and write the programs next to the engine. A program is data, so the running engine carries no compiler.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compilePrograms } from "./compile.js";

const out = fileURLToPath(new URL("./programs.json", import.meta.url));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(await compilePrograms(new URL("../src/screens/", import.meta.url))));
