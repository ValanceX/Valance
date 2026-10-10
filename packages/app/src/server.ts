// The server half, for the generated entry (`.valance/server.ts`): a pathname becomes a complete HTML document. Build time (a static export) and development both call it, so a built page
// and a served page are the same bytes. An author never imports this.
import type * as Valance from "@valancex/valance";
import { renderHead } from "@valancex/valance/web/plugin";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import type { Built } from "./app.js";
import { application, plugin, stateFor } from "./app.js";
import type { DefinedApp } from "./index.js";
import type { Content } from "./model.js";
import { routes } from "./routes.js";

export type { Built };
export { routes };

export interface ServerParts {
  readonly content: Content;
  readonly program: Valance.Program;
  readonly author?: DefinedApp | undefined;
}

export interface Rendered {
  /** 200 for a page, 404 for an address that is not one (rendered as the not-found page). */
  readonly status: number;
  readonly html: string;
}

const safe = (json: string): string => json.replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");

export const createRenderer = ({ content, program, author }: ServerParts) => {
  const app = application(content, program, author);
  const table = routes(content);

  return async (pathname: string, built: Built): Promise<Rendered> => {
    const state = stateFor(content, pathname, author);
    const served = await Effect.runPromise(renderToHtml(app, { plugins: [plugin(content, built)], state }));
    const boot = safe(JSON.stringify({ state: served.state, built }));

    return {
      status: table.known(pathname) ? 200 : 404,
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${renderHead(served.head)}</head><body><div id="app">${served.html}</div><script id="valance-boot" type="application/json">${boot}</script><script type="module" src="${built.script}"></script></body></html>`,
    };
  };
};

/** The pathnames a static export writes, under the base. */
export const pathsOf = (content: Content): ReadonlyArray<string> => routes(content).paths();
