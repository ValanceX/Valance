// Investigation of a router outlet (docs/application-model/ROUTES.md, "Nested routes and the outlet"): what MESH already gives. A parent screen puts its child where its `<mesh-slot />` is; the question is whether the
// parent is the same element while the child changes, which is what an outlet is for. Written by hand, with today's features, in the two shapes a generator could produce.
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const component = (name: string, props: string, template: string): Record<string, string> => ({
  [`src/${name}.mprx`]: template,
  [`src/${name}.ts`]: `import { component } from "@valancex/common";\nimport { Schema } from "effect";\nimport template from "./${name}.mprx";\nexport default component(template, { props: { ${props} }, events: {} });\n`,
});

/** The scaffold with an account area: a shell (the parent, with a slot) and two pages (the children), switched in the layout in the given shape. */
const project_ = (shape: "nested" | "flat"): string => {
  const files: Record<string, string> = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  Object.assign(
    files,
    component("account-shell", "who: Schema.String", `<div class="shell"><para class="menu">Account of {who}</para><mesh-slot /></div>`),
    component("profile-page", "", `<para class="profile">Profile</para>`),
    component("security-page", "", `<para class="security">Security</para>`),
  );
  files["src/main.ts"] = `import { component, defineApp, field, route } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import accountShell from "./account-shell.js";
import profilePage from "./profile-page.js";
import securityPage from "./security-page.js";
import themeToggle from "./theme-toggle.js";

export default defineApp({
  layout: component(layout),
  components: [themeToggle, accountShell, profilePage, securityPage],
  state: { theme: field(Schema.Literal("light", "dark"), "light"), who: field(Schema.String, "Ada") },
  routes: { profile: route("/account/profile"), security: route("/account/security") },
  commands: (command) => ({ toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })) }),
});
`;
  const inside =
    shape === "nested"
      ? `{#if route == "profile" || route == "security"}<account-shell who={who}>{#if route == "profile"}<profile-page />{:else}<security-page />{/if}</account-shell>{:else}<blocks items={blocks} />{/if}`
      : `{#if route == "profile"}<account-shell who={who}><profile-page /></account-shell>{:else if route == "security"}<account-shell who={who}><security-page /></account-shell>{:else}<blocks items={blocks} />{/if}`;

  files["src/layout.mprx"] = files["src/layout.mprx"]!.replace(
    "<screen />",
    `${inside}<link class="nav-link" href="/account/profile" current="false">Profile</link><link class="nav-link" href="/account/security" current="false">Security</link>`,
  );

  return project(files);
};

/** Opens the built site, marks the shell element, goes from the profile to the security page by its link, and reports what stayed. */
const navigate = async (root: string): Promise<{ readonly sameShell: boolean; readonly menu: string; readonly child: string; readonly shells: number }> => {
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

    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/account/profile`);
    await page.waitForSelector('#app[data-valance="running"]');
    await page.evaluate(() => {
      (window as unknown as { __shell: Element | null }).__shell = document.querySelector(".shell");
    });
    await page.click('a[href="/account/security"]');
    await page.waitForSelector("p.security");

    return {
      sameShell: await page.evaluate(() => (window as unknown as { __shell: Element | null }).__shell === document.querySelector(".shell")),
      menu: (await page.textContent(".shell > p.menu")) ?? "",
      child: (await page.textContent(".shell > p.security")) ?? "",
      shells: await page.locator(".shell").count(),
    };
  } finally {
    await browser.close();
    server.close();
  }
};

describe("an outlet is a slot (investigation)", () => {
  it("the parent's <mesh-slot /> is where the child draws, and the child sees the caller's names", async () => {
    const root = project_("nested");

    expect((await check(root)).diagnostics).toEqual([]);
    await build(root);

    const html = readFileSync(join(root, "dist/web/account/profile/index.html"), "utf8");

    expect(html).toContain('<div class="shell"><p class="menu">Account of Ada</p><p class="profile">Profile</p></div>');
  }, 240_000);

  it("nested in the generated text, the parent is the same element while the child changes", async () => {
    expect(await navigate(project_("nested"))).toEqual({ sameShell: true, menu: "Account of Ada", child: "Security", shells: 1 });
  }, 240_000);

  it("written as one case per page (the parent repeated), the parent is drawn again", async () => {
    const { sameShell, child, shells } = await navigate(project_("flat"));

    expect({ child, shells }).toEqual({ child: "Security", shells: 1 });
    expect(sameShell).toBe(false); // a different branch is a different subtree, so a parent's own state (focus, an open menu, scroll) would be lost
  }, 240_000);
});
