// A closed set in a form (Bet 11): the schema's literals are drawn as a radiogroup, one radio each, named and described like any other field, and the group is one tab stop with the arrow keys moving
// the choice (the platform's own, through the PORT's group). The HTML it draws is judged by the Nu Html Checker and the accessible name by the computation the standard defines.
import { computeAccessibleDescription, computeAccessibleName } from "dom-accessibility-api";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";
import { browserAvailable, errorsOf, inBrowser, portFocuses } from "./forms-support.js";

afterEach(cleanup);

const MAIN = `import { component, defineApp, field, Form } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
const Order = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2)).annotations({ title: "Name", message: () => "Enter at least 2 characters" }),
  size: Schema.Literal("small", "medium", "large").annotations({ title: "Size", message: () => "Choose a size" }),
});
const order = Form.make(Order);
export default defineApp({
  state: { order: order.field(), done: field(Schema.Boolean, false) },
  derived: (derive) => ({ form: order.view(derive, (state) => state.order) }),
  commands: (command) => order.commands(command, { field: "order", submitted: (s) => ({ ...s, done: true }) }),
  layout: component(layout),
});
`;
const LAYOUT = `<shell class="x" theme="light">
{#each form.fields as f (f.name)}<column>
{#if f.kind == "choice"}<radiogroup label={f.title} invalid={f.invalid} describedby={f.errorId}>{#each f.choices as c (c)}<radio label={c} value={c} checked={f.value == c} on.select={edit(f.name, $event)} />{/each}</radiogroup>{:else}<textfield label={f.title} value={f.value} kind={f.input} invalid={f.invalid} describedby={f.errorId} on.change={edit(f.name, $event)} on.blur={blur(f.name)} />{/if}
<text id={f.errorId}>{f.error}</text></column>
{/each}
<button on.click={submit()}>Order</button>{#if done}<status>Ordered</status>{/if}
</shell>
`;
const FILES: Record<string, string> = { "content/index.md": PAGE("Home", "Text."), "src/main.ts": MAIN, "src/layout.mprx": LAYOUT };

describe("a closed set in a form", () => {
  it("checks clean as a project", async () => {
    expect((await check(project(FILES))).diagnostics).toEqual([]);
  });
});

describe.runIf(browserAvailable)("used in a browser", () => {
  it.skipIf(!portFocuses)(
    "is a radiogroup with a name and a message, one tab stop whose arrow keys choose, and a failed submit says a choice is required (needs @valancex/port-web 0.11)",
    { timeout: 240_000 },
    async () => {
      await inBrowser(FILES, async (page, errors) => {
        await page.getByLabel("Name").fill("Ada");

        // A submit without a choice: the group is in error, named and described, and focus goes to it.
        await page.click('button:text-is("Order")');
        await page.waitForFunction(() => document.querySelector('[role="radiogroup"]')?.getAttribute("aria-invalid") === "true");
        expect(await page.locator("#size-error").textContent()).toBe("Required");

        const html = `<!doctype html>\n${await page.evaluate(() => document.documentElement.outerHTML)}`;

        expect(errorsOf(html)).toEqual([]);

        const group = new JSDOM(html).window.document.querySelector('[role="radiogroup"]')!;

        expect(computeAccessibleName(group)).toBe("Size");
        expect(computeAccessibleDescription(group)).toBe("Required");
        expect([...group.querySelectorAll("input")].map((each) => computeAccessibleName(each))).toEqual(["small", "medium", "large"]);
        expect(new Set([...group.querySelectorAll("input")].map((each) => each.getAttribute("name"))).size).toBe(1);

        // One tab stop; the arrow keys choose, and the choice is the form's.
        await page.getByLabel("Name").focus();
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("small");
        await page.keyboard.press("ArrowDown");
        await page.waitForFunction(() => (document.querySelector('input[aria-label="medium"]') as HTMLInputElement).checked);
        await page.waitForFunction(() => document.querySelector('[role="radiogroup"]')?.getAttribute("aria-invalid") !== "true");
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement?.localName)).toBe("button");

        await page.keyboard.press("Enter");
        await page.waitForSelector("text=Ordered");
        expect(errors).toEqual([]);
      });
    },
  );
});
