// Build time, in Node: MPRX → a program, with the published MESH compiler. The manifest MESH checks the templates against is derived from the tags (./web.ts), each view's scope
// Schema and the command table (./app.ts): nobody writes it.
import { manifest } from "@valancex/valance/web/build";
import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

import type { Programs } from "./app.js";
import { commands, DocScope, HomeScope } from "./app.js";
import { primitives } from "./web.js";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

// The table is read only for its commands' names and input Schemas, so the search service is never called.
const derived = JSON.stringify(manifest({ primitives, scopes: { home: HomeScope, doc: DocScope }, commands: commands(async () => []) }));

const compileOne = async (root: "home" | "doc"): Promise<Programs[typeof root]> => {
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

export const compilePrograms = async (): Promise<Programs> => ({ home: await compileOne("home"), doc: await compileOne("doc") });
