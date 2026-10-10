// What the browser does after the application has moved the reader to another page, which the application does not decide: where the page starts, and where focus is. The router
// plugin hands this to Valance's `onNavigated` (../web/router.ts); it runs only in a browser, after the URL is written.
//
//   a link to a place on another page   the address keeps the `#fragment` (the application's URL has none), and the place is scrolled to once it is drawn
//   a link to a page                    focus moves to the content, so a keyboard or screen reader user starts where the page does (a link click ends in a page that is not focused)
//   Back and Forward                    the browser restores the position it kept; focus is left alone
import type { Navigation } from "@valancex/valance/web/plugin";

/** How long to wait for the new page to be drawn, in animation frames: the application's state has moved before the page has. */
const FRAMES = 60;

const whenDrawn = (win: Window & typeof globalThis, found: () => Element | null, then: (element: Element) => void): void => {
  let left = FRAMES;
  const look = (): void => {
    const element = found();

    if (element !== null) { then(element); } else if ((left -= 1) > 0) { win.requestAnimationFrame(look); }
  };

  win.requestAnimationFrame(look);
};

export const afterNavigation = ({ kind, url }: Navigation, win: Window & typeof globalThis = window): void => {
  if (kind !== "link") { return; }

  if (url.hash !== "") {
    win.history.replaceState(win.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    const id = decodeURIComponent(url.hash.slice(1));

    whenDrawn(win, () => win.document.getElementById(id), (element) => { element.scrollIntoView(); });

    return;
  }

  // The new page's own heading is what tells that the page has been drawn: the heading of the page the reader left has another id.
  whenDrawn(win, () => win.document.querySelector("main"), (main) => {
    if (main instanceof win.HTMLElement) { main.focus({ preventScroll: true }); }
  });
};
