// Stage 52: the built page served by an ORDINARY PROCESS. `build:page` (vite build) and `build:server` (the example's own tsc, compiling src/serve-main.ts to
// dist/server) produce the artifacts; `node dist/server/serve-main.js` is started as a child process (no vitest, no vite dev server inside it); Chromium loads the
// page from it. This test imports nothing from ../src: the process boundary is the thing under test.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

import { chromium } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

let child: ChildProcess;
let origin = "";
let output: Array<string> = [];

beforeAll(async () => {
  execFileSync("pnpm", ["run", "build:page"], { cwd: process.cwd(), stdio: "pipe" });
  execFileSync("pnpm", ["run", "build:server"], { cwd: process.cwd(), stdio: "pipe" });
  child = spawn("node", ["dist/server/serve-main.js"], { cwd: process.cwd(), env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  output = [];
  child.stderr!.on("data", (chunk: Buffer) => { output.push(`stderr: ${String(chunk)}`); });
  origin = await new Promise<string>((resolve, reject) => {
    createInterface({ input: child.stdout! }).on("line", (line) => { output.push(line); const match = /^listening (http:\/\/\S+)/.exec(line); if (match !== null) { resolve(match[1]!); } });
    child.on("exit", (code) => { reject(new Error(`the server exited with ${String(code)} before listening: ${output.join("\n")}`)); });
  });
});

afterAll(async () => {
  const exited = new Promise<void>((resolve) => { child.on("exit", () => { resolve(); }); });

  child.kill("SIGTERM");
  await exited;
});

it("an ordinary Node process serves the built page: Chromium loads it, it starts, an interaction works, history works, and the built assets are fetched from that process", async () => {
  const browser = await chromium.launch();

  try {
    const page = await (await browser.newContext()).newPage();
    const requests: Array<{ readonly path: string; readonly status: number }> = [];
    const failures: Array<string> = [];

    page.on("response", (response) => { requests.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    page.on("pageerror", (error) => { failures.push(error.message); });
    await page.goto(`${origin}/tracer/about?tab=details`);
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");

    await page.getByText("Back", { exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#app")?.textContent === "0 clicks, last at 0ClickAbout");
    await page.getByText("Click", { exact: true }).click();
    await page.waitForFunction(() => /^1 clicks, last at [1-9]\d+/.test(document.querySelector("#app")?.textContent ?? ""));
    await page.getByText("About", { exact: true }).click();
    await page.waitForFunction(() => location.pathname + location.search === "/tracer/about?tab=overview");

    expect(failures).toEqual([]);
    expect(requests.filter((request) => request.status !== 200)).toEqual([]);                                  // every request the page made, including the assets, succeeded
    expect(requests.some((request) => /^\/assets\/page-.*\.js$/.test(request.path))).toBe(true);
    expect(requests.some((request) => /^\/assets\/mesh-runtime-.*\.wasm$/.test(request.path))).toBe(true);
    expect(requests.filter((request) => request.path.startsWith("/tracer")).length).toBe(1);                    // one document load
    expect(output.filter((line) => line.startsWith("stderr:"))).toEqual([]);                                    // the process wrote nothing to stderr
  } finally {
    await browser.close();
  }
});
