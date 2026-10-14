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
  /** For a project of several targets: each target's own manifest, wiring and components. Absent for one target (`model`, `wiring` and `components` are then its). */
  readonly targets?: Readonly<Record<string, { readonly model: string; readonly components: Readonly<Record<string, string>>; readonly wiring?: string }>>;
}

/** What `mesh-lsp` takes as its `"mesh"` settings. */
export interface LspSettings {
  readonly model: string;
  readonly components: Readonly<Record<string, string>>;
}

/** One target of a project, as one language server sees it: a target's template files are checked against that target's manifest. */
export interface TargetSettings {
  readonly id: string;
  readonly settings: LspSettings;
  /** Its `wiring.json`, relative to the project. Absent in a project built by an older `vlx`. */
  readonly wiring?: string;
  /** The template files this target's server answers for: those it compiles that no earlier target does (a template shared by two targets is answered once, by the first; `vlx check` checks it for both). */
  readonly owns: ReadonlyArray<string>;
}

export type Readiness =
  | { readonly kind: "ready"; readonly settings: LspSettings; readonly wiring?: string; readonly targets: ReadonlyArray<TargetSettings> }
  /** `valance.json` is there but nothing has been generated (the extension runs `vlx check` to make it, so this is a state to report only when that did not produce it). */
  | { readonly kind: "not-generated" }
  | { readonly kind: "not-a-project" };

/** Whether `root` is a VALANCE project, and if so what the language server should be told about it. */
export const readProject = (root: string): Readiness => {
  if (!existsSync(join(root, "valance.json"))) {
    return { kind: "not-a-project" };
  }

  const file = join(root, ".valance", "editor.json");

  if (!existsSync(file)) {
    return { kind: "not-generated" };
  }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<EditorFile>;

  if (parsed.version !== 1 || typeof parsed.model !== "string" || typeof parsed.components !== "object" || parsed.components === null) {
    return { kind: "not-generated" };
  }

  const listed = Object.entries(parsed.targets ?? {}).filter(([, each]) => typeof each.model === "string" && typeof each.components === "object" && each.components !== null);
  const claimed = new Set<string>();
  const targets: Array<TargetSettings> = (listed.length > 1 ? listed : [["default", { model: parsed.model, components: parsed.components, wiring: parsed.wiring }] as const]).map(
    ([id, each]) => {
      const owns = Object.keys(each.components).filter((file) => !claimed.has(file));

      owns.forEach((file) => claimed.add(file));

      return { id, settings: { model: each.model, components: each.components }, ...(typeof each.wiring === "string" ? { wiring: each.wiring } : {}), owns };
    },
  );

  return { kind: "ready", settings: { model: parsed.model, components: parsed.components }, ...(typeof parsed.wiring === "string" ? { wiring: parsed.wiring } : {}), targets };
};

/** The target whose server answers for `file` (relative to the project), and so whose manifest and wiring describe it: the first that owns it, else the first target. */
export const ownerOf = (targets: ReadonlyArray<TargetSettings>, file: string): TargetSettings | undefined => targets.find((each) => each.owns.includes(file)) ?? targets[0];

/** The template file that defines `<tag>`: the author's `src/<tag>.mprx` if the project has one. */
export const templateOf = (settings: LspSettings, tag: string): string | undefined => Object.entries(settings.components).find(([, component]) => component === tag)?.[0];

// ---- finding the project ---------------------------------------------------------------------------------------------------------------------------------------

const SKIP = new Set(["node_modules", ".git", "dist", ".valance", ".vscode-test", "target"]);

/**
 * The VALANCE projects at or below `folder`: directories holding a `valance.json`, found breadth-first to `depth` levels, never inside `node_modules` and the like. The window may be opened on the
 * project, on a repository that holds it, or on a parent of several.
 */
export const findProjects = (folder: string, depth = 3): ReadonlyArray<string> => {
  if (existsSync(join(folder, "valance.json"))) {
    return [folder];
  }

  const found: Array<string> = [];
  let level: ReadonlyArray<string> = [folder];

  for (let at = 0; at < depth; at += 1) {
    const next: Array<string> = [];

    for (const dir of level) {
      let names: ReadonlyArray<string>;

      try {
        names = readdirSync(dir).sort();
      } catch {
        continue;
      }

      for (const name of names) {
        const child = join(dir, name);

        if (SKIP.has(name) || name.startsWith(".")) {
          continue;
        }

        try {
          if (!statSync(child).isDirectory()) {
            continue;
          }
        } catch {
          continue;
        }

        if (existsSync(join(child, "valance.json"))) {
          found.push(child);
        } else {
          next.push(child);
        }
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
  const at = (file: string): string => inWorkspace(workspace, project, file);

  return { model: at(settings.model), components: Object.fromEntries(Object.entries(settings.components).map(([file, component]) => [at(file), component])) };
};

/** A file of the project (relative to it, `/` separated), written from the workspace folder, with `/`. */
export const inWorkspace = (workspace: string, project: string, file: string): string => {
  const prefix = relative(workspace, project)
    .split(sep)
    .filter((part) => part !== "")
    .join("/");

  return prefix === "" ? file : `${prefix}/${file}`;
};

/** What to tell the author when the server is not running, and what to do about it. */
export const explain = (
  readiness: Readiness | { readonly kind: "no-server"; readonly path: string } | { readonly kind: "no-cli"; readonly path: string } | { readonly kind: "partial" },
): string => {
  switch (readiness.kind) {
    case "ready":
      return "Language features are on.";
    case "not-a-project":
      return "No valance.json was found in this folder or the folders below it (three levels). Open the project's folder, or the folder that contains it.";
    case "not-generated":
      return "The project's `vlx check` ran and wrote nothing the editor can read, so it does not know the project's components. Run `vlx check` in the project to see why; this window notices by itself.";
    case "no-cli":
      return `The editor runs the project's own \`vlx check\` to learn its components, and it is not installed (${readiness.path}). Install the project's dependencies (\`npm install\`); this window notices by itself.`;
    case "partial":
      return "The language server is running, but ctrl+click, references and the connection lenses cannot reach your files: this project's .valance/ has no wiring.json, so it was built by an older @valancex/cli (an installed tarball is a frozen copy). Install the CLI by path (npm install -D /path/to/Valance/packages/cli), or repack and reinstall it, then reload the window: it runs `vlx check` itself.";
    case "no-server":
      return `The template language server was not found at ${readiness.path}. Install it in the project: npm install -D @valancex/mesh-lsp@0.10.0`;
  }
};
