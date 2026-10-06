// The server half of a page (Node): a request URL becomes a complete HTML document. The application is rendered with the public server path (`renderToHtml`), the state it
// rendered from and the compiled MESH programs travel in one JSON block (the browser never compiles MPRX), and the document loads the page script (./page.ts).
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { application, stateFor, titleOf } from "./app.js";
import { compilePrograms } from "./compile.js";
import { primitives } from "./web.js";

const escape = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// Programs are data and do not change while the process runs: compile once.
const programs = compilePrograms();

/** `script` is the URL of the page script (the built asset, from ./serve.ts). The title is the application's own `titleOf` for the state rendered. */
export const renderDocument = async (url: string, script: string): Promise<string> => {
  const built = await programs;
  const state = stateFor(url);
  // Search runs in the browser: rendering never starts one, so the service here is never called.
  const { html } = await Effect.runPromise(renderToHtml(application(built, async () => []), { primitives, state }));
  const boot = JSON.stringify({ programs: built, state }).replaceAll("<", "\\u003c");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(titleOf(state))}</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0}shell>*{padding:0 1rem}ul{list-style:none;padding:0}pre{background:#f4f4f8;padding:.75rem;overflow:auto}</style></head><body><div id="app">${html}</div><script type="application/json" id="valance-boot">${boot}</script><script type="module" src="${script}"></script></body></html>`;
};
