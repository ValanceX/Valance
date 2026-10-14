// The content model: what the build produces from `content/` and what the application and its layout consume. Plain JSON-able data. A MESH scope is flat, so a block is one record whose
// unused fields are empty (`kind` says which are meaningful); the empty values are explicit so a template never reads something missing.

/** A run of inline text. `href` is empty unless `kind` is `link`. */
export interface Span {
  readonly id: string;
  readonly kind: "text" | "strong" | "emphasis" | "code" | "link";
  readonly text: string;
  readonly href: string;
}

export interface Item {
  readonly id: string;
  readonly spans: ReadonlyArray<Span>;
}

/** What a layout draws a page's body from. Kinds: heading, paragraph, list, code, quote, image. */
export interface Block {
  readonly id: string;
  readonly kind: "heading" | "paragraph" | "list" | "code" | "quote" | "image";
  /** heading: 1 to 3. */
  readonly level: number;
  /** heading: the id on the page. */
  readonly anchor: string;
  readonly spans: ReadonlyArray<Span>;
  /** list: the items. */
  readonly items: ReadonlyArray<Item>;
  readonly ordered: boolean;
  /** code: the language, and the source. */
  readonly lang: string;
  readonly text: string;
  /** image: the address under the site's base, and its description. */
  readonly src: string;
  readonly alt: string;
}

export interface Heading {
  readonly id: string;
  readonly label: string;
  readonly anchor: string;
  readonly level: number;
}

export interface Page {
  /** Its path in the site: `/` or `/guide/getting-started`. The identity of the page. */
  readonly path: string;
  /** The file it came from, relative to the project. */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  /** Position among its siblings in navigation. */
  readonly order: number;
  /** The navigation group: the page's directory, or empty at the top level. */
  readonly section: string;
  readonly blocks: ReadonlyArray<Block>;
  readonly outline: ReadonlyArray<Heading>;
}

export interface SiteInfo {
  readonly name: string;
  /** Every address starts with this: `/` or `/something/`. */
  readonly base: string;
  /** Where the site is published (no trailing slash), or empty. */
  readonly url: string;
  /** How a document's title is written from a page's title and the site's name: `{page}` and `{site}`. */
  readonly title: string;
  /** The address the application's backend requests go to (a path on the site's origin, or an absolute https address), or empty when it has none. */
  readonly api: string;
  /** Tell assistive technology about a page change made in place (the title, and focus at the content). */
  readonly announce: boolean;
}

/** The title format when the project does not say: the page, then the site. */
export const DEFAULT_TITLE = "{page} · {site}";

export interface Content {
  readonly site: SiteInfo;
  /** In navigation order. */
  readonly pages: ReadonlyArray<Page>;
  /** `content/404.md` when the author wrote one. */
  readonly notFound?: Page;
}
