// What this package may depend on, made executable (docs/CONSTRAINTS.md, C45): it composes VALANCE and the MESH compiler and bundles with Vite; it reimplements none of NEXUS, MESH or PORT,
// and the core knows nothing of it.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const core = fileURLToPath(new URL("../../valance/", import.meta.url));
const read = (path: string): string => readFileSync(path, "utf8");
const importsOf = (text: string): ReadonlyArray<string> => Array.from(text.matchAll(/(?:from|import\()\s*"([^"]+)"/g), (match) => match[1]!);
const files = readdirSync(src).filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"));

/** Every file reachable from `entry` through relative imports. */
const closure = (entry: string, seen = new Set<string>()): ReadonlySet<string> => {
  if (seen.has(entry)) { return seen; }

  seen.add(entry);

  for (const name of importsOf(read(join(src, entry))).filter((each) => each.startsWith("."))) { closure(join(dirname(entry), name.replace(/\.js$/, ".ts")), seen); }

  return seen;
};

describe("what the application package depends on", () => {
  it("imports VALANCE, the MESH compiler and runtime, effect and Vite, and never NEXUS or PORT directly", () => {
    const names = new Set(files.flatMap((file) => importsOf(read(join(src, file))).filter((name) => !name.startsWith("."))).map((name) => name.startsWith("node:") ? "node" : name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0]!));

    expect([...names].sort()).toEqual(["@valancex/cli", "@valancex/mesh-compiler", "@valancex/mesh-runtime", "@valancex/valance", "effect", "node", "vite"]);
  });

  it("keeps Node and Vite out of everything the browser or an author's main.ts loads", () => {
    for (const entry of ["index.ts", "client.ts"]) {
      for (const file of closure(entry)) {
        const names = importsOf(read(join(src, file)));

        expect(names.filter((name) => name.startsWith("node:") || name === "vite" || name === "@valancex/mesh-compiler"), `${file} (reached from ${entry})`).toEqual([]);
      }
    }
  });

  it("is not known to the core: VALANCE's package and sources never mention it", () => {
    expect(read(join(core, "package.json"))).not.toContain("@valancex/cli");

    for (const file of readdirSync(join(core, "src"))) { expect(read(join(core, "src", file)), file).not.toContain("@valancex/cli"); }
  });

  it("owns the command the core is forbidden to have (a CLI), and publishes none of itself yet", () => {
    const manifest = JSON.parse(read(join(src, "..", "package.json"))) as { private?: boolean; bin?: Record<string, string> };

    expect(manifest.bin).toEqual({ vlx: "./bin/vlx.js" });
    expect(manifest.private).toBe(true);
  });
});
