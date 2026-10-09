// Build time, in Node: MPRX → a program, with the MESH compiler. The manifest MESH checks the templates against is the one Valance derives (primitive tags from ./primitives.ts, the
// page view's scope Schema, the command table) plus the composites' hand-written entries (../views/composites.json): the one place the manifest is still written by hand.
import { manifest } from "@valancex/valance/web/build";
import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

import { commands } from "../app/application.js";
import { PageScope } from "../app/scope.js";

import { primitives } from "./primitives.js";

const view = (name: string): string => readFileSync(new URL(`../views/${name}`, import.meta.url), "utf8");

interface Manifest { readonly components: Record<string, unknown>; readonly [key: string]: unknown }

export const mergedManifest = (): string => {
  const derived = manifest({ primitives, scopes: { page: PageScope }, commands }) as unknown as Manifest;
  const composites = JSON.parse(view("composites.json")) as { readonly components: Record<string, unknown> };

  return JSON.stringify({ ...derived, components: { ...derived.components, ...composites.components } });
};

const COMPONENTS = ["page", "layout", "block", "callout", "code-block", "runs", "inline"] as const;

export const compilePage = async () => {
  const result = await compileProgram({
    model: { manifest: mergedManifest(), path: "manifest.json" },
    root: "page",
    components: COMPONENTS.map((component) => ({ component, source: view(`${component}.mprx`), path: `views/${component}.mprx` })),
  });

  if (result.program === undefined) {
    throw new Error(`the views don't compile: ${JSON.stringify({ assembly: result.assembly, components: result.components }, null, 2)}`);
  }

  return result.program;
};
