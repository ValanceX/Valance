import { describe, expect, it } from "vitest";

import { viewportOf, watchViewport } from "../src/viewport.js";
import type { MediaWindow } from "../src/viewport.js";

describe("the window size classes", () => {
  it("are compact under 600, medium from 600, expanded from 840", () => {
    expect([0, 320, 599, 600, 839, 840, 1920].map(viewportOf)).toEqual(["compact", "compact", "compact", "medium", "medium", "expanded", "expanded"]);
  });
});

/** A window of a given width whose width can change, firing the media queries' change events as a browser does. */
const fakeWindow = (width: number) => {
  const queries = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
  const win: MediaWindow = {
    matchMedia: (query) => {
      const min = Number(/min-width: (\d+)px/.exec(query)![1]);
      const found = queries.get(query) ?? { matches: width >= min, listeners: new Set() };

      queries.set(query, found);

      return {
        get matches() {
          return found.matches;
        },
        addEventListener: (_, listener) => void found.listeners.add(listener),
        removeEventListener: (_, listener) => void found.listeners.delete(listener),
      };
    },
  };

  return {
    win,
    resize: (next: number) => {
      // As a browser does: every query is brought up to date, then the ones that changed are announced.
      const changed = [...queries].filter(([query, found]) => next >= Number(/min-width: (\d+)px/.exec(query)![1]) !== found.matches);

      for (const [query, found] of changed) {
        found.matches = next >= Number(/min-width: (\d+)px/.exec(query)![1]);
      }

      for (const [, found] of changed) {
        found.listeners.forEach((listener) => listener());
      }
    },
    listeners: () => [...queries.values()].reduce((count, found) => count + found.listeners.size, 0),
  };
};

describe("watching the window", () => {
  it("says the class now, and again only when it changes", () => {
    const { win, resize } = fakeWindow(1200);
    const seen: Array<string> = [];

    watchViewport(win, (viewport) => seen.push(viewport));
    resize(1000);
    resize(700);
    resize(650);
    resize(400);
    resize(1300);
    expect(seen).toEqual(["expanded", "medium", "compact", "expanded"]);
  });

  it("stops when told to", () => {
    const { win, resize, listeners } = fakeWindow(300);
    const seen: Array<string> = [];
    const stop = watchViewport(win, (viewport) => seen.push(viewport));

    expect(listeners()).toBe(2);
    stop();
    expect(listeners()).toBe(0);
    resize(900);
    expect(seen).toEqual(["compact"]);
  });
});
