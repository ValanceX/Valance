// Build time, in Node: MPRX → a program, with the published MESH compiler. A program is data. The manifest MESH checks the templates against is DERIVED, not written: from the
// Web primitives table (its tags), each view's scope Schema (what it reads) and the command table (what it may run).
import { manifest } from "@valancex/valance/web/build";
import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

import type { Programs } from "./app.js";
import { commands, DetailScope, ListScope } from "./app.js";
import { primitives } from "./web.js";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

// The table is only read for the commands' names and input Schemas, so the fetch service is never called.
const derived = JSON.stringify(manifest({ primitives, scopes: { list: ListScope, detail: DetailScope }, commands: commands(() => Promise.reject(new Error("never called while a manifest is derived"))) }));

const compileOne = async (root: "list" | "detail"): Promise<Programs[typeof root]> => {
  const result = await compileProgram({
    model: { manifest: derived, path: "derived-manifest.json" },
    root,
    components: [{ component: root, source: read(`${root}.mprx`), path: `${root}.mprx` }],
  });

  if (result.program === undefined) {
    throw new Error(`${root} doesn't compile: ${JSON.stringify(result.assembly ?? result.components)}`);
  }

  return result.program;
};

export const compilePrograms = async (): Promise<Programs> => ({ list: await compileOne("list"), detail: await compileOne("detail") });
