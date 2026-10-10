// URLs are the application's, not the framework's: a function from state to a URL, and from a URL to the fact `go` takes. No router.
import type { Site } from "../model/site.js";

import type { AppState } from "./state.js";
import { initial } from "./state.js";

export const NOT_FOUND = "not-found";

export const routes = (site: Site) => {
  const byPath = new Map(site.pages.map((page) => [page.path, page.id] as const));
  const byId = new Map(site.pages.map((page) => [page.id, page] as const));

  const pageIdOf = (pathname: string): string => pathname === "/" || pathname === "/docs" || pathname === "/docs/" ? initial.page : byPath.get(pathname) ?? NOT_FOUND;

  return {
    urlOf: ({ page }: AppState): string => byId.get(page)?.path ?? "/docs/",
    /** The navigation fact `go` takes, for a URL. */
    stateOf: (url: URL): { readonly id: string } => ({ id: pageIdOf(url.pathname) }),
    /** The title of the document for a state, as `history` keeps it and as the server writes it. */
    titleOf: ({ page }: AppState): string => { const title = byId.get(page)?.title; return title === undefined ? site.name : `${title} · ${site.name}`; },
    /** The state a server starts from for a request URL. */
    stateFor: (url: string): AppState => ({ ...initial, page: pageIdOf(new URL(url, "http://localhost").pathname) }),
    known: (pathname: string): boolean => pageIdOf(pathname) !== NOT_FOUND,
  };
};
