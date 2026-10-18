// A production build bundles the MESH runtime's WebAssembly module once for each copy of `@valancex/mesh-runtime` the packages resolve, and the browser fetches every one (decision W20: a plain
// install of the published set resolved two, 0.12.0 through `@valancex/valance` and 0.11.0 through `@valancex/common`, and shipped 171 KB of brotli twice). `vlx build` therefore refuses to build
// when more than one copy is in play, naming each. `vlx dev` does not look: development says nothing about size (decision W9).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { AppError } from "./diagnostics.js";

const RUNTIME = "@valancex/mesh-runtime";
/** The packages whose code imports the runtime, or is imported by one that does. */
const IMPORTERS = ["@valancex/common", "@valancex/valance", "@valancex/nexus", "@valancex/port-web", "@valancex/router"] as const;

/** The directory of `name` as Node would find it from `from`: the nearest `node_modules/<name>` going up, resolved through links. */
const find = (from: string, name: string): string | undefined => {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);

    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    if (dirname(dir) === dir) {
      return undefined;
    }
  }
};

export interface Copy {
  /** The copy's directory, resolved through links. */
  readonly dir: string;
  readonly version: string;
  /** The packages that resolve to it. */
  readonly usedBy: ReadonlyArray<string>;
}

/** The copies of the runtime that the project's packages resolve, each with the packages that use it. */
export const runtimeCopies = (root: string): ReadonlyArray<Copy> => {
  const copies = new Map<string, { version: string; usedBy: Array<string> }>();

  for (const name of IMPORTERS) {
    // From the project first; a package the project does not list directly is found through one it does (pnpm links only the direct ones).
    const importer =
      find(root, name) ??
      IMPORTERS.map((other) => find(root, other))
        .flatMap((dir) => (dir === undefined ? [] : [find(dir, name)]))
        .find((dir) => dir !== undefined);
    const dir = importer === undefined ? undefined : find(importer, RUNTIME);

    if (dir === undefined) {
      continue;
    }

    const entry = copies.get(dir) ?? { version: (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }).version, usedBy: [] };

    entry.usedBy.push(name);
    copies.set(dir, entry);
  }

  return [...copies].map(([dir, { version, usedBy }]) => ({ dir, version, usedBy }));
};

/** Throws `runtime-duplicate`, naming every copy and who uses it, when the build would bundle more than one. */
export const assertOneRuntime = (root: string): void => {
  const copies = runtimeCopies(root);

  if (copies.length < 2) {
    return;
  }

  const newest = copies
    .map((copy) => copy.version)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1)!;
  const listed = copies.map((copy) => `${copy.version} at ${relative(root, copy.dir) || "."} (used by ${copy.usedBy.join(", ")})`).join("; ");

  throw new AppError([
    {
      file: "package.json",
      line: 0,
      column: 0,
      code: "runtime-duplicate",
      message:
        `${copies.length} copies of ${RUNTIME} would be built into the site, and the browser would fetch the WebAssembly runtime ${copies.length} times: ${listed}. ` +
        `Make them one version: add "overrides": { "${RUNTIME}": "${newest}" } to package.json (npm; pnpm.overrides with pnpm, resolutions with yarn) and install again`,
    },
  ]);
};
