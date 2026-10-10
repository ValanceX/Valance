// The URL policy, derived from the content: a page's path is its address. Handed to Valance as a `RouteTable` (Plugin.routes), which `Web.run` turns into the browser's history and link handling
// and a static export reads for the addresses it writes. The application never writes a route.
import type { RouteTable } from "@valancex/valance/web/plugin";

import type { Content } from "./model.js";
import { pageAt } from "./scope.js";

export interface PageState { readonly page: string }

/** An address as the application sees it: under the base removed, no trailing slash, `/` for the first page. An address outside the base is kept whole (it is not a page). */
export const normalize = (pathname: string, base: string): string => {
  const inside = pathname === base.replace(/\/$/, "") ? "/" : pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
  const trimmed = inside.replace(/\/+$/, "");

  return trimmed === "" ? "/" : trimmed;
};

export const urlOf = (content: Content, path: string): string => `${content.site.base}${path.replace(/^\//, "")}`;

export const routes = (content: Content): RouteTable<PageState> => ({
  urlOf: ({ page }) => urlOf(content, page),
  stateOf: (url) => ({ id: normalize(url.pathname, content.site.base) }),
  navigate: "go",
  known: (pathname) => pageAt(content, normalize(pathname, content.site.base)) !== undefined,
  paths: () => content.pages.map((page) => urlOf(content, page.path)),
  // Static first: every page is rendered once at build time.
  delivery: () => "static",
  onNavigated: ({ kind, url }) => {
    // Land at the top of a new page, or at its heading when the address names one; Back and Forward are the browser's to restore.
    if (kind !== "link" || typeof window === "undefined") { return; }

    // The application's state has no fragment, so the address bar lost it: put it back.
    if (url.hash !== "") { window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`); }

    const target = url.hash === "" ? undefined : document.getElementById(decodeURIComponent(url.hash.slice(1)));

    if (target === null || target === undefined) { window.scrollTo(0, 0); } else { target.scrollIntoView(); }
  },
});
