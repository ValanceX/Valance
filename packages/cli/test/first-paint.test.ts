// First paint and layout shift, measured (finding WA-6, work package WP-1: "measure both before claiming a fix"). A page is opened in Chromium with its scripts, styles and wasm delayed, so a page that
// paints before its styles, or that moves when the script takes over, shows it. Reported: the cumulative layout shift, and how many distinct positions the first heading had while the page loaded.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { dev } from "../src/dev.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;
const scaffold = () => project(Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json")));
const DELAY = 250;

interface Measured {
  /** Cumulative layout shift of the load (no recent input), as the browser scores it. */
  readonly cls: number;
  /** The distinct vertical positions and heights the first heading had, frame by frame, until the application was running. */
  readonly headings: ReadonlyArray<string>;
  /** Milliseconds from navigation to first contentful paint, and to the application running. */
  readonly fcp: number;
  readonly running: number;
  /** What moved, when there was a shift: for the failure message. */
  readonly why: ReadonlyArray<string>;
}

const measure = async (page: Page, url: string): Promise<Measured> => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __seen: Array<string>; __stop: boolean };

    w.__cls = 0;
    w.__seen = [];
    w.__stop = false;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{
        value: number;
        hadRecentInput: boolean;
        startTime: number;
        sources: Array<{ node: Element | null; previousRect: DOMRect; currentRect: DOMRect }>;
      }>) {
        if (!entry.hadRecentInput) {
          w.__cls += entry.value;
          (w as unknown as { __why: Array<string> }).__why = [
            ...((w as unknown as { __why?: Array<string> }).__why ?? []),
            `${Math.round(entry.startTime)}ms ${entry.value.toFixed(4)} ${entry.sources.map((source) => `${source.node?.nodeName}.${(source.node as HTMLElement | null)?.className ?? ""} ${Math.round(source.previousRect.y)}+${Math.round(source.previousRect.height)} -> ${Math.round(source.currentRect.y)}+${Math.round(source.currentRect.height)}`).join("; ")}`,
          ];
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    const sample = (): void => {
      const heading = document.querySelector("h1");
      if (heading !== null) {
        const box = heading.getBoundingClientRect();
        const mark = `${Math.round(box.y)}+${Math.round(box.height)}`;

        if (w.__seen[w.__seen.length - 1] !== mark) {
          w.__seen.push(mark);
        }
      }
      if (!w.__stop) {
        requestAnimationFrame(sample);
      }
    };

    requestAnimationFrame(sample);
  });

  const started = Date.now();

  await page.goto(url, { waitUntil: "commit" });
  await page.waitForSelector('#app[data-valance="running"]', { timeout: 90_000 });

  const running = Date.now() - started;

  await page.waitForTimeout(500); // late shifts count too

  return page.evaluate(
    ([ran]) => {
      const w = window as unknown as { __cls: number; __seen: Array<string>; __stop: boolean };

      w.__stop = true;

      const paint = performance.getEntriesByName("first-contentful-paint")[0];

      return {
        why: (w as unknown as { __why?: Array<string> }).__why ?? [],
        cls: Math.round(w.__cls * 10000) / 10000,
        headings: w.__seen,
        fcp: Math.round(paint?.startTime ?? -1),
        running: ran!,
      };
    },
    [running] as const,
  );
};

const slow = async (page: Page): Promise<void> => {
  await page.route(/\.(js|css|wasm|ts)(\?.*)?$|\/@|\/node_modules\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, DELAY));
    await route.continue();
  });
};

describe("first paint and layout shift (WA-6, WP-1)", () => {
  it("a built page: styled at first paint, no layout shift when the script takes over", async () => {
    const root = scaffold();

    await build(root);

    const dist = join(root, "dist/web");
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
    const server = createServer((request, response) => {
      const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
      const file = [join(dist, path), join(dist, path, "index.html")].find((each) => existsSync(each) && /\.[a-z0-9]+$/.test(each));

      response.statusCode = file === undefined ? 404 : 200;
      response.setHeader("content-type", types[(file ?? "x.html").slice((file ?? "x.html").lastIndexOf("."))] ?? "application/octet-stream");
      response.end(readFileSync(file ?? join(dist, "404.html")));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await slow(page);

      const result = await measure(page, `http://127.0.0.1:${(server.address() as { port: number }).port}/`);

      console.log("built", JSON.stringify(result));
      expect(result.cls, result.why.join("; ")).toBe(0);
      expect(result.headings.length).toBe(1);
    } finally {
      await browser.close();
      server.close();
    }
  }, 240_000);

  it("the dev server: styled at first paint, no layout shift", async () => {
    const root = scaffold();
    const running = await dev(root, { port: 0, log: () => undefined });
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await slow(page);

      const result = await measure(page, running.url);

      console.log("dev", JSON.stringify(result));
      expect(result.cls, result.why.join("; ")).toBe(0);
      expect(result.headings.length).toBe(1);
    } finally {
      await browser.close();
      await running.close();
    }
  }, 240_000);
});
