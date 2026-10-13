// Builds and packs the packages this verifier runs against when they are prepared but not published, into <directory> (default: ./.packs).
// Only the packages that changed are packed; with-local-packs.mjs takes the rest from the registry.
//
//  node scripts/build-packs.mjs [directory]
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const here = fileURLToPath(new URL("..", import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, ".packs"));

mkdirSync(out, { recursive: true });

for (const name of readdirSync(out)) {
  if (/^valancex-(nexus|valance|port-web)-*\.tgz$/.test(name)) {
    rmSync(resolve(out, name));
  }
}

const run = (cwd, command, args) => {
  // pnpm is a `.cmd` shim on Windows, which only a shell starts.
  const { status } = spawnSync(command, args, { cwd, stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });

  if (status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
};

for (const dir of ["../../../Nexus", "../../../Port/packages/port-web", "../../packages/valance"]) {
  const cwd = resolve(here, dir);

  run(cwd, "pnpm", ["install", "--ignore-scripts", ...dir.includes("Nexus") ? ["--frozen-lockfile"] : []]);
  run(cwd, "pnpm", ["build"]);
  run(cwd, "pnpm", ["pack", "--pack-destination", out]);
}

console.log(readdirSync(out).join("\n"));