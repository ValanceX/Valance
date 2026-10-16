// The server half, for the generated entry (`.valance/server.ts`): a pathname becomes a complete HTML document. Build time (a static export) and development both call it, so a built page
// and a served page are the same bytes. An author never imports this.
import type * as Valance from "@valancex/valance";
import { renderHead } from "@valancex/valance/web/plugin";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import type { Built } from "./app.js";
import { application, stateFor } from "./app.js";
import { plugin } from "./web-app.js";
import type { DefinedApp } from "./index.js";
import type { Content } from "./model.js";
import { normalize, routes } from "./routes.js";
import { routingFor } from "./routing-engine.js";

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
  const table = routes(content, routingFor(author));

  /** `search` is the query of the request, when there is one to give (a development server has it; a build writes pages for addresses with none). */
  return async (pathname: string, built: Built, search = ""): Promise<Rendered> => {
    const state = stateFor(content, pathname, author, search);
    const served = await Effect.runPromise(renderToHtml(app, { plugins: [plugin(content, built, author)], state }));
    const boot = safe(JSON.stringify({ state: served.state, built }));

    return {
      status: table.known(pathname) ? 200 : 404,
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${renderHead(served.head)}</head><body><div id="app">${served.html}</div><script id="valance-boot" type="application/json">${boot}</script><script type="module" src="${built.script}"></script></body></html>`,
    };
  };
};

/** The pathnames a static export writes, under the base. */
export const pathsOf = (content: Content, author?: DefinedApp): ReadonlyArray<string> => routes(content, routingFor(author)).paths();

const escape = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

/**
 * The app shell (ROUTES.md R-33, R-34): a document with an empty `#app`, the script and the stylesheets, that a host answers a client route's addresses with. Nothing in it depends on the address, so
 * one file serves them all; the browser draws the page from the address bar.
 */
export const createShell =
  ({ content }: Pick<ServerParts, "content">) =>
  (built: Built): string =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(content.site.name)}</title>${built.styles.map((href) => `<link rel="stylesheet" href="${escape(href)}">`).join("")}</head><body><div id="app"></div><script id="valance-boot" type="application/json">${safe(JSON.stringify({ shell: true, built }))}</script><script type="module" src="${built.script}"></script></body></html>`;

/** Whether the shell, not a page, answers `pathname` (under the base): it is an address of a route that says `delivery: "client"`. */
export const clientDelivered = (content: Content, author: DefinedApp | undefined, pathname: string): boolean =>
  routingFor(author).match(normalize(pathname, content.site.base))?.delivery === "client";

/** The rewrites a host reads beside the site (`_redirects`, in the syntax Netlify and Cloudflare Pages share): each client route's addresses answered by the shell with status 200. */
export const redirectsFor = (content: Content, author: DefinedApp | undefined, shell: string, everything = false): string => {
  const base = content.site.base;
  const lines = everything
    ? [`${base}*`]
    : routingFor(author)
        .list.filter((each) => each.delivery === "client")
        .map((each) => `${base.replace(/\/$/, "")}${each.pattern.replace(/\*[A-Za-z_][A-Za-z0-9_]*$/, "*")}`);

  return lines.length === 0 ? "" : `${lines.map((from) => `${from}  ${base}${shell}  200`).join("\n")}\n`;
};
