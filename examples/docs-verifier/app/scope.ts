// What the page view reads: a function of the state and the site. The view is a template (../views/page.mprx); this is the only place that decides what it is given.
import { Schema } from "effect";

import type { Block, Page, Site } from "../model/site.js";

import { NOT_FOUND } from "./routes.js";
import type { AppState } from "./state.js";

const Link = Schema.Struct({ href: Schema.String, label: Schema.String });

export const PageScope = Schema.Struct({
  site: Schema.String,
  nav: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, href: Schema.String })),
  blocks: Schema.Array(Schema.Struct({
    id: Schema.String,
    kind: Schema.String,
    text: Schema.String,
    level: Schema.Number,
    lang: Schema.String,
    tone: Schema.String,
    copyLabel: Schema.String,
  })),
  prev: Link,
  next: Link,
});
export type PageScope = typeof PageScope.Type;

const missing: Page = {
  id: NOT_FOUND,
  path: "",
  title: "Not found",
  section: "",
  blocks: [{ id: "not-found:0", kind: "heading", text: "Not found", level: 1, lang: "", tone: "" }, { id: "not-found:1", kind: "paragraph", text: "There is no such page.", level: 0, lang: "", tone: "" }],
};

const none = { href: "", label: "" };

export const pageScope = (site: Site, state: AppState): PageScope => {
  const at = site.pages.findIndex((page) => page.id === state.page);
  const page = site.pages[at] ?? missing;
  const link = (target: Page | undefined, arrow: (title: string) => string) => target === undefined ? none : { href: target.path, label: arrow(target.title) };
  const show = (block: Block) => ({ ...block, copyLabel: block.kind === "code" ? (state.copied === block.id ? "Copied" : "Copy") : "" });

  return {
    site: site.name,
    nav: site.pages.map((entry) => ({ id: entry.id, href: entry.path, label: `${entry.id === state.page ? "› " : ""}${entry.section === "" ? "" : `${entry.section}: `}${entry.title}` })),
    blocks: page.blocks.map(show),
    prev: at > 0 ? link(site.pages[at - 1], (title) => `← ${title}`) : none,
    next: at >= 0 ? link(site.pages[at + 1], (title) => `${title} →`) : none,
  };
};
