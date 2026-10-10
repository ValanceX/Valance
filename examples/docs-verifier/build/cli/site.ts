// `pnpm build` (last stage): the prepared site and the built page → the static site, in `dist/<site>`.
import { nameAssets } from "../assets.js";
import { readGeneratedSite, siteName } from "../document.js";
import { exportSite } from "../export.js";
import { deliverable } from "../paths.js";
import { builtAssets } from "../serve.js";

const site = readGeneratedSite();
const dir = deliverable(siteName());

nameAssets(siteName(), dir);

const { files, pages } = await exportSite(site, dir, await builtAssets(dir, site.base));

console.log(`${pages.length} pages, ${files.length} files → ${dir}`);
