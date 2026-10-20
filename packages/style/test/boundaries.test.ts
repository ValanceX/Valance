// The mechanism behind the style contract stays behind it (north star §2 and checklist item 10): a test fails if a layer reaches across.
//
//   - @valancex/style knows nothing of the ecosystem: no PORT, no MESH, no VALANCE, no DOM; it reads data and writes text
//   - PORT Web (the renderer) knows nothing of themes: it realizes the table it is given, and the hook is a constant attribute in that table
//   - VALANCE's core names no style package; the native host passes the look on as data it does not read
//   - in the CLI one file, theme.ts, is where the style package is used
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string): string => readFileSync(path, "utf8");
const importsOf = (text: string): string[] => Array.from(text.matchAll(/from "([^"]+)"/g), (match) => match[1]!);
const sources = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
    .map((file) => join(dir, file));

describe("the style package", () => {
  const manifest = JSON.parse(read(join(here, "..", "package.json"))) as { dependencies: Record<string, string> };

  it("depends on nothing of the ecosystem", () => {
    expect(Object.keys(manifest.dependencies).sort()).toEqual(["ajv", "ajv-formats"]);
  });

  it("imports only its own files, Node's file and path modules, and the schema validator", () => {
    const imported = new Set(sources(join(here, "..", "src")).flatMap((file) => importsOf(read(file))));

    expect([...imported].filter((name) => !name.startsWith("./")).sort()).toEqual(["ajv", "ajv-formats", "node:fs", "node:path", "node:url"]);
  });

  it("names no DOM object", () => {
    for (const file of sources(join(here, "..", "src"))) {
      expect(
        read(file)
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, ""),
        file,
      ).not.toMatch(/\b(document\.|window\.|globalThis\.document|HTMLElement|getComputedStyle|localStorage)/);
    }
  });
});

describe("the renderers", () => {
  const require = createRequire(import.meta.url);

  it("PORT Web knows no theme: nothing in it names the hook, a layer, a token or a recipe", () => {
    const dist = join(dirname(require.resolve("@valancex/port-web/package.json")), "dist");
    const text = readdirSync(dist)
      .filter((file) => file.endsWith(".js"))
      .map((file) => read(join(dist, file)))
      .join("\n");

    expect(text).not.toMatch(/data-vlx|vlx-theme|@layer|--vlx-|recipe/);
  });

  it("VALANCE's core names no style package", () => {
    const core = join(here, "..", "..", "valance", "src");

    for (const file of sources(core)) {
      expect(
        importsOf(read(file)).filter((name) => name.includes("style")),
        file,
      ).toEqual([]);
    }
  });

  it("the CLI uses the style package in one file", () => {
    const cli = join(here, "..", "..", "cli", "src");
    const users = sources(cli).filter((file) => importsOf(read(file)).includes("@valancex/style"));

    expect(users.map((file) => file.slice(cli.length + 1))).toEqual(["theme.ts"]);
  });
});
