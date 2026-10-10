// What the document's head says about a page: its title, a description, and its own URL as the canonical one (the first page is also served at `/` and `/docs`). The same function
// runs on the server, which writes it into the document, and in the browser, which keeps it in step as the reader moves.
import type { Plugin } from "@valancex/valance/web/plugin";

import { routes } from "../app/routes.js";
import type { AppState } from "../app/state.js";
import type { Site } from "../model/site.js";

export const seo = (site: Site): Plugin<AppState> => {
  const { titleOf, descriptionOf, canonicalOf } = routes(site);

  return {
    name: "docs-seo",
    head: (state) => {
      const canonical = canonicalOf(state);

      return {
        title: titleOf(state),
        meta: [{ name: "description", content: descriptionOf(state) }, { property: "og:title", content: titleOf(state) }, { property: "og:type", content: "article" }],
        links: canonical === undefined ? [] : [{ rel: "canonical", href: canonical }],
      };
    },
  };
};
