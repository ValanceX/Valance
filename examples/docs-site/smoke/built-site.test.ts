// The BUILT site, end to end: `pnpm build` (vite + tsc), the server (src/serve.ts) over node:http, and real Chromium. The page is server rendered, takes over without a
// second document load, searches through the server, navigates by links, keeps the title in step, and Back restores the previous page.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

import { serve } from "../src/serve.js";

let served: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  execFileSync("pnpm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe" });
  served = await serve(join(process.cwd(), "dist", "page"));
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => { served.server.close(() => { resolve(); }); });
});

it("serves a rendered document, a 404 for an unknown path, and the search endpoint", async () => {
  const html = await (await fetch(`${served.origin}/docs/guides/state`)).text();

  expect(html).toContain("<title>State · Valance</title>");
  expect(html).toContain("Commands are the only way to change it.");
  expect(html).toContain(`src="${served.script}"`);
  expect((await fetch(`${served.origin}/docs/nope`)).status).toBe(404);
  expect(await (await fetch(`${served.origin}/api/search?q=async`)).json()).toEqual([{ id: "async-work", title: "Async Work" }]);
});

it("hydrates, searches, navigates by links, keeps the title, and Back restores", async () => {
  const page = await (await browser.newContext()).newPage();
  const failures: Array<string> = [];
  const documents: Array<string> = [];

  page.on("pageerror", (error) => { failures.push(error.message); });
  page.on("request", (request) => { if (request.resourceType() === "document") { documents.push(new URL(request.url()).pathname); } });
  await page.goto(`${served.origin}/docs/guides/state`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  expect(await page.title()).toBe("State · Valance");

  // search: the field carries what is typed, the application asks the server, results are links
  await page.getByRole("textbox").fill("async");
  await page.getByRole("link", { name: "Async Work" }).first().waitFor();
  expect(await page.getByRole("textbox").inputValue()).toBe("async");

  // a plain click on a link is navigation inside the page: no new document, the URL and the title follow, search closes and the field empties
  await page.getByRole("link", { name: "Async Work" }).first().click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/async-work");
  expect(await page.title()).toBe("Async Work · Valance");
  expect(await page.getByRole("textbox").inputValue()).toBe("");
  expect(await page.getByRole("heading", { name: "Async Work" }).count()).toBe(1);

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state");
  expect(await page.title()).toBe("State · Valance");
  expect(await page.getByRole("heading", { name: "State", exact: true }).count()).toBe(1);

  expect(failures).toEqual([]);
  expect(documents).toEqual(["/docs/guides/state"]);                                      // one document load: everything after was in place
});
