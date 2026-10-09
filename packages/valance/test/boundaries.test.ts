// Dependency and composition boundaries (constraints C1, C4, C5), checked against the real installed packages.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = (path: string): URL => new URL(path, import.meta.url);
const json = (path: string): { dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(here(path), "utf8"));
const declared = (path: string): ReadonlyArray<string> => {
  const manifest = json(path);

  return [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})];
};
const source = (file: string): string => readFileSync(here(`../src/${file}`), "utf8");
const importsOf = (text: string): ReadonlyArray<string> => Array.from(text.matchAll(/from "([^"]+)"/g), (match) => match[1]!);

describe("dependency boundary", () => {
  it("MESH, PORT Web and NEXUS don't depend on Valance (nor MESH/PORT on NEXUS)", () => {
    expect(declared("../node_modules/@valancex/mesh-runtime/package.json")).toEqual([]);
    expect(declared("../node_modules/@valancex/port-web/package.json")).toEqual(["@valancex/mesh-runtime"]);
    expect(declared("../node_modules/@valancex/nexus/package.json").filter((name) => name.startsWith("@valancex/")).sort()).toEqual(["@valancex/mesh-runtime"]);
  });

  it("Valance's core (index, internal, errors) names no PORT package and nothing Web; only the ./web entries do", () => {
    for (const file of ["index.ts", "internal.ts", "errors.ts"]) {
      const core = source(file);

      expect(importsOf(core).filter((name) => name.includes("port")), file).toEqual([]);
      expect(core, file).not.toMatch(/\b(DOM|Element|document|window|HTML|Web)\b/);
    }

    for (const file of readdirSync(here("../src/")).filter((name) => name.endsWith(".ts") && name !== "index.ts" && name !== "internal.ts" && name !== "errors.ts")) {
      expect(file.startsWith("web")).toBe(true);
    }
  });

  it("Valance depends on NEXUS, and on PORT Web only optionally", () => {
    const manifest = JSON.parse(readFileSync(here("../package.json"), "utf8")) as { dependencies: Record<string, string>; peerDependenciesMeta: Record<string, { optional: boolean }> };

    expect(Object.keys(manifest.dependencies)).toEqual(["@valancex/nexus"]);
    expect(manifest.peerDependenciesMeta["@valancex/port-web"]).toEqual({ optional: true });
  });
});

describe("composition boundary", () => {
  it("the application author's code wires no MESH host and no PORT", () => {
    const app = readFileSync(here("../../../examples/tracer-web/src/app.ts"), "utf8");

    expect(app).not.toMatch(/Mesh\.host|createWebPort|@valancex\/port-web|@valancex\/mesh-runtime|Application\.start/);
  });
});
