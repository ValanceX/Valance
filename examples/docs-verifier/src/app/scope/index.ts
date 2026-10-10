// What the page view reads: a function of the state and the site. The view is a template (../../views/page.mprx); this is the only place that decides what it is given. The shape is
// declared in ./contract.ts; the blocks are projected in ./blocks.ts; where the reader can go is worked out in ./navigation.ts.
import type { SiteMap } from "../../model/site.js";
import { slug } from "../../model/slug.js";
import { dateIn, say, uiFor, type Ui } from "../../model/ui.js";
import { hrefOf } from "../routes.js";
import type { AppState } from "../state.js";

import { blockView, failure } from "./blocks.js";
import type { PageScope } from "./contract.js";
import { header, pager, sidebar, siblingsOf, switchers } from "./navigation.js";

export { BlockView, PageScope, UiView } from "./contract.js";

/** What the search says, in words: shown to the reader, and announced to a screen reader. */
const statusOf = (
  { query, status, hits }: AppState["search"],
  ui: Ui,
): string => {
  switch (status) {
    case "idle":
      return "";
    case "loading":
      return ui.searching;
    case "failed":
      return ui.searchUnavailable;
    case "ready":
      return hits.length === 0
        ? say(ui.noResults, { query: query.trim() })
        : hits.length === 1
          ? ui.oneResult
          : say(ui.results, { count: hits.length });
  }
};

export const pageScope = (map: SiteMap, state: AppState): PageScope => {
  const here = map.pages.find((page) => page.id === state.page);
  const page = state.content;
  const ui = uiFor(map.ui, page.locale);
  const doc = page.layout === "doc" && here !== undefined;
  const siblings = siblingsOf(map, here);
  const blocks =
    state.status === "failed"
      ? failure(
          state.page,
          here === undefined ? map.base : hrefOf(map, here.path),
          ui,
        )
      : page.blocks;
  // "On this page" is for a page of documentation: a post is a column, a landing page is the width, an index is a list.
  const outline =
    state.status === "failed" || page.layout !== "doc" ? [] : page.outline;
  const { locales, versions } = switchers(map, here);
  const tags =
    page.layout === "post" && here !== undefined
      ? page.tags.flatMap((tag) => {
          const target = map.pages.find(
            (entry) =>
              entry.slug === `${here.collection}/tags/${slug(tag)}` &&
              entry.locale === here.locale &&
              entry.version === here.version,
          );

          return target === undefined
            ? []
            : [
                {
                  id: `${page.id}:${slug(tag)}`,
                  label: tag,
                  href: hrefOf(map, target.path),
                },
              ];
        })
      : [];
  const home =
    map.pages.find((entry) => entry.locale === page.locale) ?? map.pages[0];

  return {
    site: map.name,
    ui,
    lang: page.locale,
    layout: page.layout,
    showNav: doc,
    ...header(map, page.locale),
    footer: map.footer,
    hasLocales: locales.length > 1,
    locales,
    hasVersions: versions.length > 1,
    versions,
    post: {
      show: page.layout === "post",
      iso: page.date,
      date: dateIn(ui, page.date),
      byline: page.author === "" ? "" : `${ui.by} ${page.author}`,
      hasAuthor: page.author !== "",
      hasTags: tags.length > 0,
      tags,
    },
    home: hrefOf(map, home?.path ?? "/"),
    theme: state.theme,
    menu: state.menu ? "true" : "false",
    sections: sidebar(map, doc ? siblings : [], state.page),
    query: state.search.query,
    searching: state.search.status !== "idle",
    status: statusOf(state.search, ui),
    hits: state.search.hits.map((hit) => ({
      id: hit.id,
      href: hrefOf(map, hit.href),
      title: hit.title,
      where: [hit.section, hit.heading]
        .filter((part) => part !== "")
        .join(" › "),
      excerpt: hit.excerpt,
    })),
    loading: state.status === "loading" ? "true" : "false",
    contentStatus: state.status,
    hasToc: outline.length > 0,
    toc: outline.map((entry) => ({
      id: entry.id,
      href: `#${entry.anchor}`,
      label: entry.label,
      cls: `toc-link toc-level-${entry.level}`,
      current: entry.anchor === state.active ? "location" : "false",
    })),
    blocks: blocks.map((block) => blockView(block, state, map.base, ui)),
    ...pager(map, siblings, state.page),
  };
};
