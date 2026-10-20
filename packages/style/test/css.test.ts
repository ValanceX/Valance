// The compiled stylesheet: stylelint passes it, it reaches a primitive only by what the contract names, and it fails stylelint when a value in it is wrong (shown on the default theme with a deliberate
// mistake, and on the compiled text itself).
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkTheme, compileWeb, defaultInputs, loadTheme, root } from "../src/index.js";
import { themeWith } from "./helpers.js";
import { lint } from "./stylelint.js";

const inputs = defaultInputs();
const loaded = loadTheme(join(root, "themes", "default", "theme.json"), (path) => path);
const css = compileWeb(loaded, inputs);

describe("the default theme's stylesheet", () => {
  it("passes stylelint", async () => {
    expect(await lint(css)).toEqual([]);
  });

  it("declares the layers first, library before theme before application", () => {
    expect(css).toMatch(/^\/\*.*\*\/\n@layer vlx-library, vlx-theme, vlx-app;\n/);
    expect(css).toContain("@layer vlx-theme {");
  });

  it("is deterministic", () => {
    expect(
      compileWeb(
        loadTheme(join(root, "themes", "default", "theme.json"), (path) => path),
        inputs,
      ),
    ).toBe(css);
  });

  it("makes the tokens custom properties, the modes by data-theme, and dark and high contrast by the system's preference", () => {
    expect(css).toContain("--vlx-color-text: #1d2330;");
    expect(css).toContain("--vlx-space-4: 1rem;");
    expect(css).toContain("--vlx-type-body-family: system-ui, sans-serif;");
    expect(css).toContain('[data-theme="dark"] {');
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\n {4}:root \{/);
    expect(css).toMatch(/@media \(prefers-contrast: more\) \{\n {4}:root \{/);
  });

  it("styles every primitive of the portable core by its hook", () => {
    for (const primitive of ["column", "row", "heading", "text", "button", "checkbox", "textfield"]) {
      expect(css).toContain(`[data-vlx="${primitive}"] {`);
    }
  });

  it("reaches a variant by its attribute (the default value also when the attribute is absent) and a state by its selector", () => {
    expect(css).toContain('[data-vlx="button"]:is([data-intent="neutral"], :not([data-intent])) {');
    expect(css).toContain('[data-vlx="button"][data-intent="primary"] {');
    expect(css).toContain('[data-vlx="button"]:focus-visible {');
    expect(css).toContain('[data-vlx="button"]:disabled {');
    expect(css).toContain('[data-vlx="textfield"][aria-invalid="true"] {');
    expect(css).toContain('[data-vlx="checkbox"][aria-invalid="true"] {');
  });

  it("has a media query for a condition", () => {
    expect(css).toContain("@media (width < 600px) {");
  });
});

describe("a stylesheet with a wrong value in it", () => {
  const wrong: Array<[string, string, (text: string) => string]> = [
    ["an unknown property", "property-no-unknown", (text) => text.replace("border-radius:", "border-radious:")],
    ["a value the property does not take", "declaration-property-value-no-unknown", (text) => text.replace(/border-radius: var\(--vlx-radius-2\)/, "border-radius: banana")],
    ["an invalid hex color", "color-no-invalid-hex", (text) => text.replace("#1d2330", "#1d233")],
    ["an unknown unit", "unit-no-unknown", (text) => text.replace("--vlx-space-4: 1rem", "--vlx-space-4: 1rme")],
    ["an unknown pseudo-class", "selector-pseudo-class-no-unknown", (text) => text.replace(":focus-visible", ":focus-visble")],
    ["an unknown at-rule", "at-rule-no-unknown", (text) => text.replace("@media (width < 600px)", "@medai (width < 600px)")],
    ["an invalid media query", "media-query-no-invalid", (text) => text.replace("(width < 600px)", "(width <)")],
    ["an unknown function", "function-no-unknown", (text) => text.replace("var(--vlx-radius-2)", "vra(--vlx-radius-2)")],
    ["a class selector (the contract reaches a primitive by its hook, never its class)", "selector-max-class", (text) => text.replace('[data-vlx="text"] {', ".text {")],
    ["an element selector", "selector-max-type", (text) => text.replace('[data-vlx="row"] {', "vlx-row {")],
    ["a descendant combinator", "selector-max-combinators", (text) => text.replace('[data-vlx="heading"] {', '[data-vlx="column"] [data-vlx="heading"] {')],
  ];

  it.each(wrong)("is refused for %s", async (_name, rule, mutate) => {
    const mutated = mutate(css);

    expect(mutated).not.toBe(css);
    expect((await lint(mutated)).map((each) => each.split(":")[0])).toContain(rule);
  });

  it("is refused when a recipe's escape block has a typo in it, because the escape is compiled as written", async () => {
    const { loaded: withEscape } = themeWith((edit) => edit("recipes/text.json", (recipe) => (recipe.escape = { web: { css: "text-transfrom: none" } })));

    expect(checkTheme(withEscape, inputs).problems).toEqual([]);
    expect((await lint(compileWeb(withEscape, inputs))).some((each) => each.startsWith("property-no-unknown") && each.includes("text-transfrom"))).toBe(true);
  });
});
