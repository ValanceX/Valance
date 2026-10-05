// Build time and "the server", in Node, for the links Chromium test: compiles the fixture's page and renders its home URL to HTML with the SAME application definition.
import type { TestProject } from "vitest/node";

import { compileProgram } from "@valancex/mesh-compiler";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { application, manifest, primitives, source } from "../test/links-fixture.js";

export default async function setup(project: TestProject): Promise<void> {
  const compiled = await compileProgram({ model: { manifest, path: "components.json" }, root: "shell", components: [{ component: "shell", path: "shell.mprx", source }] });

  if (compiled.program === undefined) { throw new Error(JSON.stringify(compiled.assembly ?? compiled.components)); }

  const served = await Effect.runPromise(renderToHtml(application(compiled.program), { primitives, state: { page: "home" } }));

  project.provide("links", { program: compiled.program, html: served.html, state: served.state });
}

declare module "vitest" {
  export interface ProvidedContext {
    links: { readonly program: import("@valancex/nexus").Mesh.Program; readonly html: string; readonly state: { readonly page: string } };
  }
}
