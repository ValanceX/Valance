// Build time, in Node: MPRX → template-v1 with the published MESH compiler. A program is data.
import type { Mesh } from "@valancex/nexus";
import type { Programs } from "./app.js";

import { compile } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

const compileOne = async (root: "list" | "message"): Promise<Mesh.Program> => {
  const model = read("components.json");
  const result = await compile({ source: read(`${root}.mprx`), path: `${root}.mprx`, model: { manifest: model, path: "components.json", component: root } });

  if (result.template === undefined) {
    throw new Error(`${root} doesn't compile: ${JSON.stringify(result.diagnostics)}`);
  }

  return { root, templates: [JSON.stringify(result.template)], model };
};

export const compilePrograms = async (): Promise<Programs> => ({ list: await compileOne("list"), message: await compileOne("message") });
