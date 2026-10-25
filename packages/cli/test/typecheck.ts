import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const tsc = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin", "tsc");

/**
 * The diagnostics `tsc` (strict, NodeNext) reports for `source`, one message each, with no position.
 * The file is written inside the package, so that `effect` and `@valancex/common` resolve as they do for a project.
 * (TypeScript 7 has no JavaScript compiler API, so this runs the compiler.)
 */
export const diagnosticsOf = (source: string): ReadonlyArray<string> => {
  const file = join(import.meta.dirname, `.typecheck-${process.pid}.ts`);

  writeFileSync(file, source);

  try {
    const run = spawnSync(
      process.execPath,
      [
        tsc,
        "--noEmit",
        "--ignoreConfig",
        "--strict",
        "--skipLibCheck",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--types",
        "node",
        "--pretty",
        "false",
        file,
      ],
      {
        encoding: "utf8",
      },
    );

    return `${run.stdout}${run.stderr}`
      .split("\n")
      .filter((line) => /(^| )error TS\d+: /.test(line))
      .map((line) => line.replace(/^.*?error TS\d+: /, ""));
  } finally {
    rmSync(file, { force: true });
  }
};
