// Build time, in Node: MPRX → a program, with the published MESH compiler. A program is data.
import type { Programs } from "./app.js";

import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

const compileOne = async (root: "list" | "message"): Promise<Programs[typeof root]> => {
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

export const compilePrograms = async (): Promise<Programs> => ({ list: await compileOne("list"), message: await compileOne("message") });
