// The theme in a project: the default one needs nothing written (Tier 1), a `theme/` directory replaces it (Tier 2) and is checked with the rest of the project, and `vlx theme check` says what it finds.
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { root as styleRoot } from "@valancex/style";

import { check } from "../src/check.js";
import { main } from "../src/cli.js";
import { generateEntries } from "../src/emit.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const quiet = () => ({ out: vi.spyOn(console, "log").mockImplementation(() => undefined), err: vi.spyOn(console, "error").mockImplementation(() => undefined) });

/** A project with a copy of the default theme in `theme/` and `change` applied to a file of it. */
const withTheme = (change?: (edit: (file: string, change: (json: any) => void) => void) => void): string => {
  const root = project({ "content/index.md": PAGE() });
  const directory = join(root, "theme");

  cpSync(join(styleRoot, "themes", "default"), directory, { recursive: true });
  change?.((file, edit) => {
    const json = JSON.parse(readFileSync(join(directory, file), "utf8"));

    edit(json);
    writeFileSync(join(directory, file), JSON.stringify(json, null, 2));
  });

  return root;
};

describe("a project with no theme", () => {
  it("gets the default theme's stylesheet, in the theme layer, and the portable core's layout in the library layer", () => {
    const root = project({ "content/index.md": PAGE() });

    generateEntries(root);
    const theme = readFileSync(join(root, ".valance", "theme.css"), "utf8");
    const core = readFileSync(join(root, ".valance", "core.css"), "utf8");

    expect(theme).toContain("@layer vlx-library, vlx-theme, vlx-app;");
    expect(theme).toContain('[data-vlx="button"]');
    expect(core).toContain("@layer vlx-library {");
    expect(readFileSync(join(root, ".valance", "client.ts"), "utf8")).toMatch(/import "\.\/theme\.css";\nimport "\.\/core\.css";/);
  });

  it("checks clean", async () => {
    expect((await check(project({ "content/index.md": PAGE() }))).diagnostics).toEqual([]);
  });
});

describe("vlx theme check", () => {
  it("reports the default theme: its contrast, and what each target applies", async () => {
    const { out, err } = quiet();

    expect(await main(["theme", "check"], project({ "content/index.md": PAGE() }))).toBe(0);
    const text = out.mock.calls.flat().join("\n");

    expect(text).toContain('the default theme "default" (modes: light, dark, contrast)');
    expect(text).toMatch(/contrast {2}light {5}color\.text on color\.surface {2}\d+\.\d\d:1 {2}\(min 4\.5\) {2}ok/);
    expect(text).toContain("web: 7 of 7 primitives of the portable core styled");
    expect(text).toContain("desktop: 7 of 7 primitives of the portable core styled");
    expect(text).toContain("not applied: button state hovered (unsupported)");
    expect(text).toContain("no problems");
    expect(err).not.toHaveBeenCalled();
  });

  it("prints the same as data with --json", async () => {
    const { out } = quiet();

    expect(await main(["theme", "check", "--json"], project({ "content/index.md": PAGE() }))).toBe(0);
    const report = JSON.parse(out.mock.calls.flat().join("\n")) as { diagnostics: unknown[]; contrast: unknown[]; coverage: Array<{ target: string }> };

    expect(report.diagnostics).toEqual([]);
    expect(report.contrast.length).toBe(24);
    expect(report.coverage.map((each) => each.target)).toEqual(["web", "desktop"]);
  });

  it("refuses a theme with a mistake in it, naming the file, and exits 1 (a deliberately wrong value: a text color the accent cannot carry)", async () => {
    const { err } = quiet();
    const root = withTheme((edit) => edit("tokens/light.tokens.json", (json) => Object.assign(json.color["on-accent"].$value, { hex: "#808080", components: [0.5, 0.5, 0.5] })));

    expect(await main(["theme", "check"], root)).toBe(1);
    expect(err.mock.calls.flat().join("\n")).toMatch(/theme\.json contrast-below-minimum: \/contrast: color\.on-accent on color\.accent is 2\.\d\d:1/);
  });

  it("says what to write when it is not told what to check", async () => {
    const { err } = quiet();

    expect(await main(["theme"], project({ "content/index.md": PAGE() }))).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toContain("vlx theme check");
  });
});

describe("a project's own theme", () => {
  it("is used instead of the default, whole, and checks clean when it is sound", async () => {
    const root = withTheme((edit) => edit("tokens/light.tokens.json", (json) => Object.assign(json.color.accent.$value, { hex: "#005a9c", components: [0, 0.3529, 0.6118] })));

    expect((await check(root)).diagnostics).toEqual([]);
    generateEntries(root);
    expect(readFileSync(join(root, ".valance", "theme.css"), "utf8")).toContain("--vlx-color-accent: #005a9c;");
  });

  it("is checked with the project: a recipe that names a token that does not exist is a diagnostic of vlx check", async () => {
    const root = withTheme((edit) => edit("recipes/button.json", (json) => (json.variants.intent.primary.background = "color.acent")));
    const found = (await check(root)).diagnostics.filter((each) => each.file.startsWith("theme/"));

    expect(found.map((each) => `${each.file} ${each.code}`)).toEqual(["theme/recipes/button.json unresolved-token"]);
    expect(found[0]!.message).toContain('did you mean "color.accent"');
  });

  it("leaves the page with no theme rather than a half of one while it has a problem", () => {
    const root = withTheme((edit) => edit("recipes/button.json", (json) => (json.target.part = "roots")));

    generateEntries(root);
    expect(readFileSync(join(root, ".valance", "theme.css"), "utf8")).toContain("The theme has a problem");
  });
});

describe("the desktop target", () => {
  it("is given the theme resolved: values, not references", () => {
    const root = project({ "content/index.md": PAGE(), "valance.json": '{ "name": "Test", "targets": ["web", "desktop"] }', "valance.desktop.json": "{}" });

    generateEntries(root, { targets: ["desktop"] } as never);
    const theme = JSON.parse(readFileSync(join(root, ".valance", "theme.desktop.json"), "utf8")) as { modes: Record<string, Record<string, { base?: Record<string, unknown> }>> };

    expect(Object.keys(theme.modes)).toEqual(["light", "dark"]);
    expect(theme.modes["light"]!["button"]!.base).toMatchObject({ radius: 8 });
    expect(readFileSync(join(root, ".valance", "desktop.ts"), "utf8")).toContain("theme: theme ?? undefined");
  });
});
