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
