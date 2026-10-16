// The URL policy, derived from the content: a page's path is its address. Handed to Valance as a `RouteTable` (Plugin.routes), which `Web.run` turns into the browser's history and link handling
// and a static export reads for the addresses it writes. The application never writes a route.
import type { RouteTable } from "@valancex/valance/web/plugin";

import { announcePage } from "./announce.js";
import type { Content } from "./model.js";
import type { Routing } from "./routing-engine.js";
import { routingFor } from "./routing-engine.js";
import { pageAt } from "./scope.js";
import { pageUrl } from "./url.js";

export interface PageState {
  readonly page: string;
}

/** An address as the application sees it: under the base removed, no trailing slash, `/` for the first page. An address outside the base is kept whole (it is not a page). */
export const normalize = (pathname: string, base: string): string => {
  const inside = pathname === base.replace(/\/$/, "") ? "/" : pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
  const trimmed = inside.replace(/\/+$/, "");

  return trimmed === "" ? "/" : trimmed;
};

/** A page address as the application writes it (`go("/guide/a/")`, `go("guide/a")`): one leading slash, no trailing slash, `/` for the first page. The base is not part of it. */
export const tidy = (path: string): string => {
  const trimmed = path.replace(/^\/+/, "").replace(/\/+$/, "");

  return trimmed === "" ? "/" : `/${trimmed}`;
};

export const urlOf = (content: Content, path: string): string => pageUrl(content.site.base, path, content.site.trailingSlash);

/** Where an alias leads (a route with `redirectTo`), followed to the end (at most eight hops); any other address is itself. */
export const followed = (routing: Routing, address: string): string => {
  let here = address;

  for (let hops = 0; hops < 8; hops += 1) {
    const next = routing.any ? routing.alias(here) : undefined;

    if (next === undefined) {
      return here;
    }

    here = routing.match(next)?.address ?? next;
  }

  return here;
};

/**
 * The address a URL is, inside the application: a declared route's canonical path and query, or the content page's path. The query belongs to a declared route only; a content page has none.
 */
export const addressOf = (content: Content, routing: Routing, url: { readonly pathname: string; readonly search: string }): string => {
  const path = normalize(url.pathname, content.site.base);
  const matched = (routing.any ? routing.match(`${path}${url.search}`)?.address : undefined) ?? path;

  return followed(routing, matched);
};

export const routes = (content: Content, routing: Routing = routingFor(undefined)): RouteTable<PageState> => ({
  urlOf: ({ page }) => urlOf(content, page),
  stateOf: (url) => ({ id: addressOf(content, routing, url) }),
  navigate: "go",
  known: (pathname) => {
    const path = normalize(pathname, content.site.base);

    return pageAt(content, path) !== undefined || routing.match(path) !== undefined;
  },
  paths: () => [...content.pages.map((page) => urlOf(content, page.path)), ...routing.pages().addresses.map((address) => urlOf(content, address))],
  // Static first: every page is rendered once at build time.
  delivery: () => "static",
  onNavigated: ({ kind, url }) => {
    if (typeof window === "undefined") {
      return;
    }

    // A person who cannot see the page change is told it did: the new title, and focus at the content. Not for a fragment (the browser moves there itself), and not when the project turned it off.
    const announce = (): void => {
      if (content.site.announce && url.hash === "") {
        setTimeout(() => announcePage(document as never), 0); // after the application has presented the new page
      }
    };

    // Land at the top of a new page, or at its heading when the address names one; Back and Forward are the browser's to restore.
    if (kind !== "link") {
      announce();
      return;
    }

    // The application's state has no fragment, so the address bar lost it: put it back.
    if (url.hash !== "") {
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    const target = url.hash === "" ? undefined : document.getElementById(decodeURIComponent(url.hash.slice(1)));

    if (target === null || target === undefined) {
      window.scrollTo(0, 0);
    } else {
      target.scrollIntoView();
    }

    announce();
  },
});
