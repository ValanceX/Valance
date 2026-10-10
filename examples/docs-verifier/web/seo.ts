// What the document's head says about a page: its title, a description, and its own URL as the canonical one (the first page is also served at `/` and `/docs`). The same function
// runs on the server, which writes it into the document, and in the browser, which keeps it in step as the reader moves.
import type { Plugin } from "@valancex/valance/web/plugin";

import { routes } from "../app/routes.js";
import type { AppState } from "../app/state.js";
import type { SiteMap } from "../model/site.js";

export const seo = (map: SiteMap): Plugin<AppState> => {
  const { titleOf, descriptionOf, canonicalOf, alternatesOf } = routes(map);

  return {
    name: "site-seo",
    head: (state) => {
      const canonical = canonicalOf(state);

      return {
        title: titleOf(state),
        meta: [
          { name: "description", content: descriptionOf(state) },
          { property: "og:title", content: titleOf(state) },
          { property: "og:type", content: "article" },
          // A page that is not there is not for a search engine to keep.
          ...(canonical === undefined ? [{ name: "robots", content: "noindex" }] : []),
        ],
        links: [
          ...(canonical === undefined ? [] : [{ rel: "canonical", href: canonical }]),
          // The same page in the site's other languages, for a search engine to offer each reader theirs.
          ...alternatesOf(state).map((alternate) => ({ rel: "alternate", hreflang: alternate.locale, href: alternate.href })),
          // A site with a feed says so, once, on every page.
          ...(map.feeds.length > 0 ? [{ rel: "alternate", type: "application/atom+xml", title: map.name, href: `${map.base}feed.xml` }] : []),
        ],
      };
    },
  };
};
