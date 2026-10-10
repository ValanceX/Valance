// `pnpm build:content`: content/ → generated/site.json, the one file the rest of the project reads.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readSite } from "./content.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
let site;

try {
  site = readSite(`${root}content`);
} catch (error) {
  // A mistake in the content is reported where it is, once, and fails the build.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}


mkdirSync(`${root}generated`, { recursive: true });
writeFileSync(`${root}generated/site.json`, `${JSON.stringify(site, null, 2)}\n`);
console.log(`${site.pages.length} pages → generated/site.json`);
