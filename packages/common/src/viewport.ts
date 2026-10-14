// How much room the page has, kept current. The three classes are the ones phones, tablets and desktops agree on closely enough to design for (under 600 px, 600 to 839, 840 and up). It is
// a fact about the window, so it enters the application as state (`viewport`, changed by the framework's `resize` command), and a layout chooses with `{#if viewport == "compact"}`. The server
// does not know the window: it renders `expanded`, the browser corrects it as soon as it starts.
import type { Viewport } from "./index.js";

export const MEDIUM = 600;
export const EXPANDED = 840;

export const viewportOf = (width: number): Viewport => (width >= EXPANDED ? "expanded" : width >= MEDIUM ? "medium" : "compact");

interface Query {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

export interface MediaWindow {
  matchMedia(query: string): Query;
}

/** Calls `changed` with the current class now, and again whenever it changes. Returns the function that stops watching. */
export const watchViewport = (win: MediaWindow, changed: (viewport: Viewport) => void): (() => void) => {
  const medium = win.matchMedia(`(min-width: ${MEDIUM}px)`);
  const expanded = win.matchMedia(`(min-width: ${EXPANDED}px)`);
  const current = (): Viewport => (expanded.matches ? "expanded" : medium.matches ? "medium" : "compact");
  let last: Viewport | undefined;
  const check = (): void => {
    const now = current();

    if (now !== last) {
      last = now;
      changed(now);
    }
  };

  medium.addEventListener("change", check);
  expanded.addEventListener("change", check);
  check();

  return () => {
    medium.removeEventListener("change", check);
    expanded.removeEventListener("change", check);
  };
};
