// What this package may depend on, made executable (docs/CONSTRAINTS.md, C45): it composes VALANCE and the MESH compiler and bundles with Vite; it reimplements none of NEXUS, MESH or PORT,
// and the core knows nothing of it.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

describe("what the application package depends on", () => {
  it("imports VALANCE, the application packages, the MESH compiler, effect and Vite, and never NEXUS, PORT or the MESH runtime directly", () => {
    const names = new Set(
      files
        .flatMap((file) => importsOf(read(join(src, file))).filter((name) => !name.startsWith(".")))
        .map((name) => (name.startsWith("node:") ? "node" : name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0]!)),
    );

    expect([...names].sort()).toEqual(["@valancex/common", "@valancex/mesh-compiler", "@valancex/style", "@valancex/valance", "effect", "node", "vite"]);
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

    // The command reaches the interface through a dynamic import, so a plain run never loads Ink; nothing else reaches it.
    const cli = read(join(src, "cli.ts"));

    expect(cli).not.toMatch(/^import .* from "\.\/ui\//m);
    expect(cli).toContain('import("./ui/run.js")');
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

describe("libraries (Bet 12; K4, K11): the mechanism is the build's, and the core knows nothing of it", () => {
  const nodeOnly = (file: string): ReadonlyArray<string> => importsOf(read(join(src, file))).filter((name) => !name.startsWith("."));

  it("reading a project's libraries imports only Node: no Vite, no compiler, no PORT, no framework package", () => {
    expect(nodeOnly("libraries.ts").every((name) => name.startsWith("node:"))).toBe(true);
  });

  it("only the bundler's configuration, the two bundles and the template stage name the `valance` condition or the libraries' settings", () => {
    const knows = files.filter((file) => /\bCONDITION\b|librariesOf|libraryOf|idOf\b/.test(read(join(src, file))) && file !== "libraries.ts").sort();

    expect(knows).toEqual(["build.ts", "check.ts", "compile.ts", "emit.ts", "library.ts", "package.ts", "theme.ts", "vite.ts"]);
  });

  it("the core, the application package and the router do not know a library or its condition", () => {
    for (const dir of ["../../valance/src/", "../../common/src/", "../../router/src/"]) {
      for (const file of readdirSync(fileURLToPath(new URL(dir, import.meta.url))).filter((name) => name.endsWith(".ts"))) {
        expect(read(fileURLToPath(new URL(`${dir}${file}`, import.meta.url))), `${dir}${file}`).not.toMatch(/export condition|librariesOf|"valance":/);
      }
    }
  });
});
