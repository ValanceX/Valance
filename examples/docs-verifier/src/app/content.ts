// The content of a page, for whoever holds the whole site: the build and a server, which put a page's content in the state they render from. The browser never has the whole site: it
// asks the platform for one page at a time (./capabilities.ts, `Pages`).
import type { Page, Site, SiteMap } from "../model/site.js";
import { uiFor } from "../model/ui.js";

import { isNotFound, notFoundLocale } from "./variants.js";

const text = (id: string, content: string) => ({ id, kind: "text" as const, text: content });

/** What is shown where there is no page: the application's own page, in the reader's language, not an error. */
export const missing = (map: Pick<SiteMap, "ui" | "defaultLocale">, id: string): Page => {
  const locale = notFoundLocale(map, id);
  const ui = uiFor(map.ui, locale);

  return {
    id,
    path: "",
    title: ui.notFound,
    description: "",
    section: "",
    layout: "doc",
    collection: "",
    slug: "",
    locale,
    version: "",
    date: "",
    tags: [],
    author: "",
    outline: [],
    blocks: [
      { id: "not-found:0", kind: "heading", level: 1, anchor: "not-found", spans: [text("not-found:0.0", ui.notFound)] },
      { id: "not-found:1", kind: "paragraph", spans: [text("not-found:1.0", ui.noSuchPage)] },
    ],
  };
};

/** The content of page `id`, or the not-found page. */
export const contentOf = (site: Site, id: string): Page => site.pages.find((page) => page.id === id) ?? missing(site, isNotFound(id) ? id : "not-found");
