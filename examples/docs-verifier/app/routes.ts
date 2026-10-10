// URLs are the application's, not the framework's: a function from state to a URL, and from a URL to the fact `go` takes. No router.
import type { Site } from "../model/site.js";
import type { AppState } from "./state.js";

import { initial } from "./state.js";
import { homeOf, isNotFound, latestOf, notFoundId, translationsOf } from "./variants.js";

export { NOT_FOUND } from "./variants.js";

/** `path` under the site's base. */
export const hrefOf = (map: Pick<SiteMap, "base">, path: string): string => `${map.base}${path.replace(/^\//, "")}`;

/** The file a page's content is in, relative to the site's base: `docs/guides/state/index.json`, and `index.json` for the page at the root. The export writes it, a server serves it, the browser fetches it. */
export const contentFile = (path: string): string => `${path.replace(/^\/+|\/+$/g, "")}/index.json`.replace(/^\//, "");

/** The application's URL policy: a function from state to a URL and back, and what a build and a server need to know about the pages. Plain data and functions: no router. */
export const routes = (map: SiteMap) => {
  const byPath = new Map(map.pages.map((page) => [page.path, page.id] as const));
  const byId = new Map(map.pages.map((page) => [page.id, page] as const));
  const roots = new Map(map.roots.map((root) => [root.path, root.page] as const));
  const first = map.pages[0]?.path ?? "/";

  /** The path of a URL's pathname inside the site: without the base, without a trailing slash. Outside the base it is nothing. */
  const insideOf = (pathname: string): string | undefined => {
    if (!pathname.startsWith(map.base)) { return pathname === map.base.slice(0, -1) ? "/" : undefined; }

    const rest = `/${pathname.slice(map.base.length)}`;

    return rest.length > 1 ? rest.replace(/\/+$/, "") || "/" : rest;
  };
  /** The language an address is in: its first segment, when that is a language of the site that is not the default. */
  const localeOf = (inside: string): string => {
    const segment = inside.split("/")[1] ?? "";

    return map.locales.some((locale) => locale.code === segment && segment !== map.defaultLocale) ? segment : map.defaultLocale;
  };
  const pageIdOf = (pathname: string): string => {
    const inside = insideOf(pathname);

    if (inside === undefined) { return notFoundId(map, map.defaultLocale); }

    return byPath.get(inside) ?? roots.get(inside) ?? notFoundId(map, localeOf(inside));
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
    known: (pathname: string): boolean => !isNotFound(pageIdOf(pathname)),
    /** Every page's own URL, in the order of the site, under the base. */
    paths: (): ReadonlyArray<string> => map.pages.map((page) => hrefOf(map, page.path)),
    /** The addresses that are no page and lead to one (`/`, `/docs`), under the base: documents too, so a reader and a crawler that go there find the page. */
    aliases: (): ReadonlyArray<string> => map.roots.map((root) => hrefOf(map, root.path)),
    /**
     * The page's own address, the one a search engine should keep when the same page is reached by another (`/`), or in an older version (the newest version's page); absolute when
     * the site says where it is published.
     */
    canonicalOf: ({ page }: AppState): string | undefined => { const found = byId.get(page); return found === undefined ? undefined : `${map.url}${hrefOf(map, latestOf(map, found).path)}`; },
    /** The same page in the site's other languages: where a search engine should look for it (`hreflang`). Only with more than one. */
    alternatesOf: ({ page }: AppState): ReadonlyArray<{ readonly locale: string; readonly href: string }> => {
      const found = byId.get(page);

      const translations = found === undefined || map.locales.length < 2 ? [] : translationsOf(map, found);

      // A page alone in its language has nothing to be an alternate of.
      return found === undefined || translations.length < 2 ? [] : translations.map((other) => ({ locale: other.locale, href: `${map.url}${hrefOf(map, other.path)}` }));
    },
    /** A one-line description of the page, for a search result and a link preview. */
    descriptionOf: ({ page }: AppState): string => byId.get(page)?.description ?? map.name,
    /** Where the site starts in a language. */
    homeOf: (locale: string): string => hrefOf(map, homeOf(map, locale)?.path ?? first),
  };
};
