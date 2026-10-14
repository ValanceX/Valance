// Which colors the person's system asks for, kept current. It is a fact about the person, so it enters the application as state (`colorScheme`, changed by the framework's `colorScheme`
// command), as `viewport` does for the window's size; a layout chooses with `theme={theme == "system" ? colorScheme : theme}`. The server does not know the person: it renders `light`, the page
// corrects it as it starts.
import type { ColorScheme } from "./index.js";

interface Query {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

export interface SchemeWindow {
  matchMedia(query: string): Query;
}

/** Calls `changed` with the current scheme now, and again whenever it changes. Returns the function that stops watching. */
export const watchColorScheme = (win: SchemeWindow, changed: (scheme: ColorScheme) => void): (() => void) => {
  const dark = win.matchMedia("(prefers-color-scheme: dark)");
  let last: ColorScheme | undefined;
  const check = (): void => {
    const now: ColorScheme = dark.matches ? "dark" : "light";

    if (now !== last) {
      last = now;
      changed(now);
    }
  };

  dark.addEventListener("change", check);
  check();

  return () => dark.removeEventListener("change", check);
};
