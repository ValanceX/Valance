// The web target of the playground, in a real browser and through the W3C's Nu Html Checker: the library's components work as a person uses them (type, open, switch a tab), the markup is valid, and
// the two themes change the colors with no template change. The browser is the one Playwright installed (MESH_CHROMIUM names it); the build is the playground's own `vlx build`.
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { playground, root, vlx } from "./helpers.js";

const dist = join(playground, "dist", "web");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

let server: Server;
let origin = "";
let browser: Browser;

beforeAll(async () => {
  const built = vlx(["build"]);

  if (built.status !== 0) {
    throw new Error(built.output);
  }

  server = createServer((request, response) => {
    const path = join(dist, (request.url ?? "/").split("?")[0]!.replace(/\/$/, "/index.html"));
    const file = existsSync(path) && statSync(path).isFile() ? path : join(dist, "index.html");

    response.setHeader("content-type", TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream");
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch(process.env["MESH_CHROMIUM"] === undefined ? {} : { executablePath: process.env["MESH_CHROMIUM"] });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

describe("the playground's web page", () => {
  it("shows every component and reaches them by their roles", async () => {
    const page = await browser.newPage();

    await page.goto(origin);
    await page.getByRole("heading", { name: "Components" }).waitFor();
    expect(await page.getByRole("textbox", { name: "Name" }).count()).toBe(1);
    expect(await page.getByRole("button", { name: "Details" }).count()).toBe(1);
    // the tabs are toggle buttons (the portable `toggle`): one is pressed, and its panel is shown
    expect(await page.getByRole("button", { name: "One", pressed: true }).count()).toBe(1);
    expect(await page.getByRole("button", { name: "Two", pressed: false }).count()).toBe(1);
    expect(await page.getByText("Panel One").count()).toBe(1);
    expect(await page.getByRole("listitem").count()).toBe(2);
    await page.close();
  }, 60_000);

  it("works with the keyboard: type a name, open the disclosure, switch the tab", async () => {
    const page = await browser.newPage();

    await page.goto(origin);
    await page.getByRole("textbox", { name: "Name" }).fill("Ada");
    expect(await page.getByText("Hello Ada").count()).toBe(0);
    await page.getByRole("button", { name: "Details" }).focus();
    await page.keyboard.press("Enter");
    await page.getByText("Hello Ada").waitFor();

    await page.getByRole("button", { name: "Two" }).focus();
    await page.keyboard.press("Space");
    await page.getByText("Panel Two").waitFor();
    expect(await page.getByText("Panel One").count()).toBe(0);
    expect(await page.getByRole("button", { name: "Two", pressed: true }).count()).toBe(1);
    await page.close();
  }, 60_000);

  it("is valid HTML, by the Nu Html Checker", () => {
    const html = join(dist, "index.html");
    const checked = execFileSync("pnpm", ["exec", "vnu", "--no-stream", "--errors-only", html], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).toString();

    expect(checked).toBe("");
  }, 120_000);

  it("takes its colors from the theme: the stylesheet is the library layer under the theme's, and the application has no color of its own", () => {
    const css = readdirSyncCss().join("\n");

    expect(css).toContain("@layer vlx-library");
    expect(css).toMatch(/--vlx-color-accent:\s*#4a2fc0/i);
    expect(readFileSync(join(playground, "src", "layout.mprx"), "utf8")).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

import { readdirSync } from "node:fs";
function readdirSyncCss(): string[] {
  const assets = join(dist, "assets");

  return readdirSync(assets).filter((name) => name.endsWith(".css")).map((name) => readFileSync(join(assets, name), "utf8"));
}
