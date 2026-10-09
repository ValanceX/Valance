// The server half of a page (Node): a request URL becomes a complete HTML document. The application is rendered with the public server path (`renderToHtml`), the state it rendered from,
// the site and the compiled MESH program travel in one JSON block (the browser never compiles MPRX and never reads the content directory), and the document loads the page script.
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { application } from "../app/application.js";
import { routes } from "../app/routes.js";
import type { Site } from "../model/site.js";

import { compilePage } from "./compile.js";
import { primitives } from "./primitives.js";

const escape = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The site `pnpm build:content` wrote. */
export const readGeneratedSite = (root = process.cwd()): Site => JSON.parse(readFileSync(join(root, "generated", "site.json"), "utf8")) as Site;

// Programs are data and do not change while the process runs: compile once.
const program = compilePage();

const STYLE = "body{font:16px/1.6 system-ui,sans-serif;margin:0}header,footer{padding:.75rem 1.5rem;background:#f3f3f3}nav ul{list-style:none;padding:0}main{padding:1rem 1.5rem;max-width:48rem}pre{background:#111;color:#eee;padding:1rem;overflow:auto}aside{border-left:4px solid #888;padding:.25rem 1rem;background:#fafafa}figure{margin:0}";

/** `script` is the URL of the page script (the built asset, from ./serve.ts). The title is the application's own `titleOf` for the state rendered. */
export const renderDocument = async (site: Site, url: string, script: string): Promise<string> => {
  const built = await program;
  const { stateFor, titleOf } = routes(site);
  const state = stateFor(url);
  const { html } = await Effect.runPromise(renderToHtml(application(built, site), { primitives, state }));
  const boot = JSON.stringify({ program: built, site, state }).replaceAll("<", "\\u003c");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(titleOf(state))}</title><style>${STYLE}</style></head><body><div id="app">${html}</div><script id="valance-boot" type="application/json">${boot}</script><script type="module" src="${script}"></script></body></html>`;
};
