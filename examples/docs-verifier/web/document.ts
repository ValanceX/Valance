// The server half of a page (Node): a request URL becomes a complete HTML document. The application is rendered with the public server path (`renderToHtml`) and the site's plugins,
// the head the plugins say (title, description, canonical URL, stylesheet) is written with `renderHead`, and the state it rendered from, the site, the compiled MESH program and the
// build's URLs travel in one JSON block (the browser never compiles MPRX and never reads the content directory). The document loads the page script. It writes no title and no style.
import { renderHead } from "@valancex/valance/web/plugin";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { application } from "../app/application.js";
import { routes } from "../app/routes.js";
import type { Site } from "../model/site.js";

import type { Built } from "./built.js";
import { compilePage } from "./compile.js";
import { plugins } from "./plugins.js";

/** The site `pnpm build:content` wrote. */
export const readGeneratedSite = (root = process.cwd()): Site => JSON.parse(readFileSync(join(root, "generated", "site.json"), "utf8")) as Site;

// Programs are data and do not change while the process runs: compile once. (A failure is reported when a document is first asked for, not as an unhandled rejection at import.)
const program = compilePage();

program.catch(() => undefined);

/** `built` is what `vite build` wrote (./serve.ts reads it). The head is the plugins' for the state rendered. */
export const renderDocument = async (site: Site, url: string, built: Built): Promise<string> => {
  const compiled = await program;
  const state = routes(site).stateFor(url);
  const served = await Effect.runPromise(renderToHtml(application(compiled, site), { plugins: plugins(site, built), state }));
  const boot = JSON.stringify({ program: compiled, site, state, built }).replaceAll("<", "\\u003c");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${renderHead(served.head)}</head><body><div id="app">${served.html}</div><script id="valance-boot" type="application/json">${boot}</script><script type="module" src="${built.script}"></script></body></html>`;
};
