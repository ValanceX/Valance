// What `vite build` does not do. The search index and the site's theme (an optional sites/<site>/theme.css, which overrides the kit's custom properties) are named by their content and put
// beside the page script, and `built.json` says where, so the server, the exporter and the page can link them. (Paths are relative to the site's base; ./serve.ts puts the base in front.)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { generatedSearch } from "./paths.js";

const named = (prefix: string, extension: string, content: Buffer): string => `${prefix}-${createHash("sha256").update(content).digest("base64url").slice(0, 8)}.${extension}`;

export const nameAssets = (site: string, dir: string): void => {
  const built: { search?: string; theme?: string } = {};
  const index = readFileSync(generatedSearch(site));

  writeFileSync(`${dir}/assets/${named("search", "json", index)}`, index);
  built.search = `assets/${named("search", "json", index)}`;

  if (existsSync(`sites/${site}/theme.css`)) {
    const theme = readFileSync(`sites/${site}/theme.css`);

    writeFileSync(`${dir}/assets/${named("theme", "css", theme)}`, theme);
    built.theme = `assets/${named("theme", "css", theme)}`;
  }

  writeFileSync(`${dir}/built.json`, `${JSON.stringify(built)}\n`);
};
