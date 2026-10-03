// Stage 51: the real page without the dev server. `pnpm run build:page` (vite build) produces hashed JS and WASM assets plus a manifest; `servePage` (node:http) answers
// the document route and the assets; Chromium loads it. The page script, the document, the payload and the WASM are the same ones the dev-server tests exercise.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

import { servePage } from "../src/serve.js";

const DIR = join(process.cwd(), "dist", "page");
let served: Awaited<ReturnType<typeof servePage>>;

beforeAll(async () => {
  execFileSync("pnpm", ["run", "build:page"], { cwd: process.cwd(), stdio: "pipe" });
  served = await servePage(DIR);
});

afterAll(async () => { await new Promise<void>((resolve) => { served.server.close(() => { resolve(); }); }); });

it("the build contains the page script, the WASM runtime and a manifest, and the script references the WASM by its hashed name", () => {
  const assets = readdirSync(join(DIR, "assets"));
  const script = assets.find((name) => /^page-.*\.js$/.test(name))!;
  const wasm = assets.find((name) => /^mesh-runtime-.*\.wasm$/.test(name))!;

  expect(script).toBeDefined();
  expect(wasm).toBeDefined();
  expect(existsSync(join(DIR, ".vite", "manifest.json"))).toBe(true);
  expect(served.script).toBe(`/assets/${script}`);
  expect(readFileSync(join(DIR, "assets", script), "utf8")).toContain(wasm);          // the emitted asset is what the script will fetch
});

it("the served document carries the server HTML, the compiled programs and state, and the BUILT script (not the dev server's)", async () => {
  const html = await (await fetch(`${served.origin}/tracer/about?tab=details`)).text();

  expect(html).toContain("About Tracer: 0 clicks");                                  // server-rendered body
  expect(html).toMatch(/<script type="application\/json" id="valance-boot">.*"programs".*"state".*<\/script>/);
  expect(html).toContain(`<script type="module" src="${served.script}"></script>`);
  expect(html).not.toContain("/src/page.ts");
});

it("Chromium loads the built page: it starts, an existing interaction works, and the history behavior is unchanged, with no request to a dev-server path", async () => {
  const browser = await chromium.launch();

  try {
    const page = await (await browser.newContext()).newPage();
    const requests: Array<string> = [];

    page.on("request", (request) => { requests.push(new URL(request.url()).pathname); });
    const failures: Array<string> = [];

    page.on("pageerror", (error) => { failures.push(error.message); });
    await page.goto(`${served.origin}/tracer/about?tab=details`);
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");   // the page script ran `run` and it mounted

    await page.getByText("Back", { exact: true }).click();                              // About -> counter, a different program
    await page.waitForFunction(() => document.querySelector("#app")?.textContent === "0 clicks, last at 0ClickAbout");
    await page.getByText("Click", { exact: true }).click();                             // a command that reads the platform clock
    await page.waitForFunction(() => /^1 clicks, last at [1-9]\d+/.test(document.querySelector("#app")?.textContent ?? ""));
    await page.getByText("About", { exact: true }).click();
    await page.waitForFunction(() => location.pathname + location.search === "/tracer/about?tab=overview");   // pushState, as with the dev server
    await page.goBack();
    await page.waitForFunction(() => location.pathname + location.search === "/tracer/?tab=overview");
    await page.waitForFunction(() => /^1 clicks/.test(document.querySelector("#app")?.textContent ?? ""));    // popstate handled in place by the same application

    expect(failures).toEqual([]);
    expect(requests.filter((path) => /^\/(src|@|node_modules)\b/.test(path))).toEqual([]);   // nothing came from a dev server
    expect(requests.some((path) => path === served.script)).toBe(true);
    expect(requests.some((path) => /^\/assets\/mesh-runtime-.*\.wasm$/.test(path))).toBe(true);
    expect(requests.filter((path) => path.startsWith("/tracer")).length).toBe(1);        // one document load: the rest was in place
  } finally {
    await browser.close();
  }
});
