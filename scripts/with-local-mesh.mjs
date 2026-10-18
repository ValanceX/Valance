// Runs Valance's tests against a MESH that is not published yet. MESH's `@valancex/mesh-compiler` and
// `@valancex/mesh-runtime` are built and packed from a MESH checkout, the workspace's pnpm `overrides` point at
// the tarballs, the suite runs, and the workspace is put back as it was. A MESH that reads enums, `has`, `??`
// and snippets (0.14) makes the tests that a published 0.12 compiler skips run: the five enum tests and the
// five snippet tests of `packages/cli`.
//
//   node scripts/with-local-mesh.mjs [--mesh ../Mesh] [--no-build] [--keep] [--only tests|examples|browser] [-- command]
//
// By default it runs, in this order: every package's and example's unit tests (`pnpm -r --no-bail test`), the
// examples' browser suites (`pnpm test:examples`) and tracer-web's browser suite (`pnpm test:browser`). With
// `-- command` it runs that command instead (once, from the workspace root). It refuses to start when
// `package.json` or `pnpm-lock.yaml` has uncommitted changes (it restores them with git), and it needs Chromium
// for the browser suites (set PLAYWRIGHT_BROWSERS_PATH as the environment does).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const dashes = args.indexOf("--");
const own = dashes === -1 ? args : args.slice(0, dashes);
const command = dashes === -1 ? undefined : args.slice(dashes + 1);
const option = (name, fallback) => {
  const at = own.indexOf(name);

  return at === -1 ? fallback : own[at + 1];
};
const mesh = resolve(root, option("--mesh", "../Mesh"));
const only = option("--only");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (file, fileArgs, cwd, extra = {}) => {
  const result = spawnSync(file, fileArgs, { cwd, stdio: "inherit", shell: process.platform === "win32", ...extra });

  return result.status ?? 1;
};
const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: root, encoding: "utf8" });

if (git("status", "--porcelain", "--", "package.json", "pnpm-lock.yaml").trim() !== "") {
  console.error("with-local-mesh: package.json or pnpm-lock.yaml has uncommitted changes; commit or stash them first (they are restored with git when this ends)");
  process.exit(2);
}

const packages = join(mesh, "packages");

if (!own.includes("--no-build")) {
  for (const step of [
    ["run", "build:wasm", "-w", "@valancex/mesh-compiler"],
    ["run", "build:wasm", "-w", "@valancex/mesh-runtime"],
    ["run", "build"],
  ]) {
    if (run(npm, step, packages) !== 0) {
      console.error(`with-local-mesh: npm ${step.join(" ")} failed in ${packages}`);
      process.exit(2);
    }
  }
}

const dir = mkdtempSync(join(tmpdir(), "local-mesh-"));
const overrides = {};

for (const name of ["mesh-compiler", "mesh-runtime"]) {
  const [packed] = JSON.parse(
    execFileSync(npm, ["pack", "--json", "--pack-destination", dir], {
      cwd: join(packages, name),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      shell: process.platform === "win32",
    }),
  );

  overrides[`@valancex/${name}`] = `file:${join(dir, packed.filename)}`;
  console.error(`with-local-mesh: ${packed.filename} (${packed.size} bytes)`);
}

const manifestPath = join(root, "package.json");
const original = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(original);
let status = 1;

const restore = () => {
  writeFileSync(manifestPath, original);
  git("checkout", "--", "pnpm-lock.yaml");
  rmSync(dir, { recursive: true, force: true });
};

try {
  manifest.pnpm = { ...manifest.pnpm, overrides: { ...manifest.pnpm?.overrides, ...overrides } };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (run(pnpm, ["install", "--no-frozen-lockfile", "--ignore-scripts"], root) !== 0) {
    throw new Error("pnpm install with the local packages failed");
  }

  const steps = command
    ? [command]
    : [
        ...(only === undefined || only === "tests" ? [[pnpm, "-r", "--no-bail", "test"]] : []),
        ...(only === undefined || only === "examples" ? [[pnpm, "test:examples"]] : []),
        ...(only === undefined || only === "browser" ? [[pnpm, "test:browser"]] : []),
      ];
  const failed = [];

  for (const [file, ...stepArgs] of steps) {
    const code = run(file, stepArgs, root);

    console.error(`with-local-mesh: ${[file, ...stepArgs].join(" ")} exited ${code}`);
    if (code !== 0) {
      failed.push([file, ...stepArgs].join(" "));
    }
  }

  status = failed.length === 0 ? 0 : 1;
  if (failed.length > 0) {
    console.error(`with-local-mesh: failed: ${failed.join("; ")}`);
  }
} finally {
  if (!own.includes("--keep")) {
    restore();
    run(pnpm, ["install", "--frozen-lockfile", "--ignore-scripts"], root);
  }
}

process.exit(status);
