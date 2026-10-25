// Libraries of components and themes (Bet 12; decisions K3 to K14). A package is a VALANCE library when its `exports` has the condition `valance`: that condition is the one thing the build keys on
// (K11). The package's top-level `valance` field is metadata only: what it holds (`components` or `theme`), the targets it supports, the stylesheets it declares. Templates ship as source and the
// consumer's build compiles them (K3), so the build must process a marked package instead of loading it in Node, which does not know `.mprx` or `.css`.
//
// This module reads the project's dependencies and says which are libraries. It does not load them: Vite does, with the settings `viteSettings` returns.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import type { Diagnostic } from "./diagnostics.js";
import { diagnostic } from "./diagnostics.js";
import type { TargetId } from "./targets.js";

/** The targets a library can name. (Not imported from `targets.ts`, which imports the compiler, which imports this.) */
const TARGET_IDS: ReadonlyArray<string> = ["web", "desktop"];
const isTarget = (name: string): name is TargetId => TARGET_IDS.includes(name);

/** The export condition that marks a package as a VALANCE library. */
export const CONDITION = "valance";
export const KINDS = ["components", "theme"] as const;
export type LibraryKind = (typeof KINDS)[number];

export interface Library {
  readonly name: string;
  readonly version: string;
  /** The package's real directory (a symlink resolved). */
  readonly dir: string;
  readonly kind: LibraryKind;
  /** The targets whose vocabularies the library's templates are written for. Absent in the field: every target. */
  readonly targets: ReadonlyArray<TargetId>;
  /** The stylesheets the library declares, as absolute paths of files that exist. */
  readonly styles: ReadonlyArray<string>;
  /** A theme's `theme.json`, as an absolute path (kind `theme`). */
  readonly theme?: string;
}

interface Manifest {
  readonly name?: string;
  readonly version?: string;
  readonly exports?: unknown;
  readonly valance?: unknown;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
}

const read = (file: string): Manifest | undefined => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Manifest;
  } catch {
    return undefined;
  }
};

/** Whether an `exports` value has the `valance` condition anywhere in it. */
export const hasCondition = (exports: unknown): boolean =>
  typeof exports === "object" && exports !== null && !Array.isArray(exports) && Object.entries(exports).some(([key, value]) => key === CONDITION || hasCondition(value));

/** The directory `name` is installed in for a project at `root`, looked for as Node looks for it: `node_modules/<name>` here and in each parent directory. */
export const installedAt = (root: string, name: string): string | undefined => {
  for (let at = resolve(root); ; at = dirname(at)) {
    const candidate = join(at, "node_modules", ...name.split("/"));

    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }

    if (dirname(at) === at) {
      return undefined;
    }
  }
};

/** What reading a project's dependencies found: the libraries, and what is wrong with their markers. */
export interface Found {
  readonly libraries: ReadonlyArray<Library>;
  readonly problems: ReadonlyArray<Diagnostic>;
}

const NONE: Found = { libraries: [], problems: [] };

/** The metadata a library's `valance` field holds, checked. `file` names the package.json in a diagnostic. */
const fieldOf = (manifest: Manifest, dir: string, file: string): { readonly library?: Library; readonly problems: ReadonlyArray<Diagnostic> } => {
  const problems: Array<Diagnostic> = [];
  const problem = (code: string, message: string): void => void problems.push(diagnostic(file, 0, code, message));
  const field = manifest.valance;
  const given = typeof field === "object" && field !== null && !Array.isArray(field) ? (field as Record<string, unknown>) : undefined;

  if (field !== undefined && given === undefined) {
    problem("library-field", `"valance" in ${file} must be an object ({ "kind": "components", "targets": ["web", "desktop"] })`);
  }

  for (const key of Object.keys(given ?? {})) {
    if (!["kind", "targets", "styles", "theme"].includes(key)) {
      problem("library-field", `"valance.${key}" in ${file} is not a field of a library (kind, targets, styles, theme)`);
    }
  }

  const kind = given?.["kind"] ?? "components";

  if (!KINDS.includes(kind as LibraryKind)) {
    problem("library-field", `"valance.kind" in ${file} is ${JSON.stringify(kind)}; it is one of ${KINDS.map((each) => `"${each}"`).join(", ")}`);
  }

  const listed = given?.["targets"];
  const targets: Array<TargetId> = [];

  if (listed !== undefined && (!Array.isArray(listed) || listed.length === 0)) {
    problem("library-field", `"valance.targets" in ${file} must be a non-empty list of targets`);
  }

  for (const each of Array.isArray(listed) ? listed : []) {
    if (typeof each === "string" && isTarget(each)) {
      targets.push(each);
    } else {
      problem("library-field", `"valance.targets" in ${file} names ${JSON.stringify(each)}, which is not a target`);
    }
  }

  const styles: Array<string> = [];

  const listedStyles: ReadonlyArray<unknown> = Array.isArray(given?.["styles"]) ? (given["styles"] as ReadonlyArray<unknown>) : [];

  for (const each of listedStyles) {
    const path = typeof each === "string" ? resolve(dir, each) : undefined;

    if (path === undefined || !path.startsWith(dir + sep)) {
      problem("library-field", `"valance.styles" in ${file} lists ${JSON.stringify(each)}: a stylesheet inside the package, as "./dist/x.css"`);
    } else if (!existsSync(path)) {
      problem("library-styles", `"valance.styles" in ${file} lists ${String(each)}, which the package does not contain (did the library build run?)`);
    } else {
      styles.push(path);
    }
  }

  let theme: string | undefined;

  if (kind === "theme") {
    const entry = given?.["theme"];
    const path = typeof entry === "string" ? resolve(dir, entry) : undefined;

    if (path === undefined || !path.startsWith(dir + sep)) {
      problem("library-field", `a theme package says where its theme is: "valance": { "kind": "theme", "theme": "./theme/theme.json" } in ${file}`);
    } else if (!existsSync(path)) {
      problem("library-field", `"valance.theme" in ${file} is ${String(entry)}, which the package does not contain`);
    } else {
      theme = path;
    }
  }

  return {
    problems,
    ...(problems.length > 0
      ? {}
      : {
          library: {
            name: manifest.name ?? "",
            version: manifest.version ?? "0.0.0",
            dir,
            kind: kind as LibraryKind,
            targets: targets.length === 0 ? ["web", "desktop"] : targets,
            styles,
            ...(theme === undefined ? {} : { theme }),
          },
        }),
  };
};

/**
 * The libraries a project at `root` depends on: each dependency (of any kind) installed under `node_modules` whose `exports` has the `valance` condition. A package with the field and no condition is
 * said so (the build keys on the condition, K11); a field that is wrong is a diagnostic about the package's `package.json`, where its author can act.
 */
export const librariesOf = (root: string): Found => {
  const own = read(join(root, "package.json"));

  if (own === undefined) {
    return NONE;
  }

  const names = [...new Set([...Object.keys(own.dependencies ?? {}), ...Object.keys(own.devDependencies ?? {}), ...Object.keys(own.peerDependencies ?? {})])].sort();
  const libraries: Array<Library> = [];
  const problems: Array<Diagnostic> = [];

  for (const name of names) {
    const dir = installedAt(root, name);
    const manifest = dir === undefined ? undefined : read(join(dir, "package.json"));

    if (dir === undefined || manifest === undefined) {
      continue;
    }

    const marked = hasCondition(manifest.exports);

    if (!marked) {
      if (manifest.valance !== undefined && name !== "@valancex/valance") {
        problems.push(
          diagnostic(
            `node_modules/${name}/package.json`,
            0,
            "library-unmarked",
            `${name} has a "valance" field but no "valance" export condition, so the build does not process it: add ${JSON.stringify({ exports: { ".": { valance: "./dist/index.js" } } })} (the condition is what marks a library)`,
          ),
        );
      }

      continue;
    }

    const checked = fieldOf({ ...manifest, name }, dir, `node_modules/${name}/package.json`);

    problems.push(...checked.problems);

    if (checked.library !== undefined) {
      libraries.push(checked.library);

      // A library resolves its peers (`@valancex/common`, `effect`) from where it really is. One linked from outside the project (`npm install ../acme-ui`) finds none there (K7).
      const missing = Object.keys(manifest.peerDependencies ?? {}).filter(
        (peer) => manifest.peerDependenciesMeta?.[peer]?.optional !== true && installedAt(dir, peer) === undefined,
      );

      if (missing.length > 0) {
        problems.push(
          diagnostic(
            `node_modules/${name}/package.json`,
            0,
            "library-peers",
            `${name} cannot find its peer ${missing.map((each) => `${each}`).join(", ")} from ${dir}. A library linked from outside the project (\`npm install ../${name}\`) resolves its peers from its own directory: install it from a packed tarball (\`npm pack\`), or develop it in a workspace (\`vlx init library\`)`,
          ),
        );
      }
    }
  }

  return { libraries, problems };
};

/** The library a file belongs to (a template or a stylesheet, by absolute or project-relative path), if any. */
export const libraryOf = (libraries: ReadonlyArray<Library>, root: string, file: string): Library | undefined => {
  let real = resolve(root, file);

  try {
    real = realpathSync(real);
  } catch {
    // a file that does not exist belongs to whoever its path says
  }

  return libraries.find((each) => real.startsWith(each.dir + sep));
};

/** The qualified id of a component: `package/name` for a library's, the bare name for the application's and the built-ins'. */
export const idOf = (libraries: ReadonlyArray<Library>, root: string, file: string, name: string): string => {
  const library = libraryOf(libraries, root, file);

  return library === undefined ? name : `${library.name}/${name}`;
};

/** What the build tells Vite about marked packages: process them (`noExternal`), and resolve the `valance` condition. */
export const viteSettings = (libraries: ReadonlyArray<Library>): { readonly names: ReadonlyArray<string> } => ({ names: libraries.map((each) => each.name) });
