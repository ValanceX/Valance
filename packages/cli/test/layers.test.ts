// A dialog and a popover in a built application (WP6b): the application owns `open`, a dismissal is an event it answers, and the browser does the rest (a modal page, focus inside it and back to what
// opened it, the page that does not scroll behind it). Written the way docs/use/layers.md says; the HTML it draws is judged by the Nu Html Checker and the name by the computation the standard defines.
import { computeAccessibleName } from "dom-accessibility-api";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";
import { browserAvailable, errorsOf, inBrowser, portLayers } from "./forms-support.js";

afterEach(cleanup);

const MAIN = `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
export default defineApp({
  state: { confirming: field(Schema.Boolean, false), menu: field(Schema.Boolean, false), deleted: field(Schema.Boolean, false) },
  commands: (command) => ({
    ask: command((state) => ({ ...state, confirming: true })),
    cancel: command((state) => ({ ...state, confirming: false })),
    remove: command((state) => ({ ...state, confirming: false, deleted: true })),
    toggleMenu: command((state) => ({ ...state, menu: !state.menu })),
  }),
  layout: component(layout),
});
`;
const LAYOUT = `<shell class="x" theme="light">
<button id="delete" on.click={ask()}>Delete</button>
<dialog open={confirming} label="Delete this order?" on.dismiss={cancel()}>
<text>This cannot be undone.</text>
<button on.click={cancel()}>Keep it</button>
<button on.click={remove()}>Delete for good</button>
</dialog>
<button id="more" on.click={toggleMenu()}>More</button>
<popover open={menu} anchor="more" placement="bottom" on.dismiss={toggleMenu()}><text>Archive</text></popover>
{#if deleted}<status>Deleted</status>{/if}
</shell>
`;
const FILES: Record<string, string> = { "content/index.md": PAGE("Home", "Text."), "src/main.ts": MAIN, "src/layout.mprx": LAYOUT };

describe.runIf(portLayers)("a dialog and a popover (needs @valancex/port-web 0.12)", () => {
  it("check clean as a project, and refuse a placement that is not one of four and a dialog that has no `open`", async () => {
    expect((await check(project(FILES))).diagnostics).toEqual([]);
    cleanup();
    expect((await check(project({ ...FILES, "src/layout.mprx": LAYOUT.replace('placement="bottom"', 'placement="middle"') }))).diagnostics).not.toEqual([]);
    cleanup();
    expect((await check(project({ ...FILES, "src/layout.mprx": LAYOUT.replace("open={confirming} ", "") }))).diagnostics).not.toEqual([]);
  });

  describe.runIf(browserAvailable)("used in a browser", () => {
    it(
      "a dialog is modal while the application has it open, keeps focus inside, scrolls nothing behind it, is dismissed by Escape as the application decides, and gives focus back",
      { timeout: 240_000 },
      async () => {
        await inBrowser(FILES, async (page, errors) => {
          const modal = () => page.evaluate(() => document.querySelector("dialog")!.matches(":modal"));

          expect(await modal()).toBe(false);
          await page.click("#delete");
          await page.waitForFunction(() => document.querySelector("dialog")!.matches(":modal"));
          expect(await page.evaluate(() => document.querySelector("dialog")!.contains(document.activeElement))).toBe(true);

          const html = `<!doctype html>\n${await page.evaluate(() => document.documentElement.outerHTML)}`;

          expect(errorsOf(html)).toEqual([]);
          expect(computeAccessibleName(new JSDOM(html).window.document.querySelector("dialog")!)).toBe("Delete this order?");
          // the page behind it does not scroll (I14)
          expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");

          // Tab stays inside: three presses from the first of two buttons come back to it
          for (let each = 0; each < 5; each += 1) {
            await page.keyboard.press("Tab");
            expect(await page.evaluate(() => document.querySelector("dialog")!.contains(document.activeElement))).toBe(true);
          }

          await page.keyboard.press("Escape");
          await page.waitForFunction(() => !document.querySelector("dialog")!.matches(":modal"));
          expect(await page.evaluate(() => document.activeElement?.id)).toBe("delete");
          expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("visible");

          // the application can say yes
          await page.click("#delete");
          await page.waitForFunction(() => document.querySelector("dialog")!.matches(":modal"));
          await page.click('button:text-is("Delete for good")');
          await page.waitForSelector("text=Deleted");
          expect(await modal()).toBe(false);
          expect(errors).toEqual([]);
        });
      },
    );

    it("a popover opens at its button and closes by Escape or by a press outside, as the application decides", { timeout: 240_000 }, async () => {
      await inBrowser(FILES, async (page, errors) => {
        const open = () => page.evaluate(() => document.querySelector("[popover]")!.matches(":popover-open"));

        await page.click("#more");
        await page.waitForFunction(() => document.querySelector("[popover]")!.matches(":popover-open"));
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector("[popover]")!.matches(":popover-open"));
        expect(await open()).toBe(false);

        await page.click("#more");
        await page.waitForFunction(() => document.querySelector("[popover]")!.matches(":popover-open"));
        await page.click("#delete");
        await page.waitForFunction(() => !document.querySelector("[popover]")!.matches(":popover-open"));
        expect(errors).toEqual([]);
      });
    });
  });
});
