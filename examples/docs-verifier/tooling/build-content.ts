// `pnpm build:content`: content/ → generated/site.json, the one file the rest of the project reads.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readSite } from "./content.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const site = readSite(`${root}content`);

mkdirSync(`${root}generated`, { recursive: true });
writeFileSync(`${root}generated/site.json`, `${JSON.stringify(site, null, 2)}\n`);
console.log(`${site.pages.length} pages → generated/site.json`);
