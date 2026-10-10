// Where the reader can go from the page they are on: the sidebar of its collection, the page before and after it, the same page in other languages and versions, and the site's header
// links. Pure functions of the site's map; the reader's page is one of its pages.
import type { PageInfo, SiteMap } from "../../model/site.js";
import { slug } from "../../model/slug.js";
import { hrefOf } from "../routes.js";
import { localesFor, versionsFor } from "../variants.js";

export const none = { href: "", label: "" };

/** The pages of the collection the reader is in, in its language and version and of its layout: the navigation, and what comes before and after. */
export const siblingsOf = (map: SiteMap, here: PageInfo | undefined): ReadonlyArray<PageInfo> =>
  here === undefined
    ? []
    : map.pages.filter(
        (entry) =>
          entry.collection === here.collection &&
          entry.locale === here.locale &&
          entry.version === here.version &&
          entry.layout === here.layout,
      );

/** The sidebar: the siblings, grouped by the section the site's configuration put them in. */
export const sidebar = (map: SiteMap, siblings: ReadonlyArray<PageInfo>, current: string) => {
  const sections: Array<{
    id: string;
    title: string;
    items: Array<{ id: string; href: string; label: string; current: string }>;
  }> = [];

  for (const entry of siblings) {
    const id = entry.section === "" ? "top" : slug(entry.section) || "section";
    const section =
      sections.find((candidate) => candidate.id === id) ??
      sections[sections.push({ id, title: entry.section, items: [] }) - 1]!;

    section.items.push({
      id: entry.id,
      href: hrefOf(map, entry.path),
      label: entry.title,
      current: entry.id === current ? "page" : "false",
    });
  }

  return sections;
};

/** The page before and the page after the current one among its siblings. */
export const pager = (map: SiteMap, siblings: ReadonlyArray<PageInfo>, current: string) => {
  const place = siblings.findIndex((entry) => entry.id === current);
  const link = (
    target: PageInfo | undefined,
    arrow: (title: string) => string,
  ) =>
    target === undefined
      ? none
      : { href: hrefOf(map, target.path), label: arrow(target.title) };

  return {
    hasPager: place > 0 || (place >= 0 && place < siblings.length - 1),
    prev: place > 0 ? link(siblings[place - 1], (title) => `← ${title}`) : none,
    next:
      place >= 0 && place < siblings.length - 1
        ? link(siblings[place + 1], (title) => `${title} →`)
        : none,
  };
};

/** The same page in the other languages and in the other versions. */
export const switchers = (map: SiteMap, here: PageInfo | undefined) => {
  const choice =
    (kind: string) =>
    (entry: {
      readonly code: string;
      readonly label: string;
      readonly page: { readonly path: string };
      readonly current: boolean;
    }) => ({
      id: `${kind}:${entry.code}`,
      label: entry.label,
      href: hrefOf(map, entry.page.path),
      code: entry.code,
      current: entry.current ? "true" : "false",
    });

  return {
    locales: here === undefined ? [] : localesFor(map, here).map(choice("locale")),
    versions: here === undefined ? [] : versionsFor(map, here).map(choice("version")),
  };
};

/** The links in the site's header, in the page's language. An address on another site is as written. */
export const header = (map: SiteMap, locale: string) => {
  const links = map.header[locale] ?? map.header[map.defaultLocale] ?? [];

  return {
    hasHeader: links.length > 0,
    header: links.map((entry, index) => ({
      id: String(index),
      label: entry.label,
      href: /^[a-z][a-z0-9+.-]*:/i.test(entry.href)
        ? entry.href
        : hrefOf(map, entry.href),
    })),
  };
};
