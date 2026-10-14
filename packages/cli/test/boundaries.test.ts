// What this package may depend on, made executable (docs/CONSTRAINTS.md, C45): it composes VALANCE and the MESH compiler and bundles with Vite; it reimplements none of NEXUS, MESH or PORT,
// and the core knows nothing of it.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const core = fileURLToPath(new URL("../../valance/", import.meta.url));
const read = (path: string): string => readFileSync(path, "utf8");
// Comments are not imports (the author API documents itself with examples).
const importsOf = (text: string): ReadonlyArray<string> =>
  Array.from(
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .matchAll(/(?:from|import\()\s*"([^"]+)"/g),
    (match) => match[1]!,
  );
const files = readdirSync(src).filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"));

/** Every file reachable from `entry` through relative imports. */
const closure = (entry: string, seen = new Set<string>()): ReadonlySet<string> => {
  if (seen.has(entry)) {
    return seen;
  }

  seen.add(entry);

  for (const name of importsOf(read(join(src, entry))).filter((each) => each.startsWith("."))) {
    closure(join(dirname(entry), name.replace(/\.js$/, ".ts")), seen);
  }

  return seen;
};

describe("what the application package depends on", () => {
  it("imports VALANCE, the MESH compiler and runtime, effect and Vite, and never NEXUS or PORT directly", () => {
    const names = new Set(
      files
        .flatMap((file) => importsOf(read(join(src, file))).filter((name) => !name.startsWith(".")))
        .map((name) => (name.startsWith("node:") ? "node" : name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0]!)),
    );

    expect([...names].sort()).toEqual(["@valancex/common", "@valancex/mesh-compiler", "@valancex/mesh-runtime", "@valancex/valance", "effect", "node", "vite"]);
  });

  it("keeps Node and Vite out of everything the browser loads", () => {
    for (const entry of ["client.ts"]) {
      for (const file of closure(entry)) {
        const names = importsOf(read(join(src, file)));

        expect(
          names.filter((name) => name.startsWith("node:") || name === "vite" || name === "@valancex/mesh-compiler"),
          `${file} (reached from ${entry})`,
        ).toEqual([]);
      }
    }
  });

  it("draws with Ink only from src/ui, which nothing but the command loads, and only when it is going to draw", () => {
    const ui = join(src, "ui");
    const uiFiles = readdirSync(ui).filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"));
    const outside = files.filter((file) => importsOf(read(join(src, file))).some((name) => name === "ink" || name === "react" || name.startsWith("react/")));

    expect(outside).toEqual([]);
    expect(uiFiles.length).toBeGreaterThan(3);

    for (const file of uiFiles) {
      const names = importsOf(read(join(ui, file))).filter((name) => !name.startsWith("."));

      expect(
        names.filter((name) => !["ink", "react", "node:path"].includes(name)),
        file,
      ).toEqual([]);
    }

    // The command reaches the interface through a dynamic import, so a plain run never loads Ink; the browser entry and the other commands never reach it at all.
    const cli = read(join(src, "cli.ts"));

    expect(cli).not.toMatch(/^import .* from "\.\/ui\//m);
    expect(cli).toContain('import("./ui/run.js")');

    for (const entry of ["client.ts"]) {
      expect([...closure(entry)].filter((file) => file.startsWith("ui"))).toEqual([]);
    }
  });

  it("is not known to the core: VALANCE's package and sources never mention it", () => {
    expect(read(join(core, "package.json"))).not.toContain("@valancex/cli");

    for (const file of readdirSync(join(core, "src"))) {
      expect(read(join(core, "src", file)), file).not.toContain("@valancex/cli");
    }
  });

  it("owns the command the core is forbidden to have (a CLI), and is published (the core never mentions it)", () => {
    const manifest = JSON.parse(read(join(src, "..", "package.json"))) as { private?: boolean; bin?: Record<string, string> };

    expect(manifest.bin).toEqual({ vlx: "./bin/vlx.js" });
    expect(manifest.private).toBeUndefined();
  });
});
