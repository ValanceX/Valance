// `pnpm build:site`: the generated site and the built assets → the static site, in dist/site.
import { exportSite } from "./export.js";
import { readGeneratedSite } from "./document.js";
import { builtAssets } from "./serve.js";

const site = readGeneratedSite();
const dir = "dist/site";
const { files, pages } = await exportSite(site, dir, await builtAssets(dir, site.base));

console.log(`${pages.length} pages, ${files.length} files → ${dir}`);
