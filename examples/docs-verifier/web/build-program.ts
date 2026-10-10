// `pnpm build:program`: the views → generated/program.json, the compiled MESH program. The page script imports it, so the program is in the script (cached across pages) and in no
// document.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { compilePage } from "./compile.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const program = await compilePage();

mkdirSync(`${root}generated`, { recursive: true });
writeFileSync(`${root}generated/program.json`, `${JSON.stringify(program)}\n`);
console.log(`views → generated/program.json (${JSON.stringify(program).length} bytes)`);
