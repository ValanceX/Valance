// What a page says about itself to a search engine as data, not as markup: schema.org's JSON-LD, for the page the document is for. A pure function of the site's map and the state, so a build
// and a server say the same; the document writes it once (the browser does not keep it in step: a crawler reads the document it was given).
import type { SiteMap } from "../model/site.js";

import type { AppState } from "./state.js";
import { routes } from "./routes.js";
import { isNotFound } from "./variants.js";

/** The structured data of the page in `state`, or nothing: a page that is not there says nothing, and a site not yet published has no address to say. */
export const structuredData = (map: SiteMap, state: AppState): Readonly<Record<string, unknown>> | undefined => {
  const page = state.content;
  const canonical = routes(map).canonicalOf(state);

  if (isNotFound(state.page) || canonical === undefined || map.url === "") { return undefined; }

  const site = { "@type": "WebSite", name: map.name, url: `${map.url}${map.base}` };
  const common = { "@context": "https://schema.org", name: page.title, headline: page.title, description: page.description, url: canonical, inLanguage: page.locale, isPartOf: site };

  switch (page.layout) {
    case "post": return { ...common, "@type": "BlogPosting", datePublished: page.date, ...(page.author === "" ? {} : { author: { "@type": "Person", name: page.author } }), ...(page.tags.length === 0 ? {} : { keywords: page.tags.join(", ") }) };
    case "doc": return { ...common, "@type": "TechArticle" };
    case "list": return { ...common, "@type": "CollectionPage" };
    case "landing": return { ...common, "@type": "WebPage" };
  }
};
