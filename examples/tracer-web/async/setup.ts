// Build time, in Node: MPRX → template-v1 for the async tracer. The browser never compiles MPRX.
import type { Mesh } from "@valancex/nexus";
import type { TestProject } from "vitest/node";

import { compileProgram } from "./compile.js";

export default async function setup(project: TestProject): Promise<void> {
  project.provide("asyncProgram", await compileProgram());
}

declare module "vitest" {
  export interface ProvidedContext {
    asyncProgram: Mesh.Program;
  }
}
