// Writes gallery/structure.web.json (the structure of every cell through the Web PORT in jsdom: the gate of decision Q8) and gallery/index.html (the gallery as a page, for a person; not committed).
import { writeFileSync } from "node:fs";
import { loadSpecifications, loadWeb } from "@valancex/primitives";

import { jsdomAdapter } from "../dist/adapters/jsdom.js";
import { cellsOf, structureOf } from "../dist/gallery.js";
import { gallerySite } from "../dist/site.js";

const cells = cellsOf(loadSpecifications(), loadWeb());
const structure = await structureOf(jsdomAdapter("snapshot"), cells);

writeFileSync(new URL("../gallery/structure.web.json", import.meta.url), `${JSON.stringify(structure, null, 1)}\n`);
writeFileSync(new URL("../gallery/index.html", import.meta.url), gallerySite().html);
console.log(`gallery/structure.web.json: ${cells.length} cells`);
