// The content of a page, for whoever holds the whole site: the build and a server, which put a page's content in the state they render from. The browser never has the whole site: it
// asks the platform for one page at a time (./capabilities.ts, `Pages`).
import type { Page, Site } from "../model/site.js";

import { NOT_FOUND } from "./routes.js";

const text = (id: string, content: string) => ({ id, kind: "text" as const, text: content });

/** What is shown where there is no page: the application's own page, not an error. */
export const missing: Page = {
  id: NOT_FOUND,
  path: "",
  title: "Not found",
  description: "",
  section: "",
  outline: [],
  blocks: [
    { id: "not-found:0", kind: "heading", level: 1, anchor: "not-found", spans: [text("not-found:0.0", "Not found")] },
    { id: "not-found:1", kind: "paragraph", spans: [text("not-found:1.0", "There is no such page.")] },
  ],
};

/** The content of page `id`, or the not-found page. */
export const contentOf = (site: Site, id: string): Page => site.pages.find((page) => page.id === id) ?? missing;
