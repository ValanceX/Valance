// Conformance: each web tag, drawn from its specification's own example through @valancex/port-web into a DOM, is what the specification says it is, judged by the verifiers the briefs name (the accessible
// name and description computation of the Accessible Name and Description Computation specification as `dom-accessibility-api` implements it; the role-to-element mapping of ARIA in HTML as `aria-query` has it
// for the elements its table covers). A case fails when a regression changes the role, the name, a state, the description or the live settings of what the tag draws.
import { createWebPort } from "@valancex/port-web";
import { computeAccessibleDescription, computeAccessibleName, getRole } from "dom-accessibility-api";
import { elementRoles, roles } from "aria-query";
import * as Web from "@valancex/valance/web";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSpecifications, loadWeb, webTable } from "../src/index.js";
import type { Example, Specification, WebRealization } from "../src/index.js";
import { roleOfElement } from "./roles.js";
import { treeOf } from "./tree.js";

const specifications = loadSpecifications();
const realizations = loadWeb();
const table = webTable(realizations, Web as never);

let dom: JSDOM;
let container: Element;
let reports: Array<[string, unknown]>;

beforeEach(() => {
  dom = new JSDOM(`<!doctype html><body><div id="root"></div></body>`);
  const g = globalThis as Record<string, unknown>;

  for (const name of ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "Event", "KeyboardEvent", "MutationObserver", "CSS"]) {
    g[name] = (dom.window as unknown as Record<string, unknown>)[name === "window" ? "window" : name];
  }

  container = dom.window.document.getElementById("root")!;
  reports = [];
});

afterEach(() => dom.window.close());

const draw = (tag: string, example: Example): Element => {
  const tree = treeOf(realizations, tag, example);

  if (example.describedByText !== undefined) {
    const hint = dom.window.document.createElement("span");

    hint.id = String(example.props?.describedby);
    hint.textContent = example.describedByText;
    dom.window.document.body.append(hint);
  }

  const port = createWebPort({ container, primitives: table, report: (handler, payload) => reports.push([handler, payload]) });

  port.draw(tree);

  return container.firstElementChild!;
};

/** Where a verifier disagrees with the official text, and what each says (the specification follows the official text). */
const toolDiffers: Record<string, { tool: string; official: string; reason: string }> = {
  section: {
    tool: "region",
    official: "generic",
    reason: "ARIA in HTML: <section> is region only when it has an accessible name, and generic otherwise; dom-accessibility-api and aria-query report region always",
  },
};

// A layer needs PORT Web 0.12: with an older PORT the table leaves it out (the next case says so), and there is nothing to draw.
const tags = Object.entries(realizations.primitives).filter(([tag]) => tag in table);

it("draws every tag the realizations name, except the layers when the PORT has none (PORT Web 0.12)", () => {
  expect(Object.keys(realizations.primitives).filter((tag) => !(tag in table))).toEqual(Web.layerProp === undefined ? ["dialog", "popover"] : []);
});

describe.each(tags)("the web tag %s", (tag, realization: WebRealization) => {
  const specification: Specification = specifications[realization.primitive]!;
  const element = () => draw(tag, specification.example);

  it("is the element the realization names, with its constant attributes", () => {
    const drawn = element();

    expect(drawn.localName).toBe(realization.element);

    for (const [name, value] of Object.entries(realization.attributes ?? {})) {
      expect(drawn.getAttribute(name), name).toBe(value);
    }
  });

  it("has the accessible name its rule gives", () => {
    const drawn = element();
    const rule = specification.accessibleName;
    const prop = rule.prop === undefined ? undefined : specification.example.props?.[rule.prop];
    const text = specification.example.text;

    if (rule.from === "prop") {
      expect(computeAccessibleName(drawn)).toBe(prop);
    } else if (rule.from === "either") {
      expect(computeAccessibleName(drawn)).toBe(typeof prop === "string" && prop !== "" ? prop : text);
    } else if (rule.from === "content") {
      expect(computeAccessibleName(drawn)).toBe(text);
    }
  });
});

const specificationOf = (realization: WebRealization): Specification => specifications[realization.primitive]!;
const draws = (tag: string) => draw(tag, specificationOf(realizations.primitives[tag]!).example);

describe.each(tags.filter(([, each]) => (specificationOf(each).webRole ?? specificationOf(each).role) !== null && !["column", "row", "label"].includes(each.primitive)))(
  "the role of the web tag %s",
  (tag, realization: WebRealization) => {
    const expected = specificationOf(realization).webRole ?? specificationOf(realization).role;

    it(`is ${expected}`, () => {
      const drawn = draws(tag);
      const found = roleOfElement(drawn, { getRole, elementRoles });
      const waived = toolDiffers[drawn.localName];

      if (waived !== undefined && computeAccessibleName(drawn) === "") {
        // the tool is wrong against the official text here: the case checks that it still is, so a corrected tool shows the waiver is no longer needed
        expect(found, waived.reason).toBe(waived.tool);
        expect(expected).toBe(waived.official);
      } else {
        expect(found).toBe(expected);
      }
    });
  },
);

describe.each(tags.filter(([, each]) => specificationOf(each).example.describedByText !== undefined))("the description of the web tag %s", (tag, realization: WebRealization) => {
  it("is what describedby points at", () => {
    expect(computeAccessibleDescription(draws(tag))).toBe(specificationOf(realization).example.describedByText);
  });
});

describe.each(tags.filter(([, each]) => specificationOf(each).live !== undefined))("the live region of the web tag %s", (tag, realization: WebRealization) => {
  it("has the settings the specification gives", () => {
    const drawn = draws(tag);
    const live = specificationOf(realization).live!;
    // the role carries the implicit settings (ARIA 1.2: status is polite, alert is assertive, both atomic); an explicit attribute may only repeat them
    const implicit = roles.get(drawn.getAttribute("role") as never)?.props as Record<string, unknown> | undefined;

    expect(implicit?.["aria-live"]).toBe(live.politeness);
    expect(implicit?.["aria-atomic"]).toBe(String(live.atomic));
    expect(drawn.getAttribute("aria-live") ?? live.politeness).toBe(live.politeness);
  });
});
