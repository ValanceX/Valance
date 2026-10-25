// Shared by the tests: the playground, running `vlx`, and a component program rendered with the MESH runtime. Everything here uses what a consumer can install.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { render } from "@valancex/mesh-runtime";

export const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const playground = join(root, "playground");

/** Runs the `vlx` the workspace installed, in `cwd`. Returns what it printed and its exit status. */
export const vlx = (args: ReadonlyArray<string>, cwd: string = playground): { readonly status: number; readonly output: string } => {
  const ran = spawnSync("pnpm", ["exec", "vlx", ...args], { cwd, encoding: "utf8" });

  return { status: ran.status ?? 1, output: `${ran.stdout}${ran.stderr}` };
};

/** A copy of the playground that can be changed and built without touching the original (its node_modules are linked, not copied). */
export const copyOfPlayground = (): string => {
  const copy = mkdtempSync(join(tmpdir(), "components-playground-"));

  cpSync(playground, copy, { recursive: true, filter: (from) => !/\/(\.valance|dist)(\/|$)/.test(from) });

  return copy;
};

export const remove = (dir: string): void => rmSync(dir, { recursive: true, force: true });

interface Manifest {
  readonly components: Readonly<Record<string, { readonly scope?: Readonly<Record<string, { readonly kind: string }>> }>>;
}

type Type = { readonly kind: string; readonly values?: ReadonlyArray<string>; readonly fields?: Readonly<Record<string, { readonly type: Type }>> };

const defaultOf = (type: Type): unknown =>
  type.kind === "string"
    ? ""
    : type.kind === "number"
      ? 0
      : type.kind === "boolean"
        ? false
        : type.kind === "list"
          ? []
          : type.kind === "enum"
            ? (type.values?.[0] ?? "")
            : Object.fromEntries(Object.entries(type.fields ?? {}).map(([name, field]) => [name, defaultOf(field.type)]));

/** The playground's program for a target as `vlx check` wrote it, rendered with the runtime from a snapshot: every scope name of the layout has a default, then `values` replace some. */
export const rendered = async (target: "web" | "desktop", values: Record<string, unknown> = {}, dir: string = playground) => {
  execFileSync("pnpm", ["exec", "vlx", "check"], { cwd: dir, stdio: "ignore" });

  const program = JSON.parse(readFileSync(join(dir, ".valance", `program.${target}.json`), "utf8")) as { readonly model: unknown; readonly root: string; readonly templates: ReadonlyArray<string> };
  const model = typeof program.model === "string" ? program.model : JSON.stringify(program.model);
  const manifest = JSON.parse(model) as Manifest;
  const snapshot = Object.fromEntries(Object.entries(manifest.components[program.root]?.scope ?? {}).map(([name, type]) => [name, defaultOf(type)]));
  const result = await render({ program: { model, root: program.root, templates: program.templates }, model, snapshot: { ...snapshot, ...values } });

  if (result.render === undefined) {
    throw new Error(`the playground's ${target} program did not render: ${JSON.stringify(result.diagnostics)}`);
  }

  return result.render;
};
