// One project, more than one target: what `vlx init --web --desktop` makes is checked, and built into a site and an engine from the same state, commands and content.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { loadConfig } from "../src/config.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0" } as const;
const scaffolded = (): string =>
  project(Object.fromEntries([...plan({ ...answers, targets: ["web", "desktop"] }).files].filter(([name]) => name !== "package.json" && name !== "valance.json")));

describe("vlx init --web --desktop", () => {
  it("makes the content, the state and the commands once, and a layout for each target", () => {
    const names = [...plan({ ...answers, targets: ["web", "desktop"] }).files.keys()].sort();

    expect(names).toContain("valance.web.json");
    expect(names).toContain("valance.desktop.json");
    expect(names).toContain("src/main.ts");
    expect(names).toContain("src/web/layout.mprx");
    expect(names).toContain("src/desktop/layout.mprx");
    expect(names).not.toContain("src/layout.mprx");
    expect(names.filter((name) => name.startsWith("content/"))).toHaveLength(3);
  });
});

describe("a project of two targets", () => {
  it("has both targets, and checks clean", async () => {
    const root = scaffolded();

    expect(loadConfig(root).targets).toEqual(["web", "desktop"]);
    expect((await check(root)).diagnostics).toEqual([]);
  }, 120_000);

  it("reports a mistake in one target's templates, in that target's vocabulary", async () => {
    const root = scaffolded();
    const { writeFileSync } = await import("node:fs");

    writeFileSync(join(root, "src/desktop/layout.mprx"), '<div class="x"><blocks items={blocks} /></div>');

    const found = (await check(root)).diagnostics;

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((each) => each.file.startsWith("src/desktop/"))).toBe(true);
  }, 120_000);

  it("compiles a component written with the portable core only against both vocabularies, and a web button needs neither class nor pressed", async () => {
    const root = scaffolded();
    const { writeFileSync, readFileSync: read, mkdirSync } = await import("node:fs");

    mkdirSync(join(root, "src/shared"), { recursive: true });
    writeFileSync(join(root, "src/shared/note.mprx"), "<row><heading>Note</heading><text>hello</text><button>Ok</button></row>");
    writeFileSync(join(root, "src/shared/note.ts"), 'import { component } from "@valancex/common";\nimport template from "./note.mprx";\n\nexport default component(template);\n');

    const main = read(join(root, "src/main.ts"), "utf8")
      .replace("import desktopLayout", 'import note from "./shared/note.js";\nimport desktopLayout')
      .replace("components: [themeToggle]", "components: [themeToggle, note]")
      .replace("desktop: { layout: component(desktopLayout) }", "desktop: { layout: component(desktopLayout), components: [note] }");

    writeFileSync(join(root, "src/main.ts"), main);
    writeFileSync(join(root, "src/web/layout.mprx"), read(join(root, "src/web/layout.mprx"), "utf8").replace("<blocks", "<note /><blocks"));
    writeFileSync(join(root, "src/desktop/layout.mprx"), read(join(root, "src/desktop/layout.mprx"), "utf8").replace("<blocks", "<note /><blocks"));
    expect((await check(root)).diagnostics).toEqual([]);

    const manifest = JSON.parse(read(join(root, ".valance/manifest.web.json"), "utf8")) as {
      readonly components: Record<string, { readonly props: Record<string, { readonly required: boolean }> }>;
    };

    expect(manifest.components["button"]!.props["class"]!.required).toBe(false);
    expect(manifest.components["heading"]!.props["level"]!.required).toBe(false);
  }, 120_000);

  it("builds the site into dist/web and the engine into dist/desktop, and one target alone when asked", async () => {
    const root = scaffolded();
    const built = await build(root);

    expect(built.files).toContain("web/index.html");
    expect(built.files).toContain("desktop/engine.mjs");
    expect(readFileSync(join(root, "dist/web/index.html"), "utf8")).toContain("Notes");
    expect(existsSync(join(root, "dist/desktop/mesh-runtime.wasm"))).toBe(true);
    expect(existsSync(join(root, ".valance/program.web.json"))).toBe(true);
    expect(existsSync(join(root, ".valance/program.desktop.json"))).toBe(true);

    const only = await build(root, { targets: ["desktop"] });

    expect(only.files.every((file) => file.startsWith("desktop/"))).toBe(true);
  }, 180_000);
});

describe("vlx generate target", () => {
  it("adds the desktop to a web project without moving anything, and both build", async () => {
    const { generateTarget } = await import("../src/add.js");
    const { writeFileSync, readFileSync: read } = await import("node:fs");
    const web = plan({ ...answers, targets: ["web"] }).files;
    const root = project(Object.fromEntries([...web].filter(([name]) => name !== "package.json" && name !== "valance.json")));
    const before = read(join(root, "src/layout.mprx"), "utf8");
    const made = generateTarget(root, "desktop");

    expect(made.created).toEqual(["valance.desktop.json", "src/desktop/layout.mprx"]);
    expect(made.changed).toEqual(["src/main.ts"]);
    expect(read(join(root, "src/layout.mprx"), "utf8")).toBe(before);
    expect(read(join(root, "src/main.ts"), "utf8")).toContain("targets: { desktop: { layout: component(desktopLayout) } }");
    expect(loadConfig(root).targets).toEqual(["web", "desktop"]);
    expect((await check(root)).diagnostics).toEqual([]);
    expect(() => generateTarget(root, "desktop")).toThrow(/already has the desktop target/);
    expect(() => generateTarget(root, "mobile")).toThrow(/is not a target/);
    writeFileSync(join(root, "valance.json"), '{ "name": "Test" }');

    const built = await build(root);

    expect(built.files).toContain("web/index.html");
    expect(built.files).toContain("desktop/engine.mjs");
  }, 180_000);

  it("makes a project with no main.ts one, for a content-only project", async () => {
    const { generateTarget } = await import("../src/add.js");
    const root = project({ "content/index.md": "---\ntitle: Home\n---\n\n# Home\n", "valance.web.json": '{ "version": 1 }' });

    generateTarget(root, "desktop");
    expect((await check(root)).diagnostics).toEqual([]);
  }, 120_000);
});
