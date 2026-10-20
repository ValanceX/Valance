// The coverage of a theme per target, and what the Desktop is told: resolved values, only those it honors, the rest listed.
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { coverageOf, defaultInputs, loadTheme, resolveForDesktop, root } from "../src/index.js";
import { themeWith } from "./helpers.js";

const inputs = defaultInputs();
const loaded = loadTheme(join(root, "themes", "default", "theme.json"), (path) => path);
const CORE = ["button", "checkbox", "column", "heading", "row", "text", "textfield"];

describe("coverage", () => {
  it("the default theme styles all seven primitives of the portable core on both targets", () => {
    for (const target of ["web", "desktop"] as const) {
      const coverage = coverageOf(loaded, inputs, target);

      expect([...coverage.styled].sort()).toEqual(CORE);
      expect(coverage.unstyled).toEqual([]);
    }
  });

  it("the web applies everything the theme asks", () => {
    expect(coverageOf(loaded, inputs, "web").notApplied).toEqual([]);
  });

  it("the Desktop lists what it does not apply, by primitive", () => {
    const names = coverageOf(loaded, inputs, "desktop").notApplied.map((each) => `${each.primitive} ${each.kind} ${each.name} ${each.support}`);

    expect(names).toContain("button state hovered unsupported");
    expect(names).toContain("button state focus-visible unsupported");
    expect(names).toContain("(theme) condition mode contrast unsupported");
    expect(names).toContain("checkbox state focus-visible unsupported");
    // a property the Desktop does not honor in a recipe it applies is named too
    expect(names.some((each) => each.startsWith("button state disabled") || each.startsWith("button property disabled"))).toBe(true);
  });

  it("a theme that leaves a primitive unstyled says so, on each target", () => {
    const { loaded: without } = themeWith((edit) => edit("theme.json", (json) => (json.recipes = json.recipes.filter((each: string) => !each.includes("textfield")))));

    expect(coverageOf(without, inputs, "web").unstyled).toEqual(["textfield"]);
    expect(coverageOf(without, inputs, "desktop").unstyled).toEqual(["textfield"]);
  });
});

describe("what the Desktop is told", () => {
  const theme = resolveForDesktop(loaded, inputs);

  it("has the modes the Desktop can choose, light and dark, and not high contrast", () => {
    expect(Object.keys(theme.modes)).toEqual(["light", "dark"]);
  });

  it("is resolved: colors are hex, lengths are points", () => {
    const button = theme.modes["light"]!["button"]!;

    expect(button.base).toEqual({ radius: 8, padding: [8, 16, 8, 16], fontSize: 15, fontWeight: 500, minSize: 40 });
    expect(button.variants!["intent"]!["primary"]).toEqual({ background: "#4a2fc0", text: "#ffffff", border: { width: 1, color: "#4a2fc0" } });
    expect(button.variants!["size"]!["lg"]!.padding).toEqual([12, 32, 12, 32]);
    expect(theme.modes["dark"]!["button"]!.variants!["intent"]!["primary"]!.background).toBe("#a78bfa");
  });

  it("leaves out what the Desktop does not apply: elevation, opacity, outline", () => {
    const text = JSON.stringify(theme);

    expect(text).not.toContain("elevation");
    expect(text).not.toContain("opacity");
    expect(text).not.toContain("outline");
    expect(theme.modes["light"]!["button"]!.states).toEqual(undefined);
  });

  it("keeps the states it applies and the viewport conditions", () => {
    expect(theme.modes["light"]!["textfield"]!.states).toEqual({ invalid: { border: { width: 2, color: "#b3261e" } } });
    expect(theme.modes["light"]!["button"]!.when).toEqual({ "viewport:compact": { minSize: 48 } });
  });

  it("says each variant's default", () => {
    expect(theme.defaults).toEqual({ intent: "neutral", size: "md" });
  });
});

describe("the Desktop's theme", () => {
  it("is the one the window's own tests read (a copy of this fixture is in the PORT repository: packages/port-desktop/tests/fixtures/theme-default.json)", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "desktop-theme-default.json"), "utf8")) as unknown;

    // When the contract changes this fails; copy the new resolution to both fixtures (here and in the PORT repository) and run the window's tests.
    expect(JSON.parse(JSON.stringify(resolveForDesktop(loaded, inputs)))).toEqual(fixture);
  });
});
