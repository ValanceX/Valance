// Libraries (Bet 12; K3 to K14). The four failures of the scratch project that started the bet, each with a test that passes only with the feature: a library shipped as compiled JavaScript, a library
// whose targets exclude the application's, a library's styles, and a symlinked install. Then the qualified ids of its components.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { themeReport } from "../src/theme.js";
import { cleanup, project } from "./fixture.js";
import { APP_FILES, APP_MAIN, APP_PACKAGE, install, libraryFiles } from "./library-support.js";
import { diagnosticsOf } from "./typecheck.js";

afterEach(cleanup);

const found = async (root: string): Promise<string[]> => (await check(root)).diagnostics.map((each) => `${each.file}:${each.line} ${each.code}`);

const withLibrary = (files: Record<string, string> = APP_FILES(), library = libraryFiles()): string => {
  const root = project(files);

  install(root, "acme-ui", library);

  return root;
};

describe("a library shipped as compiled JavaScript (K3, K4, K11)", () => {
  it("is checked and built: its templates and stylesheets are processed by the build, not loaded by Node", { timeout: 120_000 }, async () => {
    const root = withLibrary();

    expect(await found(root)).toEqual([]);

    const built = await build(root);
    const html = readFileSync(join(built.dir, "web", "index.html"), "utf8");

    expect(html).toContain("More");
  });

  it("needs the condition: a package with the field and no `valance` export condition is told so, not processed", async () => {
    const root = withLibrary(APP_FILES(), libraryFiles({ exports: { ".": "./dist/index.js" } }));
    const diagnostics = (await check(root)).diagnostics;

    expect(diagnostics.map((each) => each.code)).toContain("library-unmarked");
    expect(diagnostics.find((each) => each.code === "library-unmarked")!.message).toContain("export condition");
  });
});

const MULTI = (extra: Record<string, string> = {}): Record<string, string> =>
  APP_FILES({
    "valance.web.json": "{}",
    "valance.desktop.json": "{}",
    "src/desktop/layout.mprx": '<column>\n  <disclosure label="More" open={opened} on.toggle={flip()} />\n</column>\n',
    "src/main.ts": APP_MAIN("acme-ui", "\n  targets: { desktop: { layout: component(desktopLayout) } },").replace(
      'import layout from "./layout.mprx";',
      'import layout from "./layout.mprx";\nimport desktopLayout from "./desktop/layout.mprx";',
    ),
    ...extra,
  });

describe("a library for one target used by a project of two (K5)", () => {
  it("is one diagnostic at the use, not several inside node_modules; and the supported target is clean", { timeout: 120_000 }, async () => {
    const root = withLibrary(MULTI(), libraryFiles({ field: { kind: "components", targets: ["web"] } }));
    const result = (await check(root)).diagnostics;

    expect(result.map((each) => `${each.file}:${each.line} ${each.code}`)).toEqual(["src/desktop/layout.mprx:2 unsupported-target"]);
    expect(result[0]!.message).toContain("acme-ui/disclosure");
    expect(result[0]!.message).toContain("supports web only");
    expect(result[0]!.message).toContain("desktop");
    expect(result.some((each) => each.file.includes("node_modules"))).toBe(false);
  });

  it("is fine when the library supports both", { timeout: 120_000 }, async () => {
    expect(await found(withLibrary(MULTI()))).toEqual([]);
  });
});

describe("a library's stylesheets (K6)", () => {
  it("are collected into the library layer, below the theme and the application, and not left to a side-effect import", { timeout: 120_000 }, async () => {
    const root = withLibrary();
    const built = await build(root);
    const assets = readdirSync(join(built.dir, "web", "assets")).filter((each) => each.endsWith(".css"));
    const css = assets.map((each) => readFileSync(join(built.dir, "web", "assets", each), "utf8")).join("\n");

    expect(css).toMatch(/@layer vlx-library\s*\{[^}]*disclosure-marker/);
    expect(css.indexOf("@layer vlx-library,")).toBeGreaterThanOrEqual(0);
    // the order the layers are named in is library, theme, application: a theme or application rule wins without a specificity fight
    expect(css).toMatch(/@layer vlx-library,\s*vlx-theme,\s*vlx-app/);
  });

  it("a stylesheet the field names but the package lacks is said at the package", async () => {
    const root = withLibrary(APP_FILES(), libraryFiles({ field: { kind: "components", styles: ["./dist/missing.css"] } }));

    expect((await check(root)).diagnostics.find((each) => each.code === "library-styles")).toMatchObject({ file: "node_modules/acme-ui/package.json" });
  });
});

describe("the marker is checked where its author can act (K11)", () => {
  it.each([
    [{ kind: "widgets" }, "library-field", "valance.kind"],
    [{ kind: "components", targets: ["terminal"] }, "library-field", "not a target"],
    [{ kind: "components", targets: [] }, "library-field", "non-empty"],
    [{ kind: "components", colour: "red" }, "library-field", "not a field"],
    [{ kind: "theme" }, "library-field", "says where its theme is"],
  ])("a wrong field %j is %s", async (field, code, text) => {
    const diagnostics = (await check(withLibrary(APP_FILES(), libraryFiles({ field })))).diagnostics;
    const mine = diagnostics.find((each) => each.code === code);

    expect(mine, JSON.stringify(diagnostics)).toBeDefined();
    expect(mine!.file).toBe("node_modules/acme-ui/package.json");
    expect(mine!.message).toContain(text);
  });
});

describe("a symlinked install (K7: unsupported, and said so)", () => {
  it("is told that the library cannot find its peers, with the two ways that work", async () => {
    const root = project(APP_FILES());
    const outside = mkdtempSync(join(tmpdir(), "acme-ui-"));

    for (const [path, text] of Object.entries(libraryFiles())) {
      mkdirSync(dirname(join(outside, path)), { recursive: true });
      writeFileSync(join(outside, path), text);
    }

    symlinkSync(outside, join(root, "node_modules", "acme-ui"), "dir");

    const mine = (await check(root)).diagnostics.find((each) => each.code === "library-peers");

    expect(mine, "a library linked from outside the project").toBeDefined();
    expect(mine!.message).toContain("npm pack");
    expect(mine!.message).toContain("vlx init library");
  });
});

describe("qualified ids, collisions and overrides (K14)", () => {
  const OTHER = libraryFiles({ name: "other-ui", files: { "dist/disclosure.mprx": "<column><text>other</text></column>\n" } });
  const BOTH = (extra = ""): Record<string, string> =>
    APP_FILES({
      "package.json": APP_PACKAGE(["acme-ui", "other-ui"]),
      "src/main.ts": APP_MAIN("acme-ui", extra)
        .replace('import { disclosure } from "acme-ui";', 'import { disclosure } from "acme-ui";\nimport { disclosure as other } from "other-ui";')
        .replace("components: [disclosure]", "components: [disclosure, other]"),
    });
  const two = (files: Record<string, string>): string => {
    const root = project(files);

    install(root, "acme-ui", libraryFiles());
    install(root, "other-ui", OTHER);

    return root;
  };

  it("two libraries with a disclosure are a compile error that names both ids and the ways out", { timeout: 120_000 }, async () => {
    const mine = (await check(two(BOTH()))).diagnostics.find((each) => each.code === "template-duplicate");

    expect(mine, "the collision").toBeDefined();
    expect(mine!.message).toContain("acme-ui/disclosure");
    expect(mine!.message).toContain("other-ui/disclosure");
    expect(mine!.message).toContain("resolve");
  });

  it("`resolve` chooses one: the other is left out, and the program is the chosen one's", { timeout: 120_000 }, async () => {
    const root = two(BOTH('\n  resolve: { disclosure: "other-ui/disclosure" },'));

    expect(await found(root)).toEqual([]);

    const built = await build(root);

    expect(readFileSync(join(built.dir, "web", "index.html"), "utf8")).toContain("other");
    expect(readFileSync(join(built.dir, "web", "index.html"), "utf8")).not.toContain("The panel is open");
  });

  it("`resolve` naming a component that is not listed is an error at the definition", async () => {
    const mine = (await check(two(BOTH('\n  resolve: { disclosure: "third-ui/disclosure" },')))).diagnostics.find((each) => each.code === "resolve-unknown");

    expect(mine!.message).toContain("third-ui/disclosure");
    expect(mine!.message).toContain("acme-ui/disclosure");
  });

  it("an `override` of the same name replaces a library's component (the application's template wins) with no collision", { timeout: 120_000 }, async () => {
    const root = project(
      APP_FILES({
        "src/disclosure.mprx": "<column><text>mine</text></column>\n",
        "src/disclosure.ts":
          'import { component } from "@valancex/common";\nimport { Schema } from "effect";\nimport template from "./disclosure.mprx";\nexport default component(template, { props: { label: Schema.String, open: Schema.Boolean }, events: { toggle: Schema.Void } });\n',
        "src/main.ts": APP_MAIN("acme-ui", "\n  override: [mine],").replace(
          'import layout from "./layout.mprx";',
          'import layout from "./layout.mprx";\nimport mine from "./disclosure.js";',
        ),
      }),
    );

    install(root, "acme-ui", libraryFiles());
    expect(await found(root)).toEqual([]);
    expect(readFileSync(join((await build(root)).dir, "web", "index.html"), "utf8")).toContain("mine");
  });

  it("the qualified ids are written as a type that `resolve` takes, even when the collision stops the compile (B3, I2)", { timeout: 120_000 }, async () => {
    const root = two(BOTH());

    await check(root);

    const file = join(root, ".valance/types/library-components.d.ts");
    const declared = readFileSync(file, "utf8");

    expect(declared).toContain('"acme-ui/disclosure": true;');
    expect(declared).toContain('"other-ui/disclosure": true;');

    const source = (id: string): string =>
      `/// <reference path="${file}" />\nimport { defineApp } from "@valancex/common";\nexport default defineApp({ resolve: { disclosure: "${id}" } });\n`;

    expect(diagnosticsOf(source("other-ui/disclosure"))).toEqual([]);
    expect(diagnosticsOf(source("third-ui/disclosure")).join("\n")).toContain('"third-ui/disclosure"');
  });

  it("a malformed `resolve` is refused when the definition is checked", async () => {
    const mine = (await check(two(BOTH('\n  resolve: { disclosure: "disclosure" },')))).diagnostics.find((each) => each.code === "entry-definition");

    expect(mine!.message).toContain("qualified id");
  });
});

describe("a theme package (K12)", () => {
  const themeRoot = fileURLToPath(new URL("../../style/themes/default/", import.meta.url));
  const copy = (from: string, to: string): void => cpSync(from, to, { recursive: true });
  const installTheme = (root: string, change: (tokens: string) => string = (text) => text): void => {
    const dir = join(root, "node_modules", "acme-theme");

    copy(themeRoot, join(dir, "theme"));
    writeFileSync(join(dir, "theme", "tokens", "base.tokens.json"), change(readFileSync(join(dir, "theme", "tokens", "base.tokens.json"), "utf8")));
    writeFileSync(join(dir, "index.js"), "export {};\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "acme-theme",
        version: "1.0.0",
        type: "module",
        exports: { ".": { valance: "./index.js" } },
        valance: { kind: "theme", theme: "./theme/theme.json", targets: ["web", "desktop"] },
      }),
    );
  };
  const files = (extra: Record<string, string> = {}): Record<string, string> => ({
    ...APP_FILES(),
    "package.json": APP_PACKAGE(["acme-ui", "acme-theme"]),
    "valance.json": '{ "name": "Test", "theme": "acme-theme" }',
    ...extra,
  });

  it("is the project's theme: its tokens are in the built stylesheet, and `vlx theme check` reports it", { timeout: 120_000 }, async () => {
    const root = project(files());

    install(root, "acme-ui", libraryFiles());
    // the first space token, 0.25rem in the default theme, is 0.3125rem in this one
    installTheme(root, (text) => text.replace('"value": 0.25,', '"value": 0.3125,'));

    expect(await found(root)).toEqual([]);

    const built = await build(root);
    const css = readdirSync(join(built.dir, "web", "assets"))
      .filter((each) => each.endsWith(".css"))
      .map((each) => readFileSync(join(built.dir, "web", "assets", each), "utf8"))
      .join("\n");

    expect(css).toContain("--vlx-space-1: .3125rem");

    const report = themeReport(root);

    expect(report.custom).toBe(true);
    expect(report.diagnostics).toEqual([]);
  });

  it("is told when the package is not installed or not a theme, and when a theme/ directory is beside it", async () => {
    const missing = project(files());

    install(missing, "acme-ui", libraryFiles());
    expect((await check(missing)).diagnostics.map((each) => each.code)).toContain("theme-package");

    const both = project(files({ "theme/theme.json": readFileSync(join(themeRoot, "theme.json"), "utf8") }));

    install(both, "acme-ui", libraryFiles());
    installTheme(both);
    expect((await check(both)).diagnostics.map((each) => each.code)).toContain("theme-conflict");
  });
});
