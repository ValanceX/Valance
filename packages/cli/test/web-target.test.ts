// The web target's own settings: the security headers a build writes, the title, the backend address and its dev proxy, and what the configuration refuses.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { dev } from "../src/dev.js";
import { contentSecurityPolicy, headersFile } from "../src/security.js";
import { loadConfig } from "../src/config.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const BASE = { "content/index.md": PAGE("Home"), "content/guide/a.md": PAGE("A") };
const codes = async (files: Record<string, string>): Promise<ReadonlyArray<string>> =>
  (await check(project({ ...BASE, ...files }))).diagnostics.map(({ file, code }) => `${file} ${code}`);

describe("the settings", () => {
  it("accept a title format, the backend, headers and announcements, with the defaults when absent", () => {
    const bare = loadConfig(project(BASE));

    expect(bare).toMatchObject({ title: "{page} · {site}", api: { base: "", proxy: "" }, web: { headers: true, announce: true } });

    const set = loadConfig(
      project({
        ...BASE,
        "valance.json": '{ "name": "Test", "title": "{site}: {page}" }',
        "valance.web.json": '{ "headers": false, "announce": false, "api": { "base": "https://api.example.com" } }',
      }),
    );

    expect(set).toMatchObject({ title: "{site}: {page}", api: { base: "https://api.example.com" }, web: { headers: false, announce: false } });
  });

  it("refuse a title with no page, a stray brace, a backend that is not a path or an https address, and a proxy that goes with no path", async () => {
    expect(await codes({ "valance.json": '{ "name": "T", "title": "{site}" }' })).toEqual(["valance.json config-value"]);
    expect(await codes({ "valance.json": '{ "name": "T", "title": "{page} {nope}" }' })).toEqual(["valance.json config-value"]);
    expect(await codes({ "valance.web.json": '{ "api": { "base": "http://api.example.com" } }' })).toEqual(["valance.web.json config-value"]);
    expect(await codes({ "valance.web.json": '{ "api": { "base": "//evil.example" } }' })).toEqual(["valance.web.json config-value"]);
    expect(await codes({ "valance.web.json": '{ "api": { "base": "https://api.example.com", "proxy": "http://localhost:3000" } }' })).toEqual(["valance.web.json config-value"]);
    expect(await codes({ "valance.web.json": '{ "api": { "base": "/api", "extra": 1 } }' })).toEqual(["valance.web.json config-value"]);
    expect(await codes({ "valance.web.json": '{ "headers": "yes" }' })).toEqual(["valance.web.json config-value"]);
    expect(await codes({ "valance.web.json": '{ "api": { "base": "/api", "proxy": "http://localhost:3000" } }' })).toEqual([]);
  });
});

describe("the security headers", () => {
  it("are a strict policy that lets the WebAssembly runtime start and nothing else loosened", () => {
    const policy = contentSecurityPolicy(loadConfig(project(BASE)));

    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/unsafe-inline|'unsafe-eval'|\*/);
  });

  it("allow the backend's origin when it is another origin, and only that", () => {
    const policy = contentSecurityPolicy(loadConfig(project({ ...BASE, "valance.web.json": '{ "api": { "base": "https://api.example.com/v1" } }' })));

    expect(policy).toContain("connect-src 'self' https://api.example.com;");
    expect(policy).not.toContain("/v1");
  });

  it("are written beside the built site, under its base, and not when turned off", async () => {
    const root = project({ ...BASE, "valance.web.json": '{ "base": "/docs/" }' });

    await build(root);

    const file = readFileSync(join(root, "dist/_headers"), "utf8");

    expect(file).toContain("\n/docs/*\n");
    expect(file).toContain("  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'");
    expect(file).toContain("  X-Content-Type-Options: nosniff");
    expect(headersFile(loadConfig(root))).toBe(file);

    const off = project({ ...BASE, "valance.web.json": '{ "headers": false }' });

    await build(off);
    expect(() => readFileSync(join(off, "dist/_headers"))).toThrow();
  }, 60_000);
});

describe("the title", () => {
  const MAIN = (title: string): string =>
    `import { defineApp, field } from "@valancex/common";\nimport { Schema } from "effect";\nexport default defineApp({ state: { unread: field(Schema.Number, 3) }, title: ${title} });\n`;

  it("is the project's format by default, and the application's parts when it says them, cleaned of direction overrides", async () => {
    const plain = project(BASE);

    await build(plain);
    expect(readFileSync(join(plain, "dist/guide/a/index.html"), "utf8")).toContain("<title>A · Test</title>");

    const formatted = project({ ...BASE, "valance.json": '{ "name": "Test", "title": "{site} / {page}" }' });

    await build(formatted);
    expect(readFileSync(join(formatted, "dist/guide/a/index.html"), "utf8")).toContain("<title>Test / A</title>");

    const own = project({ ...BASE, "src/main.ts": MAIN("(state) => ({ status: String(state.unread) })") });

    await build(own);
    expect(readFileSync(join(own, "dist/guide/a/index.html"), "utf8")).toContain("<title>(3) A · Test</title>");

    const hostile = project({ ...BASE, "src/main.ts": MAIN('() => "Inbox\\u202e gnp.exe\\n  "') });

    await build(hostile);
    expect(readFileSync(join(hostile, "dist/guide/a/index.html"), "utf8")).toContain("<title>Inbox gnp.exe · Test</title>");
  }, 90_000);

  it("falls back to the default when the application's title function throws, and the page is still built", async () => {
    const root = project({ ...BASE, "src/main.ts": MAIN("() => { throw new Error('nope'); }") });

    await build(root);
    expect(readFileSync(join(root, "dist/guide/a/index.html"), "utf8")).toContain("<title>A · Test</title>");
  }, 60_000);
});

describe("vlx dev and the backend", () => {
  it("forwards the api path to the proxy target, so the page sees one origin", async () => {
    const backend = createServer((request, response) => {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ path: request.url, via: request.headers["x-requested-with"] ?? null }));
    }).listen(0, "127.0.0.1");

    await new Promise((resolve) => backend.once("listening", resolve));

    const target = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
    const root = project({ ...BASE, "valance.web.json": `{ "api": { "base": "/api", "proxy": "${target}" } }` });
    const running = await dev(root, { port: 5900 + Math.floor(Math.random() * 90), log: () => undefined });

    try {
      const answer = (await (await fetch(`${new URL(running.url).origin}/api/items?x=1`, { headers: { "x-requested-with": "valance" } })).json()) as { path: string; via: string };

      expect(answer).toEqual({ path: "/api/items?x=1", via: "valance" });
    } finally {
      await running.close();
      backend.close();
    }
  }, 60_000);
});
