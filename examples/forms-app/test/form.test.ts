import { build } from "@valancex/cli/node";
import type { Browser, Page, Route } from "playwright";
import { chromium } from "playwright";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveStatic } from "./serve.js";

// The reference form, built and served as a static site under the strict policy the build wrote, driven in Chromium with the backend answered by the test.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let browser: Browser;
let server: Server;
let origin: string;

beforeAll(async () => {
  await build(root);
  ({ origin, server } = await serveStatic(join(root, "dist/web")));
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.close();
});

interface Opened {
  readonly page: Page;
  readonly errors: Array<string>;
  readonly sent: Array<unknown>;
}

/** Opens the form; `answer` is what the backend says to a sign-up. */
const open = async (
  address: string,
  answer: (route: Route) => Promise<void> | void = (route) => route.fulfill({ status: 201, contentType: "application/json", body: '{"id":"u1"}' }),
): Promise<Opened> => {
  const page = await browser.newPage();
  const errors: Array<string> = [];
  const sent: Array<unknown> = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of (404|409|500)/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await page.route("**/api/signup", async (route) => {
    sent.push(route.request().postDataJSON());
    await answer(route);
  });
  await page.goto(`${origin}${address}`);
  await page.waitForSelector('#app[data-valance="running"]');

  return { page, errors, sent };
};

const field = (page: Page, label: string) => page.locator(`input[aria-label="${label}"]`);
const fillValid = async (page: Page): Promise<void> => {
  await field(page, "Name").fill("Ada");
  await field(page, "Email").fill("ada@example.com");
  await field(page, "Password").fill("analytical1");
  // Leave the last field and let the render its `blur` causes happen before the click. A click that comes while that render is in flight is lost: the render puts the controlled box back between the
  // click's toggle and the moment its `change` is read (finding RF-11). Real clicks are tens of milliseconds long; a test's are not.
  await field(page, "Password").blur();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('input[aria-label="I accept the terms"]').check();
};
const texts = (page: Page, selector: string) => page.locator(selector).allTextContents();

describe("the sign-up form", () => {
  it("opens on its own address with the plan the query names, and the page is the route's screen", async () => {
    const { page, errors } = await open("/signup?plan=pro");

    expect(await page.title()).toBe("Sign up · Sign-up");
    expect(await page.textContent("h1")).toBe("Create your account");
    expect(await page.getAttribute("button.plan >> nth=1", "aria-pressed")).toBe("true");
    expect(await page.getAttribute("button.plan >> nth=0", "aria-pressed")).toBe("false");
    expect(new URL(page.url()).search).toBe("?plan=pro");
    expect(errors).toEqual([]);
    await page.close();
  });

  it("shows nothing wrong before the first press, then every problem at once, and sends nothing", async () => {
    const { page, sent } = await open("/signup");

    expect(await texts(page, ".error")).toEqual([]);
    await page.click("button.send");
    await page.waitForSelector(".error");
    expect(await texts(page, ".error")).toEqual(["Enter your name", "Enter an email like you@example.com", "Use at least 8 characters", "Accept the terms to continue"]);
    expect(sent).toEqual([]);
    await page.close();
  });

  it("checks as the person types after that, in the Schemas' words, including a rule that needs two fields", async () => {
    const { page } = await open("/signup");

    await page.click("button.send");
    await field(page, "Name").fill("Ada");
    await field(page, "Email").fill("ada@");
    await page.waitForFunction(() => document.querySelectorAll(".error").length === 3);
    expect(await texts(page, ".error")).toEqual(["Enter an email like you@example.com", "Use at least 8 characters", "Accept the terms to continue"]);
    await field(page, "Password").fill("ada12345");
    await page.waitForFunction(() => [...document.querySelectorAll(".error")].some((each) => each.textContent === "Do not put your name in your password"));
    await field(page, "Password").fill("analytical1");
    await page.waitForFunction(() => ![...document.querySelectorAll(".error")].some((each) => /password/i.test(each.textContent ?? "")));
    await page.close();
  });

  it("sends the form on Enter in a field, shows that it is working, and welcomes the person", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { page, sent, errors } = await open("/signup?plan=pro", async (route) => {
      await gate;
      await route.fulfill({ status: 201, contentType: "application/json", body: '{"id":"u1"}' });
    });

    await fillValid(page);
    await field(page, "Password").press("Enter");
    await page.waitForFunction(() => document.querySelector("button.send")?.textContent === "Creating…");
    expect(await page.isDisabled("button.send")).toBe(true);
    release();
    await page.waitForSelector(".success");
    expect(await page.textContent(".success")).toBe("Welcome, Ada. Your pro account is ready.");
    expect(sent).toEqual([{ name: "Ada", email: "ada@example.com", password: "analytical1", terms: true, plan: "pro" }]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it("says an email is taken from the server's 409, beside the email, until the email changes", async () => {
    const { page } = await open("/signup", (route) => route.fulfill({ status: 409, contentType: "application/json", body: '{"error":"taken"}' }));

    await fillValid(page);
    await page.click("button.send");
    await page.waitForFunction(() => [...document.querySelectorAll(".error")].some((each) => each.textContent === "That email already has an account"));
    expect(await page.isDisabled("button.send")).toBe(false);
    await field(page, "Email").fill("ada@elsewhere.com");
    await page.waitForFunction(() => document.querySelectorAll(".error").length === 0);
    await page.close();
  });

  it("says a failed request failed, in words for the person, and lets them try again", async () => {
    let first = true;
    const { page, sent } = await open("/signup", (route) => {
      if (first) {
        first = false;
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }

      return route.fulfill({ status: 201, contentType: "application/json", body: '{"id":"u2"}' });
    });

    await fillValid(page);
    await page.click("button.send");
    await page.waitForSelector(".failure");
    expect(await page.textContent(".failure")).toBe("The server had a problem. Try again in a moment.");
    await page.click("button.send");
    await page.waitForSelector(".success");
    expect(sent).toHaveLength(2);
    await page.close();
  });

  it("keeps every character typed one by one, fast, while the screen redraws on each (the controlled field)", async () => {
    const { page } = await open("/signup");

    await field(page, "Name").pressSequentially("Ada Lovelace-King", { delay: 0 });
    await field(page, "Email").pressSequentially("ada.lovelace@example.com", { delay: 0 });
    await page.waitForFunction(() => (document.querySelector('input[aria-label="Email"]') as HTMLInputElement).value === "ada.lovelace@example.com");
    expect(await field(page, "Name").inputValue()).toBe("Ada Lovelace-King");
    await page.close();
  });

  it("clears the form on Escape", async () => {
    const { page } = await open("/signup");

    await fillValid(page);
    await field(page, "Email").press("Escape");
    await page.waitForFunction(() => (document.querySelector('input[aria-label="Name"]') as HTMLInputElement).value === "");
    expect(await field(page, "Email").inputValue()).toBe("");
    expect(await page.locator('input[aria-label="I accept the terms"]').isChecked()).toBe(false);
    await page.close();
  });

  it("is a page the rest of the site links to by address, and a content page still draws content", async () => {
    const { page } = await open("/");

    await page.click('a[href="/signup"]');
    await page.waitForSelector("h1#signup");
    expect(new URL(page.url()).pathname).toBe("/signup");
    await page.click('a[href="/guide/about"]');
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "About this form");
    await page.close();
  });

  it("masks the password, marks an invalid field invalid and ties it to its message", async () => {
    const { page } = await open("/signup");

    expect(await field(page, "Password").getAttribute("type")).toBe("password");
    expect(await field(page, "Name").getAttribute("type")).toBeNull(); // no kind: the browser's own text
    await page.click("button.send");
    await page.waitForSelector(".error");

    for (const [label, message] of [
      ["Name", "name-error"],
      ["Email", "email-error"],
      ["Password", "password-error"],
      ["I accept the terms", "terms-error"],
    ] as const) {
      const control = page.locator(`input[aria-label="${label}"]`);

      expect(await control.getAttribute("aria-invalid"), label).toBe("true");
      expect(await control.getAttribute("aria-describedby"), label).toBe(message);
      expect(await page.getAttribute(`#${message}`, "class"), label).toBe("error");
    }

    // Once it is right, it is not invalid any more (and the message is gone).
    await field(page, "Name").fill("Ada");
    await page.waitForFunction(() => document.querySelector('input[aria-label="Name"]')?.getAttribute("aria-invalid") === "false");
    expect(await page.locator("#name-error").count()).toBe(0);
    await page.close();
  });

  it("shows a field's problem when the person leaves it, and not before, without waiting for the first press", async () => {
    const { page } = await open("/signup");

    await field(page, "Name").focus();
    expect(await texts(page, ".error")).toEqual([]); // being in the field is not a problem
    await field(page, "Email").focus(); // leaving Name
    await page.waitForSelector("#name-error");
    expect(await texts(page, ".error")).toEqual(["Enter your name"]); // Email has been entered, not left
    await field(page, "Password").focus(); // leaving Email
    await page.waitForSelector("#email-error");
    expect(await texts(page, ".error")).toEqual(["Enter your name", "Enter an email like you@example.com"]);
    await page.close();
  });
});
