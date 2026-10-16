// The findings register is only a register if what is open is going somewhere (docs/findings/README.md, "How to analyze later" step 3). A row whose status says Open names the work package that
// will close it, so an untracked gap fails here instead of being found a year later.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const register = readFileSync(fileURLToPath(new URL("../../../docs/findings/README.md", import.meta.url)), "utf8");
const analysis = readFileSync(fileURLToPath(new URL("../../../docs/findings/2026-10-16-gap-analysis-and-proposed-work.md", import.meta.url)), "utf8");

/** The table rows of the register: [id, the cells]. */
const rows = register
  .split("\n")
  .filter((line) => /^\| (WA|RF|F|D)-?\d+/.test(line))
  .map((line) =>
    line
      .split("|")
      .map((cell) => cell.trim())
      .filter((_, at, all) => at > 0 && at < all.length),
  );

describe("the findings register", () => {
  it("has rows to check", () => {
    expect(rows.length).toBeGreaterThan(10);
  });

  it("names a work package for every row that is still open", () => {
    const open = rows.filter((cells) => cells.some((cell) => /^Open\b/.test(cell)));

    expect(open.length).toBeGreaterThan(0);
    for (const cells of open) {
      const status = cells.find((cell) => /^Open\b/.test(cell))!;

      expect(status, `${cells[0]} is Open and names no work package`).toMatch(/WP-\d+/);
    }
  });

  it("names only work packages the gap analysis defines", () => {
    const defined = new Set([...analysis.matchAll(/\bWP-(\d+)/g)].map((match) => match[1]));

    for (const cells of rows) {
      for (const match of cells.join(" ").matchAll(/Open → WP-(\d+)/g)) {
        expect(defined.has(match[1]), `${cells[0]} names WP-${match[1]}`).toBe(true);
      }
    }
  });
});
