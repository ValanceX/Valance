// The command on your PATH is not the version your project uses. Like `ng`, a global `vlx` hands `dev`, `build` and `check` to the `@valancex/cli` installed in the project (the one its
// package.json names, with the MESH compiler, runtime and VALANCE that go with it), so a project builds the same wherever it is run from. `init` and `--help` need no project and are the
// global command's own. With no local install (or the local one is this one) it runs as it is.
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findRoot } from "./config.js";

const SELF = realpathSync(fileURLToPath(new URL("../", import.meta.url)));

/** The `dist/cli.js` of the `@valancex/cli` installed in the project that contains `cwd`, if it is not this package. */
export const localCli = (cwd: string): string | undefined => {
  try {
    const root = findRoot(cwd);
    const manifest = createRequire(join(root, "package.json")).resolve("@valancex/cli/package.json");
    const dir = realpathSync(manifest.replace(/[\\/]package\.json$/, ""));
    const entry = join(dir, "dist", "cli.js");

    return dir !== SELF && existsSync(entry) ? entry : undefined;
  } catch {
    // No project here, or nothing installed in it: the command runs as it is.
    return undefined;
  }
};
