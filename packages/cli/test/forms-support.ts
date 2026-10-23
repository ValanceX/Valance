// What the form tests share: the Nu Html Checker, and a built project served to a real browser.
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { chromium, type Page } from "playwright";
import { expect } from "vitest";

import { build } from "../src/build.js";
import { project } from "./fixture.js";

const jar = join(createRequire(import.meta.url).resolve("vnu-jar/package.json"), "..", "build", "dist", "vnu.jar");

/** The Nu Html Checker's errors for a document. */
export const errorsOf = (html: string): ReadonlyArray<string> => {
  const directory = mkdtempSync(join(tmpdir(), "vnu-"));

  try {
    writeFileSync(join(directory, "page.html"), html);

    const run = spawnSync("java", ["-jar", jar, "--format", "json", directory], { encoding: "utf8" });

    if (run.error !== undefined) {
      throw new Error(`the Nu Html Checker needs Java: ${run.error.message}`);
    }

    const report = JSON.parse(run.stderr.slice(run.stderr.indexOf("{"))) as { messages: Array<{ type: string; subType?: string; message: string }> };

    return report.messages.filter((each) => (each.subType ?? each.type) === "error").map((each) => each.message);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
export const browserAvailable = await chromium
  .launch()
  .then(async (browser) => {
    await browser.close();

    return true;
  })
  .catch(() => false);

/** Builds the project, serves `dist/web`, and runs `run` against a page that has loaded and is running. */
export const inBrowser = async (files: Record<string, string>, run: (page: Page, errors: Array<string>) => Promise<void>): Promise<void> => {
  const root = project(files);

  await build(root);

  const dist = normalize(join(root, "dist/web"));
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://x").pathname;
      const path = normalize(join(dist, url.endsWith("/") ? `${url}index.html` : url));

      if (!path.startsWith(dist + sep)) {
        response.writeHead(403).end();
        return;
      }

      try {
        response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(path));
      } catch {
        response.writeHead(404).end();
      }
    })();
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    const errors: Array<string> = [];

    page.on("pageerror", (error) => void errors.push(error.message));
    await page.goto(`${origin}/`);
    await page.waitForSelector('#app[data-valance="running"], #app[data-valance="failed"]');
    expect(await page.getAttribute("#app", "data-valance")).toBe("running");
    await run(page, errors);
  } finally {
    await browser.close();
    server.close();
  }
};

/** Whether the installed Web PORT has layers (0.12): the dialog and popover cases need it, and say so when it is not there. */
export const portLayers = (() => {
  const { version } = JSON.parse(readFileSync(join(createRequire(import.meta.url).resolve("@valancex/port-web/package.json")), "utf8")) as { version: string };
  const [major = 0, minor = 0] = version.split(".").map(Number);

  return major > 0 || minor >= 12;
})();

/** Whether the installed Web PORT moves focus on request (0.11): the end-to-end focus case needs it, and says so when it is not there. */
export const portFocuses = (() => {
  const { version } = JSON.parse(readFileSync(join(createRequire(import.meta.url).resolve("@valancex/port-web/package.json")), "utf8")) as { version: string };
  const [major = 0, minor = 0] = version.split(".").map(Number);

  return major > 0 || minor >= 11;
})();
