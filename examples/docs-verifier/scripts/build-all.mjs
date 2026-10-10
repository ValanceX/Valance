// Builds every site in sites/ with the same commands, one after another: the kit builds them all, and what differs is each site's directory.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

for (const site of readdirSync("sites").sort()) {
  console.log(`\n== ${site}`);
  execFileSync("pnpm", ["run", "build"], { stdio: "inherit", env: { ...process.env, SITE: site } });
}
