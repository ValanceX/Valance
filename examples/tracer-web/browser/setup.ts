// Build time and "the server", in Node: MPRX → template-v1 (published MESH compiler), then the application
// rendered to HTML through @valancex/valance/web/server. The page receives the program, the server's HTML and
// the state the server embedded: what a real page load carries. The browser never compiles MPRX.
import type { TestProject } from "vitest/node";

import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { application, primitives } from "../src/app.js";
import { compileProgram } from "../src/compile.js";

export default async function setup(project: TestProject): Promise<void> {
  const program = await compileProgram();
  const served = await Effect.runPromise(renderToHtml(application(program), { primitives }));

  project.provide("page", { program, html: served.html, state: served.state });
}

declare module "vitest" {
  export interface ProvidedContext {
    page: {
      readonly program: { readonly root: string; readonly templates: ReadonlyArray<string>; readonly model: string };
      readonly html: string;
      readonly state: { readonly title: string; readonly count: number; readonly stamp: number };
    };
  }
}
