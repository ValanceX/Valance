// The parity report is green or waived with a reason per primitive (the Spec Gate): the Desktop PORT's vocabulary agrees with the specifications. PORT_VOCABULARY_DIR names a checkout of the vocabulary's
// directory (valancex/port, packages/port-desktop-vocabulary) to check instead of the published one; the waivers for what only that checkout has then do not apply.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadSpecifications, parity, root, settle } from "../src/index.js";
import type { Desktop, Waiver } from "../src/index.js";

const specifications = loadSpecifications();
const waivers = JSON.parse(readFileSync(join(root, "waivers.json"), "utf8")) as Waiver[];
const override = process.env.PORT_VOCABULARY_DIR;
const directory = override ?? join(createRequire(import.meta.url).resolve("@valancex/port-desktop-vocabulary/package.json"), "..");
const read = (file: string) => JSON.parse(readFileSync(join(directory, file), "utf8")) as { components: Desktop["components"] };
const desktop: Desktop = { components: { ...read("vocabulary.json").components, ...read("content.json").components } };

describe("parity with the Desktop PORT's vocabulary", () => {
  const settled = settle(parity(specifications, desktop), override === undefined ? waivers : []);

  it("has no finding that is not waived with a reason", () => {
    expect(settled.red).toEqual([]);
  });

  it("has no waiver that covers nothing", () => {
    expect(override === undefined ? settled.stale : []).toEqual([]);
  });

  it("gives every waiver a reason", () => {
    for (const waiver of waivers) {
      expect(waiver.reason.length, `${waiver.primitive} ${waiver.member}`).toBeGreaterThan(20);
    }
  });

  it("finds a difference when the Desktop disagrees (a regression)", () => {
    const changed: Desktop = { components: { ...desktop.components, button: { ...desktop.components.button!, events: {} } } };

    expect(parity(specifications, changed).some((each) => each.primitive === "button" && each.member === "events.click")).toBe(true);
  });
});
