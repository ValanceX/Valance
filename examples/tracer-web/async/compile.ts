// Build time, in Node: MPRX → template-v1 with the published MESH compiler (as ../src/compile.ts).
import type { Mesh } from "@valancex/nexus";

import { compile } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

export const compileProgram = async (): Promise<Mesh.Program> => {
  const model = read("components.json");
  const result = await compile({ source: read("asyncapp.mprx"), path: "asyncapp.mprx", model: { manifest: model, path: "components.json", component: "asyncapp" } });

  if (result.template === undefined) {
    throw new Error(`asyncapp doesn't compile: ${JSON.stringify(result.diagnostics)}`);
  }

  return { root: "asyncapp", templates: [JSON.stringify(result.template)], model };
};
