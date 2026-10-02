// Build time and "the server", in Node: MPRX → template-v1 (published MESH compiler), then the application
// rendered to HTML for two request paths through @valancex/valance/web/server. The page receives the programs,
// each path's server HTML and the state the server embedded: what a real page load carries. The browser never
// compiles MPRX. What a request URL means (`stateFor`) is the application's.
import type { TestProject } from "vitest/node";

import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { application, primitives, stateFor } from "../src/app.js";
import type { AppState, Programs } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";

export interface Served {
  readonly html: string;
  readonly state: AppState;
}

export default async function setup(project: TestProject): Promise<void> {
  const programs = await compilePrograms();
  const app = application(programs);
  const serve = (state: AppState): Promise<Served> => Effect.runPromise(renderToHtml(app, { primitives, state }));

  project.provide("page", {
    programs,
    // The URLs the "server" is asked for. What each means is the application's (`stateFor`); count is not in a URL.
    home: await serve(stateFor("/tracer/?tab=overview")),
    about: await serve({ ...stateFor("/tracer/about?tab=details"), count: 3 }),
    invalid: await serve(stateFor("/tracer/not-a-view")),
  });
}

declare module "vitest" {
  export interface ProvidedContext {
    page: { readonly programs: Programs; readonly home: Served; readonly about: Served; readonly invalid: Served };
  }
}
