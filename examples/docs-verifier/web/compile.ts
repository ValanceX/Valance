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

const COMPONENTS = ["page", "layout", "block", "heading", "callout", "code-block", "code-tabs", "tokens", "token", "list-block", "list-items", "table-block", "runs", "inline"] as const;

export const compilePage = async () => {
  const result = await compileProgram({
    model: { manifest: derivedManifest(), path: "manifest.json" },
    root: "page",
    components: COMPONENTS.map((component) => ({ component, source: view(`${component}.mprx`), path: `views/${component}.mprx` })),
  });

  if (result.program === undefined) {
    // Each diagnostic with the template it is in, its code, and what it says: the place to fix, not a document to read.
    const found = [
      ...(result.components ?? []).flatMap((entry) => (entry.diagnostics?.diagnostics ?? []).map((diagnostic) => `views/${entry.component}.mprx: ${diagnostic.code}: ${diagnostic.message}`)),
      ...((result.assembly as { diagnostics?: ReadonlyArray<{ code: string; message: string }> } | undefined)?.diagnostics ?? []).map((diagnostic) => `assembly: ${diagnostic.code}: ${diagnostic.message}`),
    ];

    throw new Error(`the views don't compile:\n  ${found.length > 0 ? found.join("\n  ") : JSON.stringify({ assembly: result.assembly, components: result.components })}`);
  }

  return result.program;
};
