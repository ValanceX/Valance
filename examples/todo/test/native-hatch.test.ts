// Web.run's two ways down to the platform (Tier 3, north-star refinements B6): `native`, PORT Web's constrained hatch, passed through to the PORT; and `target`, a wrapper of the
// target run builds, which keeps what run reports (`mounted.dispatched`, `stop`). The to-do application over a jsdom page, as in web-realization.test.ts.
import type { Native } from "@valancex/port-web/native";
import * as Web from "@valancex/valance/web";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { application, initial } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";

const programs = await compilePrograms();

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const primitives: Web.WebPrimitives = {
  column: { element: "div" },
  row: { element: "div" },
  heading: { element: "h1" },
  text: { element: "p" },
  button: { element: "button", events: { click: { type: "click" } } },
  checkbox: { element: "input" },
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

const container = (): Element => new JSDOM("<!doctype html><title>x</title><div id=app></div>", { url: "http://localhost/" }).window.document.getElementById("app")!;

describe("Web.run's native option: PORT Web's hatch, passed through", () => {
  it("calls the callback with each drawn element of the primitive and its key, and its cleanup when the page stops", async () => {
    const seen: Array<string> = [];
    const native: Native = {
      heading: (element, { key }) => {
        seen.push(`${element.tagName} ${key}`);

        return () => seen.push(`cleanup ${key}`);
      },
    };
    const app = container();
    const host = await Web.run(application(programs, initial()), { container: app, primitives, present: "mount", native });

    await wait(() => app.querySelector("h1") !== null);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^H1 /);

    await host.stop();
    expect(seen[1]).toBe(`cleanup ${seen[0]!.slice("H1 ".length)}`);
  });

  it("is checked by the PORT: a callback for a primitive the table does not have is refused (invalid-primitives)", async () => {
    await expect(Web.run(application(programs, initial()), { container: container(), primitives, present: "mount", native: { headng: () => undefined } })).rejects.toMatchObject({
      code: "invalid-primitives",
    });
  });
});

describe("Web.run's target option: a wrapper of the target run builds", () => {
  it("gets run's own target (with native), and run still reports: the dispatched outcomes and stop", async () => {
    const draws: Array<string> = [];
    const hatched: Array<string> = [];
    const app = container();
    const host = await Web.run(application(programs, initial()), {
      container: app,
      primitives,
      present: "mount",
      native: { heading: (element) => void hatched.push(element.textContent ?? "") },
      target: (base) => (report) => {
        const port = base(report);

        return {
          ...port,
          draw: (tree) => {
            port.draw(tree);
            draws.push(app.querySelector("h1")?.textContent ?? "");
          },
        };
      },
    });

    closers.push(() => host.stop());
    expect(draws).toEqual(["Your lists"]);
    expect(hatched).toEqual(["Your lists"]);

    const add = Array.from(app.querySelectorAll("button")).find((button) => button.textContent === "Add list")!;

    add.dispatchEvent(new (app.ownerDocument.defaultView as unknown as typeof globalThis).MouseEvent("click", { bubbles: true }));
    await wait(() => host.mounted.dispatched.length === 1);
    expect(host.mounted.dispatched[0]!._tag).toBe("Success");
  });
});
