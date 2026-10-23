// What the specifications say that the web can be held to besides role and name: the role set, the states each primitive carries (as ARIA in HTML has them realized), the keyboard rows and the events.
// Every waiver is listed here with its reason, and is checked to still be true (a waiver that stops being true fails, so it is removed).
import { createWebPort } from "@valancex/port-web";
import * as Web from "@valancex/valance/web";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { loadSpecifications, loadWeb, webTable } from "../src/index.js";
import { treeOf } from "./tree.js";

const specifications = loadSpecifications();
const realizations = loadWeb();
const table = webTable(realizations, Web as never);

/** Decision A11: the twenty-three role names of version 1, pinned to AccessKit 0.17.1. */
const A11 = [
  "heading",
  "paragraph",
  "list",
  "listitem",
  "blockquote",
  "code",
  "strong",
  "emphasis",
  "link",
  "img",
  "generic",
  "button",
  "checkbox",
  "textbox",
  "radio",
  "radiogroup",
  "label",
  "status",
  "alert",
  "table",
  "row",
  "cell",
  "columnheader",
] as const;

const draw = (tag: string) => {
  const dom = new JSDOM(`<!doctype html><body><div id="root"></div></body>`);
  const g = globalThis as Record<string, unknown>;

  for (const name of ["document", "Node", "Element", "HTMLElement", "HTMLInputElement", "Event", "KeyboardEvent"]) {
    g[name] = (dom.window as unknown as Record<string, unknown>)[name];
  }

  const reports: Array<[string, unknown]> = [];
  const container = dom.window.document.getElementById("root")!;
  const port = createWebPort({ container, primitives: table, report: (handler, payload) => reports.push([handler, payload]) });

  port.draw(treeOf(realizations, tag, specifications[realizations.primitives[tag]!.primitive]!.example));

  return { element: container.firstElementChild!, reports, window: dom.window };
};

const tagOf = (primitive: string) => Object.entries(realizations.primitives).find(([, each]) => each.primitive === primitive)?.[0];

describe("the role set", () => {
  it("has a portable primitive's role among the version-1 names, or none (column, row, and the label wrapper)", () => {
    for (const specification of Object.values(specifications)) {
      if (specification.status === "portable" && specification.role !== null) {
        expect(A11, specification.name).toContain(specification.role);
      }
    }
  });

  it("keeps a web-only primitive's role outside the portable contract (a web-only primitive is not in the portable set under another name)", () => {
    const portable = new Set(
      Object.values(specifications)
        .filter((each) => each.status === "portable")
        .map((each) => each.name),
    );

    for (const specification of Object.values(specifications)) {
      if (specification.status === "web-only") {
        expect(portable.has(specification.name), specification.name).toBe(false);
      }
    }
  });

  it("gives a list only items", () => {
    expect(specifications.list!.content).toEqual({ only: ["listitem"] });
    expect(specifications.listitem!.within).toEqual(["list"]);
  });
});

describe("the states a primitive carries", () => {
  it("are supplied by props the specification declares", () => {
    for (const specification of Object.values(specifications)) {
      for (const [state, prop] of Object.entries(specification.states ?? {})) {
        expect(specification.props[prop], `${specification.name} ${state}`).toBeDefined();
      }
    }
  });

  // ARIA in HTML: a native checkbox/radio's checked and a button's disabled are the element's own state (no aria-checked, no aria-disabled); invalid and level are ARIA attributes.
  const realized = (name: string, state: string, tag: string): void => {
    const { element } = draw(tag);

    if (state === "invalid") {
      expect(element.getAttribute("aria-invalid"), `${name} invalid`).toBe("true");
    } else if (state === "checked") {
      expect((element as HTMLInputElement).checked, `${name} checked`).toBe(true);
      expect(element.hasAttribute("aria-checked"), `${name} must not repeat the native state`).toBe(false);
    } else if (state === "disabled") {
      expect(element.hasAttribute("disabled"), `${name} disabled`).toBe(true);
    } else if (state === "pressed") {
      expect(element.getAttribute("aria-pressed"), `${name} pressed`).toBe("true");
    } else if (state === "level") {
      expect(element.getAttribute("aria-level"), `${name} level`).not.toBeNull();
    }
  };

  const cases = Object.values(specifications).flatMap((specification) =>
    Object.keys(specification.states ?? {})
      .map((state) => ({ name: specification.name, state, tag: tagOf(specification.name), given: specification.example.props?.[specification.states![state]!] }))
      .filter((each) => each.tag !== undefined && each.given !== undefined),
  );

  it.each(cases)("$name carries $state on the web", ({ name, state, tag }) => realized(name, state, tag!));
});

describe("a described primitive", () => {
  it("is one whose describedby is a ref the example resolves", () => {
    for (const specification of Object.values(specifications)) {
      for (const prop of Object.keys(specification.relations ?? {})) {
        expect(specification.example.describedByText, `${specification.name}.${prop}`).toBeDefined();
        expect(specification.example.props?.[prop], `${specification.name}.${prop}`).toBeDefined();
      }
    }
  });
});

describe("the events and keys", () => {
  /** Events the specification has that the web does not realize, with the reason: none. */
  const unrealized: Record<string, string> = {};

  it("are realized by the web, except those listed", () => {
    const missing: string[] = [];

    for (const specification of Object.values(specifications)) {
      const tag = tagOf(specification.name);

      if (tag === undefined) {
        continue;
      }

      for (const event of Object.keys(specification.events)) {
        if (realizations.primitives[tag]!.events?.[event] === undefined) {
          missing.push(`${specification.name}.${event}`);
        }
      }
    }

    expect(missing.sort()).toEqual(Object.keys(unrealized).sort());
  });

  it("have a reason for each waiver", () => {
    for (const reason of Object.values(unrealized)) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("raise submit on Enter and cancel on Escape in a textfield, and nothing on another key", () => {
    const { element, reports, window } = draw("textfield");

    for (const key of ["Enter", "Escape", "a"]) {
      element.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
    }

    expect(reports.map(([handler]) => handler)).toEqual(["textfield.submit", "textfield.cancel"]);
  });

  it("are the native keys of the element: a button, a checkbox, a radio and a link are the elements whose Enter or Space activation HTML defines", () => {
    // the HTML Standard defines the activation behavior (a click on Enter or Space) of button, input checkbox and radio, and a with href; the realization uses those elements, so the keys are not ours to implement
    for (const [primitive, element, type] of [
      ["button", "button", undefined],
      ["checkbox", "input", "checkbox"],
      ["radio", "input", "radio"],
      ["link", "a", undefined],
    ] as const) {
      const realization = realizations.primitives[tagOf(primitive)!]!;

      expect(realization.element, primitive).toBe(element);
      expect(realization.attributes?.type, primitive).toBe(type);
    }
  });

  it("does not yet give the radios of a group the arrow keys: a known failure, a radio needs a shared name for it", () => {
    // HTML: arrow keys move among radios of a group, a group being the radios with the same name in the same form owner. The web's radio carries no `name` and PORT Web has no way to give the radios of a
    // group one (a group's name is not a prop of either). The specification keeps the rows (the Desktop does them); this stays true until PORT Web can, and then this test fails to say the waiver is gone.
    const { element } = draw("radio");
    const rows = specifications.radio!.keyboard.filter((each) => each.moves !== undefined);

    expect(rows.length).toBe(4);
    expect(element.getAttribute("name")).toBeNull();
  });
});

describe("the replay declaration", () => {
  it("is on every control the person acts on, and only there (a control with an event raised by a key)", () => {
    const acted = Object.values(specifications)
      .filter((each) => each.status === "portable" && each.keyboard.some((row) => row.raises !== undefined) && Object.keys(each.events).length > 0)
      .map((each) => each.name)
      .sort();

    expect(
      Object.values(specifications)
        .filter((each) => each.replay !== undefined)
        .map((each) => each.name)
        .sort(),
    ).toEqual(acted);
  });
});

describe("one list, whose element is chosen by a prop", () => {
  const items = specifications["list"]!.example!.children;
  const elementWith = (ordered: boolean | undefined) => {
    const dom = new JSDOM(`<!doctype html><body><div id="root"></div></body>`);
    const g = globalThis as Record<string, unknown>;

    for (const name of ["document", "Node", "Element", "HTMLElement", "HTMLInputElement", "Event", "KeyboardEvent"]) {
      g[name] = (dom.window as unknown as Record<string, unknown>)[name];
    }

    const container = dom.window.document.getElementById("root")!;
    const port = createWebPort({ container, primitives: table, report: () => {} });

    port.draw(treeOf(realizations, "list", { props: ordered === undefined ? {} : { ordered }, ...(items === undefined ? {} : { children: items }) }));

    return container.firstElementChild!.localName;
  };

  // `ordered` is realized by the element, which needs PORT Web 0.11; the PORT before it has no such prop and the table leaves it out.
  const chooses = (table["list"] as { props?: Record<string, unknown> }).props?.["ordered"] !== undefined;

  it.skipIf(!chooses)("is an ol while `ordered` is true, a ul otherwise (needs @valancex/port-web 0.11)", () => {
    expect(elementWith(true)).toBe("ol");
    expect(elementWith(false)).toBe("ul");
    expect(elementWith(undefined)).toBe("ul");
  });
});
