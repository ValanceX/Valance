// "Today's tables regenerate with no test changes" (the Spec Gate): the table generated from the specifications and the web's realization is the table that was written by hand, tag for tag. The hand
// table is frozen beside this test (legacy/primitives.ts, as it was before WP3). What the generated one has beyond it is listed, with the reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as Web from "@valancex/valance/web";
import { describe, expect, it } from "vitest";

import { generateDocs, generatePrimitives, generateStylePrimitives, loadSpecifications, loadWeb, root, webTable } from "../src/index.js";
import { primitives as legacy } from "./legacy/primitives.js";

const generated = webTable(loadWeb(), Web as never) as unknown as Record<
  string,
  {
    element: string;
    attributes?: object;
    props?: Record<string, unknown>;
    events?: Record<string, unknown>;
  }
>;

/** A realization as data: what a function builds is what it builds of a stand-in element. */
const plain = (value: unknown): unknown => {
  if (typeof value === "function") {
    return `built:${JSON.stringify((value as (a: unknown, b: unknown) => unknown)({}, { checked: "C", value: "V" }))}`;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, plain(each)]));
  }

  return value;
};

/** Props and events the generated table has that the hand table did not: the primitives' new states and relations (WP3), each declared by its specification. */
const additions: Record<string, ReadonlyArray<string>> = {
  textfield: ["kind", "invalid", "describedby"], // `id` on `text` is what a `describedby` points at
  checkbox: ["invalid", "describedby", "replay"], // `replay` (WP8): the early-input shell skips a control marked "never"
  button: ["id", "label", "intent", "size", "replay"], // `id` is what a popover's `anchor` names
  text: ["id"],
  paragraph: ["id"],
  list: Web.elementWhen === undefined ? [] : ["ordered"], // the element it chooses (PORT Web 0.11)
};

/** Events the generated table has that the hand table did not: the textfield's focus and blur (the Desktop has them; Chromium raises them as the specification says). */
const eventAdditions: Record<string, ReadonlyArray<string>> = { textfield: ["focus", "blur"] };

/** The primitives a theme reaches by a hook (WP4: the seven of the portable core; another joins when a theme styles it). */
const styleHooks = ["column", "row", "heading", "text", "button", "checkbox", "textfield"];

/** Decision P7: the web's short tags are the ARIA names now. The hand table's tag, and the one that realizes it. */
const renamed = loadWeb().renamed ?? {};

describe("the generated web table", () => {
  it("has every tag the hand table had (renamed as P7 says), and the tags WP3 adds", () => {
    expect(Object.keys(renamed).sort()).toEqual(["item", "para", "quote"]);
    expect(Object.keys(generated)).toEqual(expect.arrayContaining(Object.keys(legacy).map((tag) => renamed[tag] ?? tag)));
    expect(
      Object.keys(generated)
        .filter((tag) => !(tag in legacy) && !Object.values(renamed).includes(tag))
        .sort(),
    ).toEqual([
      "alert",
      ...(Web.layerProp === undefined ? [] : ["dialog"]), // the layers (PORT Web 0.12)
      "label",
      ...(Web.layerProp === undefined ? [] : ["popover"]),
      "radio",
      "radiogroup",
      "status",
      "toggle",
    ]);
  });

  it("keeps none of the old tags", () => {
    for (const old of Object.keys(renamed)) {
      expect(generated[old], old).toBeUndefined();
    }
  });

  for (const [tag, was] of Object.entries(legacy)) {
    it(`${tag} is what it was`, () => {
      const now = generated[renamed[tag] ?? tag]!;

      expect(now.element).toBe(was.element);
      // the constant attributes are the hand table's, and the style hook (WP4: `data-vlx`, which a theme reaches a primitive by, never its element or its class) on the portable core
      const { "data-vlx": hook, ...rest } = (now.attributes ?? {}) as Record<string, string>;

      expect(plain(rest)).toEqual(plain(was.attributes ?? {}));
      expect(hook === undefined ? [] : [hook]).toEqual(styleHooks.includes(renamed[tag] ?? tag) ? [renamed[tag] ?? tag] : []);

      for (const kind of ["props", "events"] as const) {
        const was_ = (was[kind] ?? {}) as Record<string, unknown>;
        const now_ = (now[kind] ?? {}) as Record<string, unknown>;

        for (const [name, realization] of Object.entries(was_)) {
          expect(plain(now_[name]), `${tag}.${name}`).toEqual(plain(realization));
        }

        const extra = Object.keys(now_)
          .filter((name) => !(name in was_))
          .sort();

        expect(extra, `${tag} ${kind} beyond the hand table`).toEqual((kind === "props" ? (additions[renamed[tag] ?? tag] ?? []) : (eventAdditions[tag] ?? [])).slice().sort());
      }
    });
  }
});

describe("the committed table", () => {
  it("is what the generator writes from the specifications and the realizations", () => {
    const committed = readFileSync(join(root, "..", "common", "src", "primitives.ts"), "utf8");

    expect(committed).toBe(generatePrimitives(loadSpecifications(), loadWeb()));
  });
});

describe("the committed reference page", () => {
  it("is what the generator writes from the specifications and the realizations", () => {
    expect(readFileSync(join(root, "..", "..", "docs", "use", "primitives.md"), "utf8")).toBe(generateDocs(loadSpecifications(), loadWeb()));
  });
});

describe("the style contract's view of the primitives", () => {
  it("is what the generator writes from the specifications and the realizations", () => {
    expect(readFileSync(join(root, "..", "style", "src", "primitives.ts"), "utf8")).toBe(generateStylePrimitives(loadSpecifications(), loadWeb()));
  });
});

describe("a popover's mode (decision I29)", () => {
  const specifications = loadSpecifications();
  const popover = specifications["popover"]!;

  it("is `mode` in the specification, the realization and the table, and `kind` is gone: a popover does not accept it", () => {
    expect(Object.keys(popover.props)).toContain("mode");
    expect(Object.keys(popover.props)).not.toContain("kind");
    expect(Object.keys(loadWeb().primitives["popover"]!.props ?? {})).toContain("mode");
    expect(Object.keys(loadWeb().primitives["popover"]!.props ?? {})).not.toContain("kind");
    expect(Object.keys(generated["popover"]?.props ?? { mode: 0 })).not.toContain("kind");
    // the textfield's `kind` (its input type) is unchanged
    expect(Object.keys(specifications["textfield"]!.props)).toContain("kind");
    expect(loadWeb().renamedProps).toEqual({ popover: { kind: "mode" } });
  });

  it("is `auto` or `manual`", () => {
    expect(popover.props["mode"]!.type).toEqual({ kind: "enum", values: ["auto", "manual"] });
  });
});
