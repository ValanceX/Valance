// Build time, in Node: MPRX → a program, with the MESH compiler. The manifest MESH checks the templates against is the one Valance derives (the tags of the kit plugin, ./kit.ts, the
// page view's scope Schema, the command table). The composites (layout, block, ...) are not declared anywhere: the compiler infers each one's contract from the templates.
import { manifest } from "@valancex/valance/web/build";
import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

import { commands } from "../app/application.js";
import { PageScope } from "../app/scope.js";

import { kit } from "./kit.js";

const view = (name: string): string => readFileSync(new URL(`../views/${name}`, import.meta.url), "utf8");

export const derivedManifest = (): string => JSON.stringify(manifest({ primitives: {}, plugins: [kit()], scopes: { page: PageScope }, commands }));

const COMPONENTS = ["page", "layout", "block", "callout", "code-block", "runs", "inline"] as const;

export const compilePage = async () => {
  const result = await compileProgram({
    model: { manifest: derivedManifest(), path: "manifest.json" },
    root: "page",
    components: COMPONENTS.map((component) => ({ component, source: view(`${component}.mprx`), path: `views/${component}.mprx` })),
  });

  if (result.program === undefined) {
    throw new Error(`the views don't compile: ${JSON.stringify({ assembly: result.assembly, components: result.components }, null, 2)}`);
  }

  return result.program;
};
