// The "server" half of a real page (Node): a request URL becomes a complete HTML document. The application is rendered with the public server
// path (`renderToHtml`), the state it rendered from and the compiled MESH programs travel in one JSON block (the browser never compiles MPRX), and
// the document loads the page script (./page.ts). What a URL means (`stateFor`) is the application's, as everywhere in this example.
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { application, primitives, stateFor } from "./app.js";
import { compilePrograms } from "./compile.js";

export const renderDocument = async (url: string): Promise<string> => {
  const programs = await compilePrograms();
  const state = stateFor(url);
  const { html } = await Effect.runPromise(renderToHtml(application(programs), { primitives, state }));
  const boot = JSON.stringify({ programs, state }).replaceAll("<", "\\u003c");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Tracer</title></head><body><main id="app">${html}</main><script type="application/json" id="valance-boot">${boot}</script><script type="module" src="/src/page.ts"></script></body></html>`;
};
