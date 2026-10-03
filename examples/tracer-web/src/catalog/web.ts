// The Web side of the catalog application: platform configuration and the page's first act. The application
// definition (./app.ts) imports none of this, and runs without it.

import * as Web from "@valancex/valance/web";

import { enter, initial, stateOf, urlOf, type AppState, type Item } from "./app.js";

/** The Web realization of the application's primitives: target configuration, not part of the application. */
export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  row: { element: "div" },
  button: { element: "button", events: { click: { type: "click" } } },
};

/**
 * The page's first act, BEFORE `Valance.start` and `Web.history`: what the URL means, with the data the application
 * starts with, and its canonical URL. A URL that is not already `urlOf(state)` is replaced, never pushed: the visitor
 * did not navigate anywhere. Whether to rewrite it is the application's policy, and it is written here, not in Web.history.
 */
export const initialStateAt = (win: Window, items: ReadonlyArray<Item> = initial.items): AppState => {
  const state = enter(items, stateOf(new URL(win.location.href)));

  if (win.location.pathname !== urlOf(state)) {
    win.history.replaceState(null, "", urlOf(state));
  }

  return state;
};

