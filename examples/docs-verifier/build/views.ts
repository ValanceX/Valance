// Build time, in Node: MPRX → a program, with the MESH compiler. The manifest MESH checks the templates against is the one Valance derives (the tags of the kit plugin, ./kit.ts, the
// page view's scope Schema, the command table). The composites (layout, block, ...) are not declared anywhere: the compiler infers each one's contract from the templates.
import { manifest } from "@valancex/valance/web/build";
import { compileProgram } from "@valancex/mesh-compiler";
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";

import { commands } from "../src/app/application.js";
import { PageScope } from "../src/app/scope.js";

import { VIEWS } from "./paths.js";
import { kit } from "../src/web/plugins/kit.js";

// Every template under src/views is a component, named by its file: adding one is adding the file.
const templates = (): ReadonlyArray<{ readonly component: string; readonly path: string }> => {
  const found = readdirSync(VIEWS, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".mprx")).sort();
  const names = found.map((file) => basename(file, ".mprx"));
  const twice = names.find((name, at) => names.indexOf(name) !== at);

  if (twice !== undefined) { throw new Error(`two templates are named ${twice}: a component is named by its file, so the name must be unique across src/views`); }

  return found.map((file, at) => ({ component: names[at]!, path: `${VIEWS}/${file}` }));
};

export const derivedManifest = (): string => JSON.stringify(manifest({ primitives: {}, plugins: [kit()], scopes: { page: PageScope }, commands: (state) => commands(state, { name: "", base: "/", url: "", header: {}, footer: "", defaultLocale: "en", locales: [], versions: [], ui: {}, roots: [], feeds: [], pages: [] }) }));


export const compilePage = async () => {
  const result = await compileProgram({
    model: { manifest: derivedManifest(), path: "manifest.json" },
    root: "page",
    components: templates().map(({ component, path }) => ({ component, source: readFileSync(path, "utf8"), path })),
  });

  if (result.program === undefined) {
    // Each diagnostic with the template it is in, its code, and what it says: the place to fix, not a document to read.
    const found = [
      ...(result.components ?? []).flatMap((entry) => (entry.diagnostics?.diagnostics ?? []).map((diagnostic) => `${entry.component}.mprx: ${diagnostic.code}: ${diagnostic.message}`)),
      ...((result.assembly as { diagnostics?: ReadonlyArray<{ code: string; message: string }> } | undefined)?.diagnostics ?? []).map((diagnostic) => `assembly: ${diagnostic.code}: ${diagnostic.message}`),
    ];

    throw new Error(`the views don't compile:\n  ${found.length > 0 ? found.join("\n  ") : JSON.stringify({ assembly: result.assembly, components: result.components })}`);
  }

  return result.program;
};
