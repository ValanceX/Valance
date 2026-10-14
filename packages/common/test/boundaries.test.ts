// What the author's side may depend on: the types of VALANCE and effect, and nothing that runs on a machine. `src/main.ts` is loaded in the browser as well as at build time.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { APP, COMPONENT, FIELD, component, defineApp, field } from "../src/index.js";

const source = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("@valancex/common", () => {
  it("imports only VALANCE and effect: no Node, no Vite, no MESH compiler, no CLI", () => {
    const names = Array.from(source.replace(/^\s*\/\/.*$/gm, "").matchAll(/from\s+"([^"]+)"/g), (match) => match[1]);

    expect(names.sort()).toEqual(["./transport.js", "@valancex/valance", "effect"]);
  });

  it("does not re-export Schema: it comes from effect", () => {
    expect(source).not.toMatch(/export\s*\{[^}]*\bSchema\b/);
  });

  it("brands what it makes, so the tools can tell a definition from any other export", () => {
    expect(defineApp({})[APP]).toBe(true);
    expect(component({ mprx: "a.mprx" })[COMPONENT]).toBe(true);
    expect(field({} as never, 0 as never)[FIELD]).toBe(true);
  });

  it("keeps a component to its template and the interface it states; what it uses is read from the template", () => {
    const bare = component({ mprx: "a.mprx" });

    expect(Object.keys(bare).sort()).toEqual(["template"]);
    expect(component({ mprx: "a.mprx" }, { props: {}, events: {} }).props).toEqual({});
    expect(defineApp({ components: [bare] }).components).toEqual([bare]);
  });
});

// What each entry loads, by following its relative imports. The authoring entry runs in the browser and at build time; the client in the browser; the server in Node, and neither knows the build tools.
const src = fileURLToPath(new URL("../src/", import.meta.url));
const importsOf = (text: string): ReadonlyArray<string> =>
  Array.from(
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .matchAll(/(?:from|import\()\s*"([^"]+)"/g),
    (match) => match[1]!,
  );
const closure = (entry: string, seen = new Set<string>()): ReadonlySet<string> => {
  if (!seen.has(entry)) {
    seen.add(entry);
    importsOf(readFileSync(`${src}${entry}`, "utf8"))
      .filter((name) => name.startsWith("."))
      .forEach((name) => closure(name.replace(/\.js$/, ".ts"), seen));
  }

  return seen;
};
const externals = (entry: string): ReadonlyArray<string> =>
  [...closure(entry)].flatMap((file) => importsOf(readFileSync(`${src}${file}`, "utf8")).filter((name) => !name.startsWith("."))).sort();

describe("the runtime entries", () => {
  it("keeps Node, Vite, the MESH compiler and the terminal out of everything the browser loads", () => {
    for (const entry of ["index.ts", "client.ts"]) {
      expect(
        externals(entry).filter((name) => name.startsWith("node:") || name === "vite" || name === "@valancex/mesh-compiler" || name === "ink" || name === "react"),
        entry,
      ).toEqual([]);
    }
  });

  it("keeps the server to VALANCE, effect and its own files, and never loads the browser's", () => {
    const allowed = ["@valancex/valance", "@valancex/valance/web", "@valancex/valance/web/plugin", "@valancex/valance/web/server", "effect"];

    expect(externals("server.ts").filter((name) => !allowed.includes(name))).toEqual([]);
    expect(externals("server.ts")).not.toContain("@valancex/mesh-runtime");
    expect([...closure("server.ts")]).not.toContain("client.ts");
  });

  it("is what the generated entries import, and the author entry loads none of it", () => {
    // the one file it loads is the types of an interceptor: nothing in it runs
    expect([...closure("index.ts")]).toEqual(["index.ts", "./transport.ts"]);
    expect(readFileSync(`${src}transport.ts`, "utf8")).not.toMatch(/^export (?:const|function|class)/m);
  });
});

describe("the http entry", () => {
  it("imports NEXUS and effect and nothing that runs on a machine, and is not loaded by the authoring entry", () => {
    const allowed = ["@valancex/nexus", "effect"];

    expect(externals("http.ts").filter((name) => !allowed.includes(name))).toEqual([]);
    expect([...closure("index.ts")]).not.toContain("http.ts");
  });
});
