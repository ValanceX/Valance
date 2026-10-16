// Component stylesheets: a stylesheet beside its template belongs to that component and applies inside it. Checked on what `vlx init` makes, through the check, the build and the dev server.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { dev } from "../src/dev.js";
import { info } from "../src/info.js";
import { plan } from "../src/init.js";
import { checkStyles, componentStyles, scoped } from "../src/styles.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0" } as const;
const scaffolded = (extra: Readonly<Record<string, string>> = {}): string =>
  project({
    ...Object.fromEntries([...plan({ ...answers, targets: ["web"] }).files].filter(([name]) => name !== "package.json" && name !== "valance.json")),
    ...extra,
  });

describe("what is a component's stylesheet", () => {
  it("is one that has its template beside it; every other stylesheet stays global", () => {
    const root = scaffolded({ "src/notes.css": "p { color: red; }" });

    expect(componentStyles(root)).toEqual([{ file: "src/theme-toggle.css", template: "src/theme-toggle.mprx", scope: "theme-toggle" }]); // the scaffold's toggle owns its look; notes.css is global
  });

  it("wraps the rules in @scope and leaves what must come first where it is", () => {
    expect(scoped(".a { color: red; }", "card")).toBe("\n@scope (.card) {\n.a { color: red; }\n}\n");
    expect(scoped('@charset "utf-8";\n@import url("x.css");\n.a {}', "card")).toMatch(/^@charset "utf-8";\n@import url\("x\.css"\);\n@scope \(\.card\) \{\n\n?\.a \{\}\n\}/);
  });
});

describe("vlx check on component stylesheets", () => {
  it("accepts a stylesheet whose template's root carries the component's name as a class", async () => {
    const root = scaffolded({ "src/theme-toggle.css": ":scope { color: red; }" });

    expect(checkStyles(root)).toEqual([]);
    expect((await check(root)).diagnostics).toEqual([]);
  }, 60_000);

  it("names the stylesheet when the template's root has no such class, and when a rule is about the page", async () => {
    const root = scaffolded({
      "src/theme-toggle.mprx": '<button class="other" pressed={theme == "dark" ? "true" : "false"} on.click={toggle()}>{theme == "dark" ? "Light" : "Dark"}</button>',
      "src/theme-toggle.css": "/* x */\nbody { margin: 0; }\n.theme-toggle { color: red; }",
    });
    const found = checkStyles(root);

    expect(found.map((each) => `${each.file}:${each.line} ${each.code}`)).toEqual(["src/theme-toggle.css:1 style-scope", "src/theme-toggle.css:2 style-global"]);
    expect(found[0]!.message).toContain('has no class "theme-toggle"');
    expect((await check(root)).diagnostics.map((each) => each.code)).toEqual(expect.arrayContaining(["style-scope", "style-global"]));
    await expect(build(root)).rejects.toThrow("style-scope");
  }, 120_000);
});

describe("a component stylesheet in the page", () => {
  it("is built inside @scope, and the global stylesheet is not", async () => {
    const root = scaffolded({ "src/theme-toggle.css": ".theme-toggle { outline: 3px solid rgb(9, 8, 7); }" });

    await build(root);

    const dir = join(root, "dist/web/assets");
    const css = readdirSync(dir)
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");

    expect(css).toMatch(/@scope\s*\(\.theme-toggle\)/);
    expect(css).toMatch(/3px solid (#090807|rgb\(9,\s*8,\s*7\))/); // the minifier may write the colour either way
    expect(css).not.toMatch(/@scope\s*\(\.(layout|bar)\)/);
    expect(existsSync(join(root, "dist/web/index.html"))).toBe(true);
  }, 180_000);

  it("is in the dev server's head the same way", async () => {
    const root = scaffolded({ "src/theme-toggle.css": ".theme-toggle { outline: 3px solid rgb(9, 8, 7); }" });
    const running = await dev(root, { port: 6600 + Math.floor(Math.random() * 300), log: () => undefined });

    try {
      const html = await (await fetch(running.url)).text();

      expect(html).toMatch(/<style[^>]*theme-toggle\.css"[^>]*>[\s\S]*@scope \(\.theme-toggle\)[\s\S]*rgb\(9, 8, 7\)/);
      writeFileSync(join(root, "src/theme-toggle.css"), ".theme-toggle { outline: 3px solid rgb(1, 1, 1); }");
      // the watcher tells the server of the edit a moment after it is written
      await expect.poll(async () => (await (await fetch(running.url)).text()).includes("rgb(1, 1, 1)"), { timeout: 5000, interval: 100 }).toBe(true);
    } finally {
      await running.close();
    }
  }, 60_000);

  it("is shown by vlx info as scoped", async () => {
    const found = await info(scaffolded({ "src/theme-toggle.css": ":scope {}" }));

    expect(found.stylesheets).toEqual([{ file: "src/styles.css" }, { file: "src/theme-toggle.css", scope: "theme-toggle" }]);
  }, 60_000);
});
