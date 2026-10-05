// Build time and "the server", in Node, for the items pressure test: MPRX → programs (the published MESH compiler), then the SAME application definition rendered to
// HTML for two request URLs through @valancex/valance/web/server. The server's fetch never completes: startup work begins during a render and is not awaited.
import type { TestProject } from "vitest/node";

import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { application, stateFor, type AppState, type Programs } from "../src/items/app.js";
import { compilePrograms } from "../src/items/compile.js";
import { primitives } from "../src/items/web.js";

export interface ItemsServed {
  readonly html: string;
  readonly state: AppState;
}

export default async function setup(project: TestProject): Promise<void> {
  const programs = await compilePrograms();
  const serve = (url: string): Promise<ItemsServed> => Effect.runPromise(renderToHtml(application(programs, () => new Promise<string>(() => undefined)), { primitives, state: stateFor(url) }));

  project.provide("items", { programs, list: await serve("/items"), detail: await serve("/items?item=b") });
}

declare module "vitest" {
  export interface ProvidedContext {
    items: { readonly programs: Programs; readonly list: ItemsServed; readonly detail: ItemsServed };
  }
}
