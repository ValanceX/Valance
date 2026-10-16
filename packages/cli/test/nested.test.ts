// Nested routes and the outlet (docs/application-model/ROUTES.md, slice 6g, statements R-39 to R-45). The area under /account has a shell that draws its child where it writes <mesh-slot />, a child
// that is itself a shell (a third level), and an index for the shell's own address.
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { application } from "@valancex/common/internal";
import { Effect, Exit, Scope } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { loadAuthor } from "../src/author.js";
import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { compileViews } from "../src/compile.js";
import { loadConfig } from "../src/config.js";
import { readContent } from "../src/content.js";
import { plan } from "../src/init.js";
import { createLoader } from "../src/vite.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const component = (name: string, props: string, template: string): Record<string, string> => ({
  [`src/${name}.mprx`]: template,
  [`src/${name}.ts`]: `import { component } from "@valancex/common";\nimport { Schema } from "effect";\nimport template from "./${name}.mprx";\nexport default component(template, { props: { ${props} }, events: {} });\n`,
});

const SHELL = `<div class="shell"><para class="menu">Account of {who}</para><mesh-slot /></div>`;

const area = (shell = SHELL): string => {
  const files: Record<string, string> = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  Object.assign(
    files,
    component("account-shell", "who: Schema.String", shell),
    component("account-home", "", `<para class="home">Account home</para>`),
    component("profile-page", "", `<para class="profile">Profile</para>`),
    component("security-page", "", `<div class="security"><para class="sec-menu">Security</para><mesh-slot /></div>`),
    component("keys-page", "", `<para class="keys">Keys</para>`),
    component("settings-page", "", `<para class="settings">Settings</para>`),
  );
  files["src/main.ts"] = `import { component, defineApp, field, route } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import accountShell from "./account-shell.js";
import accountHome from "./account-home.js";
import profilePage from "./profile-page.js";
import securityPage from "./security-page.js";
import keysPage from "./keys-page.js";
import settingsPage from "./settings-page.js";
import themeToggle from "./theme-toggle.js";

export default defineApp({
  layout: component(layout),
  components: [themeToggle, accountShell, accountHome, profilePage, securityPage, keysPage, settingsPage],
  state: { theme: field(Schema.Literal("light", "dark"), "light"), who: field(Schema.String, "Ada"), area: field(Schema.String, "") },
  routes: {
    account: route("/account", {
      title: "Account",
      screen: accountShell,
      index: accountHome,
      enter: (_, state) => ({ ...state, area: "account" }),
      children: {
        profile: route("/profile", { title: "Profile", screen: profilePage }),
        security: route("/security", { screen: securityPage, children: { keys: route("/keys", { title: "Keys", screen: keysPage }) } }),
      },
    }),
    settings: route("/settings", { title: "Settings", screen: settingsPage }),
  },
  commands: (command) => ({ toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })) }),
});
`;
  files["src/layout.mprx"] = files["src/layout.mprx"]!.replace(
    "<screen />",
    `<screen />${["/account", "/account/profile", "/account/security", "/account/security/keys", "/settings"].map((href) => `<link class="nav-link" href="${href}" current="false">${href}</link>`).join("")}`,
  );

  return project(files);
};

const started = async (root: string) => {
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const built = await compileViews(root, author);
    const app = application(readContent(root, config, (await import("@valancex/common/internal")).routingFor(author)), built.program, author);

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

const serve = async (dist: string) => {
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    const file = [join(dist, path), join(dist, path, "index.html")].find((each) => existsSync(each) && /\.[a-z0-9]+$/.test(each));

    response.statusCode = file === undefined ? 404 : 200;
    response.setHeader("content-type", types[(file ?? "x.html").slice((file ?? "x.html").lastIndexOf("."))] ?? "application/octet-stream");
    response.end(readFileSync(file ?? join(dist, "404.html")));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => server.close() };
};

describe("nested routes: what is built (R-39 to R-43)", () => {
  it("is sound; writes the pages of the leaves, of a parent with an index, and not of a parent without one (R-43)", async () => {
    const root = area();

    expect((await check(root)).diagnostics).toEqual([]);

    const built = await build(root);

    expect(built.pages).toEqual(["/", "/guide/getting-started", "/guide/writing-pages", "/account", "/account/profile", "/account/security/keys", "/settings"]);
  }, 240_000);

  it("draws each level inside its parent's slot: the index at the parent's address, the leaf deeper in (R-40, R-41)", async () => {
    const root = area();

    await build(root);

    const page = (path: string): string => readFileSync(join(root, `dist/web${path}/index.html`), "utf8");

    expect(page("/account")).toContain('<div class="shell"><p class="menu">Account of Ada</p><p class="home">Account home</p></div>');
    expect(page("/account/profile")).toContain('<div class="shell"><p class="menu">Account of Ada</p><p class="profile">Profile</p></div>');
    expect(page("/account/security/keys")).toContain(
      '<div class="shell"><p class="menu">Account of Ada</p><div class="security"><p class="sec-menu">Security</p><p class="keys">Keys</p></div></div>',
    );
    expect(page("/account/security/keys")).toContain("<title>Keys · Test</title>"); // the deepest title
    expect(page("/account")).toContain("<title>Account · Test</title>");
  }, 240_000);

  it("a parent screen with no <mesh-slot /> is outlet-missing, naming the route and the file (R-41)", async () => {
    const found = (await check(area(`<div class="shell"><para class="menu">Account of {who}</para></div>`))).diagnostics.filter((each) => each.code === "outlet-missing");

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "src/account-shell.mprx" });
    expect(found[0]!.message).toContain('the route "account"');
    expect(found[0]!.message).toContain("<mesh-slot />");
  }, 180_000);
});

describe("nested routes: the work a navigation does (R-44, R-45)", () => {
  it("writes a tree with one equality per level, each on its own path, and no disjunction over a subtree (R-44)", async () => {
    const root = area();
    const loader = await createLoader(root, loadConfig(root));

    try {
      const compiled = await compileViews(root, await loadAuthor(loader, root));
      const layout = compiled.templates.find((each) => each.component === "layout")!.source;
      const start = layout.indexOf("{#if at.l0");
      const switched = layout.slice(start, layout.indexOf("<link", start));

      expect(switched).toBe(
        '{#if at.l0 == "account"}<account-shell who={who}>{#if at.l1 == "profile"}<profile-page />{:else if at.l1 == "security"}<security-page>{#if at.l2 == "keys"}<keys-page />{/if}</security-page>{:else}<account-home />{/if}</account-shell>{:else if at.l0 == "settings"}<settings-page />{:else}<blocks items={blocks} />{/if}',
      );
      expect(switched).not.toContain("||");
      expect(switched).not.toContain("route ==");
    } finally {
      await loader.close();
    }
  }, 120_000);

  it("a move between siblings changes `route` and the one level that changed, and no other state (R-44)", async () => {
    const t = await started(area());

    try {
      await t.run("app/go", "/account/profile");

      const before = await t.state();

      await t.run("app/go", "/account/security/keys");

      const mid = await t.state();

      await t.run("app/go", "/account/security");

      const after = await t.state();
      const differs = (a: Record<string, any>, b: Record<string, any>): Array<string> => Object.keys(b).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
      const levels = (a: Record<string, any>, b: Record<string, any>): Array<string> => Object.keys(b.at).filter((key) => a.at[key] !== b.at[key]);

      expect(before).toMatchObject({ route: "account.profile", at: { l0: "account", l1: "profile", l2: "" }, area: "account" });
      expect(mid).toMatchObject({ route: "account.security.keys", at: { l0: "account", l1: "security", l2: "keys" } });
      expect(differs(before, mid).sort()).toEqual(["at", "cursor", "page", "route", "trail"]);
      expect(levels(before, mid)).toEqual(["l1", "l2"]); // l0 did not change: nothing above the move is touched
      expect(levels(mid, after)).toEqual(["l2"]); // only the deepest level
      expect(after.area).toBe("account"); // the parent's `enter` ran again; its value is the same
    } finally {
      await t.close();
    }
  }, 120_000);

  it("in Chromium every ancestor is the same element, and nothing outside the slot is touched, at each of three levels (R-44)", async () => {
    const root = area();

    await build(root);

    const site = await serve(join(root, "dist/web"));
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.goto(`${site.origin}/account/profile`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.evaluate(() => {
        const w = window as unknown as { __kept: Record<string, Element | null>; __records: Array<string> };

        w.__kept = { shell: document.querySelector(".shell"), menu: document.querySelector(".shell > .menu"), app: document.querySelector("#app > *") };
        w.__records = [];

        // Anything that changes in an ancestor other than the replacement of its slot's content: its own attributes or text, and its children other than the slot's.
        const watch = (target: Element | null, options: MutationObserverInit, label: string): void => {
          new MutationObserver((records) => {
            for (const record of records) {
              w.__records.push(`${label}:${record.type}`);
            }
          }).observe(target!, options);
        };

        watch(w.__kept["menu"]!, { subtree: true, childList: true, attributes: true, characterData: true }, "menu");
        watch(w.__kept["shell"]!, { attributes: true }, "shell");
        watch(document.querySelector("#app"), { childList: true }, "app");
      });

      await page.click('a[href="/account/security"]');
      await page.waitForSelector(".security");
      await page.click('a[href="/account/security/keys"]');
      await page.waitForSelector("p.keys");
      await page.evaluate(() => {
        (window as unknown as { __kept: Record<string, Element | null> }).__kept["security"] = document.querySelector(".security");
      });
      await page.click('a[href="/account"]');
      await page.waitForSelector("p.home");

      const result = await page.evaluate(() => {
        const w = window as unknown as { __kept: Record<string, Element | null>; __records: Array<string> };

        return {
          shell: w.__kept["shell"] === document.querySelector(".shell"),
          menu: w.__kept["menu"] === document.querySelector(".shell > .menu"),
          app: w.__kept["app"] === document.querySelector("#app > *"),
          records: w.__records,
          security: document.querySelector(".security"),
        };
      });

      expect(result).toEqual({ shell: true, menu: true, app: true, records: [], security: null });
      expect(new URL(page.url()).pathname).toBe("/account");

      // The middle level too: going from the keys page up to the security page keeps the security element.
      await page.click('a[href="/account/security/keys"]');
      await page.waitForSelector("p.keys");

      const kept = await page.evaluate(() => {
        (window as unknown as { __sec: Element | null }).__sec = document.querySelector(".security");

        return true;
      });

      expect(kept).toBe(true);
      await page.click('a[href="/account/security"]');
      await page.waitForFunction(() => document.querySelector("p.keys") === null);
      expect(await page.evaluate(() => (window as unknown as { __sec: Element | null }).__sec === document.querySelector(".security"))).toBe(true);

      // A move to a route outside the area replaces the area, as it should.
      await page.click('a[href="/settings"]');
      await page.waitForSelector("p.settings");
      expect(await page.locator(".shell").count()).toBe(0);
      expect(await page.title()).toBe("Settings · Test");
    } finally {
      await browser.close();
      site.close();
    }
  }, 300_000);
});

describe("nested routes: what the tools say", () => {
  it("vlx info lists the tree by dotted name and whole address, each child naming its parent", async () => {
    const { info, render } = await import("../src/info.js");
    const found = await info(area());

    expect(found.declared.map((each) => `${each.name} ${each.pattern}${each.parent === undefined ? "" : ` in ${each.parent}`}`)).toEqual([
      "account /account",
      "account.profile /account/profile in account",
      "account.security /account/security in account",
      "account.security.keys /account/security/keys in account.security",
      "settings /settings",
    ]);
    expect(render(found)).toContain('route "account.profile" in "account" shows <profile-page>');
  }, 120_000);

  it("a project whose routes have no children writes the flat switch it always did, with no `at` (R-44)", async () => {
    const root = area();

    const { writeFileSync } = await import("node:fs");

    writeFileSync(
      join(root, "src/main.ts"),
      readFileSync(join(root, "src/main.ts"), "utf8")
        .replace(/ {6}children: \{[\s\S]*?\n {6}\},\n/, "")
        .replace("      index: accountHome,\n", ""),
    );

    const loader = await createLoader(root, loadConfig(root));

    try {
      const compiled = await compileViews(root, await loadAuthor(loader, root));
      const layout = compiled.templates.find((each) => each.component === "layout")!.source;

      expect(layout).toContain('{#if route == "account"}<account-shell who={who} />{:else if route == "settings"}<settings-page />{:else}<blocks items={blocks} />{/if}');
      expect(layout).not.toContain("at.l");
    } finally {
      await loader.close();
    }
  }, 120_000);
});
