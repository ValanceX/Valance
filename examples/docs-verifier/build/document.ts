// The server half of a page (Node): a request URL becomes a complete HTML document, for a static export and for a server alike. The application is rendered with the public server path
// (`renderToHtml`) and the site's plugins, the head the plugins say (title, description, canonical URL, stylesheet) is written with `renderHead`, and the state it rendered from (the
// page's content included) and the site's map travel in one JSON block. The compiled MESH program is not in it: it is in the page script, once, for every page. The browser never
// reads the content directory. The document writes no title and no style.
import { renderHead } from "@valancex/valance/web/plugin";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { application } from "../src/app/application.js";
import { contentOf } from "../src/app/content.js";
import { routes } from "../src/app/routes.js";
import { structuredData } from "../src/app/structured.js";
import type { AppState } from "../src/app/state.js";
import type { Site } from "../src/model/site.js";
import { mapOf } from "../src/model/site.js";

import type { Built } from "../src/web/built.js";
import { generatedSite } from "./paths.js";
import { compilePage } from "./views.js";
import { plugins } from "../src/web/plugins/index.js";

/** The name of the site being built: `SITE` in the environment, `docs` by default. */
export const siteName = (): string => process.env["SITE"] ?? "docs";

/** The site `pnpm build:content` wrote. */
export const readGeneratedSite = (name = siteName(), root = process.cwd()): Site => JSON.parse(readFileSync(join(root, generatedSite(name)), "utf8")) as Site;

// Programs are data and do not change while the process runs: compile once. (A failure is reported when a document is first asked for, not as an unhandled rejection at import.)
const program = compilePage();

program.catch(() => undefined);

/** The state a request URL starts from: the application's own (`stateFor`), with the content of the page it names. */
export const stateOf = (site: Site, url: string): AppState => {
  const state = routes(mapOf(site)).stateFor(url);

  return { ...state, content: contentOf(site, state.page) };
};

/** `built` is what `vite build` wrote (./serve.ts reads it). The head is the plugins' for the state rendered. */
export const renderDocument = async (site: Site, url: string, built: Built): Promise<string> => {
  const compiled = await program;
  const map = mapOf(site);
  const state = stateOf(site, url);
  const served = await Effect.runPromise(renderToHtml(application(compiled, map), { plugins: plugins(map, built), state }));
  const boot = JSON.stringify({ map, state, built }).replaceAll("<", "\\u003c");
  const data = structuredData(map, state);
  const structured = data === undefined ? "" : `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;

  return `<!doctype html><html lang="${state.content.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${renderHead(served.head)}${structured}</head><body><div id="app">${served.html}</div><script id="valance-boot" type="application/json">${boot}</script><script type="module" src="${built.script}"></script></body></html>`;
};
