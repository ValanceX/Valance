// Runs the verifier against packed, unpublished versions of the @valancex packages: the way to verify a set that is prepared but not yet on the registry.
//
//   node scripts/with-local-packs.mjs [packs] [--smoke] [--only a,b,c] [--fresh]
//
//   packs     the directory holding the .tgz packs (default ./.packs, made by scripts/build-packs.sh). A package with a pack is taken from it, overrides included so only one
//             copy of each resolves; a package without one stays at the version in package.json (the registry).
//   --smoke   also run the Chromium smoke tests.
//   --only    run just these package scripts, in order (default: typecheck,build,test).
//   --fresh   start from an empty work directory.
//
// The work is a copy in ./.work, kept between runs: the sources are re-copied each time, and the install happens only when a pack changed. Nothing else here is touched.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : undefined;
const packs = resolve(args.find((arg, at) => !arg.startsWith("--") && args[at - 1] !== "--only") ?? ".packs");
const work = resolve(".work");

if (flag("--fresh")) { rmSync(work, { recursive: true, force: true }); }

const found = existsSync(packs) ? readdirSync(packs).filter((file) => /^valancex-.*\.tgz$/.test(file)) : [];
const files = Object.fromEntries(["valance", "nexus", "mesh-runtime", "mesh-compiler", "port-web"].flatMap((name) => {
  const mine = found.filter((file) => file.startsWith(`valancex-${name}-`));

  if (mine.length > 1) { throw new Error(`more than one pack for ${name} in ${packs}: ${mine.join(", ")}`); }

  return mine.length === 1 ? [[`@valancex/${name}`, `file:${join(packs, mine[0])}`]] : [];
}));

console.log(`packs: ${Object.keys(files).join(", ") || "none (everything from the registry)"}`);
mkdirSync(work, { recursive: true });

// The sources, fresh each time; what the work directory built or installed stays.
for (const entry of readdirSync(".")) {
  if (/^(node_modules|dist|generated|\.work|\.packs|pnpm-lock\.yaml)$/.test(entry)) { continue; }

  rmSync(join(work, entry), { recursive: true, force: true });
  cpSync(entry, join(work, entry), { recursive: true, filter: (source) => !/(^|\/)(node_modules|dist|generated|\.work|\.packs|evidence)(\/|$)/.test(source) });
}

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

for (const [name, spec] of Object.entries(files)) {
  const section = manifest.dependencies?.[name] === undefined ? "devDependencies" : "dependencies";

  manifest[section][name] = spec;
}

manifest.pnpm = { ...manifest.pnpm, overrides: { ...manifest.pnpm?.overrides, ...files } };
writeFileSync(join(work, "package.json"), JSON.stringify(manifest, null, 2));

const stamp = Object.values(files).map((spec) => { const file = spec.slice("file:".length); return `${file}:${statSync(file).size}:${statSync(file).mtimeMs}`; }).join("\n");
const stampFile = join(work, ".packs-stamp");
const run = (script) => {
  try {
    execFileSync("pnpm", ["run", script], { cwd: work, stdio: "inherit" });
  } catch {
    console.error(`\n\`pnpm run ${script}\` failed in ${work}`);
    process.exit(1);
  }
};

if (!existsSync(join(work, "node_modules")) || !existsSync(stampFile) || readFileSync(stampFile, "utf8") !== stamp) {
  rmSync(join(work, "node_modules", "@valancex"), { recursive: true, force: true });
  rmSync(join(work, "pnpm-lock.yaml"), { force: true });
  execFileSync("pnpm", ["install", "--ignore-scripts", "--force"], { cwd: work, stdio: "inherit" });
  writeFileSync(stampFile, stamp);
}

for (const script of only ?? ["typecheck", "build", "test"]) { run(script); }

if (flag("--smoke")) { run("test:smoke"); }
