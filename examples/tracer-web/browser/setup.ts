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
import { compilePrograms as compileCatalog } from "../src/catalog/compile.js";
import { application as catalogApplication, type AppState as CatalogState, type Programs as CatalogPrograms } from "../src/catalog/app.js";
import { primitives as catalogPrimitives } from "../src/catalog/web.js";

export interface Served {
  readonly html: string;
  readonly state: AppState;
}

export interface CatalogServed {
  readonly html: string;
  readonly state: CatalogState;
}

export default async function setup(project: TestProject): Promise<void> {
  const programs = await compilePrograms();
  const app = application(programs);
  const serve = (state: AppState): Promise<Served> => Effect.runPromise(renderToHtml(app, { primitives, state }));

  project.provide("page", {
    programs,
    // The Application Model tracer's programs (src/catalog), compiled here: the browser never compiles MPRX.
    catalog: await compileCatalog(),
    // The catalog application's home view with the keyed list [A B C], rendered by the "server": HTML, and the state it embeds.
    catalogServed: await (async (): Promise<CatalogServed> => {
      const catalog = await compileCatalog();

      return Effect.runPromise(renderToHtml(catalogApplication(catalog), { primitives: catalogPrimitives, state: { view: "home", items: [{ id: "A", name: "Alpha" }, { id: "B", name: "Beta" }, { id: "C", name: "Gamma" }] } }));
    })(),
    // The URLs the "server" is asked for. What each means is the application's (`stateFor`); count is not in a URL.
    home: await serve(stateFor("/tracer/?tab=overview")),
    about: await serve({ ...stateFor("/tracer/about?tab=details"), count: 3 }),          // case A: canonical
    plainAbout: await serve({ ...stateFor("/tracer/about"), count: 3 }),                 // case B: valid, not canonical
    notFound: await serve(stateFor("/tracer/not-a-view")),                               // case C: no view
  });
}

declare module "vitest" {
  export interface ProvidedContext {
    page: { readonly programs: Programs; readonly catalog: CatalogPrograms; readonly catalogServed: CatalogServed; readonly home: Served; readonly about: Served; readonly plainAbout: Served; readonly notFound: Served };
  }
}
