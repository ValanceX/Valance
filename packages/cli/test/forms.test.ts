// A signup form from its schema (direction Bet 11): under 25 lines of schema, wiring and template, with no validation outside the schema; built with `vlx build`, used in a browser, and the HTML it draws
// judged by the official checkers (the Nu Html Checker for conformance; the Accessible Name and Description Computation for what a screen reader says about each field).
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
const Signup = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2)).annotations({ title: "Name", message: () => "Enter at least 2 characters" }),
  age: Schema.NumberFromString.pipe(Schema.int(), Schema.between(18, 120)).annotations({ title: "Age", message: () => "Enter a whole number from 18 to 120" }),
  accept: Schema.Literal(true).annotations({ title: "I accept the terms", message: () => "You must accept the terms" }),
});
const signup = Form.make(Signup);
export default defineApp({
  state: { signup: signup.field(), done: field(Schema.Boolean, false) },
  derived: (derive) => ({ form: signup.view(derive, (state) => state.signup) }),
  commands: (command) => signup.commands(command, { field: "signup", submitted: (s) => ({ ...s, done: true }) }),
  layout: component(layout),
});
`;
const LAYOUT = `<shell class="x" theme="light">
{#each form.fields as f (f.name)}<column>
{#if f.kind == "boolean"}<checkbox label={f.title} checked={f.checked} invalid={f.invalid} describedby={f.errorId} on.change={check(f.name, $event)} />{:else}<textfield label={f.title} value={f.value} kind={f.input} invalid={f.invalid} describedby={f.errorId} on.change={edit(f.name, $event)} on.blur={blur(f.name)} />{/if}
<text id={f.errorId}>{f.error}</text></column>
{/each}
<button on.click={submit()}>Sign up</button>{#if done}<status>Welcome, signed up</status>{/if}
</shell>
`;
const FILES: Record<string, string> = { "content/index.md": PAGE("Home", "Text."), "src/main.ts": MAIN, "src/layout.mprx": LAYOUT };

describe("the form", () => {
  it("is under 25 lines of schema, wiring and template, and no validation is written outside the schema", () => {
    const lines = (text: string) => text.split("\n").filter((line) => line.trim() !== "").length;

    expect(lines(MAIN) + lines(LAYOUT)).toBeLessThan(25 + 3 /* the three import lines */);
    expect(lines(MAIN) - 3 + lines(LAYOUT)).toBeLessThan(25);
    expect(MAIN).not.toMatch(/\bif\b|\.test\(|throw|validate/);
    expect(LAYOUT).not.toMatch(/minLength|length|\.test\(|pattern/);
  });

  it("checks clean as a project", async () => {
    expect((await check(project(FILES))).diagnostics).toEqual([]);
  });
});

describe.runIf(browserAvailable)("used in a browser", () => {
  it(
    "shows an error after the person leaves a field, not at the first keystroke; a failed submit says how many fields need attention; the HTML drawn is conforming and each field has its name and its message for a screen reader",
    { timeout: 240_000 },
    async () => {
      await inBrowser(FILES, async (page, errors) => {
        const name = page.getByLabel("Name");
        const age = page.getByLabel("Age");

        // The first keystroke is not an error.
        await name.fill("A");
        expect(await page.locator('[aria-invalid="true"]').count()).toBe(0);
        // Leaving the field is.
        await name.blur();
        await page.waitForSelector('input[aria-invalid="true"]');
        expect(await page.locator("#name-error").textContent()).toBe("Enter at least 2 characters");
        // And once shown it follows the typing.
        await name.fill("Ada");
        await page.waitForFunction(() => document.querySelectorAll('[aria-invalid="true"]').length === 0);

        // A submit that fails touches every field and says how many need attention.
        await age.fill("7.5");
        // No pause: the message has its room (F24), so what is below it does not move when the message comes or goes, and the click lands.
        await page.click('button:text-is("Sign up")');
        await page.waitForFunction(() => document.querySelectorAll('[aria-invalid="true"]').length === 2);
        expect(await page.locator("#age-error").textContent()).toBe("Enter a whole number from 18 to 120");
        expect(await page.locator("#accept-error").textContent()).toBe("You must accept the terms");
        expect(await page.locator("status, [role=status]").count()).toBe(0);

        // The HTML now drawn, with errors showing: conforming, and what a screen reader says about each field.
        const html = `<!doctype html>\n${await page.evaluate(() => document.documentElement.outerHTML)}`;

        expect(errorsOf(html)).toEqual([]);

        const dom = new JSDOM(html);
        const fields = [...dom.window.document.querySelectorAll("input")];

        expect(fields.map((each) => computeAccessibleName(each))).toEqual(["Name", "Age", "I accept the terms"]);
        expect(fields.map((each) => computeAccessibleDescription(each))).toEqual(["", "Enter a whole number from 18 to 120", "You must accept the terms"]);

        // A correct form submits.
        await age.fill("36");
        await page.getByLabel("I accept the terms").click();
        await page.waitForFunction(() => (document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked);
        await page.click('button:text-is("Sign up")');
        await page.waitForSelector("text=Welcome, signed up");
        expect(errors).toEqual([]);
      });
    },
  );

  it.skipIf(!portFocuses)(
    "a failed submit takes the person to the first field in error, and a second failed submit does it again (needs @valancex/port-web 0.11)",
    { timeout: 240_000 },
    async () => {
      await inBrowser(FILES, async (page) => {
        const active = () => page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.getAttribute("aria-label") ?? document.activeElement?.localName ?? "");

        await page.getByLabel("Name").fill("Ada");
        await page.getByLabel("Name").blur();
        await page.click('button:text-is("Sign up")');
        await page.waitForFunction(() => document.querySelectorAll('[aria-invalid="true"]').length === 2);
        // The name is right; the first field in error is the age.
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Age");
        // The person goes elsewhere; the same submit fails again and the age is asked for again.
        await page.getByLabel("I accept the terms").focus();
        await page.click('button:text-is("Sign up")');
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Age");
        expect(await active()).toBe("Age");
      });
    },
  );

  it("the checkers do see a bad one: an error in the HTML, and a description that is not the message when the reference names nothing (the checks are running)", () => {
    const bad = errorsOf(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><input aria-label="x" aria-describedby="nothing" type="text"><ul><span>no</span></ul></body></html>',
    );

    expect(bad.length).toBeGreaterThan(0);

    // And the accessible description is the message only when the reference names it: a deliberately wrong one names nothing.
    const dom = new JSDOM('<input aria-label="x" aria-describedby="nothing"><span id="message">Wrong</span>');
    const wrong = dom.window.document.querySelector("input")!;

    expect(computeAccessibleDescription(wrong)).toBe("");
    wrong.setAttribute("aria-describedby", "message");
    expect(computeAccessibleDescription(wrong)).toBe("Wrong");
  });
});
