// Pages in other languages and versions: the same page, found from the page the reader is on. Pure functions of the site's map.
import type { PageInfo, SiteMap } from "../model/site.js";

export const NOT_FOUND = "not-found";

/** The id of the page that is not there, in a language: `not-found` in the default one, `not-found:fr` in another. The language is in the id so the page can speak it. */
export const notFoundId = (map: Pick<SiteMap, "defaultLocale">, locale: string): string => locale === map.defaultLocale ? NOT_FOUND : `${NOT_FOUND}:${locale}`;
export const isNotFound = (id: string): boolean => id === NOT_FOUND || id.startsWith(`${NOT_FOUND}:`);
export const notFoundLocale = (map: Pick<SiteMap, "defaultLocale">, id: string): string => id.startsWith(`${NOT_FOUND}:`) ? id.slice(NOT_FOUND.length + 1) : map.defaultLocale;

/** The page `slug` in `locale` and `version`, if there is one. */
export const pageOf = (map: SiteMap, slug: string, locale: string, version: string): PageInfo | undefined =>
  map.pages.find((page) => page.slug === slug && page.locale === locale && page.version === version);

/** The first page of a collection in a language and version: where a switcher leads when the page the reader is on is not there. */
export const firstOf = (map: SiteMap, collection: string, locale: string, version: string): PageInfo | undefined =>
  map.pages.find((page) => page.collection === collection && page.locale === locale && page.version === version);

/** Where the site starts, in a language: the first page of the first collection that has one there. */
export const homeOf = (map: SiteMap, locale: string): PageInfo | undefined => map.pages.find((page) => page.locale === locale) ?? map.pages[0];

export interface Choice {
  readonly code: string;
  readonly label: string;
  readonly page: PageInfo;
  readonly current: boolean;
}

/** The languages the reader can go to from `page`: the same page translated if it is, else the start of that language. */
export const localesFor = (map: SiteMap, page: PageInfo): ReadonlyArray<Choice> =>
  map.locales.flatMap((locale) => {
    const target = pageOf(map, page.slug, locale.code, page.version) ?? firstOf(map, page.collection, locale.code, page.version) ?? homeOf(map, locale.code);

    return target === undefined ? [] : [{ code: locale.code, label: locale.name, page: target, current: locale.code === page.locale }];
  });

/** The versions the reader can go to from `page` (a page of a collection that has them): the same page in that version if there is one, else the start of that version. */
export const versionsFor = (map: SiteMap, page: PageInfo): ReadonlyArray<Choice> =>
  page.version === "" ? [] : map.versions.flatMap((version) => {
    // The page in that version in the reader's language; else the same page in the default language; else the start of that version, in either.
    const target = pageOf(map, page.slug, page.locale, version.code) ?? pageOf(map, page.slug, map.defaultLocale, version.code)
      ?? firstOf(map, page.collection, page.locale, version.code) ?? firstOf(map, page.collection, map.defaultLocale, version.code);

    return target === undefined ? [] : [{ code: version.code, label: version.label, page: target, current: version.code === page.version }];
  });

/** The same page in the other languages (for `hreflang`): only where it exists. */
export const translationsOf = (map: SiteMap, page: PageInfo): ReadonlyArray<PageInfo> =>
  map.locales.flatMap((locale) => { const found = pageOf(map, page.slug, locale.code, page.version); return found === undefined ? [] : [found]; });

/** The newest version's page for the same thing, which an older version's canonical address names. */
export const latestOf = (map: SiteMap, page: PageInfo): PageInfo => {
  const latest = map.versions.find((version) => version.latest);

  return page.version === "" || latest === undefined || page.version === latest.code ? page : pageOf(map, page.slug, page.locale, latest.code) ?? page;
};
