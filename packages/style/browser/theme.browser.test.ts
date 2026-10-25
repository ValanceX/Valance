// The default theme in a real browser: its stylesheet applied to the seven primitives of the portable core as the web draws them (through PORT Web's table, generated from the specifications), and what the
// browser computes compared with what the tokens say. A theme "styles" a primitive when the computed value is the token's, so a hook, a selector or a unit that is wrong shows here.
// The same comparison is run on a stylesheet with three deliberate wrong values, and must find them.
import { primitives } from "@valancex/common/internal";
import { createWebPort } from "@valancex/port-web";
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";

const { css, wrong, tokens } = inject("style");

interface Color {
  components: number[];
}
interface Dimension {
  value: number;
  unit: string;
}

let container: HTMLElement;
let sheet: HTMLStyleElement;
let key = 0;

const node = (component: string, props: Record<string, unknown> = {}, children: unknown[] = []): unknown => {
  const propText: Record<string, string> = {};

  for (const [name, value] of Object.entries(props)) {
    if (typeof value !== "string") {
      propText[name] = String(value);
    }
  }

  return { type: "node", key: `k${++key}`, component, props, ...(Object.keys(propText).length === 0 ? {} : { propText }), events: {}, children };
};

const text = (value: string): unknown => ({ type: "text", key: `k${++key}`, text: value });

const draw = (root: unknown): void => {
  const port = createWebPort({ container, primitives, report: () => undefined });

  port.draw({ format: "mesh-render", version: 1, root, events: {}, children: [] } as never);
};

const install = (stylesheet: string): void => {
  sheet.textContent = stylesheet;
};

beforeEach(() => {
  container = document.createElement("div");
  sheet = document.createElement("style");
  document.head.append(sheet);
  document.body.append(container);
  install(css);
});

afterEach(() => {
  container.remove();
  sheet.remove();
});

const rgb = (token: unknown): string => {
  const [r, g, b] = (token as Color).components.map((each) => Math.round(each * 255));

  return `rgb(${r}, ${g}, ${b})`;
};
const px = (token: unknown): string => {
  const { value, unit } = token as Dimension;

  return `${unit === "rem" ? value * 16 : value}px`;
};
const light = tokens["light"]!;
const style = (element: Element, ...properties: string[]): Record<string, string> => {
  const computed = getComputedStyle(element);

  return Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property)]));
};
const root = (): HTMLElement => container.firstElementChild as HTMLElement;

/** What the browser computes for each primitive of the portable core against what its tokens say; the names of those that differ. */
const mismatches = (): string[] => {
  const found: string[] = [];
  const expect_ = (name: string, element: Element, expected: Record<string, string>): void => {
    const actual = style(element, ...Object.keys(expected));

    for (const [property, value] of Object.entries(expected)) {
      if (actual[property] !== value) {
        found.push(`${name} ${property}: ${actual[property]} (expected ${value})`);
      }
    }
  };

  container.replaceChildren();
  draw(node("column", {}, [node("heading", { level: "2" }, [text("Title")]), node("text", {}, [text("Words")]), node("button", { intent: "primary" }, [text("Save")])]));
  const column = root();
  const [heading, words, button] = [...column.children];

  expect_("column", column, { gap: px(light["space.3"]) });
  expect_("heading", heading!, { color: rgb(light["color.text"]), "font-size": px((light["type.heading"] as { fontSize: Dimension }).fontSize), "font-weight": "700" });
  expect_("text", words!, { color: rgb(light["color.text"]), "font-size": px((light["type.body"] as { fontSize: Dimension }).fontSize) });
  expect_("button", button!, {
    "background-color": rgb(light["color.accent"]),
    color: rgb(light["color.on-accent"]),
    "border-top-left-radius": px(light["radius.2"]),
    "padding-left": px(light["space.4"]),
  });

  return found;
};

describe("the default theme in Chromium", () => {
  it("styles the column, the heading, the text and the button as the tokens say", () => {
    expect(mismatches()).toEqual([]);
  });

  it("styles the row", () => {
    draw(node("row", {}, [node("text", {}, [text("a")]), node("text", {}, [text("b")])]));
    expect(style(root(), "gap")).toEqual({ gap: px(light["space.2"]) });
  });

  it("styles a button by its variants: the default intent without the attribute, the others by theirs, and a size", () => {
    draw(node("column", {}, [node("button", {}, [text("a")]), node("button", { intent: "danger" }, [text("b")]), node("button", { size: "lg" }, [text("c")])]));
    const [neutral, danger, large] = [...root().children];

    expect(style(neutral!, "background-color", "color")).toEqual({ "background-color": rgb(light["color.surface"]), color: rgb(light["color.text"]) });
    expect(style(danger!, "background-color", "color")).toEqual({ "background-color": rgb(light["color.danger"]), color: rgb(light["color.on-danger"]) });
    expect(style(large!, "padding-top", "padding-left")).toEqual({ "padding-top": px(light["space.3"]), "padding-left": px(light["space.6"]) });
  });

  it("styles a button's states: hovered, focus-visible (by the keyboard) and disabled", async () => {
    draw(node("column", {}, [node("button", {}, [text("a")]), node("button", { disabled: true }, [text("b")])]));
    const [first, disabled] = [...root().children] as HTMLElement[];

    expect(style(first!, "box-shadow")["box-shadow"]).toBe("none");
    await userEvent.hover(first!);
    expect(style(first!, "box-shadow")["box-shadow"]).not.toBe("none");
    await userEvent.unhover(first!);
    await userEvent.tab();
    expect(document.activeElement).toBe(first);
    expect(style(first!, "outline-style", "outline-width", "outline-color", "outline-offset")).toEqual({
      "outline-style": "solid",
      "outline-width": px(light["border.2"]),
      "outline-color": rgb(light["color.focus"]),
      "outline-offset": px(light["space.1"]),
    });
    expect(style(disabled!, "opacity")).toEqual({ opacity: "0.5" });
  });

  it("locks the page's scroll while a modal layer is open and gives it back when it closes (I14)", () => {
    const dialog = document.createElement("dialog");

    container.append(dialog);
    expect(getComputedStyle(document.documentElement).overflow).toBe("visible");
    dialog.showModal();
    expect(getComputedStyle(document.documentElement).overflow).toBe("hidden");
    expect(getComputedStyle(document.documentElement).scrollbarGutter).toBe("stable");
    expect(getComputedStyle(dialog).overscrollBehaviorY).toBe("contain");
    dialog.close();
    expect(getComputedStyle(document.documentElement).overflow).toBe("visible");
  });

  it("styles the checkbox and the textfield, and the textfield's invalid state", () => {
    draw(node("column", {}, [node("checkbox", { checked: false }), node("textfield", { value: "" }), node("textfield", { value: "", invalid: true })]));
    const [checkbox, field, invalid] = [...root().children];

    expect(style(checkbox!, "min-width", "min-height")).toEqual({ "min-width": px(light["space.5"]), "min-height": px(light["space.5"]) });
    expect(style(field!, "background-color", "border-top-width", "border-top-color", "border-top-left-radius", "padding-left", "min-height")).toEqual({
      "background-color": rgb(light["color.surface-field"]),
      "border-top-width": px(light["border.1"]),
      "border-top-color": rgb(light["color.border"]),
      "border-top-left-radius": px(light["radius.2"]),
      "padding-left": px(light["space.3"]),
      "min-height": px(light["size.target"]),
    });
    expect(style(invalid!, "border-top-width", "border-top-color")).toEqual({ "border-top-width": px(light["border.2"]), "border-top-color": rgb(light["color.danger"]) });
  });

  it("changes with the mode: data-theme chooses it, and the primitives follow without a template change", () => {
    const dark = tokens["dark"]!;

    container.setAttribute("data-theme", "dark");
    draw(node("column", {}, [node("text", {}, [text("a")]), node("button", { intent: "primary" }, [text("b")])]));
    const [words, button] = [...root().children];

    expect(style(words!, "color")).toEqual({ color: rgb(dark["color.text"]) });
    expect(style(button!, "background-color")).toEqual({ "background-color": rgb(dark["color.accent"]) });
  });

  it("reaches no element by its name, class or place: the same primitives drawn with other elements are styled alike", () => {
    // a primitive is reached by its hook alone, so a class a template adds changes nothing about the theme's rules
    draw(node("column", {}, [node("div", { class: "anything" }, [node("button", {}, [text("a")])])]));
    expect(style(root().querySelector("button")!, "border-top-left-radius")).toEqual({ "border-top-left-radius": px(light["radius.2"]) });
  });
});

describe("the comparison finds a wrong value", () => {
  it("in a stylesheet with a wrong accent, a wrong radius and a wrong heading type (all three, by name)", () => {
    install(wrong);
    const found = mismatches();

    expect(found.some((each) => each.startsWith("button background-color"))).toBe(true);
    expect(found.some((each) => each.startsWith("button border-top-left-radius"))).toBe(true);
    expect(found.some((each) => each.startsWith("heading font-size"))).toBe(true);
    expect(found.length).toBeGreaterThanOrEqual(3);
  });
});
