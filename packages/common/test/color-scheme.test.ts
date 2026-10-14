// The system's colors enter the application as state, as the window's size does: the page watches `prefers-color-scheme`, the framework's `colorScheme` command changes the state, and a layout reads it.
import { describe, expect, it } from "vitest";

import { watchColorScheme } from "../src/color-scheme.js";

const media = (initial: boolean) => {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: (_type: "change", listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: "change", listener: () => void) => void listeners.delete(listener),
  };

  return { query, change: (matches: boolean) => (Object.assign(query, { matches }), listeners.forEach((listener) => listener())), listeners };
};

describe("watchColorScheme", () => {
  it("says the scheme now, and again each time it changes, and only then", () => {
    const m = media(false);
    const seen: Array<string> = [];
    const stop = watchColorScheme({ matchMedia: (query) => (query === "(prefers-color-scheme: dark)" ? m.query : (undefined as never)) }, (scheme) => void seen.push(scheme));

    m.change(false);
    m.change(true);
    m.change(true);
    m.change(false);
    expect(seen).toEqual(["light", "dark", "light"]);
    stop();
    expect(m.listeners.size).toBe(0);
  });
});
