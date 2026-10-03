// Stage 49: a REAL back/forward-cache restore of the real page. A top-level tab loads the tracer page from the dev server, moves to another document, and goes Back.
// Nothing is synthesized: `pagehide` and `pageshow` are the browser's. Prerequisite (and the only departure from Playwright's defaults): Playwright launches
// Chromium with `--disable-back-forward-cache`, which makes bfcache impossible to observe; it is removed here (restoring the browser's own default, not forcing
// anything), and the full Chromium build (`channel: "chromium"`) is used because the headless shell has no bfcache. If a restore does not happen, the test says so.
import { chromium } from "playwright";
import { createViteServer } from "vitest/node";
import { expect, it } from "vitest";

import { renderDocument } from "../src/document.js";

const AWAY_MS = 1500;
const stampOf = (text: string): number => Number(/last at (\d+)/.exec(text)?.[1]);

it("a page restored from the back/forward cache is the SAME live document and a live application: its state, target and events survive, and the platform clock it reads is the wall clock, not the frozen one", async () => {
  const server = await createViteServer({
    root: process.cwd(), logLevel: "silent", configFile: false, server: { host: "127.0.0.1", port: 0 },
    plugins: [{
      name: "tracer-pages",
      configureServer(s) {
        s.middlewares.use(async (request, response, next) => {
          if (request.url === "/other") { response.setHeader("content-type", "text/html"); response.end("<!doctype html><title>other</title><p>another document</p>"); return; }
          if (request.url === undefined || !request.url.startsWith("/tracer")) { next(); return; }

          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(await renderDocument(request.url));
        });
      },
    }],
  });

  await server.listen();
  const base = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
  const browser = await chromium.launch({ channel: "chromium", ignoreDefaultArgs: ["--disable-back-forward-cache"] });

  try {
    const context = await browser.newContext();

    // Records the browser's own lifecycle events, per document, in sessionStorage (it survives both a restore and a new document).
    await context.addInitScript(() => {
      const id = Math.random().toString(36).slice(2, 8);
      const log = (line: string) => { const lines = JSON.parse(sessionStorage.getItem("log") ?? "[]") as Array<string>; lines.push(`${id} ${line}`); sessionStorage.setItem("log", JSON.stringify(lines)); };

      (window as unknown as { __doc: string }).__doc = id;
      log(`init ${location.pathname}`);
      addEventListener("pagehide", (event) => { log(`pagehide persisted=${String(event.persisted)}`); });
      addEventListener("pageshow", (event) => { log(`pageshow persisted=${String(event.persisted)}`); });
    });
    const page = await context.newPage();
    const state = () => page.evaluate(() => ({
      doc: (window as unknown as { __doc: string }).__doc,
      marker: (window as unknown as { __marker?: string }).__marker,
      valance: document.querySelector<HTMLElement>("#app")?.dataset["valance"],
      text: document.querySelector("#app")?.textContent ?? "",
      url: location.pathname + location.search,
      log: JSON.parse(sessionStorage.getItem("log") ?? "[]") as Array<string>,
      navigations: performance.getEntriesByType("navigation").map((entry) => (entry as PerformanceNavigationTiming).type),
    }));

    await page.goto(`${base}/tracer/about?tab=details`);
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#app")?.dataset["valance"] === "running");
    await page.evaluate(() => { (window as unknown as { __marker: string }).__marker = "first document"; });
    await page.getByText("Back", { exact: true }).click();                              // about -> counter (pushState)
    await page.getByText("Click", { exact: true }).click();                             // an update the URL does not carry
    await page.waitForFunction(() => /^1 clicks/.test(document.querySelector("#app")?.textContent ?? ""));
    const before = await state();

    await page.goto(`${base}/other`);                                                   // another document: the tracer page is stored, if the browser allows it
    await page.waitForTimeout(AWAY_MS);                                                 // stay away: the only time-sensitive thing the application does is stamp a click with the platform clock
    await page.evaluate(() => { history.back(); });                                     // (`goBack` waits for a `load` that a restore never fires)
    const restored = await page.waitForFunction(() => (JSON.parse(sessionStorage.getItem("log") ?? "[]") as Array<string>).some((line) => line.includes("pageshow persisted=true")), undefined, { timeout: 15_000 }).then(() => true, () => false);

    expect(restored, "Chromium did not restore the page from the back/forward cache, so the hypothesis cannot be exercised here").toBe(true);
    await page.waitForTimeout(500);
    const after = await state();

    expect(after.doc).toBe(before.doc);                                                 // the SAME document, not a new one
    expect(after.marker).toBe("first document");                                        // ... with its window and script state
    expect(after.navigations).toEqual(["navigate"]);                                    // ... and no new navigation entry for it
    expect(after.log.filter((line) => line.startsWith(`${before.doc} `))).toEqual([`${before.doc} init /tracer/about`, `${before.doc} pageshow persisted=false`, `${before.doc} pagehide persisted=true`, `${before.doc} pageshow persisted=true`]);

    // The question: is the restored page ALIVE? Its application, its target and its events.
    expect(after.valance).toBe("running");
    expect(after.text).toBe(before.text);                                               // the target is still drawn, with the in-memory count
    await page.getByText("Click", { exact: true }).click({ timeout: 3000 });
    await page.waitForFunction(() => /^2 clicks/.test(document.querySelector("#app")?.textContent ?? ""));   // events still reach the same application

    // The one time-sensitive behavior: `counter/increment` stamps the click with the platform Clock (the page passes none: Effect's default, `Date.now`).
    // The state restored from the cache still carries the stamp of the click BEFORE the freeze (a record of when it happened: correct, not stale), and the next click
    // is stamped with the wall clock of the restore: the clock the application reads did not freeze with the page.
    const stampBefore = stampOf(before.text);
    const stampAfter = stampOf((await state()).text);

    expect(stampBefore).toBeGreaterThan(0);
    expect(stampAfter - stampBefore).toBeGreaterThanOrEqual(AWAY_MS);
    await page.getByText("About", { exact: true }).click();
    await page.waitForFunction(() => location.pathname + location.search === "/tracer/about?tab=overview");   // and its history binding is alive
  } finally {
    await browser.close();
    await server.close();
  }
});
