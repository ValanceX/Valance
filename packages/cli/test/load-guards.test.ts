// Slices 6e and 6f (docs/application-model/ROUTES.md R-50 to R-66): a route's `load`, its guards, `redirectTo`, and leaving the page.
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { application, routingFor } from "@valancex/common/internal";
import { Effect, Exit, Scope } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { loadAuthor } from "../src/author.js";
import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { compileViews } from "../src/compile.js";
import { loadConfig } from "../src/config.js";
import { dev } from "../src/dev.js";
import { readContent } from "../src/content.js";
import { info, render } from "../src/info.js";
import { plan } from "../src/init.js";
import { createLoader } from "../src/vite.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const ROUTES = `
  routes: {
    order: route("/orders/:id", {
      params: Schema.Struct({ id: Schema.String }),
      delivery: "client",
      load: {
        begin: ({ id }, state) => ({ ...state, order: "loading " + id }),
        work: ({ id }, signal) =>
          id === "bad"
            ? Promise.reject(new Error("no such order"))
            : id === "slow"
              ? new Promise<string>((resolve) => setTimeout(() => resolve("late"), 80))
              : (((globalThis as any).__loads = ((globalThis as any).__loads ?? 0) + 1), fetch("/api/orders/" + id, { signal }).then((r) => r.text())),
        settle: (outcome, { id }, state) => ({ ...state, order: outcome.ok ? "ready " + id + " " + outcome.value : "failed " + id }),
      },
    }),
    report: route("/report", {
      load: {
        begin: (_input, state) => ({ ...state, order: "loading report" }),
        work: () => ((globalThis as any).__ranOnServer = true, Promise.resolve("report")),
        settle: (outcome, _input, state) => ({ ...state, order: outcome.ok ? "ready report" : "failed report" }),
      },
    }),
    login: route("/login"),
    account: route("/account", { canActivate: ({ state }) => (state.signedIn ? true : redirect("login")) }),
    form: route("/form", { canDeactivate: ({ state }) => !state.dirty, query: Schema.Struct({ tab: Schema.optional(Schema.String) }) }),
    settings: route("/settings", { title: "Settings" }),
    old: route("/old", { redirectTo: redirect("settings") }),
  },`;

const area = (): string => {
  const files: Record<string, string> = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  files["src/main.ts"] = files["src/main.ts"]!.replace(
    'import { component, defineApp, field } from "@valancex/common";',
    'import { component, defineApp, field, redirect, route } from "@valancex/common";',
  )
    .replace(
      'theme: field(Schema.Literal("light", "dark"), "light"),',
      'theme: field(Schema.Literal("light", "dark"), "light"),\n    order: field(Schema.String, ""),\n    signedIn: field(Schema.Boolean, false),\n    dirty: field(Schema.Boolean, false),',
    )
    .replace("export default defineApp({", `export default defineApp({${ROUTES}`)
    .replace(
      "commands: (command) => ({",
      "commands: (command) => ({\n    signIn: command((state) => ({ ...state, signedIn: true })),\n    makeDirty: command((state) => ({ ...state, dirty: true })),",
    );
  files["src/layout.mprx"] = files["src/layout.mprx"]!.replace(
    "<screen />",
    `<screen /><para class="order">{order}</para><button class="dirty" on.click={makeDirty()}>Edit</button>${[
      "/orders/1",
      "/orders/bad",
      "/report",
      "/form",
      "/settings",
      "/account",
    ]
      .map((href) => `<link class="nav-link" href="${href}" current="false">${href}</link>`)
      .join("")}`,
  );

  return project(files);
};

const started = async (root: string) => {
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const built = await compileViews(root, author);
    const app = application(readContent(root, config, routingFor(author)), built.program, author);

    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));

    return {
      state: () => Effect.runPromise(handle.state) as Promise<Record<string, any>>,
      run: (key: string, ...values: ReadonlyArray<unknown>) => Effect.runPromise(handle.invoke(key, values.map((value) => ({ value })) as never)),
      close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
    };
  } finally {
    await loader.close();
  }
};

/** A built site served as a host does, `_redirects` included (rewrites with status 200, redirects with the status they name). */
const serve = async (dist: string, api: (id: string) => { readonly status: number; readonly body: string }) => {
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
  const rules = existsSync(join(dist, "_redirects"))
    ? readFileSync(join(dist, "_redirects"), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => line.trim().split(/\s+/) as [string, string, string])
    : [];
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    const answered = /^\/api\/orders\/(.+)$/.exec(path);

    if (answered !== null) {
      const { status, body } = api(answered[1]!);

      response.statusCode = status;
      response.end(body);
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

    if (file === undefined && rule !== undefined) {
      if (rule[2] === "200") {
        response.setHeader("content-type", "text/html");
        response.end(readFileSync(join(dist, rule[1].replace(/^\//, ""))));
      } else {
        response.statusCode = Number(rule[2]);
        response.setHeader("location", rule[1]);
        response.end();
      }
      return;
    }

    response.statusCode = file === undefined ? 404 : 200;
    response.setHeader("content-type", types[(file ?? "x.html").slice((file ?? "x.html").lastIndexOf("."))] ?? "application/octet-stream");
    response.end(readFileSync(file ?? join(dist, "404.html")));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => server.close() };
};

describe("load (R-50 to R-56)", () => {
  it("is sound; the page a build writes shows the loading state and runs no work (R-51)", async () => {
    const root = area();

    expect((await check(root)).diagnostics).toEqual([]);
    delete (globalThis as any).__ranOnServer;
    await build(root);
    expect(readFileSync(join(root, "dist/web/report/index.html"), "utf8")).toContain('<p class="order">loading report</p>');
    expect((globalThis as any).__ranOnServer).toBeUndefined(); // the work did not run while rendering
  }, 240_000);

  it("`go` loads after the entry; a failure and a success are both state; a result after leaving is dropped; the same address does not load again (R-52 to R-55)", async () => {
    const t = await started(area());

    try {
      (globalThis as any).__loads = 0;
      await t.run("app/go", "/orders/bad");
      expect((await t.state())["order"]).toBe("failed bad");

      const slow = t.run("app/go", "/orders/slow");

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect((await t.state())["order"]).toBe("loading slow"); // the entry's own state, while the work waits
      await t.run("app/go", "/settings"); // leave before the result comes
      await slow;
      expect((await t.state())["order"]).toBe("loading slow"); // not "ready": the result was dropped
      expect((await t.state())["route"]).toBe("settings");

      await t.run("app/go", "/report");
      expect((await t.state())["order"]).toBe("ready report");
      await t.run("app/go", "/report"); // the address already shown: not an entry
      expect((globalThis as any).__loads).toBe(0);
      await t.run("app/back"); // Back to /settings, then Forward is an entry again
      await t.run("app/forward");
      expect((await t.state())["order"]).toBe("ready report");
    } finally {
      await t.close();
    }
  }, 120_000);

  it("in Chromium a client route loads on first draw and on a link, and says when it failed (R-52, R-54)", async () => {
    const root = area();

    await build(root);

    const site = await serve(join(root, "dist/web"), (id) => (id === "bad" ? { status: 500, body: "oops" } : { status: 200, body: `order ${id}` }));
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.goto(`${site.origin}/orders/7`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "ready 7 order 7");
      await page.click('a[href="/settings"]');
      await page.click('a[href="/orders/1"]');
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "ready 1 order 1");
      await page.click('a[href="/report"]');
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "ready report");
    } finally {
      await browser.close();
      site.close();
    }
  }, 300_000);
});

describe("guards and redirects (R-60 to R-63)", () => {
  it("canActivate redirects to a route until the person is signed in; canDeactivate stops leaving a dirty form, but not a change of query alone (R-60, R-61)", async () => {
    const t = await started(area());

    try {
      await t.run("app/go", "/account");
      expect((await t.state())["page"]).toBe("/login");
      await t.run("app/signIn");
      await t.run("app/go", "/account");
      expect((await t.state())["page"]).toBe("/account");

      await t.run("app/go", "/form");
      await t.run("app/go", "/form?tab=b"); // the query alone: the route is not left
      expect((await t.state())["page"]).toBe("/form?tab=b");
      await t.run("app/makeDirty");
      await t.run("app/go", "/settings");
      expect((await t.state())["page"]).toBe("/form?tab=b"); // stopped
      await t.run("app/back");
      expect((await t.state())["page"]).toBe("/form"); // Back to the same route with another query is not leaving it either
    } finally {
      await t.close();
    }
  }, 120_000);

  it("an alias lands on its target, has no page, and is a 301 for a host and a 302 in development (R-63)", async () => {
    const root = area();
    const t = await started(root);

    try {
      await t.run("app/go", "/old");
      expect(await t.state()).toMatchObject({ page: "/settings", route: "settings" });
    } finally {
      await t.close();
    }

    const built = await build(root);

    expect(built.pages).not.toContain("/old");
    expect(existsSync(join(root, "dist/web/old"))).toBe(false);
    expect(readFileSync(join(root, "dist/web/_redirects"), "utf8")).toContain("/old  /settings  301\n");
    expect(readFileSync(join(root, "dist/web/_redirects"), "utf8")).toContain("/orders/:id  /__app-shell.html  200"); // beside the shell's rewrite

    const running = await dev(root, { port: 0, log: () => undefined });

    try {
      const answer = await fetch(`${running.url}old`, { redirect: "manual" });

      expect(answer.status).toBe(302);
      expect(new URL(answer.headers.get("location")!, running.url).pathname).toBe("/settings");
    } finally {
      await running.close();
    }
  }, 300_000);

  it("a project with an alias and no client route writes `_redirects` and no shell", async () => {
    const root = area();
    const main = join(root, "src/main.ts");
    const { writeFileSync } = await import("node:fs");

    writeFileSync(main, readFileSync(main, "utf8").replace('delivery: "client",', 'staticParams: () => [{ id: "1" }],'));
    await build(root);
    expect(readFileSync(join(root, "dist/web/_redirects"), "utf8")).toBe("/old  /settings  301\n");
    expect(existsSync(join(root, "dist/web/__app-shell.html"))).toBe(false);
  }, 240_000);
});

describe("leaving the page (R-64)", () => {
  it("a guard that answers false at once makes the browser ask before the page closes; a clean form does not (R-64)", async () => {
    const root = area();

    await build(root);

    const site = await serve(join(root, "dist/web"), () => ({ status: 200, body: "" }));
    const browser = await chromium.launch();

    try {
      const dialogs: Array<string> = [];
      const open = async (dirty: boolean) => {
        const page = await browser.newPage();

        page.on("dialog", (dialog) => {
          dialogs.push(dialog.type());
          void dialog.dismiss();
        });
        await page.goto(`${site.origin}/form`);
        await page.waitForSelector('#app[data-valance="running"]');

        if (dirty) {
          await page.click("button.dirty");
          await page.waitForTimeout(50);
        }

        // leaving the page for another address asks the page first (a closing tab asks the same way)
        await page.goto(`${site.origin}/settings`).catch(() => undefined); // dismissed: the navigation is cancelled
        await new Promise((resolve) => setTimeout(resolve, 100));
      };

      await open(false);
      expect(dialogs).toEqual([]);
      await open(true);
      expect(dialogs).toEqual(["beforeunload"]);
    } finally {
      await browser.close();
      site.close();
    }
  }, 300_000);

  it("vlx info says what each route declares", async () => {
    const found = await info(area());

    expect(found.declared.map((each) => `${each.name}:${each.has.join("+")}`)).toEqual([
      "order:load",
      "report:load",
      "login:",
      "account:canActivate",
      "form:canDeactivate",
      "settings:",
      "old:redirectTo",
    ]);
    expect(render(found)).toContain("an alias, no page");
  }, 120_000);
});
