// The early-input shell (Bet 14; WP8): a built page is served to a real browser with its script held back, so the server's HTML is painted and nothing listens yet (the dead zone). A person taps and types
// there with the browser's own input protocol (Chrome DevTools `Input.dispatch*`, the events a real device makes: trusted), then the script is let go. The shell kept what was done and the client does it once.
// Each result is shown failing without the feature: the same page with the shell cut out of its head loses every tap.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { chromium } from "playwright";
import type { CDPSession, Page } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { earlyShell, earlyShellLimit } from "@valancex/common/internal";

import { build } from "../src/build.js";
import { contentSecurityPolicy, earlyShellSource } from "../src/security.js";
import { loadConfig } from "../src/config.js";
import { cleanup, PAGE, project } from "./fixture.js";
import { browserAvailable } from "./forms-support.js";

afterEach(cleanup);

const MAIN = `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
export default defineApp({
  state: { n: field(Schema.Number, 0), name: field(Schema.String, ""), paid: field(Schema.Number, 0) },
  commands: (command) => ({
    add: command((state) => ({ ...state, n: state.n + 1 })),
    pay: command((state) => ({ ...state, paid: state.paid + 1 })),
    rename: command(Schema.Struct({ name: Schema.String }), ({ name }, state) => ({ ...state, name })),
  }),
  layout: component(layout),
});
`;
const LAYOUT = `<shell class="x" theme="light">
<button on.click={add()}>Add</button>
<button on.click={pay()} replay="never">Pay</button>
<textfield label="Name" value={name} on.change={rename($event)} />
<text>Count {n}</text>
<text>Paid {paid}</text>
<text>Name is {name}</text>
</shell>
`;
const FILES = { "content/index.md": PAGE("Home", "Text."), "src/main.ts": MAIN, "src/layout.mprx": LAYOUT };
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };

/** Serves `dist` with the site's own Content-Security-Policy as a header, holding the entry script until `release()`. `cut` removes the shell from the head. */
const serve = async (dist: string, csp: string, options: { readonly cut?: boolean } = {}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://x").pathname;
      const path = normalize(join(dist, url.endsWith("/") ? `${url}index.html` : url));

      if (!path.startsWith(dist + sep)) {
        response.writeHead(403).end();
        return;
      }

      try {
        if (/\/assets\/client-[^/]+\.js$/.test(url)) {
          await gate;
        }

        let body: string | Buffer = await readFile(path);

        if (options.cut === true && extname(path) === ".html") {
          body = body.toString("utf8").replace(`<script>${earlyShell}</script>`, "");
        }

        response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "content-security-policy": csp }).end(body);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, release, close: () => server.close() };
};

/** A real press and release at the middle of an element, through the browser's input protocol. */
const tap = async (cdp: CDPSession, page: Page, selector: string): Promise<void> => {
  const box = (await page.locator(selector).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};

const text = async (cdp: CDPSession, value: string): Promise<void> => {
  await cdp.send("Input.insertText", { text: value });
};

/** Builds the page, holds its script, does `work` in the dead zone, lets the script go, and says what the page shows once it is running. */
const session = async (
  work: (cdp: CDPSession, page: Page) => Promise<void>,
  options: { readonly cut?: boolean; readonly then?: (cdp: CDPSession, page: Page) => Promise<void> } = {},
) => {
  const root = project(FILES);

  await build(root);

  const server = await serve(join(root, "dist/web"), contentSecurityPolicy(loadConfig(root)), options);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    const errors: string[] = [];

    page.on("pageerror", (error) => void errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    // A module script is deferred, so `domcontentloaded` waits for the script that is being held: the page is ready to use once its HTML is in.
    await page.goto(`${server.origin}/`, { waitUntil: "commit" });
    await page.waitForSelector("#app button");

    const starting = await page.getAttribute("#app", "data-vlx");

    await work(cdp, page);

    const before = await page.evaluate(() => ({ count: document.body.textContent, running: document.getElementById("app")!.dataset["valance"] ?? null }));

    server.release();
    await page.waitForSelector('#app[data-valance="running"], #app[data-valance="failed"]');

    const after = await page.evaluate(async () => ({
      body: document.body.textContent ?? "",
      state: document.getElementById("app")!.dataset["valance"],
      starting: document.getElementById("app")!.dataset["vlx"] ?? null,
      busy: document.querySelectorAll("[aria-busy]").length,
      shell: (window as unknown as { __vlx?: { done?: { replayed: number; dropped: number } } }).__vlx?.done ?? null,
      hasShell: "__vlx" in window,
      compiled: await ((window as unknown as { __vlx?: { wasm: Promise<unknown> | 0 } }).__vlx?.wasm || Promise.resolve(undefined)).then(
        (module) => module instanceof WebAssembly.Module,
      ),
      field: (document.querySelector("input") as HTMLInputElement).value,
    }));

    await options.then?.(cdp, page);

    return { starting, before, after, errors, page, cdp };
  } finally {
    await browser.close();
    server.close();
  }
};

describe("the shell", () => {
  it("is small, the same bytes on every page, and allowed by hash in the policy (not `unsafe-inline`)", () => {
    expect(Buffer.byteLength(earlyShell)).toBeLessThanOrEqual(earlyShellLimit);
    expect(earlyShellSource()).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);

    const policy = contentSecurityPolicy(loadConfig(project(FILES)));

    expect(policy).toContain(earlyShellSource());
    expect(policy).not.toContain("unsafe-inline");
  });
});

describe.runIf(browserAvailable)("a tap in the dead zone", () => {
  it("is done once, in order, when the application is ready: real mouse and keyboard input through the browser's input protocol", { timeout: 120_000 }, async () => {
    const result = await session(async (cdp, page) => {
      await tap(cdp, page, 'button:text-is("Add")');
      await tap(cdp, page, 'button:text-is("Add")');
      await page.locator("input").focus();
      await text(cdp, "Ada");
      await tap(cdp, page, 'button:text-is("Add")');
    });

    // The page is painted and says it is starting; the taps changed nothing yet, because nothing was listening but the shell.
    expect(result.starting).toBe("starting");
    expect(result.before.count).toContain("Count 0");
    expect(result.after.hasShell).toBe(true);
    // the module was compiled by the shell while the script was held back (the policy allowed the shell by its hash, and `wasm-unsafe-eval` the compile)
    expect(result.after.compiled).toBe(true);
    expect(result.after.state).toBe("running");
    expect(result.errors).toEqual([]);
    // three taps and the text, once each
    expect(result.after.body).toContain("Count 3");
    expect(result.after.body).toContain("Name is Ada");
    expect(result.after.field).toBe("Ada");
    expect(result.after.shell).toEqual({ replayed: 4, dropped: 0 });
    expect(result.after.starting).toBeNull();
  });

  it("is lost without the shell: the same page with it cut out of the head keeps nothing (the control)", { timeout: 120_000 }, async () => {
    const result = await session(
      async (cdp, page) => {
        await tap(cdp, page, 'button:text-is("Add")');
        await tap(cdp, page, 'button:text-is("Add")');
      },
      { cut: true },
    );

    expect(result.after.hasShell).toBe(false);
    expect(result.after.body).toContain("Count 0");
  });

  it("is done once and not again: a tap after the application is running counts one more", { timeout: 120_000 }, async () => {
    let later = "";
    const result = await session(
      async (cdp, page) => {
        await tap(cdp, page, 'button:text-is("Add")');
      },
      {
        then: async (cdp, page) => {
          await tap(cdp, page, 'button:text-is("Add")');
          await page.waitForSelector("text=Count 2");
          await new Promise((resolve) => setTimeout(resolve, 300));
          later = (await page.textContent("body")) ?? "";
        },
      },
    );

    expect(result.after.body).toContain("Count 1");
    expect(later).toContain("Count 2");
    expect(later).not.toContain("Count 3");
  });

  it("is dropped, and the control shows it is busy, when the control is marked replay=never (`Pay` is not to be tapped twice)", { timeout: 120_000 }, async () => {
    let busyBefore = "";
    const result = await session(async (cdp, page) => {
      await tap(cdp, page, 'button:text-is("Pay")');
      busyBefore = (await page.getAttribute('button:text-is("Pay")', "aria-busy")) ?? "";
    });

    expect(busyBefore).toBe("true");
    expect(result.after.body).toContain("Paid 0");
    expect(result.after.busy).toBe(0);
    expect(result.after.shell).toEqual({ replayed: 0, dropped: 0 });
  });
});

describe("the page", () => {
  it("names the WebAssembly runtime in its head and preloads the script, so the module compiles while the script downloads", () => {
    const root = project(FILES);

    return build(root).then((built) => {
      const html = readFileSync(join(built.dir, "web", "index.html"), "utf8");

      expect(html).toMatch(/<link rel="modulepreload" href="\/assets\/client-[^"]+\.js">/);
      expect(html).toMatch(/<link id="vlx-wasm" rel="preload" as="fetch" type="application\/wasm" crossorigin href="\/assets\/mesh-runtime-[^"]+\.wasm">/);
      expect(html).toContain(`<script>${earlyShell}</script>`);
      expect(html).toContain('<div id="app" data-vlx="starting">');
      // the shell comes before anything that can block: before the stylesheet and before the body
      expect(html.indexOf(earlyShell)).toBeLessThan(html.indexOf("<body>"));
    });
  });
});
