// The layers, and what each may depend on. A file that reaches upward or sideways fails here, so the structure in README.md is enforced and not just described.
//
//   sites/<n>/content    data: markdown. No code.
//   sites/<n>/snippets   the examples the content shows: TypeScript, compiled with the project. Depend on the published packages only.
//   src/model            the shape of a site's data (Schemas). Depends on `effect` only.
//   src/app              the Valance application. Depends on model, `effect`, the Valance core and NEXUS (its capabilities are NEXUS's). Names no target, no DOM, no file, no build.
//   src/views            MPRX templates. No code.
//   src/styles           the stylesheet. No code; the entry (src/main.ts) imports it, and the build turns it into one hashed file.
//   src/web              the web target: primitives, platform, browser behaviour, plugins. Depends on app, model, Valance, MESH and PORT. Not on build.
//   src/main.ts          the browser entry. Part of the web target.
//   build/content        build time: a site's directory → data. Depends on model and Node.
//   build                build time: compile the views, render a document, export, serve. Depends on src, Valance, MESH and Node.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

const files = (dir: string): ReadonlyArray<string> => readdirSync(join(root, dir), { recursive: true, encoding: "utf8" }).filter((name) => statSync(join(root, dir, name)).isFile()).map((name) => join(dir, name));
const code = (dir: string): ReadonlyArray<string> => files(dir).filter((name) => /\.(ts|mjs|js)$/.test(name) && !name.endsWith(".d.ts"));

/** The module specifiers a source text imports (comments are not code). */
export const specifiersOf = (text: string): ReadonlyArray<string> =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1").matchAll(/(?:^|\n)\s*(?:import|export)[^"';]*?from\s+"([^"]+)"|import\("([^"]+)"\)/g)].map((match) => (match[1] ?? match[2])!);

/** The layer a project path is in. */
const layerOf = (path: string): string => {
  if (path.startsWith("src/model/")) { return "model"; }
  if (path.startsWith("src/app/")) { return "app"; }
  if (path.startsWith("src/web/") || path === "src/main.ts") { return "web"; }
  if (path.startsWith("src/views/")) { return "views"; }
  if (path.startsWith("src/styles/")) { return "styles"; }
  if (path.startsWith("build/content/")) { return "content"; }
  if (path.startsWith("build/")) { return "build"; }
  if (/^sites\/[^/]+\/snippets\//.test(path)) { return "snippets"; }

  return path.split("/")[0]!;
};

/** Every module a file imports: its specifier, and for a relative one the layer it lands in. */
const imports = (file: string): ReadonlyArray<{ readonly specifier: string; readonly layer: string | undefined }> =>
  specifiersOf(readFileSync(join(root, file), "utf8")).map((specifier) => ({ specifier, layer: specifier.startsWith(".") ? layerOf(relative(root, resolve(dirname(join(root, file)), specifier))) : undefined }));

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

/** What the files import that is in another layer and is not allowed. */
const outside = (own: string, list: ReadonlyArray<string>, allowed: (specifier: string, layer: string | undefined) => boolean): ReadonlyArray<string> =>
  list.flatMap((file) => imports(file).filter(({ specifier, layer }) => layer !== own && !allowed(specifier, layer)).map(({ specifier }) => `${file} imports ${specifier}`));

const sitesIn = (kind: "content" | "snippets"): ReadonlyArray<string> => readdirSync(join(root, "sites")).flatMap((name) => (statSync(join(root, "sites", name, kind), { throwIfNoEntry: false }) === undefined ? [] : files(join("sites", name, kind))));

describe("the layers", () => {
  it("content, views and styles hold no code", () => {
    expect(sitesIn("content").filter((name) => !name.endsWith(".md"))).toEqual([]);
    expect(code("src/views")).toEqual([]);
    expect(code("src/styles")).toEqual([]);
    expect(files("src/styles").filter((name) => !name.endsWith(".css"))).toEqual([]);
    expect(files("src/views").filter((name) => !/\.(mprx|json)$/.test(name))).toEqual([]);
  });

  it("model depends on effect only", () => {
    expect(outside("model", code("src/model"), (specifier) => specifier === "effect")).toEqual([]);
  });

  it("build/content depends on model and Node, not on the application, the views or the target", () => {
    expect(outside("content", code("build/content"), (specifier, layer) => specifier.startsWith("node:") || layer === "model")).toEqual([]);
  });

  it("app depends on model, effect and the Valance core, and names no target", () => {
    expect(outside("app", code("src/app"), (specifier, layer) => specifier === "effect" || specifier === "@valancex/valance" || specifier === "@valancex/nexus" || layer === "model")).toEqual([]);

    for (const file of code("src/app")) {
      expect(withoutComments(readFileSync(join(root, file), "utf8")), file).not.toMatch(/\b(document|window|HTMLElement|localStorage)\b|node:/);
    }
  });

  it("the web target depends on the application and the target libraries, never on build", () => {
    const allowed = (specifier: string, layer: string | undefined): boolean =>
      specifier.startsWith("node:") || specifier === "effect" || /^@valancex\/(valance(\/web(\/server|\/build|\/plugin)?)?|nexus|mesh-runtime(\/mesh-runtime\.wasm\?url)?|mesh-compiler)$/.test(specifier) || layer === "app" || layer === "model" || layer === "styles" || specifier.endsWith("/.valance/program.json?raw") || specifier.endsWith(".css");

    expect(outside("web", [...code("src/web"), "src/main.ts"], allowed)).toEqual([]);
  });

  it("nothing under src reaches into build: the kit does not depend on how it is built", () => {
    expect(code("src").flatMap((file) => imports(file).filter(({ layer }) => layer === "build" || layer === "content").map(({ specifier }) => `${file} imports ${specifier}`))).toEqual([]);
  });

  it("app and the web target keep no module-level mutable state (the same code serves any number of renders and requests): only const at the top", () => {
    for (const file of [...code("src/app"), ...code("src/web")]) {
      // A top-level `let` or `var` (a line that starts at the margin).
      expect(withoutComments(readFileSync(join(root, file), "utf8")).split("\n").filter((line) => /^(let|var)\s/.test(line)), file).toEqual([]);
    }
  });

  it("snippets show what a consumer writes: the published packages and each other, never this project's own layers", () => {
    expect(sitesIn("snippets").length).toBeGreaterThan(0);
    expect(outside("snippets", sitesIn("snippets"), (specifier) => /^(effect|@valancex\/.+)$/.test(specifier))).toEqual([]);
  });

  it("nothing reaches into a layer through a deep package path", () => {
    for (const file of [...code("src"), ...code("build"), ...sitesIn("snippets")]) {
      expect(imports(file).filter(({ specifier }) => /^@valancex\/[^/]+\/(dist|src)\b/.test(specifier)), file).toEqual([]);
    }
  });

  it("the scanner sees a violation (so a pass means something)", () => {
    expect(specifiersOf('import { x } from "../web/primitives.js";\nimport * as V from "@valancex/valance/web";\n// import y from "ignored";\nconst z = await import("../tooling/content.js");')).toEqual(["../web/primitives.js", "@valancex/valance/web", "../tooling/content.js"]);
  });
});
