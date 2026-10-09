// The BUILT site, end to end, on the development branches of MESH and PORT: `pnpm build` (content, vite, tsc), the server (web/serve.ts) over node:http, and real Chromium. The page is
// server rendered through the layout's slot, takes over without a second document load, navigates by links, keeps the title in step, Back restores, and the copy button's composite
// event travels code-block → block → page to a command, whose state the page then shows.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

import { readGeneratedSite } from "../web/document.js";
import { serve } from "../web/serve.js";

let served: Awaited<ReturnType<typeof serve>>;
let browser: Browser;

beforeAll(async () => {
  execFileSync("pnpm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe" });
  served = await serve(readGeneratedSite(), join(process.cwd(), "dist", "page"));
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => { served.server.close(() => { resolve(); }); });
});

it("serves a rendered document, and a 404 with the application's own page for an unknown path", async () => {
  const html = await (await fetch(`${served.origin}/docs/guides/state`)).text();

  expect(html).toContain("<title>State · Valance</title>");
  expect(html).toContain("Commands are the only way to change it.");

  const missing = await fetch(`${served.origin}/docs/nope`);

  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain("There is no such page.");
});

it("hydrates, navigates by links, keeps the title, Back restores, and the copy button's event reaches its command", async () => {
  const page = await (await browser.newContext()).newPage();
  const failures: Array<string> = [];
  const documents: Array<string> = [];

  page.on("pageerror", (error) => { failures.push(error.message); });
  page.on("console", (message) => { if (message.type() === "error") { failures.push(message.text()); } });
  page.on("request", (request) => { if (request.resourceType() === "document") { documents.push(new URL(request.url()).pathname); } });
  await page.goto(`${served.origin}/docs/guides/getting-started`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
  expect(await page.title()).toBe("Getting Started · Valance");

  // the composite event, through real DOM events after hydration
  expect(await page.getByRole("button", { name: "Copy" }).count()).toBe(1);
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByRole("button", { name: "Copied" }).waitFor();

  // a plain click on a link is navigation inside the page: no new document, the URL and the title follow, and the copied mark is cleared by `go`
  await page.getByRole("link", { name: "Guides: State" }).click();
  await page.waitForFunction(() => location.pathname === "/docs/guides/state");
  expect(await page.title()).toBe("State · Valance");
  expect(await page.getByRole("heading", { name: "State", exact: true }).count()).toBe(1);

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/docs/guides/getting-started");
  expect(await page.title()).toBe("Getting Started · Valance");
  expect(await page.getByRole("button", { name: "Copy", exact: true }).count()).toBe(1);   // back on the page, the mark is gone

  expect(failures).toEqual([]);
  expect(documents).toEqual(["/docs/guides/getting-started"]);                            // one document load: everything after was in place
});
