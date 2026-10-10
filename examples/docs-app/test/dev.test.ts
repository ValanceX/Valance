import { dev } from "@valancex/app/node";
import type { Dev } from "@valancex/app/node";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `valance dev` on a scratch copy of the application (inside this project, so it resolves the same packages), edited the way an author edits it, with a real browser watching.
const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(here, ".work-"));
const copy = join(work, "app");

let browser: Browser;
let running: Dev;
let page: Page;
const logs: Array<string> = [];

const edit = (file: string, from: string, to: string): void => {
  const text = readFileSync(join(copy, file), "utf8");

  if (!text.includes(from)) { throw new Error(`${file} does not contain ${from}`); }

  writeFileSync(join(copy, file), text.replace(from, to));
};

const ready = async (): Promise<void> => { await page.waitForSelector('#app[data-valance="running"]'); };

beforeAll(async () => {
  for (const entry of ["content", "public", "src", "valance.json"]) { cpSync(join(here, entry), join(copy, entry), { recursive: true }); }

  running = await dev(copy, { port: 5400 + Math.floor(Math.random() * 400), log: (line) => { logs.push(line); } });
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(`${running.url}guide/getting-started`);
  await ready();
});

afterAll(async () => {
  await browser?.close();
  await running?.close();
  rmSync(work, { recursive: true, force: true });
});

describe("valance dev", () => {
  it("serves a server-rendered page that hydrates, and navigates in place", async () => {
    expect(await page.textContent("h1")).toBe("Getting started");
    await page.click('a.nav-link[href="/"]');
    await page.waitForFunction(() => location.pathname === "/");
    await page.goBack();
    await page.waitForFunction(() => location.pathname === "/guide/getting-started");
    expect(await page.textContent("h1")).toBe("Getting started");
  });

  it("shows an edit to a Markdown page", async () => {
    edit("content/guide/getting-started.md", "Open the address", "Open exactly the address");
    await page.waitForFunction(() => document.body.textContent?.includes("Open exactly the address"));
    await ready();
  });

  it("shows an edit to a component", async () => {
    edit("src/theme-toggle.mprx", '"Light" : "Dark"', '"Bright" : "Night"');
    await page.waitForFunction(() => document.querySelector("button.theme-toggle")?.textContent === "Night");
    await ready();
  });

  it("applies an edit to a stylesheet without reloading the page", async () => {
    await page.evaluate(() => { (window as unknown as { __kept: boolean }).__kept = true; });
    edit("src/styles.css", "--accent: #5b3fd6", "--accent: #d63f3f");
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() === "#d63f3f");
    expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
  });

  it("shows a mistake in the content as an overlay that names the file and line, keeps serving the last good page, and recovers when it is fixed", async () => {
    edit("content/guide/getting-started.md", "[writing pages](./writing-pages.md)", "[writing pages](./nope.md)");
    await page.waitForSelector("vite-error-overlay");
    expect(await page.evaluate(() => document.querySelector("vite-error-overlay")!.shadowRoot!.textContent)).toMatch(/content\/guide\/getting-started\.md:\d+ link-broken/);
    expect(logs.join("\n")).toMatch(/content\/guide\/getting-started\.md:\d+ link-broken/);
    expect((await fetch(`${running.url}guide/getting-started`)).status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 150));
    edit("content/guide/getting-started.md", "./nope.md", "./writing-pages.md");
    await page.waitForFunction(() => document.querySelector("vite-error-overlay") === null);
    await ready();
    expect(logs.join("\n")).toContain("content is fine again");
  });

  it("shows a mistake in a template with its line, and recovers", async () => {
    edit("src/theme-toggle.mprx", "on.click={toggle()}", "on.click={toggle()} bogus={missing}");
    await page.waitForSelector("vite-error-overlay");
    expect(await page.evaluate(() => document.querySelector("vite-error-overlay")!.shadowRoot!.textContent)).toMatch(/src\/theme-toggle\.mprx:1/);

    await new Promise((resolve) => setTimeout(resolve, 150));
    edit("src/theme-toggle.mprx", " bogus={missing}", "");
    await page.waitForFunction(() => document.querySelector("vite-error-overlay") === null);
    await ready();
  });

  it("picks up a new page without a restart", async () => {
    writeFileSync(join(copy, "content/guide/extra.md"), "---\ntitle: Extra\norder: 3\n---\n\n# Extra\n\nA new page.\n");
    await page.waitForSelector('a.nav-link[href="/guide/extra"]');
    await ready();
    await page.click('a.nav-link[href="/guide/extra"]');
    await page.waitForFunction(() => location.pathname === "/guide/extra");
    expect(await page.textContent("h1")).toBe("Extra");
  });

  it("restarts when the configuration changes, and serves the new name", async () => {
    edit("valance.json", '"Notes"', '"Renamed"');
    await page.waitForFunction(() => document.querySelector("a.brand")?.textContent === "Renamed", null, { timeout: 30_000 });
    await ready();
    expect(logs.join("\n")).toContain("the configuration changed; restarting");
  });
});
