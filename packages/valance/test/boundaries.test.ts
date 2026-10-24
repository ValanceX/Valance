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
    expect(
      declared("../node_modules/@valancex/nexus/package.json")
        .filter((name) => name.startsWith("@valancex/"))
        .sort(),
    ).toEqual(["@valancex/mesh-runtime"]);
  });

  it("Valance's core (index, internal, errors) names no PORT package and nothing Web; only the ./web entries do", () => {
    for (const file of ["index.ts", "internal.ts", "errors.ts", "units.ts"]) {
      const core = source(file);

      expect(
        importsOf(core).filter((name) => name.includes("port")),
        file,
      ).toEqual([]);
      expect(core, file).not.toMatch(/\b(DOM|Element|document|window|HTML|Web)\b/);
    }

    for (const file of readdirSync(here("../src/")).filter(
      (name) => name.endsWith(".ts") && name !== "index.ts" && name !== "internal.ts" && name !== "errors.ts" && name !== "units.ts",
    )) {
      expect(file.startsWith("web") || file === "native.ts" || file === "replay.ts" || file === "generate.ts", file).toBe(true);
    }
  });

  it("the native host names no PORT package and nothing Web: it speaks a protocol, and a PORT is whatever is on the other end", () => {
    const native = source("native.ts");

    expect(importsOf(native).filter((name) => name.includes("port") || name.includes("web"))).toEqual([]);
    expect([...new Set(importsOf(native))].sort()).toEqual(["./index.js", "@valancex/mesh-runtime", "effect", "node:readline", "node:stream"]);
  });

  it("the replay feature (the session log, its player and its recorder) names no PORT, nothing of the web and no Node module: only the MESH runtime; and the core knows it only as a type", () => {
    const replay = source("replay.ts");

    expect([...new Set(importsOf(replay))].sort()).toEqual(["@valancex/mesh-runtime"]);
    expect(replay).not.toMatch(/\b(DOM|Element|document|window|HTML|port-web)\b/);

    // the core reaches it through `import type` alone, so nothing of it is in a production bundle that does not record
    const core = source("index.ts");
    const imports = core.split("\n").filter((line) => line.includes('"./replay.js"'));

    expect(imports).toEqual(['import type { SessionRecorder } from "./replay.js";']);
  });

  it("the generated-UI feature names no PORT, nothing of the web and no Node module: only the MESH compiler and the replay hashes; nothing else in the package, in the CLI or in the common package imports it, so no page's start-up set holds it", () => {
    const generate = source("generate.ts");

    expect([...new Set(importsOf(generate))].sort()).toEqual(["./index.js", "./replay.js", "@valancex/mesh-compiler"]);
    expect(generate).not.toMatch(/\b(DOM|Element|document|window|HTML|port-web)\b/);
    // the one import of the application's own module is a type
    expect(generate.split("\n").filter((line) => line.includes('"./index.js"'))).toEqual(['import type { Program } from "./index.js";']);

    const others = readdirSync(here("../src/")).filter((name) => name.endsWith(".ts") && name !== "generate.ts");

    expect(others.filter((name) => source(name).includes("generate.js"))).toEqual([]);

    for (const dir of ["../../cli/src/", "../../common/src/", "../../router/src/", "../../style/src/"]) {
      for (const name of readdirSync(here(dir)).filter((each) => each.endsWith(".ts"))) {
        expect(readFileSync(here(dir + name), "utf8"), dir + name).not.toMatch(/@valancex\/valance\/generate/);
      }
    }
  });

  it("Valance depends on NEXUS, and on PORT Web only optionally", () => {
    const manifest = JSON.parse(readFileSync(here("../package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional: boolean }>;
    };

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
