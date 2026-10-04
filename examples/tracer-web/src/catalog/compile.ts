// Build time, in Node: MPRX → template-v1 with the published MESH compiler (as ../compile.ts, for this application's manifest).
import type { Programs } from "./app.js";

import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

const compileOne = async (root: "home" | "details" | "notfound"): Promise<Programs[typeof root]> => {
  const result = await compileProgram({
    model: { manifest: read("components.json"), path: "components.json" },
    root,
    components: [{ component: root, source: read(`${root}.mprx`), path: `${root}.mprx` }],
  });

  if (result.program === undefined) {
    throw new Error(`${root} doesn't compile: ${JSON.stringify(result.assembly ?? result.components)}`);
  }

  return result.program;
};

export const compilePrograms = async (): Promise<Programs> => ({ home: await compileOne("home"), details: await compileOne("details"), notfound: await compileOne("notfound") });
