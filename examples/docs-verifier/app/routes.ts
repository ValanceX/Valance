// URLs are the application's, not the framework's: a function from state to a URL, and from a URL to the fact `go` takes. No router.
import type { Site } from "../model/site.js";

import type { AppState } from "./state.js";
import { initial } from "./state.js";

export const NOT_FOUND = "not-found";

/** The application's URL policy: a function from state to a URL and back, and what a build and a server need to know about the pages. Plain data and functions: no router. */
export const routes = (site: Site) => {
  const byPath = new Map(site.pages.map((page) => [page.path, page.id] as const));
  const byId = new Map(site.pages.map((page) => [page.id, page] as const));

  const pageIdOf = (pathname: string): string => pathname === "/" || pathname === "/docs" || pathname === "/docs/" ? initial.page : byPath.get(pathname) ?? NOT_FOUND;

  return {
    /** The application's navigate command: `stateOf` makes its input. */
    navigate: "go",
    urlOf: ({ page }: AppState): string => byId.get(page)?.path ?? "/docs/",
    /** The navigation fact `go` takes, for a URL. */
    stateOf: (url: URL): { readonly id: string } => ({ id: pageIdOf(url.pathname) }),
    /** The title of the document for a state, as `history` keeps it and as the server writes it. */
    titleOf: ({ page }: AppState): string => { const title = byId.get(page)?.title; return title === undefined ? site.name : `${title} · ${site.name}`; },
    /** The state a server starts from for a request URL. */
    stateFor: (url: string): AppState => ({ ...initial, page: pageIdOf(new URL(url, "http://localhost").pathname) }),
    known: (pathname: string): boolean => pageIdOf(pathname) !== NOT_FOUND,
    /** Every page's own URL, in the order of the site. (`/` and `/docs` show the first page; its canonical URL is its own.) */
    paths: (): ReadonlyArray<string> => site.pages.map((page) => page.path),
    /** The page's own URL, the one a search engine should keep when the same page is reached by another (`/`). */
    canonicalOf: ({ page }: AppState): string | undefined => byId.get(page)?.path,
    /** A one-line description of the page, for a search result and a link preview. */
    descriptionOf: ({ page }: AppState): string => byId.get(page)?.description ?? site.name,
  };
};
