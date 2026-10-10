// `pnpm build` (first stage): what the page is made from. `sites/<SITE>` (default `docs`) → `.valance/<SITE>/site.json` and `search.json`, and `src/views` → `.valance/program.json`, the
// compiled MESH program. The page script imports the program; the later stages read the site.
import { mkdirSync, writeFileSync } from "node:fs";

import { readSite } from "../content/site.js";
import { buildSearchIndex } from "../content/search.js";
import { generatedProgram, generatedSearch, generatedSite } from "../paths.js";
import { compilePage } from "../views.js";

const name = process.env["SITE"] ?? "docs";
let site;

try {
  site = readSite(`sites/${name}`);
} catch (error) {
  // A mistake in the content is reported where it is, once, and fails the build.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const index = buildSearchIndex(site);
const program = await compilePage();

mkdirSync(`.valance/${name}`, { recursive: true });
writeFileSync(generatedSite(name), `${JSON.stringify(site, null, 2)}\n`);
writeFileSync(generatedSearch(name), `${JSON.stringify(index)}\n`);
writeFileSync(generatedProgram, `${JSON.stringify(program)}\n`);
console.log(`${name}: ${site.pages.length} pages, ${index.entries.length} sections, ${JSON.stringify(program).length} bytes of views → .valance/`);
