// The packages as a consumer meets them (K5, K7, K12): `vlx library check` is clean on each, a web-only component used by the desktop is one diagnostic at the use, and the two themes swap with
// no template change.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { copyOfPlayground, remove, root, vlx } from "./helpers.js";

const stylesheet = (dist: string): string =>
  readdirSync(join(dist, "web", "assets"))
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(join(dist, "web", "assets", name), "utf8"))
    .join("\n");

describe.each(["ui", "ui-web", "theme-plain", "theme-contrast"])("packages/%s", (name) => {
  it("is held to what a consumer's build relies on: `vlx library check` has nothing to say", () => {
    const ran = vlx(["library", "check"], join(root, "packages", name));

    expect(ran.output).toContain("no problems");
    expect(ran.status).toBe(0);
  });
});

describe("a web-only library in a project that also builds the desktop (K5)", () => {
  it("is one diagnostic at the use, with the library's name and what it supports, and none from node_modules", () => {
    const copy = copyOfPlayground();

    try {
      writeFileSync(join(copy, "src", "desktop", "layout.mprx"), readFileSync(join(copy, "src", "desktop", "layout.mprx"), "utf8").replace("<heading>Components</heading>", '<heading>Components</heading>\n  <badge label="new" />'));

      const ran = vlx(["check"], copy);
      const lines = ran.output.split("\n").filter((line) => /unsupported-target|node_modules/.test(line));

      expect(ran.status).toBe(1);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("src/desktop/layout.mprx:");
      expect(lines[0]).toContain("@valancex/ui-web/badge");
      expect(lines[0]).toContain("supports web only");
    } finally {
      remove(copy);
    }
  });
});

describe("the two themes swap with one setting and no template change (K12)", () => {
  const built = (theme: string): { readonly css: string; readonly html: string; readonly report: string } => {
    const copy = copyOfPlayground();

    try {
      const settings = JSON.parse(readFileSync(join(copy, "valance.json"), "utf8")) as Record<string, unknown>;

      writeFileSync(join(copy, "valance.json"), JSON.stringify({ ...settings, theme }));

      const report = vlx(["theme", "check"], copy);
      const ran = vlx(["build", "--web"], copy);

      expect(ran.status, ran.output).toBe(0);

      return { css: stylesheet(join(copy, "dist")), html: readFileSync(join(copy, "dist", "web", "index.html"), "utf8"), report: report.output };
    } finally {
      remove(copy);
    }
  };

  it("changes the colors, the borders and the radius, and leaves the page's structure as it was", () => {
    const plain = built("@valancex/theme-plain");
    const contrast = built("@valancex/theme-contrast");

    expect(plain.css).toContain("--vlx-color-accent: #4a2fc0");
    expect(contrast.css).toContain("--vlx-color-accent: #0000b3");
    expect(contrast.css).toContain("--vlx-border-1: 2px");
    expect(plain.css).toContain("--vlx-border-1: 1px");
    // the page is the same markup: the theme is a stylesheet (the hashed file names differ, so compare without them)
    const body = (html: string): string => html.replace(/assets\/[^"]+/g, "assets/x");

    expect(body(plain.html)).toBe(body(contrast.html));
  });

  it("reports each target's coverage and declares a contrast of 7 to 1 for the high-contrast theme, which holds", () => {
    const contrast = built("@valancex/theme-contrast");

    expect(contrast.report).toContain('the project\'s theme "contrast"');
    expect(contrast.report).toMatch(/color\.text on color\.surface\s+21\.00:1\s+\(min 7\)\s+ok/);
    expect(contrast.report).toContain("web: 7 of 7 primitives of the portable core styled");
    expect(contrast.report).toContain("desktop: 7 of 7 primitives of the portable core styled");
  });
});
