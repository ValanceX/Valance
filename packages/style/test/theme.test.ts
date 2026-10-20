// The default theme is sound, and each check fails on a theme with a deliberate mistake in it (a misspelled name, a wrong type, a value below the contrast it declares, a removed focus ring...).
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkTheme, loadTheme, ratio, root, toRgb } from "../src/index.js";
import { codes, themeWith } from "./helpers.js";

const hex = (value: string) => toRgb({ colorSpace: "srgb", components: [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16) / 255) });

describe("the default theme", () => {
  const loaded = loadTheme(join(root, "themes", "default", "theme.json"), (path) => path);
  const checked = checkTheme(loaded);

  it("has no problem", () => {
    expect(checked.problems).toEqual([]);
  });

  it("defines the same tokens in every mode", () => {
    const sets = Object.values(loaded.modes).map((tokens) => [...tokens.keys()].sort().join());

    expect(Object.keys(loaded.modes)).toEqual(["light", "dark", "contrast"]);
    expect(new Set(sets).size).toBe(1);
  });

  it("meets every contrast it declares, in every mode", () => {
    expect(checked.contrast.length).toBe(8 * 3);
    expect(checked.contrast.filter((each) => !each.passes)).toEqual([]);
  });
});

describe("the contrast ratio is WCAG 2.2's", () => {
  // the values the WCAG 2.2 Understanding documents and Techniques give: black on white 21:1; #767676 on white 4.54:1 (the lightest gray that passes 4.5); #777777 on white 4.48:1; #595959 on white 7.0:1
  const white = hex("#ffffff");

  it.each([
    ["#000000", 21],
    ["#767676", 4.54],
    ["#777777", 4.48],
    ["#595959", 7.0],
  ])("%s on white is %s:1", (color, expected) => {
    expect(Math.round(ratio(hex(color), white) * 100) / 100).toBe(expected);
  });

  it("does not depend on which is the lighter", () => {
    expect(ratio(white, hex("#767676"))).toBe(ratio(hex("#767676"), white));
  });
});

describe("a theme with a mistake in it", () => {
  it("fails the contrast it declares when the text on the accent is made gray (a deliberately wrong value)", () => {
    const { checked } = themeWith((edit) =>
      edit("tokens/light.tokens.json", (json) => Object.assign(json.color["on-accent"].$value, { hex: "#808080", components: [0.5, 0.5, 0.5] })),
    );

    expect(codes(checked.problems)).toEqual(["contrast-below-minimum"]);
    expect(checked.problems[0]!.message).toMatch(/color\.on-accent on color\.accent is 2\.\d\d:1 in the light mode, below the 4\.5:1/);
  });

  it("fails a token whose alias loops, a color in the old string form, and a dimension with an unknown unit", () => {
    expect(
      codes(themeWith((edit) => edit("tokens/base.tokens.json", (json) => Object.assign(json.space, { 1: { $value: "{space.2}" }, 2: { $value: "{space.1}" } }))).loaded.problems),
    ).toContain("token-cycle");
    expect(codes(themeWith((edit) => edit("tokens/light.tokens.json", (json) => (json.color.text.$value = "#1d2330"))).loaded.problems)).toContain("tokens-format");
    expect(codes(themeWith((edit) => edit("tokens/base.tokens.json", (json) => (json.radius["1"].$value.unit = "em"))).loaded.problems)).toContain("tokens-format");
  });

  it("fails a mode that lacks, or adds, a token", () => {
    expect(codes(themeWith((edit) => edit("tokens/dark.tokens.json", (json) => delete json.color.focus)).loaded.problems)).toContain("mode-missing-token");
    expect(codes(themeWith((edit) => edit("tokens/dark.tokens.json", (json) => (json.color.extra = { $value: json.color.text.$value }))).loaded.problems)).toContain(
      "mode-extra-token",
    );
  });

  it("fails a theme.json that is not a theme", () => {
    expect(codes(themeWith((edit) => edit("theme.json", (json) => delete json.modes.light)).loaded.problems)).toEqual(["schema"]);
  });
});
