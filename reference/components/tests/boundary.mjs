// "Public seams only" (decision K1), made executable. The reference build is written as an outsider writes: from what is published. This scan fails on
//   * an import of anything that is not a Node built-in, a file of this repository, one of the packages of the allowlist, or a package this repository's own workspace has;
//   * a subpath that is not an entry point: `internal`, `dist`, `src`, `node_modules`;
//   * a relative import that leaves the repository (a path into another repository);
//   * a dependency that is a link, a file or a workspace link to something that is not this repository's own package, in any package.json;
//   * an override or a package extension in pnpm-workspace.yaml that points anywhere but the registry (a prerelease pack is allowed only with ALLOW_LOCAL_PACKS=1, for the weeks a release is prepared and not out).
// Run it: `node tests/boundary.mjs`. It exits 1 and lists what it found.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The published packages the sources may import, by name. A subpath is allowed only if it is an entry point the package documents (listed here). */
export const ALLOWED = {
  "@valancex/common": [""],
  "@valancex/valance": ["", "web", "web/server", "replay", "generate"],
  "@valancex/mesh-runtime": [""],
  "@valancex/mesh-compiler": [""],
  effect: [""],
  vitest: ["", "config"],
  playwright: [""],
  typescript: [""],
};

const SOURCE = /\.(?:ts|mts|tsx|js|mjs|cjs)$/;
const SKIP = new Set(["node_modules", "dist", ".valance", ".git", "local-packs"]);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) {
      return [];
    }

    const path = join(dir, name);

    return statSync(path).isDirectory() ? walk(path) : [path];
  });

/** The names of the workspace's own packages, from their package.json files. */
const ownPackages = (root) =>
  new Set(
    walk(root)
      .filter((file) => file.endsWith(`${sep}package.json`))
      .map((file) => JSON.parse(readFileSync(file, "utf8")).name)
      .filter((name) => typeof name === "string"),
  );

const importsOf = (text) =>
  Array.from(
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .matchAll(/(?:from|import\(|require\()\s*["']([^"']+)["']/g),
    (match) => match[1],
  );

/** Splits `@scope/name/sub/path` into its package name and the subpath. */
const split = (specifier) => {
  const parts = specifier.split("/");
  const size = specifier.startsWith("@") ? 2 : 1;

  return { name: parts.slice(0, size).join("/"), subpath: parts.slice(size).join("/") };
};

export const scan = (root, options = {}) => {
  const found = [];
  const own = ownPackages(root);
  const say = (file, message) => found.push(`${relative(root, file)}: ${message}`);

  for (const file of walk(root)) {
    if (SOURCE.test(file)) {
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        if (specifier.startsWith("node:")) {
          continue;
        }

        if (specifier.startsWith(".")) {
          const target = resolve(dirname(file), specifier);

          if (target !== root && !target.startsWith(root + sep)) {
            say(file, `"${specifier}" leaves the repository (a path into another repository)`);
          }

          continue;
        }

        const { name, subpath } = split(specifier);

        if (own.has(name)) {
          continue;
        }

        if (!(name in ALLOWED)) {
          say(file, `"${specifier}" is not a package this repository may import (the allowlist is in tests/boundary.mjs)`);
        } else if (!ALLOWED[name].includes(subpath)) {
          say(file, `"${specifier}" is not an entry point of ${name} (${/(^|\/)(internal|dist|src)(\/|$)/.test(subpath) ? "a private seam" : "not in the allowlist"})`);
        }
      }
    }

    if (file.endsWith(`${sep}package.json`)) {
      const manifest = JSON.parse(readFileSync(file, "utf8"));

      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
          if (/^(link|file|git|github|portal):|^\.{1,2}\/|^\//.test(spec) || /^https?:/.test(spec)) {
            say(file, `${field}.${name} is "${spec}": a dependency is a version range from the registry, or a workspace link to a package of this repository`);
          } else if (spec.startsWith("workspace:") && !own.has(name)) {
            say(file, `${field}.${name} is a workspace link, but ${name} is not a package of this repository`);
          }
        }
      }
    }
  }

  const workspace = join(root, "pnpm-workspace.yaml");

  if (existsSync(workspace)) {
    for (const line of readFileSync(workspace, "utf8").split("\n")) {
      const pointer = /:\s*["']?((?:link|file|portal|git\+?\w*):[^"'\s]+)/.exec(line);

      if (pointer !== null && !(options.allowPacks === true && /^file:(?:\.{1,2}\/)*local-packs\//.test(pointer[1]))) {
        say(workspace, `an override that is not the registry: ${pointer[1]}${options.allowPacks === true ? "" : " (a prerelease pack needs ALLOW_LOCAL_PACKS=1, and goes when the release is published)"}`);
      }
    }
  }

  return found;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const found = scan(root, { allowPacks: process.env.ALLOW_LOCAL_PACKS === "1" });

  console.log(found.length === 0 ? "boundary: public seams only" : found.join("\n"));
  process.exit(found.length === 0 ? 0 : 1);
}
