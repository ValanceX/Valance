// URLs are the application's, not the framework's: a function from state to a URL, and from a URL to the fact `go` takes. No router.
//
// A page's own path (`/docs/guides/state`) is what the content says; the URL is that path under the site's `base` (`/docs-site/docs/guides/state` when the site is served from
// `/docs-site/`). Nothing else in the application knows the base.
import type { SiteMap } from "../model/site.js";

import type { AppState } from "./state.js";
import { initial } from "./state.js";

export const NOT_FOUND = "not-found";

/** `path` under the site's base. */
export const hrefOf = (map: Pick<SiteMap, "base">, path: string): string => `${map.base}${path.replace(/^\//, "")}`;

/** The application's URL policy: a function from state to a URL and back, and what a build and a server need to know about the pages. Plain data and functions: no router. */
export const routes = (map: SiteMap) => {
  const byPath = new Map(map.pages.map((page) => [page.path, page.id] as const));
  const byId = new Map(map.pages.map((page) => [page.id, page] as const));
  const first = map.pages[0]?.path ?? "/";

  /** The path of a URL's pathname inside the site: without the base, without a trailing slash. Outside the base it is nothing. */
  const insideOf = (pathname: string): string | undefined => {
    if (!pathname.startsWith(map.base)) { return pathname === map.base.slice(0, -1) ? "/" : undefined; }

    const rest = `/${pathname.slice(map.base.length)}`;

    return rest.length > 1 ? rest.replace(/\/+$/, "") : rest;
  };
  const pageIdOf = (pathname: string): string => {
    const inside = insideOf(pathname);

    if (inside === undefined) { return NOT_FOUND; }

    return inside === "/" || inside === "/docs" ? initial.page : byPath.get(inside) ?? NOT_FOUND;
  };

  return {
    /** The application's navigate command: `stateOf` makes its input. */
    navigate: "go",
    urlOf: ({ page }: AppState): string => hrefOf(map, byId.get(page)?.path ?? first),
    /** The navigation fact `go` takes, for a URL. */
    stateOf: (url: URL): { readonly id: string } => ({ id: pageIdOf(url.pathname) }),
    /** The title of the document for a state, as `history` keeps it and as the server writes it. */
    titleOf: ({ page }: AppState): string => { const title = byId.get(page)?.title; return title === undefined ? map.name : `${title} · ${map.name}`; },
    /** The state a server starts from for a request URL (its content is the server's to put there: ./content.ts). */
    stateFor: (url: string): AppState => ({ ...initial, page: pageIdOf(new URL(url, "http://localhost").pathname) }),
    known: (pathname: string): boolean => pageIdOf(pathname) !== NOT_FOUND,
    /** Every page's own URL, in the order of the site, under the base. */
    paths: (): ReadonlyArray<string> => map.pages.map((page) => hrefOf(map, page.path)),
    /** The page's own address, the one a search engine should keep when the same page is reached by another (`/`); absolute when the site says where it is published. */
    canonicalOf: ({ page }: AppState): string | undefined => { const found = byId.get(page); return found === undefined ? undefined : `${map.url}${hrefOf(map, found.path)}`; },
    /** A one-line description of the page, for a search result and a link preview. */
    descriptionOf: ({ page }: AppState): string => byId.get(page)?.description ?? map.name,
  };
};
