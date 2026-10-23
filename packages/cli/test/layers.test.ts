// A dialog and a popover in a built application (WP6b): the application owns `open`, a dismissal is an event it answers, and the browser does the rest (a modal page, focus inside it and back to what
// opened it, the page that does not scroll behind it). Written the way docs/use/layers.md says; the HTML it draws is judged by the Nu Html Checker and the name by the computation the standard defines.
import { computeAccessibleName } from "dom-accessibility-api";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
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

  const diagnosticsOf = async (layout: string): Promise<ReadonlyArray<string>> =>
    (await check(project({ ...FILES, "src/layout.mprx": layout }))).diagnostics.map(({ line, code, message }) => `${line} ${code}: ${message}`);

  it("a popover's `mode` is accepted and the old `kind` is refused with a diagnostic that names `mode` (decision I29); a textfield's `kind` is unchanged", async () => {
    const popover = (props: string) => `<shell class="x" theme="light"><popover open={menu} ${props} on.dismiss={toggleMenu()}><text>Archive</text></popover></shell>`;

    expect(await diagnosticsOf(popover('mode="manual"'))).toEqual([]);
    expect(await diagnosticsOf(popover('mode="sometimes"'))).not.toEqual([]);

    const old = await diagnosticsOf(popover('kind="manual"'));

    expect(old).toHaveLength(1);
    expect(old[0]).toContain('unknown-prop: component "popover" has no prop "kind"');
    expect(old[0]).toContain("`kind` on `popover` is now `mode`");
    expect(await diagnosticsOf('<shell class="x" theme="light"><textfield label="Pass" value="" kind="password" /></shell>')).toEqual([]);
  });

  it("a dialog inside a dialog is a diagnostic that names both; dialogs side by side, and a popover inside a dialog, are fine (decision I29)", async () => {
    const nested = await diagnosticsOf(
      '<shell class="x" theme="light"><dialog open={confirming} label="A" on.dismiss={cancel()}><column><dialog open={menu} label="B" on.dismiss={toggleMenu()}><text>b</text></dialog></column></dialog></shell>',
    );

    expect(nested).toHaveLength(1);
    expect(nested[0]).toMatch(/nested-modal: <dialog> is a modal layer inside <dialog>/);
    expect(
      await diagnosticsOf(
        '<shell class="x" theme="light"><dialog open={confirming} label="A" on.dismiss={cancel()}><popover open={menu} on.dismiss={toggleMenu()}><text>p</text></popover></dialog><dialog open={menu} label="B" on.dismiss={toggleMenu()}><text>b</text></dialog></shell>',
      ),
    ).toEqual([]);
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

    it(
      "a dialog that a component draws inside another dialog, which the compiler cannot see, is refused by the PORT when it is drawn, with the message that names both (decision I29)",
      { timeout: 240_000 },
      async () => {
        const files = {
          ...FILES,
          "src/main.ts": MAIN.replace('import layout from "./layout.mprx";', 'import layout from "./layout.mprx";\nimport sure from "./sure.mprx";').replace(
            "layout: component(layout),",
            "layout: component(layout),\n  components: [component(sure)],",
          ),
          "src/layout.mprx": LAYOUT.replace("<text>This cannot be undone.</text>", "<sure />"),
          "src/sure.mprx": '<dialog open={true} label="Really?"><text>Really?</text></dialog>',
        };

        const root = project(files);

        // Nothing at compile time sees the two meet (the compiler judges one template); the first page that draws them is refused, here the server's, so the build fails and says why.
        await expect(build(root)).rejects.toThrow(/nested-modal|a modal layer inside <dialog>/);
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
