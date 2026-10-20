// What the tools check of a recipe (Bet 6, "What the tools check"): each rule is shown on the default theme with one deliberate mistake, and the message is the one an author reads.
import { describe, expect, it } from "vitest";

import { checkRecipe, defaultInputs } from "../src/index.js";
import { codes, themeWith } from "./helpers.js";

const button = (change: (recipe: any) => void) => themeWith((edit) => edit("recipes/button.json", change)).checked.problems; // eslint-disable-line

describe("a recipe that names something the contract or the primitive does not have", () => {
  it("names a part that does not exist, with a suggestion", () => {
    const problems = button((recipe) => (recipe.target.part = "roots"));

    expect(codes(problems)).toEqual(["unknown-part"]);
    expect(problems[0]!.message).toContain('did you mean "root"');
  });

  it("names a state the primitive does not declare", () => {
    const problems = button((recipe) => (recipe.states.checked = { opacity: 1 }));

    expect(codes(problems)).toEqual(["unknown-state"]);
    expect(problems[0]!.message).toContain('button has no state "checked"');
  });

  it("names a misspelled state, with a suggestion", () => {
    const problems = button((recipe) => ((recipe.states["hoverd"] = recipe.states.hovered), delete recipe.states.hovered));

    expect(problems[0]!.message).toContain('did you mean "hovered"');
  });

  it("names a variant the primitive does not take", () => {
    expect(codes(themeWith((edit) => edit("recipes/text.json", (recipe) => (recipe.variants = { intent: { primary: { text: "color.accent" } } }))).checked.problems)).toEqual([
      "unknown-variant",
    ]);
  });

  it("names a variant value outside the closed set, with a suggestion", () => {
    const problems = button((recipe) => ((recipe.variants.intent.primry = recipe.variants.intent.primary), delete recipe.variants.intent.primary));

    expect(codes(problems)).toEqual(["unknown-variant-value"]);
    expect(problems[0]!.message).toContain('did you mean "primary"');
  });

  it("names a condition or a value of one that does not exist", () => {
    expect(codes(button((recipe) => (recipe.when["viewprt:compact"] = { gap: "space.1" })))).toEqual(["unknown-condition"]);
    expect(codes(button((recipe) => (recipe.when["viewport:tiny"] = { "min-size": "size.target" })))).toEqual(["unknown-condition-value"]);
  });

  it("styles a primitive that does not exist", () => {
    expect(codes(button((recipe) => (recipe.target.primitive = "buton")))).toEqual(["unknown-primitive"]);
  });

  it("styles a state the primitive does not declare", () => {
    expect(codes(themeWith((edit) => edit("recipes/checkbox.json", (recipe) => (recipe.states.disabled = { opacity: 0.5 }))).checked.problems)).toEqual(["unknown-state"]);
  });

  it("styles a state the specification declares and the web has no selector for", () => {
    const inputs = defaultInputs();
    const { style: _style, ...withoutStyle } = inputs.web.primitives["textfield"]!;
    const web = { ...inputs.web, primitives: { ...inputs.web.primitives, textfield: withoutStyle } };
    const { loaded } = themeWith(() => undefined);
    const recipe = loaded.recipes.find((each) => each.recipe.target.primitive === "textfield")!;

    expect(codes(checkRecipe(recipe.file, recipe.recipe, loaded.modes, { ...inputs, web }))).toEqual(["state-unreachable"]);
  });
});

describe("a recipe with a value the property does not take", () => {
  it("uses a property outside the portable set", () => {
    const problems = button((recipe) => (recipe.base["text-transform"] = "uppercase"));

    expect(codes(problems)).toEqual(["unknown-property"]);
    expect(problems[0]!.message).toContain("escape");
  });

  it("refers to a token that does not exist, with a suggestion", () => {
    const problems = button((recipe) => (recipe.variants.intent.primary.background = "color.acent"));

    expect(codes(problems)).toEqual(["unresolved-token"]);
    expect(problems[0]!.message).toContain('did you mean "color.accent"');
  });

  it("refers to a token of the wrong type", () => {
    const problems = button((recipe) => (recipe.base.radius = "color.accent"));

    expect(codes(problems)).toEqual(["bad-value"]);
    expect(problems[0]!.message).toContain("color token, and a dimension is needed");
  });

  it("writes a literal where a token is needed, and a number out of range", () => {
    expect(codes(button((recipe) => (recipe.base.radius = "8px")))).toEqual(["unresolved-token"]);
    expect(codes(button((recipe) => (recipe.states.disabled.opacity = 1.5)))).toEqual(["bad-value"]);
  });
});

describe("a recipe that removes the focus indicator", () => {
  it("is refused when it sets the outline to none and gives none in its place", () => {
    const problems = button((recipe) => (recipe.states["focus-visible"] = { outline: "none" }));

    expect(codes(problems)).toEqual(["focus-removed"]);
  });

  it("is refused when its escape block removes the outline", () => {
    expect(codes(button((recipe) => ((recipe.escape = { web: { css: "outline: none" } }), delete recipe.states["focus-visible"])))).toEqual(["focus-removed"]);
  });

  it("is accepted when it removes the outline and gives another", () => {
    expect(codes(button((recipe) => (recipe.escape = { web: { css: "outline-style: none" } })))).toEqual([]);
  });
});
