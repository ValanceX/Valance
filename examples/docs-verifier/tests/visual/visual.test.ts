// Visual regression. The first page of every site, at a phone, a tablet and a desktop width, in the light and the dark theme, is photographed and compared with the photograph taken the
// last time (`.visual/`): a change that moves more than a hair of the page is a failure, and the difference is written beside the photograph to look at.
//
// Photographs depend on the machine's fonts, so they are not kept in the repository: the first run on a machine makes them, and `UPDATE_VISUAL=1` takes them again after a change that was
// meant. CI keeps `.visual/` from its last good run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGeneratedSite } from "../../build/document.js";
import { build } from "../smoke/build.js";
import { serveStatic } from "../../build/serve.js";

const SITES = (process.env["VISUAL_SITES"] ?? "docs,blog,landing,handbook").split(",");
const VIEWPORTS = [{ name: "phone", width: 390, height: 780 }, { name: "tablet", width: 820, height: 1000 }, { name: "desktop", width: 1280, height: 800 }] as const;
const SCHEMES = ["light", "dark"] as const;
const DIRECTORY = join(process.cwd(), ".visual");
/** How many pixels may differ before it is a change: a little anti-aliasing is not one. (A page is a million pixels; an accent colour on a link and a bar is a few hundred.) */
const TOLERANCE = 30;

let browser: Browser;
const served: Record<string, Awaited<ReturnType<typeof serveStatic>>> = {};

beforeAll(async () => {
  mkdirSync(DIRECTORY, { recursive: true });

  for (const site of SITES) {
    build(site);
    served[site] = await serveStatic(join(process.cwd(), "dist", site));
  }

  browser = await chromium.launch();
}, 900_000);

afterAll(async () => {
  await browser.close();
  await Promise.all(Object.values(served).map(({ server }) => new Promise<void>((resolve) => { server.close(() => { resolve(); }); })));
});

describe.each(SITES)("%s", (site) => {
  it.each(VIEWPORTS.flatMap((viewport) => SCHEMES.map((scheme) => [viewport, scheme] as const)))("looks as it did: %o, %s", async (viewport, scheme) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await context.newPage();

    await page.goto(`${served[site]!.origin}${readGeneratedSite(site).pages[0]!.path}`);
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
    await page.evaluate(() => document.fonts.ready);

    const photograph = await page.screenshot({ animations: "disabled", caret: "hide" });
    const name = `${site}-${viewport.name}-${scheme}`;
    const baseline = join(DIRECTORY, `${name}.png`);

    await context.close();

    if (!existsSync(baseline) || process.env["UPDATE_VISUAL"] === "1") {
      writeFileSync(baseline, photograph);

      return;
    }

    const before = PNG.sync.read(readFileSync(baseline));
    const after = PNG.sync.read(photograph);

    expect([after.width, after.height], "the page is the size it was").toEqual([before.width, before.height]);

    const difference = new PNG({ width: before.width, height: before.height });
    const changed = pixelmatch(before.data, after.data, difference.data, before.width, before.height, { threshold: 0.1 });

    if (changed > TOLERANCE) { writeFileSync(join(DIRECTORY, `${name}.diff.png`), PNG.sync.write(difference)); }

    expect(changed).toBeLessThanOrEqual(TOLERANCE);
  });
});
