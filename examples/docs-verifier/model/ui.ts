// The words the interface speaks: every label, status and message the kit draws, in English, with a key each. A site in another language gives the keys it changes (`ui` in
// `site.json`, by language), and the rest stay English. Pure data; nothing here draws anything.
export const defaultUi = {
  menu: "Menu",
  navigation: "Navigation",
  documentation: "Documentation",
  search: "Search",
  searchLabel: "Search the site",
  colourTheme: "Colour theme",
  themeSystem: "Auto",
  themeSystemLabel: "Follow the system theme",
  themeLight: "Light",
  themeLightLabel: "Use the light theme",
  themeDark: "Dark",
  themeDarkLabel: "Use the dark theme",
  onThisPage: "On this page",
  previousAndNext: "Previous and next page",
  linkToSection: "Link to this section",
  copy: "Copy",
  copied: "Copied",
  failed: "Failed",
  alternatives: "Alternatives",
  searching: "Searching…",
  searchUnavailable: "Search is not available right now.",
  noResults: "No results for “{query}”.",
  oneResult: "1 result",
  results: "{count} results",
  couldNotLoad: "This page could not be loaded",
  connectionDropped: "The connection may have dropped. ",
  tryAgain: "Try again",
  notFound: "Not found",
  noSuchPage: "There is no such page.",
  language: "Language",
  version: "Version",
  tags: "Tags",
  allTags: "All tags",
  taggedWith: "Posts tagged “{tag}”",
  postsCount: "{count} posts",
  postedOn: "Posted",
  by: "by",
  newer: "Newer",
  older: "Older",
  readMore: "Read more",
  months: "January,February,March,April,May,June,July,August,September,October,November,December",
} as const;

export type UiKey = keyof typeof defaultUi;
export type Ui = { readonly [K in UiKey]: string };

/** The interface's words for `locale`: the kit's English, with what the site says in that language over it. */
export const uiFor = (overrides: Readonly<Record<string, Readonly<Record<string, string>>>>, locale: string): Ui => ({ ...defaultUi, ...(overrides[locale] ?? {}) }) as Ui;

/** `{name}` in `template` replaced by `values.name`. */
export const say = (template: string, values: Readonly<Record<string, string | number>> = {}): string => template.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));

/** `2026-03-12` as "12 March 2026", in the interface's own months, so the server and the browser say the same whatever each one's locale data is. */
export const dateIn = (ui: Ui, iso: string): string => {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  return found === null ? iso : `${Number(found[3])} ${ui.months.split(",")[Number(found[2]) - 1] ?? found[2]} ${found[1]}`;
};
