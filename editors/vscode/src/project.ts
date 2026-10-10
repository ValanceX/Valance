// What the extension knows about a VALANCE project, read from the files `valance` generates. The conventions (where the manifest is, which file is which component) stay in
// `@valancex/cli`, which writes `.valance/editor.json`; the extension never re-derives them. Pure: no `vscode` import, so it is tested without an editor.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface EditorFile {
  readonly version: 1;
  /** The manifest, relative to the project. */
  readonly model: string;
  /** Source path (relative to the project, `/` separated) → the component whose template it is. */
  readonly components: Readonly<Record<string, string>>;
  /** Where every name came from and what uses it (`wiring.json`), relative to the project. Absent in a project built by an older `vlx`. */
  readonly wiring?: string;
}

/** What `mesh-lsp` takes as its `"mesh"` settings. */
export interface LspSettings {
  readonly model: string;
  readonly components: Readonly<Record<string, string>>;
}

export type Readiness =
  | { readonly kind: "ready"; readonly settings: LspSettings; readonly wiring?: string }
  /** `valance.json` is there but nothing has been generated yet: run `vlx dev`, `build` or `check` once. */
  | { readonly kind: "not-generated" }
  | { readonly kind: "not-a-project" };

/** Whether `root` is a VALANCE project, and if so what the language server should be told about it. */
export const readProject = (root: string): Readiness => {
  if (!existsSync(join(root, "valance.json"))) { return { kind: "not-a-project" }; }

  const file = join(root, ".valance", "editor.json");

  if (!existsSync(file)) { return { kind: "not-generated" }; }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<EditorFile>;

  if (parsed.version !== 1 || typeof parsed.model !== "string" || typeof parsed.components !== "object" || parsed.components === null) { return { kind: "not-generated" }; }

  return { kind: "ready", settings: { model: parsed.model, components: parsed.components }, ...(typeof parsed.wiring === "string" ? { wiring: parsed.wiring } : {}) };
};

/** The template file that defines `<tag>`: the author's `src/<tag>.mprx` if the project has one. */
export const templateOf = (settings: LspSettings, tag: string): string | undefined => Object.entries(settings.components).find(([, component]) => component === tag)?.[0];

// ---- finding the project ---------------------------------------------------------------------------------------------------------------------------------------

const SKIP = new Set(["node_modules", ".git", "dist", ".valance", ".vscode-test", "target"]);

/**
 * The VALANCE projects at or below `folder`: directories holding a `valance.json`, found breadth-first to `depth` levels, never inside `node_modules` and the like. The window may be opened on the
 * project, on a repository that holds it, or on a parent of several.
 */
export const findProjects = (folder: string, depth = 3): ReadonlyArray<string> => {
  if (existsSync(join(folder, "valance.json"))) { return [folder]; }

  const found: Array<string> = [];
  let level: ReadonlyArray<string> = [folder];

  for (let at = 0; at < depth; at += 1) {
    const next: Array<string> = [];

    for (const dir of level) {
      let names: ReadonlyArray<string>;

      try { names = readdirSync(dir).sort(); } catch { continue; }

      for (const name of names) {
        const child = join(dir, name);

        if (SKIP.has(name) || name.startsWith(".")) { continue; }

        try { if (!statSync(child).isDirectory()) { continue; } } catch { continue; }

        if (existsSync(join(child, "valance.json"))) { found.push(child); } else { next.push(child); }
      }
    }

    level = next;
  }

  return found;
};

/**
 * The settings `mesh-lsp` is given. The server resolves every path against the **workspace** folder, not the project: when the project is a folder inside the workspace, its paths
 * (`model` and each component's file) are written from the workspace, with `/`.
 */
export const forWorkspace = (workspace: string, project: string, settings: LspSettings): LspSettings => {
  const prefix = relative(workspace, project).split(sep).filter((part) => part !== "").join("/");

  if (prefix === "") { return settings; }

  return { model: `${prefix}/${settings.model}`, components: Object.fromEntries(Object.entries(settings.components).map(([file, component]) => [`${prefix}/${file}`, component])) };
};

/** What to tell the author when the server is not running, and what to do about it. */
export const explain = (readiness: Readiness | { readonly kind: "no-server"; readonly path: string }): string => {
  switch (readiness.kind) {
    case "ready": return "Language features are on.";
    case "not-a-project": return "No valance.json was found in this folder or the folders below it (three levels). Open the project's folder, or the folder that contains it.";
    case "not-generated": return "The project has not been built yet, so the editor does not know its components. Run `vlx check` (or `vlx dev`) in the project once; this window notices by itself.";
    case "no-server": return `The template language server was not found at ${readiness.path}. Install it in the project: npm install -D @valancex/mesh-lsp@0.10.0`;
  }
};
