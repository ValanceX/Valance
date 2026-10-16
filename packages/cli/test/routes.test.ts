// Declared routes (`routes` in `defineApp`), checked against the acceptance list in docs/application-model/ROUTES.md. Each test names the statements (R-n) it is evidence for.
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { application, Navigation, platformOf, Store, webStore } from "@valancex/common/internal";
import type { TextStorage } from "@valancex/common/internal";
import { Effect, Exit, Scope } from "effect";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { readContent } from "../src/content.js";
import { dev } from "../src/dev.js";
import { info, render } from "../src/info.js";
import { plan } from "../src/init.js";
import { createLoader } from "../src/vite.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = {
  name: "Notes",
  dir: "/unused",
  web: { base: "", url: "" },
  packageManager: "npm",
  install: false,
  git: false,
  cli: "^0.0.0",
  targets: ["web"],
} as const;

const ROUTES = `
  routes: {
    order: route("/orders/:id", {
      params: Schema.Struct({ id: Schema.String }),
      query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "open")) }),
      title: ({ id }) => \`Order \${id}\`,
      enter: ({ id, tab }, state) => ({ ...state, orderId: id, tab: tab ?? "all" }),
      staticParams: () => [{ id: "1" }, { id: "2" }],
    }),
    settings: route("/settings", { title: "Settings" }),
  },`;

/** The scaffold with routes declared, a layout that draws the order, and the state `enter` sets. */
const withRoutes = (
  options: {
    readonly routes?: string;
    readonly extra?: Readonly<Record<string, string>>;
    readonly url?: string;
    readonly base?: string;
    readonly persist?: boolean;
    readonly trailingSlash?: "never" | "always";
  } = {},
): string => {
  const files = Object.fromEntries(
    [
      ...plan({
        ...answers,
        web: { base: options.base ?? "", url: options.url ?? "" },
      }).files,
    ].filter(([name]) => name !== "package.json" && name !== "valance.json"),
  );
  const main = files["src/main.ts"]!.replace(
    'import { component, defineApp, field } from "@valancex/common";',
    'import { component, defineApp, field, route } from "@valancex/common";',
  )
    .replace(
      'theme: field(Schema.Literal("light", "dark"), "light"),',
      'theme: field(Schema.Literal("light", "dark"), "light"),\n    orderId: field(Schema.String, ""),\n    tab: field(Schema.Literal("all", "open"), "all"),',
    )
    .replace("export default defineApp({", `export default defineApp({${options.persist === true ? '\n  persist: ["navigation"],' : ""}${options.routes ?? ROUTES}`);
  const layout = files["src/layout.mprx"]!.replace(
    "<screen />",
    '{#if route == "order"}<para class="order">Order {orderId} ({tab}) {title}</para>{:else if route == "settings"}<para class="settings">Settings {title}</para>{:else}<blocks items={blocks} />{/if}\n      <link class="nav-link" href="/orders/1" current="false">Order one</link>\n      <link class="nav-link" href="/settings" current="false">Settings</link>',
  );

  const web = JSON.parse(files["valance.web.json"]!) as Record<string, unknown>;

  return project({
    ...files,
    ...(options.trailingSlash === undefined
      ? {}
      : {
          "valance.web.json": JSON.stringify({
            ...web,
            trailingSlash: options.trailingSlash,
          }),
        }),
    "src/main.ts": main,
    "src/layout.mprx": layout,
    ...options.extra,
  });
};

const started = async (root: string) => {
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const built = await compileViews(root, author);
    const app = application(readContent(root, config), built.program, author);

    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
    const state = () => Effect.runPromise(handle.state) as Promise<Record<string, any>>;
    const run = (key: string, ...values: ReadonlyArray<unknown>) => Effect.runPromise(handle.invoke(key, values.map((value) => ({ value })) as never));

    return {
      state,
      run,
      close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
    };
  } finally {
    await loader.close();
  }
};

/** The page's script as the build wrote it. */
const bundleOf = (root: string): string => {
  const dir = join(root, "dist/web/assets");

  return readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(dir, file), "utf8"))
    .join("\n");
};

const problems = async (root: string): Promise<ReadonlyArray<string>> => (await check(root)).diagnostics.map((each) => `${each.file}:${each.code}`);

describe("entering a route (R-5 to R-9, R-17)", () => {
  it("go sets the canonical address, the route and the state `enter` makes, in one change; Back and Forward restore them", async () => {
    const t = await started(withRoutes());

    expect(await t.state()).toMatchObject({
      page: "/",
      route: "",
      orderId: "",
    });
    await t.run("app/go", "orders/42/?tab=open"); // written loosely: no leading slash, a trailing slash
    expect(await t.state()).toMatchObject({
      page: "/orders/42?tab=open",
      route: "order",
      orderId: "42",
      tab: "open",
      trail: ["/", "/orders/42?tab=open"],
      cursor: 1,
    });

    await t.run("app/go", "/orders/7"); // the query is optional: `enter` ran again, with the default
    expect(await t.state()).toMatchObject({
      page: "/orders/7",
      route: "order",
      orderId: "7",
      tab: "all",
    });

    await t.run("app/go", "/settings");
    expect(await t.state()).toMatchObject({
      page: "/settings",
      route: "settings",
    });
    await t.run("app/go", "/");
    expect(await t.state()).toMatchObject({ page: "/", route: "" });

    await t.run("app/back");
    await t.run("app/back");
    expect(await t.state()).toMatchObject({
      page: "/orders/7",
      route: "order",
      orderId: "7",
      tab: "all",
    });
    await t.run("app/back");
    expect(await t.state()).toMatchObject({
      page: "/orders/42?tab=open",
      route: "order",
      orderId: "42",
      tab: "open",
    });
    await t.run("app/forward");
    expect(await t.state()).toMatchObject({ page: "/orders/7", orderId: "7" });
    await t.close();
  }, 120_000);

  it("an address that is no route, or whose value fails its Schema, is the not-found page with no route (R-8, R-10)", async () => {
    const t = await started(withRoutes());

    await t.run("app/go", "/orders/42?tab=nope"); // `tab` is "all" or "open"
    expect(await t.state()).toMatchObject({
      page: "/orders/42?tab=nope",
      route: "",
    });
    await t.run("app/go", "/nowhere");
    expect(await t.state()).toMatchObject({ page: "/nowhere", route: "" });
    await t.close();
  }, 120_000);

  it("`enter` cannot change which page is shown (R-8)", async () => {
    const t = await started(
      withRoutes({
        routes: `routes: { order: route("/orders/:id", { enter: (_input, state) => ({ ...state, page: "/elsewhere", trail: [], cursor: 9, orderId: "set" }) }) },`,
      }),
    );

    await t.run("app/go", "/orders/5");
    expect(await t.state()).toMatchObject({
      page: "/orders/5",
      route: "order",
      trail: ["/", "/orders/5"],
      cursor: 1,
      orderId: "set",
    });
    await t.close();
  }, 120_000);
});

describe("what the note says beyond the main path (R-3, R-12, R-18)", () => {
  it("without a params Schema the parameters are the strings in the address, and a rest segment is the rest of the path (R-2, R-3)", async () => {
    const t = await started(
      withRoutes({
        routes: `routes: { file: route("/files/*path", { enter: (input, state) => ({ ...state, orderId: JSON.stringify(input) }) }) },`,
      }),
    );

    await t.run("app/go", "/files/a/b.txt");
    expect(await t.state()).toMatchObject({
      route: "file",
      page: "/files/a/b.txt",
      orderId: '{"path":"a/b.txt"}',
    });
    await t.close();
  }, 120_000);

  it("the author's `title` function still wins for the parts it returns, and the route's title stays the page part (R-12)", async () => {
    const main = readFileSync(join(withRoutes(), "src/main.ts"), "utf8").replace(
      "export default defineApp({",
      "export default defineApp({\n  title: (_state, page) => ({ app: `${page.title}!` }),",
    );
    const root = withRoutes({ extra: { "src/main.ts": main } });

    await build(root);
    expect(readFileSync(join(root, "dist/web/orders/1/index.html"), "utf8")).toContain("<title>Order 1 · Order 1!</title>");
  }, 240_000);

  it("the application-wide guard is asked about declared addresses as it is about pages, and can stop a move (R-18)", async () => {
    const root = withRoutes();
    const main = readFileSync(join(root, "src/main.ts"), "utf8").replace("export default defineApp({", 'export default defineApp({\n  guard: ({ to }) => to.name !== "/settings",');
    const t = await started(withRoutes({ extra: { "src/main.ts": main } }));

    await t.run("app/go", "/orders/3");
    expect(await t.state()).toMatchObject({ route: "order" });
    await t.run("app/go", "/settings");
    expect(await t.state()).toMatchObject({
      page: "/orders/3",
      route: "order",
    }); // stopped
    await t.close();
  }, 120_000);
});

const storage = (): TextStorage & { readonly map: Map<string, string> } => {
  const map = new Map<string, string>();

  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

describe("what is easy to miss (R-9, R-5)", () => {
  it("a restored navigation list comes back on its declared route, with the state `enter` makes (R-9)", async () => {
    const root = withRoutes({ persist: true });
    const config = loadConfig(root);
    const loader = await createLoader(root, config);
    const author = await loadAuthor(loader, root).finally(() => undefined);
    const app = application(readContent(root, config), (await compileViews(root, author)).program, author);

    await loader.close();
    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    const area = storage();
    const run = async <A>(use: (handle: Valance.ApplicationHandle<any, any>) => Promise<A>): Promise<A> => {
      const scope = await Effect.runPromise(Scope.make());
      const platform = platformOf([
        [Store, webStore("Test", area)],
        [Navigation, { owner: "engine" as const }],
      ]);

      try {
        return await use(await Effect.runPromise(Valance.start(app, { platform }).pipe(Scope.extend(scope))));
      } finally {
        await Effect.runPromise(Scope.close(scope, Exit.void));
      }
    };
    const settle = async (done: () => Promise<boolean>) => {
      for (let tries = 0; !(await done()) && tries < 200; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };

    await run(async (handle) => {
      await Effect.runPromise(handle.invoke("app/go", [{ value: "/orders/5?tab=open" }] as never));
      await settle(async () => area.map.size > 0 && [...area.map.values()].some((text) => text.includes("orders/5")));
    });

    await run(async (handle) => {
      await settle(async () => ((await Effect.runPromise(handle.state)) as { page: string }).page.startsWith("/orders"));
      expect(await Effect.runPromise(handle.state)).toMatchObject({
        page: "/orders/5?tab=open",
        route: "order",
        orderId: "5",
        tab: "open",
      });
    });
  }, 180_000);

  it("going to the address already shown is not an entry: `enter` does not run again (R-9)", async () => {
    const counted = `routes: { order: route("/orders/:id", { enter: ({ id }, state) => ({ ...state, orderId: \`\${id}#\${state.orderId.split("#").length}\` }) }) },`;
    const t = await started(withRoutes({ routes: counted }));

    await t.run("app/go", "/orders/1");
    await t.run("app/go", "/orders/1");
    await t.run("app/go", "/orders/1/");
    expect(await t.state()).toMatchObject({
      orderId: "1#1",
      trail: ["/", "/orders/1"],
    }); // entered once
    await t.close();
  }, 120_000);

  it("under a base, the address is the base followed by the page: pages are written there and a layout's literal link gets it (R-5)", async () => {
    const root = withRoutes({ base: "/docs/", url: "https://example.com" });
    const built = await build(root);
    const html = readFileSync(join(root, "dist/web/orders/1/index.html"), "utf8");

    expect(built.pages).toContain("/docs/orders/1");
    expect(html).toContain('href="/docs/orders/1"');
    expect(html).toContain('rel="canonical" href="https://example.com/docs/orders/1"');
    expect((await info(root)).declared[0]!.pages).toEqual(["/docs/orders/1", "/docs/orders/2"]);
  }, 240_000);
});

describe("declaring routes (R-1 to R-4, R-19)", () => {
  it("reports a declaration that cannot be read at src/main.ts, in the author's words", async () => {
    const cases: ReadonlyArray<readonly [string, RegExp]> = [
      [`routes: { "": route("/a") },`, /needs a name/],
      [`routes: { a: route("a") },`, /must start with "\//],
      [`routes: { a: route("/a", { nope: 1 } as never) },`, /unknown settings "nope"/],
      [`routes: { a: route("/a"), b: route("/a") },`, /cannot be told apart/],
      [`routes: { a: route("/a/:id", { query: Schema.Struct({ id: Schema.String }) }) },`, /both a path parameter and a query key/],
      [`routes: { a: route("/a", { enter: 1 as never }) },`, /`enter` must be a function/],
      [`routes: { notFound: route("/a") },`, /not-found name/],
    ];

    for (const [routes, message] of cases) {
      const found = (await check(withRoutes({ routes }))).diagnostics.filter((each) => each.code === "entry-definition");

      expect(found, routes).toHaveLength(1);
      expect(found[0]!.message, routes).toMatch(message);
      expect(found[0]!.file).toBe("src/main.ts");
    }
  }, 180_000);

  it("refuses a route whose address is a content page (R-4), and a state field called `route` (R-7)", async () => {
    expect(
      await problems(
        withRoutes({
          routes: `routes: { guide: route("/guide/getting-started") },`,
        }),
      ),
    ).toContain("src/main.ts:route-conflict");
    expect(await problems(withRoutes({ routes: `routes: { home: route("/") },` }))).toContain("src/main.ts:route-conflict");

    const taken = (await check(withRoutes())).diagnostics.length === 0 ? withRoutes() : undefined;

    expect(taken).toBeDefined();

    const main = readFileSync(join(taken!, "src/main.ts"), "utf8").replace("orderId: field(Schema.String", "route: field(Schema.String");
    const clash = (await check(withRoutes({ extra: { "src/main.ts": main } }))).diagnostics.filter((each) => each.code === "entry-definition");

    expect(clash).toHaveLength(1);
    expect(clash[0]!.message).toContain('"route"');
  }, 180_000);

  it("a staticParams entry that does not fit its Schema is a diagnostic from check, build and info, not a crash (R-14, R-19)", async () => {
    const routes = `routes: { order: route("/orders/:id", { params: Schema.Struct({ id: Schema.NumberFromString }), staticParams: () => [{ id: "x" as never }] }) },`;
    const root = withRoutes({ routes });
    const found = (await check(root)).diagnostics.filter((each) => each.code === "entry-definition");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("a `staticParams` entry does not fit its `params` Schema");
    await expect(build(root)).rejects.toThrow("entry-definition");
    expect((await info(root)).problems.map((each) => each.code)).toEqual(["entry-definition"]);
  }, 180_000);

  it("a route with parameters and no staticParams cannot be built, and check and build both say so (R-14)", async () => {
    const routes = `routes: { order: route("/orders/:id", { title: "Order" }) },`;
    const root = withRoutes({ routes });

    expect(await problems(root)).toContain("src/main.ts:route-static-params");
    await expect(build(root)).rejects.toThrow("route-static-params");
  }, 180_000);
});

describe("a built site (R-11 to R-14, R-16)", () => {
  it("writes a page for a route without parameters and one for each staticParams entry, titled and drawn by the layout", async () => {
    const root = withRoutes({ url: "https://example.com" });
    const built = await build(root);

    expect(built.pages).toEqual(["/", "/guide/getting-started", "/guide/writing-pages", "/orders/1", "/orders/2", "/settings"]);

    const order = readFileSync(join(root, "dist/web/orders/1/index.html"), "utf8");

    expect(order).toContain("<title>Order 1 · Test</title>");
    expect(order).toContain("Order 1 (all) Order 1");
    expect(order).toContain('rel="canonical" href="https://example.com/orders/1"');
    expect(order).not.toContain("<h1"); // the navigation is the content's, but `blocks` is empty for a route // `blocks` is empty for a route: the layout drew the order, not a page
    expect(readFileSync(join(root, "dist/web/settings/index.html"), "utf8")).toContain("<title>Settings · Test</title>");
    expect(existsSync(join(root, "dist/web/orders/3/index.html"))).toBe(false); // not in staticParams
    expect(bundleOf(root)).toContain("cannot be told apart");
    const sitemap = readFileSync(join(root, "dist/web/sitemap.xml"), "utf8");

    expect(sitemap).toContain("<loc>https://example.com/orders/1</loc>"); // R-32
    expect(sitemap).toContain("<loc>https://example.com/settings</loc>");
    expect(sitemap).not.toContain("/orders/3");
  }, 240_000);

  it("is the same for a project with no routes: no `route`, the files it always had", async () => {
    const root = project(Object.fromEntries([...plan({ ...answers }).files].filter(([name]) => name !== "package.json" && name !== "valance.json")));
    const built = await build(root);

    expect(built.pages).toEqual(["/", "/guide/getting-started", "/guide/writing-pages"]);
    expect(bundleOf(root)).not.toContain("cannot be told apart"); // the router is in the page only when a route is declared
  }, 240_000);
});

describe("a site whose pages end in a slash (trailingSlash: always)", () => {
  it("writes every page address with one: links, navigation, the canonical link, the sitemap, a layout's literal link and a declared route's pages", async () => {
    const root = withRoutes({
      trailingSlash: "always",
      url: "https://example.com",
    });
    const built = await build(root);
    const order = readFileSync(join(root, "dist/web/orders/1/index.html"), "utf8");
    const home = readFileSync(join(root, "dist/web/index.html"), "utf8");

    expect(built.pages).toEqual(["/", "/guide/getting-started/", "/guide/writing-pages/", "/orders/1/", "/orders/2/", "/settings/"]);
    expect(order).toContain('rel="canonical" href="https://example.com/orders/1/"');
    expect(order).toContain('href="/orders/1/"'); // the layout's literal link
    expect(home).toContain('href="/guide/getting-started/"'); // the navigation
    expect(readFileSync(join(root, "dist/web/sitemap.xml"), "utf8")).toContain("<loc>https://example.com/guide/getting-started/</loc>");
    expect(existsSync(join(root, "dist/web/guide/getting-started/index.html"))).toBe(true); // the files are the same
  }, 240_000);

  it("is the one form under a base too, and vlx info says which it is", async () => {
    const root = withRoutes({ trailingSlash: "always", base: "/docs/" });
    const found = await info(root);

    expect(found.web).toMatchObject({
      base: "/docs/",
      trailingSlash: "always",
    });
    expect(found.declared[0]!.pages).toEqual(["/docs/orders/1/", "/docs/orders/2/"]);
    expect(render(found)).toContain("addressed with a trailing slash");
  }, 120_000);
});

describe("vlx dev and vlx info (R-15, R-20)", () => {
  it("renders an address that staticParams does not list, with its query, and answers an unknown one with 404", async () => {
    const running = await dev(withRoutes(), {
      port: 6900 + Math.floor(Math.random() * 300),
      log: () => undefined,
    });

    try {
      const origin = new URL(running.url).origin;
      const page = await fetch(`${origin}/orders/99?tab=open`);
      const html = await page.text();

      expect(page.status).toBe(200);
      expect(html).toContain("Order 99 (open) Order 99");
      expect((await fetch(`${origin}/orders/99/extra`)).status).toBe(404);
    } finally {
      await running.close();
    }
  }, 120_000);

  it("lists declared routes beside the content, with the pages a build writes", async () => {
    const found = await info(withRoutes());

    expect(found.declared).toEqual([
      {
        name: "order",
        pattern: "/orders/:id",
        parameters: ["id"],
        delivery: "static",
        pages: ["/orders/1", "/orders/2"],
        buildable: true,
        has: [],
      },
      {
        name: "settings",
        pattern: "/settings",
        parameters: [],
        delivery: "static",
        pages: ["/settings"],
        buildable: true,
        has: [],
      },
    ]);
  }, 60_000);
});

/** A built site served the way a static host does: a file, or a directory's index.html, or 404. */
const serve = async (dist: string): Promise<{ readonly origin: string; readonly close: () => void }> => {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
  };
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    const file = [join(dist, path), join(dist, path, "index.html")].find((each) => existsSync(each) && /\.[a-z0-9]+$/.test(each));

    // `_redirects`, as Netlify and Cloudflare Pages read it: a rewrite (status 200) whose `:name` is one segment and whose `*` is the rest.
    const rewrite = existsSync(join(dist, "_redirects"))
      ? readFileSync(join(dist, "_redirects"), "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => line.trim().split(/\s+/) as [string, string, string])
          .find(([from]) =>
            new RegExp(
              `^${from
                .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
                .replace(/:[A-Za-z_]+/g, "[^/]+")
                .replace(/\*/g, ".*")}/?$`,
            ).test(path),
          )
      : undefined;

    if (file === undefined && rewrite !== undefined) {
      response.setHeader("content-type", "text/html");
      response.end(readFileSync(join(dist, rewrite[1])));
      return;
    }

    if (file === undefined) {
      // what a static host does for an address with no file: its 404 page, with a 404 status
      response.statusCode = 404;
      response.setHeader("content-type", "text/html");
      response.end(readFileSync(join(dist, "404.html")));
      return;
    }

    response.setHeader("content-type", types[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream");
    response.end(readFileSync(file));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => server.close(),
  };
};

describe("in a browser (R-5, R-6, R-9, R-22)", () => {
  it("a link to a declared address changes the page in place, Back returns, and a query on first load is kept", async () => {
    const root = withRoutes();

    await build(root);

    const site = await serve(join(root, "dist/web"));
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.goto(`${site.origin}/`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.evaluate(() => {
        (window as unknown as { __kept: boolean }).__kept = true;
      });
      await page.click('a[href="/orders/1"]');
      await page.waitForSelector("p.order");
      expect(await page.textContent("p.order")).toBe("Order 1 (all) Order 1");
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/orders/1");
      expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true); // no reload
      expect(await page.title()).toBe("Order 1 · Test");
      await page.goBack();
      await page.waitForFunction(() => document.querySelector("p.order") === null);

      // A static page cannot see its query; the browser can. Opening /orders/2?tab=open keeps the query and applies `enter` to it.
      await page.goto(`${site.origin}/orders/2?tab=open`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "Order 2 (open) Order 2");
      expect(new URL(page.url()).search).toBe("?tab=open");
    } finally {
      await browser.close();
      site.close();
    }
  }, 240_000);

  it("the page moves the address bar to its canonical form when it starts: the policy's slash, the query in order, the fragment kept, and no new history entry (R-6, D-1)", async () => {
    const never = withRoutes();
    const always = withRoutes({ trailingSlash: "always" });

    await build(never);
    await build(always);

    const sites = [await serve(join(never, "dist/web")), await serve(join(always, "dist/web"))];
    const browser = await chromium.launch();
    const at = async (origin: string, address: string): Promise<string> => {
      const page = await browser.newPage();

      try {
        await page.goto(`${origin}${address}`);
        await page.waitForSelector('#app[data-valance="running"]');

        const { pathname, search, hash } = new URL(page.url());

        expect(await page.evaluate(() => history.length)).toBe(2); // about:blank and this page: the address was replaced, not pushed

        return `${pathname}${search}${hash}`;
      } finally {
        await page.close();
      }
    };

    try {
      expect(await at(sites[0]!.origin, "/orders/2/?tab=open")).toBe("/orders/2?tab=open"); // never (the default)
      expect(await at(sites[0]!.origin, "/guide/getting-started/#top")).toBe("/guide/getting-started#top");
      expect(await at(sites[1]!.origin, "/orders/2?tab=open")).toBe("/orders/2/?tab=open"); // always
      expect(await at(sites[1]!.origin, "/guide/getting-started")).toBe("/guide/getting-started/");
      expect(await at(sites[0]!.origin, "/nowhere/")).toBe("/nowhere/"); // not a page: left as it was written
    } finally {
      await browser.close();
      sites.forEach((site) => site.close());
    }
  }, 300_000);
});

describe("links to declared routes (R-30 to R-32)", () => {
  const links = (body: string): string => `---\ntitle: Links\n---\n\n# Links\n\n${body}\n`;

  it("a Markdown link to a declared address is accepted and written under base and policy, with its query and fragment; one to nothing is link-broken with its line (R-30, R-31)", async () => {
    const root = withRoutes({
      base: "/docs/",
      trailingSlash: "always",
      extra: {
        "content/links.md": links("[order](/orders/42?tab=open#top) and [settings](/settings) and [gone](/nowhere)"),
      },
    });
    const found = (await check(root)).diagnostics.filter((each) => each.code === "link-broken");

    expect(found.map((each) => `${each.file}:${each.line}`)).toEqual(["content/links.md:7"]);

    const ok = withRoutes({
      base: "/docs/",
      trailingSlash: "always",
      extra: {
        "content/links.md": links("[order](/orders/42?tab=open#top) and [settings](/settings)"),
      },
    });

    await build(ok);

    const page = readFileSync(join(ok, "dist/web/links/index.html"), "utf8");

    expect(page).toContain('href="/docs/orders/42/?tab=open#top"');
    expect(page).toContain('href="/docs/settings/"');
  }, 240_000);

  it("a link whose address a route's Schema refuses leads nowhere (R-30)", async () => {
    const routes = `routes: { order: route("/orders/:id", { params: Schema.Struct({ id: Schema.NumberFromString }), staticParams: () => [{ id: 1 }] }) },`;
    const root = withRoutes({
      routes,
      extra: {
        "content/links.md": links("[good](/orders/7) [bad](/orders/x)"),
      },
    });
    const found = (await check(root)).diagnostics.filter((each) => each.code === "link-broken");

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("/orders/x");
  }, 180_000);

  it("a template's literal href is checked against pages, routes and public/, with file, line and column; a built-in layout's links are not (R-30)", async () => {
    const root = withRoutes();
    const layoutFile = join(root, "src/layout.mprx");
    const layout = readFileSync(layoutFile, "utf8").replace('<link class="nav-link" href="/settings" current="false">', '<link class="nav-link" href="/missing" current="false">');

    writeFileSync(layoutFile, layout);

    const found = (await check(root)).diagnostics.filter((each) => each.code === "link-broken");

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "src/layout.mprx" });
    expect(found[0]!.line).toBe(layout.split("\n").findIndex((line) => line.includes("/missing")) + 1);
    expect(found[0]!.column).toBeGreaterThan(1);
    expect((await check(withRoutes())).diagnostics).toEqual([]);
  }, 180_000);
});

describe("client delivery (R-33 to R-38)", () => {
  const CLIENT = `routes: {
    order: route("/orders/:id", {
      params: Schema.Struct({ id: Schema.String }),
      query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "open")) }),
      title: ({ id }) => \`Order \${id}\`,
      enter: ({ id, tab }, state) => ({ ...state, orderId: id, tab: tab ?? "all" }),
      delivery: "client",
    }),
    settings: route("/settings", { title: "Settings" }),
  },`;

  it("refuses what cannot work: staticParams on a client route, and a delivery that is neither (R-36)", async () => {
    const both = withRoutes({ routes: `routes: { order: route("/orders/:id", { delivery: "client", staticParams: () => [{ id: "1" }] }) },` });
    const odd = withRoutes({ routes: `routes: { order: route("/orders/:id", { delivery: "server" as never }) },` });

    expect((await check(both)).diagnostics.map((each) => each.code)).toEqual(["entry-definition"]);
    expect((await check(both)).diagnostics[0]!.message).toContain("has `staticParams`");
    expect((await check(odd)).diagnostics[0]!.message).toContain('`delivery` is "static" or "client"');
  }, 180_000);

  it("a client route needs no staticParams, writes no page, and is listed by vlx info (R-33, R-36)", async () => {
    const root = withRoutes({ routes: CLIENT, url: "https://example.com" });

    expect(await problems(root)).toEqual([]); // no route-static-params
    expect((await info(root)).declared.map((each) => `${each.name}:${each.pages.length}`)).toEqual(["order:0", "settings:1"]);
    expect((await info(root)).declared[0]).toMatchObject({ buildable: true });

    const built = await build(root);

    expect(built.pages).toEqual(["/", "/guide/getting-started", "/guide/writing-pages", "/settings"]);
    expect(existsSync(join(root, "dist/web/orders"))).toBe(false);
    expect(readFileSync(join(root, "dist/web/sitemap.xml"), "utf8")).not.toContain("/orders"); // R-32
  }, 240_000);

  it("writes the shell with an empty #app and `_redirects` naming each client route, under the base (R-33, R-35)", async () => {
    const root = withRoutes({ routes: CLIENT, base: "/docs/" });

    await build(root);

    const shell = readFileSync(join(root, "dist/web/__app-shell.html"), "utf8");

    expect(shell).toContain('<div id="app"></div>');
    expect(shell).toContain('"shell":true');
    expect(shell).not.toContain("Order "); // nothing of any address
    expect(readFileSync(join(root, "dist/web/_redirects"), "utf8")).toBe("/docs/orders/:id  /docs/__app-shell.html  200\n");
  }, 240_000);

  it("a project with no client route writes neither the shell nor `_redirects` (R-35)", async () => {
    const root = withRoutes();

    await build(root);
    expect(existsSync(join(root, "dist/web/__app-shell.html"))).toBe(false);
    expect(existsSync(join(root, "dist/web/_redirects"))).toBe(false);
  }, 240_000);

  it("rendering: client writes no page, the shell and a catch-all, and still checks links (R-37)", async () => {
    const root = withRoutes({ routes: CLIENT, url: "https://example.com" });
    const web = JSON.parse(readFileSync(join(root, "valance.web.json"), "utf8")) as Record<string, unknown>;

    writeFileSync(join(root, "valance.web.json"), JSON.stringify({ ...web, rendering: "client" }));

    const built = await build(root);

    expect(built.pages).toEqual([]);
    expect(built.rendering).toBe("client");
    expect(existsSync(join(root, "dist/web/index.html"))).toBe(false);
    expect(existsSync(join(root, "dist/web/guide"))).toBe(false);
    expect(existsSync(join(root, "dist/web/__app-shell.html"))).toBe(true);
    expect(existsSync(join(root, "dist/web/404.html"))).toBe(true);
    expect(readFileSync(join(root, "dist/web/_redirects"), "utf8")).toBe("/*  /__app-shell.html  200\n");
    expect(existsSync(join(root, "dist/web/sitemap.xml"))).toBe(false);

    writeFileSync(join(root, "content/links.md"), "---\ntitle: Links\n---\n\n# Links\n\n[gone](/nowhere)\n");
    await expect(build(root)).rejects.toThrow("link-broken");
  }, 300_000);

  it("vlx dev answers a client route with the shell and a static one with its page (R-38)", async () => {
    const root = withRoutes({ routes: CLIENT });
    const running = await dev(root, { port: 0, log: () => undefined });

    try {
      const shell = await (await fetch(`${running.url}orders/77?tab=open`)).text();
      const page = await (await fetch(`${running.url}settings`)).text();

      expect(shell).toContain('<div id="app"></div>');
      expect(shell).toContain('"shell":true');
      expect(page).toContain("Settings Settings");
    } finally {
      await running.close();
    }
  }, 180_000);

  it("in Chromium, an address of a client route is answered by the shell and drawn from the address bar: parameter, query, trailing slash, and a link to a static page (R-34)", async () => {
    const root = withRoutes({ routes: CLIENT });

    await build(root);

    const site = await serve(join(root, "dist/web"));
    const browser = await chromium.launch();

    try {
      const raw = await (await fetch(`${site.origin}/orders/77`)).text();

      expect(raw).toContain('<div id="app"></div>'); // what a crawler or a slow connection gets: no page, and no wrong page

      const page = await browser.newPage();

      await page.goto(`${site.origin}/orders/77?tab=open`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "Order 77 (open) Order 77");
      expect(await page.title()).toBe("Order 77 · Test");
      expect(new URL(page.url()).search).toBe("?tab=open");

      await page.goto(`${site.origin}/orders/5/`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForFunction(() => document.querySelector("p.order")?.textContent === "Order 5 (all) Order 5");
      expect(new URL(page.url()).pathname).toBe("/orders/5"); // the policy's form, put there by the page

      await page.click('a[href="/settings"]'); // a link to a static page changes the page in place
      await page.waitForSelector("p.settings");
      expect(new URL(page.url()).pathname).toBe("/settings");
    } finally {
      await browser.close();
      site.close();
    }
  }, 300_000);
});
