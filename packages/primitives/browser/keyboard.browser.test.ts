// The keys of every primitive that has any, pressed in a real browser (Chromium, through Playwright) as a person presses them, and what happens compared with what the specification's `keyboard` rows and
// events say. The jsdom cases of `test/facts.test.ts` run no default actions of the browser (a key on a button, the arrows among radios, Tab), so they cannot tell this.
//
// A difference from the specification is a test of its own that says so and asserts it, so it fails when the difference goes away.
import { createWebPort } from "@valancex/port-web";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
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

  // KNOWN DIFFERENCES, not passes. HTML makes radios one group by a shared non-empty name (the HTML Standard, "radio button group"), and the web's radios have no name, so to the browser each is a group of
  // one: (1) Tab visits every radio in turn instead of the group once (the pattern: Tab enters at the selected radio and the next Tab leaves the group), and (2) choosing one leaves the previously
  // selected radio checked in the DOM until the application renders what `select` brought. Giving a group's radios one name needs a PORT Web feature (WP6: the name must be the group's, and not shared
  // by two mounts in one document). The arrows themselves work for radios without a name in Chromium (the test above), which the HTML Standard does not promise. When these stop being true they fail.
  it("Tab visits each radio in turn: the radios are not one group to the browser (known difference)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.tab();
    expect(focused()).toBe("input[m]");
    expect(container.querySelector("input")!.hasAttribute("name")).toBe(false);
  });

  it("a selected radio stays checked until the application renders (known difference)", async () => {
    draw("radiogroup");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect([...container.querySelectorAll("input")].map((each) => each.checked)).toEqual([true, true, false]);
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
