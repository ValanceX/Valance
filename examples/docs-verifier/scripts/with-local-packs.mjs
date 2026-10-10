// Runs the verifier against packed, unpublished versions of the five packages: the way to verify a set of releases that are prepared but not yet on the registry.
//
//   node scripts/with-local-packs.mjs <directory holding the .tgz packs> [--smoke]
//
// Each repository's `npm pack` produces a pack (`valancex-<name>-<version>.tgz`); this copies the verifier to a temporary directory, points every @valancex dependency at its pack
// (overrides included, so the transitive ones too and only one copy of each resolves), installs, builds and runs the tests (and, with --smoke, the Chromium smoke tests).
// Nothing in this directory is changed.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [, , packsArg, ...flags] = process.argv;

if (packsArg === undefined) {
  console.error("usage: node scripts/with-local-packs.mjs <directory holding the .tgz packs> [--smoke]");
  process.exit(2);
}

const packs = resolve(packsArg);
const names = ["valance", "nexus", "mesh-runtime", "mesh-compiler", "port-web"];
const files = Object.fromEntries(names.map((name) => {
  const found = readdirSync(packs).filter((file) => file.startsWith(`valancex-${name}-`) && file.endsWith(".tgz"));

  if (found.length !== 1) {
    throw new Error(`expected exactly one pack for ${name} in ${packs}, found ${found.length}`);
  }

  return [`@valancex/${name}`, `file:${join(packs, found[0])}`];
}));
const work = mkdtempSync(join(tmpdir(), "docs-verifier-"));

cpSync(process.cwd(), work, { recursive: true, filter: (source) => !/(^|\/)(node_modules|dist|generated)(\/|$)/.test(source) });

const manifest = JSON.parse(readFileSync(join(work, "package.json"), "utf8"));

manifest.dependencies = { "@valancex/valance": files["@valancex/valance"] };

for (const name of ["nexus", "mesh-runtime", "mesh-compiler", "port-web"]) {
  manifest.devDependencies[`@valancex/${name}`] = files[`@valancex/${name}`];
}

manifest.pnpm = { overrides: files };
writeFileSync(join(work, "package.json"), JSON.stringify(manifest, null, 2));

const run = (command, args) => execFileSync(command, args, { cwd: work, stdio: "inherit" });

console.log(`running in ${work}`);
run("pnpm", ["install", "--ignore-scripts"]);
run("pnpm", ["run", "typecheck"]);
run("pnpm", ["run", "build"]);
run("pnpm", ["run", "test"]);

if (flags.includes("--smoke")) {
  run("pnpm", ["run", "test:smoke"]);
}
