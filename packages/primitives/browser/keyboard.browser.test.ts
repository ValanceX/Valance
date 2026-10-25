// The keys of every primitive that has any, pressed in a real browser (Chromium, through Playwright) as a person presses them, and what happens compared with what the specification's `keyboard` rows and
// events say. The jsdom cases of `test/facts.test.ts` run no default actions of the browser (a key on a button, the arrows among radios, Tab), so they cannot tell this.
//
// A difference from the specification is a test of its own that says so and asserts it, so it fails when the difference goes away.
import { createWebPort } from "@valancex/port-web";
import portPackage from "@valancex/port-web/package.json";
import * as Web from "@valancex/valance/web";
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Specification, WebRealizations } from "../src/index.js";
import { treeOf } from "../test/tree.js";
import { webTable } from "../src/web.js";

const specifications = Object.fromEntries(
  Object.values(import.meta.glob<Specification>("../specs/*.json", { eager: true, import: "default" })).map((each) => [each.name, each]),
) as Record<string, Specification>;
const realizations = (await import("../realizations/web.json")).default as unknown as WebRealizations;
const table = webTable(realizations, Web as never);

/** The tag a primitive is written as on the web. */
const tagOf = (primitive: string): string => Object.entries(realizations.primitives).find(([, each]) => each.primitive === primitive)![0];

/** Whether the installed Web PORT gives a group's radios one name (0.11): the cases that show it need it, and the known differences of the PORT before it run without it. */
const grouped = (() => {
  const [major = 0, minor = 0] = (portPackage as { version: string }).version.split(".").map(Number);

  return major > 0 || minor >= 11;
})();

/** Whether the installed Web PORT has layers (0.12): the cases of a dialog and a popover need it. */
const layered = (() => {
  const [major = 0, minor = 0] = (portPackage as { version: string }).version.split(".").map(Number);

  return major > 0 || minor >= 12;
})();

let container: HTMLElement;
let reports: Array<[string, unknown]>;
let clicks: number;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  reports = [];
  clicks = 0;
  // a link must not leave the page; the click is counted
  container.addEventListener("click", (event) => {
    clicks += 1;

    if ((event.target as Element).closest("a") !== null) {
      event.preventDefault();
    }
  });
});

afterEach(() => container.remove());

const draw = (primitive: string): void => {
  const port = createWebPort({ container, primitives: table, report: (handler, payload) => reports.push([handler, payload]) });

  port.draw(treeOf(realizations, tagOf(primitive), specifications[primitive]!.example));
};

const focused = (): string => {
  const active = document.activeElement;

  if (active === null || active === document.body) {
    return "nothing";
  }

  // a radio is told apart by its value; a field by its element
  return `${active.localName}${(active as HTMLInputElement).type === "radio" ? `[${(active as HTMLInputElement).value}]` : ""}`;
};

const handlers = () => reports.map(([handler]) => handler);

describe("the keys of a button", () => {
  it("Tab focuses it; Enter and Space raise click", async () => {
    draw("button");
    await userEvent.tab();
    expect(focused()).toBe("button");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(handlers()).toEqual(["button.click", "button.click"]);
  });
});

describe("the keys of a link", () => {
  it("Tab focuses it; Enter activates it", async () => {
    draw("link");
    await userEvent.tab();
    expect(focused()).toBe("a");
    await userEvent.keyboard("{Enter}");
    expect(clicks).toBe(1);
  });
});

describe("the keys of a toggle", () => {
  it("Tab focuses it; Enter and Space raise change with the value it is going to have", async () => {
    draw("toggle");
    await userEvent.tab();
    expect(focused()).toBe("button");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(reports).toEqual([
      ["toggle.change", false],
      ["toggle.change", false],
    ]);
  });
});

describe("the keys of a checkbox", () => {
  it("Tab focuses it; Space raises change with the new value", async () => {
    draw("checkbox");
    await userEvent.tab();
    expect(focused()).toBe("input");
    await userEvent.keyboard(" ");
    expect(reports).toEqual([["checkbox.change", false]]);
  });
});

describe("the keys of a textfield", () => {
  it("Tab focuses it and raises focus; typing raises change; Enter raises submit; Escape raises cancel; Tab away raises blur", async () => {
    draw("textfield");
    await userEvent.tab();
    expect(focused()).toBe("input");
    await userEvent.keyboard("a");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");
    await userEvent.tab();
    expect(handlers()).toEqual(["textfield.focus", "textfield.change", "textfield.submit", "textfield.cancel", "textfield.blur"]);
  });
});

describe("the keys of a radio group", () => {
  it("Tab enters the group at the selected radio", async () => {
    draw("radiogroup");
    await userEvent.tab();
    expect(focused()).toBe("input[s]");
  });

  it("Space on a radio that is not selected raises select with its value", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe("input[m]");
    await userEvent.keyboard(" ");
    expect(reports).toEqual([["radio.select", "m"]]);
  });

  it("ArrowDown and ArrowRight move focus to the next radio, ArrowUp and ArrowLeft to the previous (the specification's rows)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe("input[m]");
    await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe("input[l]");
    await userEvent.keyboard("{ArrowUp}");
    expect(focused()).toBe("input[m]");
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused()).toBe("input[s]");
  });

  it("ArrowDown selects the radio it moves to and raises select with its value (the pattern for a radio group)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(reports).toEqual([["radio.select", "m"]]);
  });

  // KNOWN DIFFERENCES of a PORT Web before 0.11, run only with it, and failing when they stop being true: HTML makes radios one group by a shared non-empty name (the HTML Standard, "radio button group"),
  // and those radios have no name, so to the browser each is a group of one: (1) Tab visits every radio in turn instead of the group once, and (2) choosing one leaves the previously selected radio
  // checked in the DOM until the application renders what `select` brought. The arrows themselves work for radios without a name in Chromium (the test above), which the HTML Standard does not promise.
  it.skipIf(grouped)("Tab visits each radio in turn: the radios are not one group to the browser (known difference of PORT Web before 0.11)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.tab();
    expect(focused()).toBe("input[m]");
    expect(container.querySelector("input")!.hasAttribute("name")).toBe(false);
  });

  it.skipIf(grouped)("a selected radio stays checked until the application renders (known difference of PORT Web before 0.11)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect([...container.querySelectorAll("input")].map((each) => each.checked)).toEqual([true, true, false]);
  });

  // HTML makes radios one group by a shared non-empty name (the HTML Standard, "radio button group"); the PORT gives a radiogroup's radios the group's name (WebPrimitive.group), so the browser's own
  // behavior is the pattern's: Tab enters the group once, at the selected radio, and the next Tab leaves it; and choosing one unchecks the previous one at once.
  it.skipIf(!grouped)("Tab enters the group once and the next Tab leaves it: the radios are one group to the browser (needs @valancex/port-web 0.11)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    expect(focused()).toBe("input[s]");
    await userEvent.tab();
    expect(focused()).not.toMatch(/^input/);
    expect(container.querySelector("input")!.getAttribute("name")).toBe(container.querySelectorAll("input")[2]!.getAttribute("name"));
  });

  it.skipIf(!grouped)("choosing a radio unchecks the one that was selected, at once (needs @valancex/port-web 0.11)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect([...container.querySelectorAll("input")].map((each) => each.checked)).toEqual([false, true, false]);
  });
});

describe("the keys of the web-only link", () => {
  it("Enter activates it", async () => {
    draw("a");
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(clicks).toBe(1);
  });
});

describe.skipIf(!layered)("the keys of a dialog and a popover (needs @valancex/port-web 0.12)", () => {
  it("a dialog is modal while open: the page behind it is inert, focus is inside it, Tab stays in it, and Escape raises dismiss with `escape` and does not close it", async () => {
    const outside = document.createElement("button");

    document.body.append(outside);

    try {
      draw("dialog");

      const dialog = container.querySelector("dialog")!;

      expect(dialog.matches(":modal")).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);
      await userEvent.tab();
      await userEvent.tab();
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
      await userEvent.keyboard("{Escape}");
      expect(reports).toEqual([["dialog.dismiss", "escape"]]);
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(dialog.matches(":modal")).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("a popover raises dismiss with `escape` for Escape and with `outside` for a press outside it", async () => {
    draw("popover");
    expect(container.querySelector("[popover]")!.matches(":popover-open")).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(reports).toEqual([["popover.dismiss", "escape"]]);
    reports.length = 0;
    // the application did not close it, so the PORT opens it again (within 100 ms)
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(container.querySelector("[popover]")!.matches(":popover-open")).toBe(true);

    const elsewhere = document.createElement("button");

    elsewhere.style.cssText = "position:fixed;top:0;left:0";
    elsewhere.textContent = "elsewhere";
    document.body.append(elsewhere);

    try {
      await userEvent.click(elsewhere);
      expect(reports).toEqual([["popover.dismiss", "outside"]]);
    } finally {
      elsewhere.remove();
    }
  });
});
