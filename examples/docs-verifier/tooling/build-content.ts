// `pnpm build:content`: sites/<SITE> (default `docs`) → generated/<SITE>/site.json and search.json, the files the rest of the project reads.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readSite } from "./content.js";
import { buildSearchIndex } from "./search.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const name = process.env["SITE"] ?? "docs";
let site;

try {
  site = readSite(`${root}sites/${name}`);
} catch (error) {
  // A mistake in the content is reported where it is, once, and fails the build.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const index = buildSearchIndex(site);

mkdirSync(`${root}generated/${name}`, { recursive: true });
writeFileSync(`${root}generated/${name}/site.json`, `${JSON.stringify(site, null, 2)}\n`);
writeFileSync(`${root}generated/${name}/search.json`, `${JSON.stringify(index)}\n`);
console.log(`${name}: ${site.pages.length} pages → generated/${name}/site.json, ${index.entries.length} sections → generated/${name}/search.json`);
