// Builds a site with the production command, once per change: the smoke files each need the built sites, and building is the slow part. A stamp of everything the build reads says whether
// what is in `dist/<site>` is from the sources as they are.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INPUTS = ["app", "model", "tooling", "views", "styles", "web", "scripts", "sites", "package.json", "vite.page.config.ts", "tsconfig.json", "tsconfig.server.json"];

const files = (path: string): ReadonlyArray<string> => statSync(path).isDirectory() ? readdirSync(path).sort().flatMap((name) => files(join(path, name))) : [path];

const stampOf = (site: string): string => {
  const hash = createHash("sha256");

  hash.update(site);

  for (const input of INPUTS) {
    if (existsSync(input)) { for (const file of files(input)) { hash.update(file); hash.update(readFileSync(file)); } }
  }

  return hash.digest("base64url");
};

export const build = (site: string): void => {
  const marker = join("dist", `.stamp-${site}`);
  const stamp = stampOf(site);

  if (existsSync(marker) && readFileSync(marker, "utf8") === stamp && existsSync(join("dist", site, "built.json")) && process.env["REBUILD"] !== "1") { return; }

  execFileSync("pnpm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe", env: { ...process.env, SITE: site } });
  writeFileSync(marker, stamp);
};
