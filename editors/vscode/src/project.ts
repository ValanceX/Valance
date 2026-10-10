// What the extension knows about a VALANCE project, read from the files `valance` generates. The conventions (where the manifest is, which file is which component) stay in
// `@valancex/app`, which writes `.valance/editor.json`; the extension never re-derives them. Pure: no `vscode` import, so it is tested without an editor.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface EditorFile {
  readonly version: 1;
  /** The manifest, relative to the project. */
  readonly model: string;
  /** Source path (relative to the project, `/` separated) → the component whose template it is. */
  readonly components: Readonly<Record<string, string>>;
}

/** What `mesh-lsp` takes as its `"mesh"` settings. */
export interface LspSettings {
  readonly model: string;
  readonly components: Readonly<Record<string, string>>;
}

export type Readiness =
  | { readonly kind: "ready"; readonly settings: LspSettings }
  /** `valance.json` is there but nothing has been generated yet: run `valance dev`, `build` or `check` once. */
  | { readonly kind: "not-generated" }
  | { readonly kind: "not-a-project" };

/** Whether `root` is a VALANCE project, and if so what the language server should be told about it. */
export const readProject = (root: string): Readiness => {
  if (!existsSync(join(root, "valance.json"))) { return { kind: "not-a-project" }; }

  const file = join(root, ".valance", "editor.json");

  if (!existsSync(file)) { return { kind: "not-generated" }; }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<EditorFile>;

  if (parsed.version !== 1 || typeof parsed.model !== "string" || typeof parsed.components !== "object" || parsed.components === null) { return { kind: "not-generated" }; }

  return { kind: "ready", settings: { model: parsed.model, components: parsed.components } };
};

/** The template file that defines `<tag>`: the author's `src/<tag>.mprx` if the project has one. */
export const templateOf = (settings: LspSettings, tag: string): string | undefined => Object.entries(settings.components).find(([, component]) => component === tag)?.[0];
