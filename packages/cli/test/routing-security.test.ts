// The security of the routing surfaces (DP10; ROUTES.md 6b, 6e, 6f): the app shell and a client route under the strict policy the build writes, a `load` that reaches for another origin, addresses
// that try to leave the application, redirect loops, and what `_redirects` is made of.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const app = (): string => {
  const files: Record<string, string> = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  files["src/main.ts"] = files["src/main.ts"]!.replace(
    'import { component, defineApp, field } from "@valancex/common";',
    'import { component, defineApp, field, redirect, route } from "@valancex/common";',
  )
    .replace('theme: field(Schema.Literal("light", "dark"), "light"),', 'theme: field(Schema.Literal("light", "dark"), "light"),\n    note: field(Schema.String, ""),')
    .replace(
      "export default defineApp({",
      `export default defineApp({
  routes: {
    item: route("/items/:id", {
      params: Schema.Struct({ id: Schema.String }),
      delivery: "client",
      load: {
        begin: (_input, state) => ({ ...state, note: "loading" }),
        work: ({ id }) => fetch(id === "far" ? "https://other.example/data" : "/api/" + id).then((r) => r.text()),
        settle: (outcome, _input, state) => ({ ...state, note: outcome.ok ? "ready " + outcome.value : "failed" }),
      },
    }),
    ping: route("/ping", { canActivate: () => redirect("pong") }),
    pong: route("/pong", { canActivate: () => redirect("ping") }),
    old: route("/old", { redirectTo: redirect("settings") }),
    settings: route("/settings", { title: "Settings" }),
  },`,
    );
  files["src/layout.mprx"] = files["src/layout.mprx"]!.replace(
    "<screen />",
    `<screen /><para class="note">{note}</para><button class="evil-0" on.click={go("//evil.example/x")}>a</button><button class="evil-1" on.click={go("javascript:alert(1)")}>b</button><button class="evil-2" on.click={go("/%2e%2e/%2e%2e/etc/passwd")}>c</button>`,
  );

  return project(files);
};

/** A host that applies the `_headers` the build wrote and the rewrites in `_redirects`, and answers /api/*. */
const serve = async (dist: string) => {
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
  const headers = readFileSync(join(dist, "_headers"), "utf8");
  const policy = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1];
  const rules = readFileSync(join(dist, "_redirects"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim().split(/\s+/) as [string, string, string]);
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);

    if (policy !== undefined) {
      response.setHeader("content-security-policy", policy);
    }
    if (path.startsWith("/api/")) {
      response.end(path.slice(5));
      return;
    }

    const file = [join(dist, path), join(dist, path, "index.html")].find((each) => existsSync(each) && /\.[a-z0-9]+$/.test(each));
    const rule = rules.find(([from]) =>
      new RegExp(
        `^${from
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/:[A-Za-z_]+/g, "[^/]+")
          .replace(/\*/g, ".*")}/?$`,
      ).test(path),
    );

    if (file === undefined && rule !== undefined && rule[2] === "200") {
      response.setHeader("content-type", "text/html");
      response.end(readFileSync(join(dist, rule[1].replace(/^\//, ""))));
      return;
    }

    response.statusCode = file === undefined ? 404 : 200;
    response.setHeader("content-type", types[(file ?? "x.html").slice((file ?? "x.html").lastIndexOf("."))] ?? "application/octet-stream");
    response.end(readFileSync(file ?? join(dist, "404.html")));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => server.close() };
};

describe("routing surfaces under the strict policy", () => {
  it("the shell and a client route run under the policy the build writes; a load to another origin is blocked and is a failure, not a leak; nothing runs inline", async () => {
    const root = app();

    await build(root);

    const site = await serve(join(root, "dist/web"));
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();
      const violations: Array<string> = [];

      page.on("console", (message) => {
        if (/Content Security Policy|Refused to/i.test(message.text())) {
          violations.push(message.text());
        }
      });

      await page.goto(`${site.origin}/items/7`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForFunction(() => document.querySelector("p.note")?.textContent === "ready 7");

      // another origin: the policy's connect-src ('self') refuses it, and the load ends as a failure the application can show
      await page.goto(`${site.origin}/items/far`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForFunction(() => document.querySelector("p.note")?.textContent === "failed");
      expect(violations.some((text) => /connect/i.test(text))).toBe(true);
      expect(violations.filter((text) => /script-src|inline/i.test(text))).toEqual([]); // the shell's boot data is JSON, not script
    } finally {
      await browser.close();
      site.close();
    }
  }, 300_000);

  it("an address cannot take the application out of its origin or run script: //host, javascript: and an encoded one are only addresses that are not pages", async () => {
    const root = app();

    await build(root);

    const site = await serve(join(root, "dist/web"));
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();
      let dialogs = 0;

      page.on("dialog", (dialog) => {
        dialogs += 1;
        void dialog.dismiss();
      });
      await page.goto(`${site.origin}/settings`);
      await page.waitForSelector('#app[data-valance="running"]');

      for (const [n] of [
        [0, "/evil.example/x"],
        [1, "/javascript:alert(1)"],
        [2, "/%2e%2e/%2e%2e/etc/passwd"],
      ] as const) {
        await page.click(`button.evil-${n}`);
        await page.waitForTimeout(100);
        expect(new URL(page.url()).origin).toBe(site.origin); // never another origin
        expect(decodeURIComponent(new URL(page.url()).pathname).startsWith("/")).toBe(true);
        expect(await page.textContent("h1")).toBe("Not found"); // an address that is not a page is the not-found page
      }

      expect(new URL(page.url()).origin).toBe(site.origin);
      expect(dialogs).toBe(0);
    } finally {
      await browser.close();
      site.close();
    }
  }, 300_000);

  it("guards that redirect to each other end as a refusal, not a loop (R-61)", async () => {
    const { routingOf } = await import("@valancex/common/internal");
    const { redirect, route } = await import("@valancex/common");
    const { Effect } = await import("effect");
    const routing = routingOf({ ping: route("/ping", { canActivate: () => redirect("pong") }), pong: route("/pong", { canActivate: () => redirect("ping") }), home: route("/") });

    expect(await Effect.runPromise(routing.decide("/", "/ping", {}, "programmatic"))).toBeUndefined();
  }, 60_000);

  it("`_redirects` holds only the author's patterns, the site's own files and fixed targets, one rule to a line", async () => {
    const root = app();

    await build(root);

    const rules = readFileSync(join(root, "dist/web/_redirects"), "utf8")
      .split("\n")
      .filter((line) => line !== "");

    expect(rules).toEqual(["/old  /settings  301", "/items/:id  /__app-shell.html  200"]);
    for (const rule of rules) {
      expect(rule).toMatch(/^\/[\w/:*.-]*  \/[\w/.-]*  (200|301)$/);
    }
  }, 240_000);
});
