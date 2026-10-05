// Build time and "the server", in Node, for the documentation-site benchmark: MPRX → programs (the published MESH compiler), then the SAME application definition rendered
// to HTML for a home, a guide and a reference URL through @valancex/valance/web/server.
import type { TestProject } from "vitest/node";

import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { application, stateFor, type AppState, type Programs } from "../src/docs-benchmark/app.js";
import { compilePrograms } from "../src/docs-benchmark/compile.js";
import { primitives } from "../src/docs-benchmark/web.js";

export interface DocsServed {
  readonly html: string;
  readonly state: AppState;
}

export default async function setup(project: TestProject): Promise<void> {
  const programs = await compilePrograms();
  const serve = (url: string): Promise<DocsServed> => Effect.runPromise(renderToHtml(application(programs, () => new Promise(() => undefined)), { primitives, state: stateFor(url) }));

  project.provide("docs", { programs, home: await serve("/docs/"), guide: await serve("/docs/guides/state"), reference: await serve("/docs/reference/api") });
}

declare module "vitest" {
  export interface ProvidedContext {
    docs: { readonly programs: Programs; readonly home: DocsServed; readonly guide: DocsServed; readonly reference: DocsServed };
  }
}
