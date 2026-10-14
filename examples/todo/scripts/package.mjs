// Builds the engine as one executable for a platform: `node scripts/package.mjs linux-x64|win32-x64 [out-dir]` (out-dir defaults to `out/<platform>`).
// The engine is bundled to one CommonJS file, turned into a Node single executable application blob with the compiled screens and the MESH runtime's module as assets, and injected into the
// platform's own `node` binary. The Windows binary is Node's official release for the same version as the one running this, checked against its published SHA-256, and injected here: nothing
// is run for the target, so it builds on Linux.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const platform = process.argv[2];
const targets = { "linux-x64": { exe: "todo-engine", node: undefined }, "win32-x64": { exe: "todo-engine.exe", node: "win-x64/node.exe" } };
// (A Linux binary is only ever built on Linux: its `node` is the one running this.)

if (targets[platform] === undefined) {
  console.error(`usage: node scripts/package.mjs ${Object.keys(targets).join("|")} [out-dir]`);
  process.exit(2);
}

const out = resolve(process.argv[3] ?? join(root, "out", platform));
const work = join(root, "build");
const programs = join(root, "dist", "programs.json");

if (!existsSync(programs)) {
  console.error("build the screens first: pnpm build");
  process.exit(2);
}

mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "src", "sea-main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: join(work, "engine.cjs"),
  logLevel: "warning",
  legalComments: "none",
});

const wasm = require.resolve("@valancex/mesh-runtime/mesh-runtime.wasm", { paths: [root] });

writeFileSync(
  join(work, "sea-config.json"),
  JSON.stringify({
    main: join(work, "engine.cjs"),
    output: join(work, "engine.blob"),
    disableExperimentalSEAWarning: true,
    assets: { "programs.json": programs, "mesh-runtime.wasm": wasm },
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", join(work, "sea-config.json")], { stdio: "inherit" });

const download = async (path) => {
  const base = `https://nodejs.org/dist/v${process.versions.node}`;
  const cached = join(work, `node-v${process.versions.node}-${path.replace("/", "-")}`);

  if (!existsSync(cached)) {
    const [binary, sums] = await Promise.all([fetch(`${base}/${path}`), fetch(`${base}/SHASUMS256.txt`)]);

    if (!binary.ok || !sums.ok) {
      throw new Error(`could not download ${base}/${path} (${binary.status})`);
    }

    const bytes = Buffer.from(await binary.arrayBuffer());
    const expected = (await sums.text())
      .split("\n")
      .find((line) => line.endsWith(`  ${path}`))
      ?.split(/\s+/)[0];

    if (expected === undefined || createHash("sha256").update(bytes).digest("hex") !== expected) {
      throw new Error(`${path} does not match the checksum nodejs.org publishes`);
    }

    writeFileSync(cached, bytes);
  }

  return cached;
};

const target = targets[platform];
const exe = join(out, target.exe);

// On the platform itself the running `node` is the binary (what CI does on Windows); for another one, the official release is downloaded.
const hostPlatform = `${process.platform}-${process.arch}`;

copyFileSync(platform === hostPlatform || target.node === undefined ? process.execPath : await download(target.node), exe);
chmodSync(exe, 0o755);

const { inject } = await import("postject");

await inject(exe, "NODE_SEA_BLOB", readFileSync(join(work, "engine.blob")), { sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2" });
console.log(`wrote ${exe}`);
