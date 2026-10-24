// The gallery (decision Q7): the cells the specifications give, the page they make (judged by the Nu Html Checker), the structure of every cell through two PORTs (the gate, Q8), and the states a
// person puts a node in, forced in Chromium (Q10) and compared with what the theme's recipe says.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadSpecifications, loadWeb } from "@valancex/primitives";
import { compileWeb, defaultInputs, loadTheme, root as styleRoot, toCss } from "@valancex/style";
import { describe, expect, it } from "vitest";

import { jsdomAdapter } from "../src/adapters/jsdom.js";
import { terminalAdapter } from "../src/adapters/terminal/adapter.js";
import { force, computed } from "../src/chromium.js";
import { cellsOf, structureOf } from "../src/index.js";
import { gallerySite } from "../src/site.js";

const specifications = loadSpecifications();
const realizations = loadWeb();
const jar = join(createRequire(import.meta.url).resolve("vnu-jar/package.json"), "..", "build", "dist", "vnu.jar");

const errorsOf = (html: string): ReadonlyArray<string> => {
  const directory = mkdtempSync(join(tmpdir(), "vnu-gallery-"));

  try {
    writeFileSync(join(directory, "page.html"), html);

    const run = spawnSync("java", ["-jar", jar, "--format", "json", directory], { encoding: "utf8" });
    const report = JSON.parse(run.stderr.slice(run.stderr.indexOf("{"))) as {
      messages: Array<{ type: string; subType?: string; message: string }>;
    };

    return report.messages.filter((each) => (each.subType ?? each.type) === "error").map((each) => each.message);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("the cells", () => {
  const cells = cellsOf(specifications, realizations);

  it("are every combination of the closed sets and each state, with stable and unique keys", () => {
    const ids = cells.map((each) => each.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(cells.map((each) => each.key)).size).toBe(cells.length);
    // a button: its example, nine combinations of intent and size, and the two values of disabled
    expect(ids.filter((id) => id.startsWith("button/intent="))).toHaveLength(9);
    expect(ids).toContain("button/intent=danger,size=lg");
    expect(ids).toContain("button/disabled=true");
    expect(ids).toContain("checkbox/checked=false");
    // a layer covers the page, and a part inside another is drawn in it
    expect(ids.some((id) => id.startsWith("dialog/") || id.startsWith("popover/") || id.startsWith("listitem/") || id.startsWith("radio/"))).toBe(false);
  });

  it("grow with a closed set: a new member adds the cells that carry it, and nothing else changes", () => {
    const grown = structuredClone(specifications) as unknown as Record<string, { props: Record<string, { type: { values: string[] } }> }>;

    grown["button"]!.props["intent"]!.type.values.push("warning");

    const before = new Set(cells.map((each) => each.id));
    const added = cellsOf(grown as never, realizations).filter((each) => !before.has(each.id));

    expect(added.map((each) => each.id)).toEqual(["button/intent=warning,size=sm", "button/intent=warning,size=md", "button/intent=warning,size=lg"]);
  });
});

describe("the page", () => {
  it("is a document the Nu Html Checker finds no error in, with every cell in every mode of the theme", () => {
    const site = gallerySite();

    expect(site.modes).toEqual(["light", "dark", "contrast"]);
    expect(site.html.slice(site.html.indexOf("<body>")).match(/data-theme="/g)).toHaveLength(3);
    expect(errorsOf(site.html)).toEqual([]);
  });

  it("is judged by a checker that is running: the same page with a button inside a button has an error", () => {
    const site = gallerySite();

    expect(errorsOf(site.html.replace("<main>", "<main><button><button>x</button></button>")).length).toBeGreaterThan(0);
  });
});

describe("the structure of every cell (the gate)", () => {
  const cells = cellsOf(specifications, realizations);

  it("is the same through two PORTs where both draw it, and a cell a PORT cannot draw is null, not missing", async () => {
    const web = await structureOf(jsdomAdapter("test"), cells);
    const terminal = await structureOf(terminalAdapter(), cells);

    expect(Object.keys(web)).toEqual(cells.map((each) => each.id));
    expect(Object.keys(terminal)).toEqual(cells.map((each) => each.id));
    // the terminal declares link, list, image… unsupported: those cells are null
    expect(terminal["link/example"]).toBeNull();
    expect(web["link/example"]).not.toBeNull();

    // where both draw a cell they agree on its meaning
    for (const cell of cells) {
      const a = web[cell.id];
      const b = terminal[cell.id];

      if (a === null || a === undefined || b === null || b === undefined) {
        continue;
      }

      expect(
        b.map((each) => [each.role, each.name, each.text, each.enabled, each.checked, each.pressed]),
        cell.id,
      ).toEqual(a.map((each) => [each.role, each.name, each.text, each.enabled, each.checked, each.pressed]));
    }
  });

  it("is committed (gallery/structure.web.json), so a change to a cell shows in review, and is not what a changed cell gives", async () => {
    const snapshot = JSON.parse(readFileSync(new URL("../gallery/structure.web.json", import.meta.url), "utf8")) as unknown;
    const web = JSON.parse(JSON.stringify(await structureOf(jsdomAdapter("test"), cells))) as Record<string, unknown>;

    expect(web).toEqual(snapshot);

    const changed = structuredClone(cellsOf(specifications, realizations)) as unknown as Array<{
      id: string;
      tree: { root: { props: Record<string, unknown> } };
    }>;
    const at = changed.find((each) => each.id === "button/disabled=true")!;

    at.tree.root.props["disabled"] = false;
    expect(JSON.parse(JSON.stringify(await structureOf(jsdomAdapter("test"), changed as never)))).not.toEqual(snapshot);
  });
});

const usable = await chromium
  .launch()
  .then(async (browser) => {
    await browser.close();

    return true;
  })
  .catch(() => false);

describe.runIf(usable)("forced states, in Chromium", () => {
  it("hovered, pressed and focus-visible are the recipe's: forcing them paints what the theme says, and not forcing does not", async () => {
    const site = gallerySite();
    const loaded = loadTheme(join(styleRoot, "themes", "default", "theme.json"), (path) => path);
    const light = loaded.modes["light"]!;
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.setContent(site.html);

      // the first button of the light section, by its cell
      const selector = '[data-theme="light"] button[data-vlx="button"]:not([disabled])';
      const properties = ["box-shadow", "outline-style", "outline-color", "outline-width"];
      const base = await computed(page, selector, properties);

      expect(base["box-shadow"]).toBe("none");
      expect(base["outline-style"]).toBe("none");

      // hovered: the elevation of the recipe
      const releaseHover = await force(page, selector, ["hover"]);
      const hovered = await computed(page, selector, properties);

      expect(hovered["box-shadow"]).not.toBe("none");
      await releaseHover();
      expect((await computed(page, selector, properties))["box-shadow"]).toBe("none");

      // pressed, with hover (a pressed button is under the pointer): the recipe's pressed has no elevation
      const releasePressed = await force(page, selector, ["hover", "pressed"]);

      expect((await computed(page, selector, properties))["box-shadow"]).toBe("none");
      await releasePressed();

      // focus-visible: the ring of the recipe, in the focus color
      const releaseFocus = await force(page, selector, ["focus-visible"]);
      const focused = await computed(page, selector, properties);

      expect(focused["outline-style"]).toBe("solid");
      expect(focused["outline-color"]).toBe(rgb(toCss(light.get("color.focus")!.value as never)));
      await releaseFocus();
    } finally {
      await browser.close();
    }

    expect(compileWeb(loaded, defaultInputs())).toContain("@media (any-hover: hover)");
  });
});

/** A CSS color as the browser writes it computed, for the colors the default theme has (`#rrggbb`). */
const rgb = (css: string): string => {
  const hex = css.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

  return `rgb(${r}, ${g}, ${b})`;
};
