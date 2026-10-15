// The list of places an application has been: its moves, and what is made of a list read back from an earlier run.
import { describe, expect, it } from "vitest";

import { History } from "../src/index.js";

const pages = ["/", "/a", "/b"];
const isPage = (entry: unknown): entry is string => typeof entry === "string" && pages.includes(entry);

describe("the moves", () => {
  it("pushing puts the new place after the current one and drops what was ahead", () => {
    const back = History.go(History.push(History.push(History.start("/"), "/a"), "/b"), -2);

    expect(back).toEqual({ entries: ["/", "/a", "/b"], index: 0 });
    expect(History.push(back, "/b")).toEqual({ entries: ["/", "/b"], index: 1 });
  });

  it("traversing moves the position and nothing else; a move off either end changes nothing", () => {
    const list = History.push(History.start("/"), "/a");

    expect(History.go(list, -1)).toEqual({ entries: ["/", "/a"], index: 0 });
    expect(History.go(list, 1)).toBe(list);
    expect(History.go(History.go(list, -1), -1)).toEqual({ entries: ["/", "/a"], index: 0 });
    expect(History.canGo(list, -1)).toBe(true);
    expect(History.canGo(list, 1)).toBe(false);
    expect(History.canGo(list, 0.5)).toBe(false);
    expect(History.current(History.go(list, -1))).toBe("/");
  });

  it("replacing changes the current place and adds none", () => {
    expect(History.replace(History.push(History.start("/"), "/a"), "/b")).toEqual({ entries: ["/", "/b"], index: 1 });
  });
});

describe("restoring a list read back from somewhere", () => {
  it("keeps a list that still fits", () => {
    const saved = { entries: ["/", "/a", "/b"], index: 1 };

    expect(History.restore(saved, isPage, "/")).toEqual(saved);
  });

  it("drops places that are gone and follows the current one, or the nearest before it", () => {
    expect(History.restore({ entries: ["/", "/gone", "/a", "/b"], index: 2 }, isPage, "/")).toEqual({ entries: ["/", "/a", "/b"], index: 1 });
    expect(History.restore({ entries: ["/", "/a", "/gone"], index: 2 }, isPage, "/")).toEqual({ entries: ["/", "/a"], index: 1 });
    expect(History.restore({ entries: ["/gone", "/a"], index: 0 }, isPage, "/")).toEqual({ entries: ["/a"], index: 0 });
  });

  it("starts again at the first place when nothing is left, or the data is not a list", () => {
    for (const saved of [{ entries: ["/x"], index: 0 }, { entries: [], index: 0 }, { entries: "no", index: 0 }, { entries: ["/"], index: 1.5 }, null, undefined, 7, "x"]) {
      expect(History.restore(saved, isPage, "/")).toEqual({ entries: ["/"], index: 0 });
    }
  });
});
