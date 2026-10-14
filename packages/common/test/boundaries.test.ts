// What the author's side may depend on: the types of VALANCE and effect, and nothing that runs on a machine. `src/main.ts` is loaded in the browser as well as at build time.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { APP, COMPONENT, FIELD, component, defineApp, field } from "../src/index.js";

const source = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("@valancex/common", () => {
  it("imports only VALANCE and effect: no Node, no Vite, no MESH compiler, no CLI", () => {
    const names = Array.from(source.replace(/^\s*\/\/.*$/gm, "").matchAll(/from\s+"([^"]+)"/g), (match) => match[1]);

    expect(names.sort()).toEqual(["@valancex/valance", "effect"]);
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
