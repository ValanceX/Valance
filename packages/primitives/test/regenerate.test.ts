// "Today's tables regenerate with no test changes" (the Spec Gate): the table generated from the specifications and the web's realization is the table that was written by hand, tag for tag. The hand
// table is frozen beside this test (legacy/primitives.ts, as it was before WP3). What the generated one has beyond it is listed, with the reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as Web from "@valancex/valance/web";
import { describe, expect, it } from "vitest";

import { generateDocs, generatePrimitives, loadSpecifications, loadWeb, root, webTable } from "../src/index.js";
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
  checkbox: ["invalid", "describedby"],
  button: ["label"],
  text: ["id"],
  para: ["id"],
};

/** Events the generated table has that the hand table did not: the textfield's focus and blur (the Desktop has them; Chromium raises them as the specification says). */
const eventAdditions: Record<string, ReadonlyArray<string>> = { textfield: ["focus", "blur"] };

describe("the generated web table", () => {
  it("has every tag the hand table had, and the tags WP3 adds", () => {
    expect(Object.keys(generated)).toEqual(expect.arrayContaining(Object.keys(legacy)));
    expect(
      Object.keys(generated)
        .filter((tag) => !(tag in legacy))
        .sort(),
    ).toEqual(["alert", "label", "radio", "radiogroup", "status"]);
  });

  for (const [tag, was] of Object.entries(legacy)) {
    it(`${tag} is what it was`, () => {
      const now = generated[tag]!;

      expect(now.element).toBe(was.element);
      expect(plain(now.attributes ?? {})).toEqual(plain(was.attributes ?? {}));

      for (const kind of ["props", "events"] as const) {
        const was_ = (was[kind] ?? {}) as Record<string, unknown>;
        const now_ = (now[kind] ?? {}) as Record<string, unknown>;

        for (const [name, realization] of Object.entries(was_)) {
          expect(plain(now_[name]), `${tag}.${name}`).toEqual(plain(realization));
        }

        const extra = Object.keys(now_)
          .filter((name) => !(name in was_))
          .sort();

        expect(extra, `${tag} ${kind} beyond the hand table`).toEqual((kind === "props" ? (additions[tag] ?? []) : (eventAdditions[tag] ?? [])).slice().sort());
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
