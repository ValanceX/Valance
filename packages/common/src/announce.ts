// After the application changes page in place, a person using a screen reader hears nothing: no page load happened, so nothing says the page changed, and focus is wherever it was (on a
// link that may no longer exist). This does what a page load would: it says the new title in a polite live region, and moves focus to the main content when that can take it. It is browser
// code, written against the few parts of `document` it touches so it is tested without one. Hash links are left to the browser, which moves to the fragment itself.
export interface Node_ {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute?(name: string): boolean;
  readonly style?: { setProperty(name: string, value: string): void };
  focus?(options?: { preventScroll?: boolean }): void;
}

export interface AnnounceDocument {
  readonly title: string;
  readonly body: { append(node: never): void };
  getElementById(id: string): Node_ | null;
  querySelector(selector: string): Node_ | null;
  createElement(tag: string): Node_;
}

export const ANNOUNCER_ID = "valance-announcer";

/**
 * Visually hidden, still read out. Set through the style object, not a `style` attribute: a page served with the strict policy `vlx build` writes (`style-src 'self'`) refuses an inline style
 * attribute, and setting properties on `element.style` is the one way it allows.
 */
const HIDDEN: ReadonlyArray<readonly [string, string]> = [
  ["position", "absolute"],
  ["width", "1px"],
  ["height", "1px"],
  ["margin", "-1px"],
  ["padding", "0"],
  ["overflow", "hidden"],
  ["clip", "rect(0 0 0 0)"],
  ["clip-path", "inset(50%)"],
  ["white-space", "nowrap"],
  ["border", "0"],
];

/** Says the document's title, and focuses `#content` (or `<main>`) when it has a `tabindex`. */
export const announcePage = (document: AnnounceDocument, options: { readonly focus: boolean } = { focus: true }): void => {
  let region = document.getElementById(ANNOUNCER_ID);

  if (region === null) {
    region = document.createElement("div");
    region.setAttribute("id", ANNOUNCER_ID);
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    HIDDEN.forEach(([name, value]) => region!.style?.setProperty(name, value));
    document.body.append(region as never);
  }

  // A region that says the same words again is not announced again: clear it first.
  region.textContent = "";
  region.textContent = document.title;

  if (options.focus) {
    const main = document.getElementById("content") ?? document.querySelector("main");

    // Only an element the author made focusable (a `tabindex`): making one focusable here would put an outline on the whole page.
    if (main !== null && main.hasAttribute?.("tabindex") === true) {
      main.focus?.({ preventScroll: true });
    }
  }
};
