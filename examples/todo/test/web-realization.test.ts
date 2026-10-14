// Is the to-do vocabulary the desktop's alone? The same application, with the same compiled screens, is realized on the web by a table of seven entries (PORT Web's own mechanism) and used in a
// DOM. What it takes, and what it cannot do, is the evidence for the vocabulary investigation (docs/application-model/NATIVE-VOCABULARY.md).
import * as Web from "@valancex/valance/web";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { application, initial, sample, starting } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import type { TodoState } from "../src/routes.js";

const programs = await compilePrograms();

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

/** The whole realization: one entry per component of the vocabulary. */
const primitives: Web.WebPrimitives = {
  column: { element: "div" },
  row: { element: "div" },
  heading: { element: "h1" },
  text: { element: "p" },
  button: { element: "button", props: { disabled: Web.booleanAttribute("disabled") }, events: { click: { type: "click" } } },
  // A checkbox is an `<input type="checkbox">`, and this table has no way to give an element a fixed attribute: it can only be realized as a bare `<input>`.
  checkbox: {
    element: "input",
    props: { checked: Web.property("checked", "boolean") },
    events: { change: Web.event("change", { kind: "boolean", of: (_event, element) => (element as HTMLInputElement).checked }) },
  },
  textfield: {
    element: "input",
    props: { value: Web.controlled("value"), placeholder: Web.attribute("placeholder") },
    events: { change: Web.event("input", { kind: "string", of: (_event, element) => (element as HTMLInputElement).value }) },
  },
};

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close();
  }
});

const page = async (state: TodoState) => {
  const dom = new JSDOM("<!doctype html><title>x</title><div id=app></div>", { url: "http://localhost/" });
  const container = dom.window.document.getElementById("app")!;
  const host = await Web.run(application(programs, state), { container, primitives, present: "mount" });

  closers.push(() => host.stop());
  await wait(() => container.querySelector("h1") !== null);

  const win = dom.window as unknown as { Event: typeof Event; MouseEvent: typeof MouseEvent };

  return {
    container,
    html: () => container.innerHTML,
    click: (label: string) =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.startsWith(label))!
        .dispatchEvent(new win.MouseEvent("click", { bubbles: true })),
    type: (placeholder: string, text: string) => {
      const input = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;

      input.value = text;
      input.dispatchEvent(new win.Event("input", { bubbles: true }));
    },
  };
};

describe("the to-do vocabulary realized as HTML", () => {
  it("draws the lists, takes typing and a click, and shows the new list: the same application, on the web", async () => {
    const p = await page(initial());

    expect(p.html()).toContain("No lists yet");

    p.type("New list", "Groceries");
    await wait(() => p.container.querySelector<HTMLInputElement>("input")!.value === "Groceries");
    p.click("Add list");
    await wait(() => p.html().includes("Groceries (0 of 0 open)"));
    p.click("Groceries");
    await wait(() => p.html().includes("Nothing to do"));
    expect(p.container.querySelector("h1")!.textContent).toBe("Groceries");
  });

  it("follows the application's own guards: an unsaved edit cannot be left", async () => {
    const p = await page(await starting(sample(), "/lists/l1/items/i1"));

    p.type("What needs doing?", "Oat milk");
    await wait(() => p.html().includes("Unsaved changes"));
    p.click("Back to list");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(p.html()).toContain("Edit item");
  });

  it("cannot realize the checkbox as one: the table has no way to give the element its type (recorded, not hidden)", async () => {
    const p = await page(sample("/lists/l1"));
    const box = p.container.querySelector("input:not([placeholder])")!;

    expect(box.getAttribute("type")).toBeNull(); // a text box in a browser, where a checkbox was meant
  });
});
