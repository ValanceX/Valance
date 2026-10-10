// The layers, and what each may depend on. A file that reaches upward or sideways fails here, so the structure in README.md is enforced and not just described.
//
//   content/   data: markdown and nav.json. No code.
//   model/     the shape of the site's data (Schemas). Depends on `effect` only.
//   tooling/   build time: content → generated/site.json. Depends on model/ and Node.
//   app/       the Valance application. Depends on model/, `effect` and the Valance core. Names no target, no DOM, no file, no tooling.
//   views/     MPRX templates. No code.
//   styles/    the stylesheet. No code; the browser entry (web/page.ts) imports it, and the build turns it into one hashed file.
//   web/       the target: primitives, compile, server, browser. Depends on app/, model/, Valance, MESH, PORT and Node. Not on tooling/.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

const files = (dir: string): ReadonlyArray<string> => readdirSync(join(root, dir), { recursive: true, encoding: "utf8" }).filter((name) => statSync(join(root, dir, name)).isFile()).map((name) => join(dir, name));
const code = (dir: string): ReadonlyArray<string> => files(dir).filter((name) => /\.(ts|mjs|js)$/.test(name) && !name.endsWith(".d.ts"));

/** The module specifiers a source text imports (comments are not code). */
export const specifiersOf = (text: string): ReadonlyArray<string> =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1").matchAll(/(?:^|\n)\s*(?:import|export)[^"';]*?from\s+"([^"]+)"|import\("([^"]+)"\)/g)].map((match) => (match[1] ?? match[2])!);

/** Every module a file imports: its specifier, and for a relative one the layer (top-level directory) it lands in. */
const imports = (file: string): ReadonlyArray<{ readonly specifier: string; readonly layer: string | undefined }> =>
  specifiersOf(readFileSync(join(root, file), "utf8")).map((specifier) => ({ specifier, layer: specifier.startsWith(".") ? relative(root, resolve(dirname(join(root, file)), specifier)).split("/")[0] : undefined }));

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

const outside = (dir: string, allowed: (specifier: string, layer: string | undefined) => boolean): ReadonlyArray<string> =>
  code(dir).flatMap((file) => imports(file).filter(({ specifier, layer }) => layer !== dir && !allowed(specifier, layer)).map(({ specifier }) => `${file} imports ${specifier}`));

describe("the layers", () => {
  it("content/, views/ and styles/ hold no code", () => {
    expect(code("content")).toEqual([]);
    expect(code("views")).toEqual([]);
    expect(code("styles")).toEqual([]);
    expect(files("styles").filter((name) => !name.endsWith(".css"))).toEqual([]);
    expect(files("views").filter((name) => !/\.(mprx|json)$/.test(name))).toEqual([]);
  });

  it("model/ depends on effect only", () => {
    expect(outside("model", (specifier) => specifier === "effect")).toEqual([]);
  });

  it("tooling/ depends on model/ and Node, not on the application, the views or the target", () => {
    expect(outside("tooling", (specifier, layer) => specifier.startsWith("node:") || layer === "model")).toEqual([]);
  });

  it("app/ depends on model/, effect and the Valance core, and names no target", () => {
    expect(outside("app", (specifier, layer) => specifier === "effect" || specifier === "@valancex/valance" || layer === "model")).toEqual([]);

    for (const file of code("app")) {
      expect(withoutComments(readFileSync(join(root, file), "utf8")), file).not.toMatch(/\b(document|window|HTMLElement|localStorage)\b|node:/);
    }
  });

  it("web/ depends on the application and the target libraries, never on tooling/", () => {
    const allowed = (specifier: string, layer: string | undefined): boolean =>
      specifier.startsWith("node:") || specifier === "effect" || /^@valancex\/(valance(\/web(\/server|\/build|\/plugin)?)?|mesh-runtime(\/mesh-runtime\.wasm\?url)?|mesh-compiler)$/.test(specifier) || layer === "app" || layer === "model" || layer === "styles";

    expect(outside("web", allowed)).toEqual([]);
  });

  it("nothing reaches into a layer through a deep package path", () => {
    for (const dir of ["model", "tooling", "app", "web"]) {
      for (const file of code(dir)) {
        expect(imports(file).filter(({ specifier }) => /^@valancex\/[^/]+\/(dist|src)\b/.test(specifier)), file).toEqual([]);
      }
    }
  });

  it("the scanner sees a violation (so a pass means something)", () => {
    expect(specifiersOf('import { x } from "../web/primitives.js";\nimport * as V from "@valancex/valance/web";\n// import y from "ignored";\nconst z = await import("../tooling/content.js");')).toEqual(["../web/primitives.js", "@valancex/valance/web", "../tooling/content.js"]);
  });
});
